"""
LinuxOps Manager — Motor de Generación Automática y Clasificación de Contenedores
Infiere descripciones comprensibles, propósito, categoría y procesa etiquetas declarativas Docker Compose.
Diseñado con arquitectura desacoplada para admitir ampliación posterior con IA.
"""

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("linuxops.services.container_doc_engine")

# Categorías estándar del catálogo
VALID_CATEGORIES = [
    "database",
    "web-application",
    "backend-api",
    "cache-queue",
    "security-proxy",
    "ci-cd",
    "monitoring-logging",
    "system-tool",
    "other",
]

VALID_ENVIRONMENTS = ["development", "testing", "staging", "production"]


def compute_identity_key(container_name: str, compose_project: Optional[str] = None, compose_service: Optional[str] = None) -> str:
    """
    Calcula la clave de identidad duradera para un contenedor.
    Garantiza que la documentación no se pierda al recrear el contenedor en Docker.
    """
    clean_name = container_name.strip().lstrip("/")
    if compose_project and compose_service:
        return f"compose:{compose_project.strip()}:{compose_service.strip()}"
    return f"name:{clean_name}"


def extract_linuxops_labels(labels: Dict[str, str]) -> Dict[str, str]:
    """
    Extrae y normaliza las etiquetas personalizadas 'linuxops.*' de Docker Compose.
    """
    if not labels or not isinstance(labels, dict):
        return {}

    extracted = {}
    label_mapping = {
        "linuxops.description": "description",
        "linuxops.purpose": "purpose",
        "linuxops.application": "application_name",
        "linuxops.owner": "owner",
        "linuxops.environment": "environment",
        "linuxops.category": "category",
        "linuxops.managed": "managed",
    }

    for l_key, target_field in label_mapping.items():
        val = labels.get(l_key)
        if val is not None and str(val).strip():
            extracted[target_field] = str(val).strip()

    # Normalizar environment si viene en etiquetas
    if "environment" in extracted:
        env_val = extracted["environment"].lower()
        if env_val in VALID_ENVIRONMENTS:
            extracted["environment"] = env_val
        elif "prod" in env_val:
            extracted["environment"] = "production"
        elif "dev" in env_val:
            extracted["environment"] = "development"
        elif "test" in env_val:
            extracted["environment"] = "testing"
        elif "stag" in env_val:
            extracted["environment"] = "staging"

    # Normalizar category si viene en etiquetas
    if "category" in extracted:
        cat_val = extracted["category"].lower()
        if cat_val in VALID_CATEGORIES:
            extracted["category"] = cat_val

    return extracted


