# LinuxOps Manager

**LinuxOps Manager** es una plataforma centralizada y segura de administración de infraestructura Linux, diseñada con arquitectura de componentes independientes para gestionar contenedores Docker, servicios systemd, métricas del sistema, registros y terminales remotas interactivas bajo el protocolo **mTLS**.

---

## 🌟 Características Principales

- **Gestión Centralizada Multi-Servidor**: Monitoreo en tiempo real de múltiples servidores Linux mediante comunicación saliente del agente sin requerir puertos abiertos de entrada en los hosts remotos.
- **Canal Seguro mTLS con CA Interna**: Autenticación mutua cliente-servidor mediante certificados X.509 dedicados por agente y tokens de incorporación de un solo uso con expiración corta.
- **Administración de Docker Engine**:
  - Listado e inspección de contenedores con ofuscación automática de variables de entorno sensibles (`PASSWORD`, `SECRET`, `KEY`, etc.).
  - Acciones controladas: inicio, detención segura con timeout configurable y reinicio.
  - Visor de registros con límites y filtrado temporal.
  - Catálogo de imágenes, redes y volúmenes.
- **Servicios del Sistema (systemd)**:
  - Listado y control de unidades `.service` (iniciar, detener, reiniciar, recargar).
  - Consulta de logs en tiempo real vía `journalctl`.
  - Operaciones no privilegiadas bajo usuario `linuxops-agent` con reglas sudoers mínimas estrictas (sin `shell=True`).
- **Terminal Web Real (PTY + WebSocket)**:
  - Sesión interactiva completa mediante **xterm.js** y pseudoterminales de Linux (no comandos simulados).
  - Ejecutada bajo usuario sin privilegios (`linuxops-pty`).
  - Límites de concurrencia y cierre por inactividad.
- **Auditoría Append-Only Criptográfica**:
  - Registro de todas las acciones administrativas con encadenamiento de hashes SHA-256 (tamper-evident).
  - Herramienta de verificación de integridad en tiempo de ejecución.
- **Control de Acceso Basado en Roles (RBAC)**:
  - Roles predefinidos (`superadmin`, `infra_admin`, `operator`, `auditor`, `readonly`) y soporte para roles y permisos personalizados por servidor.
  - Hashing de contraseñas con **Argon2id**.
  - Autenticación multifactor (**MFA TOTP**).
  - Mitigación de fuerza bruta con bloqueo temporal.

---

## 🏗️ Arquitectura del Sistema

```
linuxops-manager/
├── frontend/             # SPA React 18 + TypeScript + Vite + Tailwind CSS + xterm.js
├── backend/              # FastAPI + SQLAlchemy 2.0 + Alembic + WebSockets + Argon2id
├── agent/                # Demonio ligero para Linux (psutil + docker-py + systemd)
├── deploy/               # Docker Compose (PostgreSQL 16, Backend, Frontend, Nginx TLS)
├── docs/                 # Documentación técnica completa (instalación, seguridad, operaciones)
├── scripts/              # Herramientas de respaldo, restauración y generación de certificados
├── .env.example          # Plantilla de variables de entorno
└── README.md
```

---

## 🚀 Inicio Rápido

### 1. Clonar y Configurar Entorno
```bash
git clone https://github.com/organization/linuxops-manager.git
cd linuxops-manager
cp .env.example .env
```

### 2. Generar Certificados TLS para Desarrollo
```bash
bash scripts/generate-dev-certs.sh
```

### 3. Levantar la Infraestructura Central
```bash
cd deploy
docker compose up -d --build
```

### 4. Acceder a la Consola Web
Navegue a `https://localhost` (o la IP de su host).
- **Usuario inicial**: `admin`
- **Contraseña temporal**: `LinuxOpsAdmin_2026!ChangeMe`

*Se recomienda encarecidamente cambiar la contraseña y activar MFA en el primer inicio de sesión.*

---

## 📚 Documentación Técnica Detallada

- [Arquitectura Técnica](docs/architecture.md)
- [Guía de Instalación y Despliegue](docs/installation.md)
- [Protocolo de Incorporación Segura y mTLS](docs/agent-enrollment.md)
- [Modelo de Seguridad y DevSecOps](docs/security.md)
- [Manual de Operaciones](docs/operations.md)
- [Procedimiento de Respaldo y Recuperación](docs/recovery.md)

---

## 🔒 Consideraciones de Seguridad
1. El backend nunca ejecuta comandos arbitrarios del usuario en su propio sistema operativo.
2. La terminal interactiva no otorga permisos de superusuario por defecto y está deshabilitada para operadores estándar.
3. El socket de Docker nunca se expone a la red.
4. Las contraseñas, tokens y claves privadas nunca se registran en logs ni en la bitácora de auditoría.

