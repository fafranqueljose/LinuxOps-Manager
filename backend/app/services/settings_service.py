"""
LinuxOps Manager — Servicio Centralizado de Parámetros de Configuración del Sistema
"""

from typing import Any, Dict, Optional
from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.models.alert import SystemSetting


class SettingsService:
    @staticmethod
    async def get_setting_value(db: AsyncSession, key: str, default: Any = None) -> Any:
        """Obtiene el valor de un parámetro del sistema almacenado en PostgreSQL."""
        setting = await db.get(SystemSetting, key)
        if setting is not None and setting.value is not None:
            return setting.value
        return default

    @staticmethod
    async def get_all_settings_dict(db: AsyncSession) -> Dict[str, Any]:
        """Retorna un diccionario de clave -> valor para todos los parámetros persistidos."""
        stmt = select(SystemSetting)
        res = await db.execute(stmt)
        return {s.key: s.value for s in res.scalars().all()}

    @staticmethod
    async def get_effective_agent_connection(
        db: AsyncSession, request: Optional[Request] = None
    ) -> Dict[str, Any]:
        """
        Calcula la URL base y banderas para la descarga e instalación del agente.
        Prioridad:
        1. Parámetros de SystemSetting: server_dns, server_port, server_protocol.
        2. settings.APP_URL si no contiene 'linuxops.local'.
        3. Encabezados de la petición HTTP (x-forwarded-proto, host).
        """
        dns = await SettingsService.get_setting_value(db, "server_dns", "")
        port = await SettingsService.get_setting_value(db, "server_port", 443)
        proto = await SettingsService.get_setting_value(db, "server_protocol", "https")
        insecure = bool(await SettingsService.get_setting_value(db, "agent_insecure_tls", False))

        dns_clean = str(dns).strip() if dns else ""
        proto_clean = str(proto).strip().lower() if proto else "https"

        if dns_clean:
            try:
                port_int = int(port) if port is not None else None
            except (ValueError, TypeError):
                port_int = None

            if port_int and not ((proto_clean == "https" and port_int == 443) or (proto_clean == "http" and port_int == 80)):
                base_url = f"{proto_clean}://{dns_clean}:{port_int}"
            else:
                base_url = f"{proto_clean}://{dns_clean}"
        elif settings.APP_URL and "linuxops.local" not in settings.APP_URL:
            base_url = settings.APP_URL.rstrip("/")
        elif request:
            req_proto = request.headers.get("x-forwarded-proto", request.url.scheme)
            req_host = request.headers.get("x-forwarded-host", request.headers.get("host", request.url.netloc))
            if req_host:
                base_url = f"{req_proto}://{req_host}".rstrip("/")
            else:
                base_url = str(request.base_url).rstrip("/")
        else:
            base_url = settings.APP_URL.rstrip("/")

        insecure_curl = " -k" if insecure else ""
        insecure_arg = " --insecure" if insecure else ""
        sample_install = (
            f"curl -sSL{insecure_curl} {base_url}/install-agent.sh | sudo bash -s -- "
            f"--server-url {base_url} --token <TOKEN_DE_INCORPORACIÓN> --server-id <ID_SERVIDOR>{insecure_arg}"
        )

        return {
            "base_url": base_url,
            "dns": dns_clean,
            "port": port,
            "protocol": proto_clean,
            "insecure": insecure,
            "sample_install_command": sample_install,
            "download_url": f"{base_url}/install-agent.sh",
        }

