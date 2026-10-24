"""
LinuxOps Agent — Validador Local de Solicitudes y Protección Anti-Repetición
Asegura que ninguna orden se ejecute a menos que cumpla con:
1. Protocolo versionado oficial (1.0).
2. Identificador único de solicitud no repetido (Anti-Replay).
3. Fecha de caducidad vigente (Anti-Expired).
4. Operación explícitamente habilitada en la lista blanca de capacidades.
"""

import datetime
import re
from typing import Dict, Optional, Set, Tuple

# Catálogo explícito de operaciones permitidas
ALLOWED_OPERATIONS = {
    "docker.container.list",
    "docker.container.inspect",
    "docker.container.start",
    "docker.container.stop",
    "docker.container.restart",
    "docker.container.logs",
    "docker.image.list",
    "docker.network.list",
    "docker.volume.list",
    "systemd.unit.list",
    "systemd.unit.inspect",
    "systemd.unit.start",
    "systemd.unit.stop",
    "systemd.unit.restart",
    "systemd.unit.reload",
    "systemd.unit.journal",
    "system.info",
}

# Validación estricta para nombres de servicio systemd: alfanumérico con @ _ . - terminando en .service
SYSTEMD_UNIT_REGEX = re.compile(r"^[a-zA-Z0-9@_.-]+\.service$")

# Validación para ID o nombres de contenedores Docker
DOCKER_ID_REGEX = re.compile(r"^[a-zA-Z0-9_.-]{2,128}$")


class RequestValidator:
    def __init__(self, max_cache_size: int = 10000, ttl_seconds: int = 120):
        # Mapeo de request_id -> timestamp de expiración para prevención de repetición
        self.seen_requests: Dict[str, datetime.datetime] = {}
        self.max_cache_size = max_cache_size
        self.ttl_seconds = ttl_seconds

    def _clean_expired_cache(self, now: datetime.datetime) -> None:
        """Purga solicitudes caducadas del caché local."""
        if len(self.seen_requests) > self.max_cache_size:
            self.seen_requests = {k: v for k, v in self.seen_requests.items() if v > now}

    def validate_envelope(self, envelope: dict) -> Tuple[bool, Optional[str]]:
        """
        Valida integridad del sobre de protocolo.
        Devuelve (es_valido, motivo_error).
        """
        now = datetime.datetime.now(datetime.timezone.utc)
        self._clean_expired_cache(now)

        # 1. Versionado del protocolo
        version = envelope.get("protocol_version")
        if version != "1.0":
            return False, f"Versión de protocolo no soportada: {version}. Se requiere '1.0'."

        # 2. Identificador único de solicitud
        request_id = envelope.get("request_id")
        if not request_id or not isinstance(request_id, str):
            return False, "Campo 'request_id' faltante o inválido."

        # Prevención de repetición (Anti-Replay)
        if request_id in self.seen_requests:
            return False, f"Ataque de repetición detectado: 'request_id' {request_id} ya fue procesado."

        # 3. Fecha de expiración (Anti-Expired)
        expires_at_raw = envelope.get("expires_at")
        if not expires_at_raw:
            return False, "Falta la fecha de expiración 'expires_at'."

        try:
            expires_at = datetime.datetime.fromisoformat(expires_at_raw)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=datetime.timezone.utc)
        except Exception:
            return False, "Formato inválido de fecha en 'expires_at'."

        if expires_at < now:
            return False, f"La solicitud ha caducado (expiró en {expires_at.isoformat()}, hora actual {now.isoformat()})."

        # 4. Operación permitida
        module = envelope.get("module")
        operation = envelope.get("operation")
        full_op = f"{module}.{operation}" if module else str(operation)

        if full_op not in ALLOWED_OPERATIONS:
            return False, f"Operación denegada por política local del agente: '{full_op}'."

        # 5. Validación de parámetros según la operación
        payload = envelope.get("payload", {})
        if module == "systemd":
            unit = payload.get("unit")
            if unit and not SYSTEMD_UNIT_REGEX.match(unit):
                return False, f"Nombre de unidad systemd malformado o no permitido: '{unit}'."

        if module == "docker":
            container_id = payload.get("container_id")
            if container_id and not DOCKER_ID_REGEX.match(container_id):
                return False, f"Identificador de contenedor Docker sospechoso: '{container_id}'."

        # Registrar en caché anti-repetición
        cache_expiry = now + datetime.timedelta(seconds=self.ttl_seconds)
        self.seen_requests[request_id] = cache_expiry

        return True, None


request_validator = RequestValidator()