# Reglas de reconocimiento por patrones de imagen, nombre y servicios
RULES_CATALOG: List[Dict[str, Any]] = [
    {
        "id": "postgres",
        "patterns": [r"postgres", r"timescale", r"bitnami/postgresql", r"postgis"],
        "category": "database",
        "description": "Servicio de base de datos relacional PostgreSQL para almacenamiento, integridad y persistencia estructurada de datos de la plataforma.",
        "purpose": "Motor de base de datos relacional para persistencia de datos transaccionales.",
    },
    {
        "id": "mysql_mariadb",
        "patterns": [r"mysql", r"mariadb", r"bitnami/mysql", r"percona"],
        "category": "database",
        "description": "Servicio de base de datos relacional MySQL / MariaDB utilizado para gestión transaccional y persistencia de información de aplicaciones.",
        "purpose": "Base de datos relacional para soporte y persistencia de datos.",
    },
    {
        "id": "mongodb",
        "patterns": [r"mongo", r"mongodb", r"bitnami/mongodb"],
        "category": "database",
        "description": "Base de datos distribuida NoSQL orientada a documentos para almacenamiento flexible y de alta escala.",
        "purpose": "Almacenamiento NoSQL de documentos y colecciones semi-estructuradas.",
    },
    {
        "id": "redis",
        "patterns": [r"redis", r"bitnami/redis", r"dragonfly", r"keydb"],
        "category": "cache-queue",
        "description": "Servicio de almacenamiento en memoria utilizado para caché de alta velocidad, gestión de sesiones y mensajería volátil.",
        "purpose": "Caché de baja latencia, almacén clave-valor en memoria y broker de mensajería rápida.",
    },
    {
        "id": "rabbitmq",
        "patterns": [r"rabbitmq", r"bitnami/rabbitmq"],
        "category": "cache-queue",
        "description": "Broker de mensajería empresarial RabbitMQ para encolamiento asíncrono y desacoplamiento de servicios mediante protocolo AMQP.",
        "purpose": "Intercambio de mensajes asíncronos y colas de tareas distribuidas.",
    },
    {
        "id": "kafka",
        "patterns": [r"kafka", r"confluentinc/cp-kafka", r"bitnami/kafka"],
        "category": "cache-queue",
        "description": "Plataforma distribuida de transmisión de eventos Apache Kafka para procesamiento de flujos de datos en tiempo real.",
        "purpose": "Streaming y bus de eventos de alto rendimiento.",
    },
    {
        "id": "nginx",
        "patterns": [r"nginx", r"openresty", r"nginx-proxy"],
        "category": "security-proxy",
        "description": "Servidor web HTTP y proxy inverso utilizado para enrutar tráfico, terminación SSL y publicación de servicios.",
        "purpose": "Servidor web, balanceo de carga y enrutamiento perimetral HTTP/HTTPS.",
    },
    {
        "id": "traefik_caddy",
        "patterns": [r"traefik", r"caddy", r"haproxy", r"envoy"],
        "category": "security-proxy",
        "description": "Proxy inverso perimetral y balanceador de carga dinámico con soporte de descubrimiento automático de microservicios.",
        "purpose": "Enrutamiento perimetral, gestión automática de certificados SSL y balanceo de carga.",
    },
    {
        "id": "jenkins",
        "patterns": [r"jenkins", r"gitlab-runner", r"github-runner", r"drone", r"argocd"],
        "category": "ci-cd",
        "description": "Servidor o agente de automatización para pipelines de integración continua, pruebas y despliegue automatizado (CI/CD).",
        "purpose": "Ejecución automatizada de flujos de integración y entrega continua.",
    },
    {
        "id": "harbor",
        "patterns": [r"harbor", r"goharbor"],
        "category": "system-tool",
        "description": "Registro empresarial seguro de artefactos y contenedores OCI con escaneo de vulnerabilidades y firma de imágenes.",
        "purpose": "Registro privado y catálogo centralizado de imágenes de Docker.",
    },
    {
        "id": "gitea_gitlab",
        "patterns": [r"gitea", r"gitlab-ce", r"gitlab-ee"],
        "category": "ci-cd",
        "description": "Servidor auto-hospedado de control de versiones y repositorio de código Git con gestión de proyectos y colaboración.",
        "purpose": "Gestión centralizada de repositorios de código fuente.",
    },
    {
        "id": "grafana_loki_prometheus",
        "patterns": [r"grafana", r"loki", r"prometheus", r"promtail", r"alertmanager", r"victoria-metrics"],
        "category": "monitoring-logging",
        "description": "Componente del stack de observabilidad para recolección, indexación, alertas y visualización de telemetría y métricas del sistema.",
        "purpose": "Monitorización, visualización y gestión centralizada de telemetría y logs.",
    },
    {
        "id": "elasticsearch",
        "patterns": [r"elasticsearch", r"opensearch"],
        "category": "database",
        "description": "Motor analítico y de búsqueda distribuida para indexación masiva de texto y registros estructurados.",
        "purpose": "Indexación y búsqueda de texto completo y telemetría analítica.",
    },
    {
        "id": "php_apache",
        "patterns": [r"php", r"wordpress", r"drupal", r"apache", r"httpd"],
        "category": "web-application",
        "description": "Servidor de ejecución de aplicaciones web PHP servidas mediante Apache HTTP Server o PHP-FPM.",
        "purpose": "Alojamiento y procesamiento de aplicaciones web basadas en PHP.",
    },
    {
        "id": "python_app",
        "patterns": [r"python", r"fastapi", r"uvicorn", r"django", r"flask"],
        "category": "backend-api",
        "description": "Entorno de ejecución para servicios, APIs REST o procesos desarrollados en lenguaje Python.",
        "purpose": "API backend o servicio de lógica de negocio en Python.",
    },
    {
        "id": "node_app",
        "patterns": [r"node", r"nextjs", r"nestjs", r"express"],
        "category": "web-application",
        "description": "Entorno de ejecución de aplicaciones web, APIs o microservicios basados en Node.js.",
        "purpose": "Ejecución de interfaces web interactivas o microservicios Node.js.",
    },
    {
        "id": "java_app",
        "patterns": [r"openjdk", r"eclipse-temurin", r"tomcat"],
        "category": "backend-api",
        "description": "Máquina virtual Java (JVM) y entorno de ejecución para aplicaciones empresariales o microservicios basados en Java.",
        "purpose": "Ejecución de aplicaciones y servicios Java / Spring Boot.",
    },
    {
        "id": "vault",
        "patterns": [r"vault", r"keycloak", r"authelia", r"authentik"],
        "category": "security-proxy",
        "description": "Servicio de seguridad centralizada para gestión de identidades, tokens, credenciales y autenticación de usuarios y aplicaciones.",
        "purpose": "Gestión de identidad, control de acceso y almacenamiento seguro de secretos.",
    },
]


class ContainerDocEngine:
    """Motor de inferencia de documentación técnica y administrativa de contenedores."""

    @staticmethod
    def infer_from_rules(
        container_name: str,
        image_name: str,
        compose_service: Optional[str] = None,
        compose_project: Optional[str] = None,
        ports: Optional[List[Any]] = None,
    ) -> Tuple[str, str, str, str]:
        """
        Evalúa reglas deterministas sobre el nombre de la imagen, el servicio y el nombre del contenedor.
        Retorna (description, purpose, category, rule_id).
        """
        search_targets = [
            (image_name or "").lower(),
            (compose_service or "").lower(),
            (container_name or "").lower(),
            (compose_project or "").lower(),
        ]
        target_text = " ".join(t for t in search_targets if t)

        for rule in RULES_CATALOG:
            for pattern in rule["patterns"]:
                if re.search(r"\b" + pattern + r"\b", target_text) or pattern in target_text:
                    return (
                        rule["description"],
                        rule["purpose"],
                        rule["category"],
                        rule["id"],
                    )

        # Fallback genérico para contenedores que no coincidan con las reglas principales
        service_label = compose_service or container_name.lstrip("/")
        image_short = image_name.split("/")[-1].split(":")[0] if image_name else "imagen base"
        
        fallback_desc = (
            f"Contenedor basado en la imagen '{image_short}' ejecutando el servicio '{service_label}'. "
            f"El propósito técnico específico no ha sido catalogado automáticamente y requiere documentación manual."
        )
        fallback_purpose = f"Ejecución de componentes y procesos del servicio {service_label}."
        return fallback_desc, fallback_purpose, "other", "generic_fallback"

    @classmethod
    def generate_documentation_suggestion(
        cls,
        container_name: str,
        image_name: str,
        compose_service: Optional[str] = None,
        compose_project: Optional[str] = None,
        labels: Optional[Dict[str, str]] = None,
        ports: Optional[List[Any]] = None,
    ) -> Dict[str, Any]:
        """
        Genera una propuesta completa combinando etiquetas declarativas y reglas deterministas.
        """
        extracted_labels = extract_linuxops_labels(labels or {})

        desc_rule, purp_rule, cat_rule, rule_id = cls.infer_from_rules(
            container_name=container_name,
            image_name=image_name,
            compose_service=compose_service,
            compose_project=compose_project,
            ports=ports,
        )

        # Si existen etiquetas explícitas en el compose, tienen precedencia para la sugerencia
        final_desc = extracted_labels.get("description") or desc_rule
        final_purp = extracted_labels.get("purpose") or purp_rule
        final_cat = extracted_labels.get("category") or cat_rule
        final_app = extracted_labels.get("application_name") or compose_project or "General"
        final_owner = extracted_labels.get("owner") or "Operaciones / TI"
        final_env = extracted_labels.get("environment") or "production"

        return {
            "description": final_desc,
            "purpose": final_purp,
            "category": final_cat,
            "application_name": final_app,
            "owner": final_owner,
            "environment": final_env,
            "source_rule": f"labels+{rule_id}" if extracted_labels else rule_id,
            "labels_detected": extracted_labels,
        }

    @classmethod
    async def generate_with_ai(
        cls,
        container_name: str,
        image_name: str,
        compose_service: Optional[str] = None,
        compose_project: Optional[str] = None,
        labels: Optional[Dict[str, str]] = None,
        ports: Optional[List[Any]] = None,
        networks: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Punto de extensión para futuros proveedores de IA (Google Gemini, OpenAI, Claude).
        GARANTÍA DE SEGURIDAD ESTRICTA:
        - Nunca se transmiten variables de entorno, contraseñas, secretos, tokens, credenciales ni contenido de archivos.
        - Solo se transmiten metadatos no sensibles de catálogo.
        - Si no hay proveedor configurado, delega transparentemente en el motor de reglas.
        """
        # Por defecto utiliza el motor de reglas seguro y probado
        return cls.generate_documentation_suggestion(
            container_name=container_name,
            image_name=image_name,
            compose_service=compose_service,
            compose_project=compose_project,
            labels=labels,
            ports=ports,
        )


container_doc_engine = ContainerDocEngine()
