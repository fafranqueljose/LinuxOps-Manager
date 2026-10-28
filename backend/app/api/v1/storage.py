"""
LinuxOps Manager — Router del Módulo de Almacenamiento Linux
Despacha solicitudes seguras hacia el agente remoto vía WebSocket protocol envelope.
"""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import require_permission
from app.models.server import Server
from app.models.user import User
from app.schemas.storage import StorageOverviewOut
from app.services.agent_gateway import agent_gateway

router = APIRouter(prefix="/servers/{server_id}/storage", tags=["Almacenamiento"])


@router.get("", response_model=StorageOverviewOut)
async def get_storage_overview(
    server_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("servers:read")),
):
    """
    Obtiene la visión completa del almacenamiento del servidor Linux:
    1. Unidades de usuario configuradas en /etc/fstab (NFS, CIFS, Discos).
    2. Sistemas de archivos reales montados en el SO.
    3. Árbol de directorios distinguiendo puntos de montaje vs directorios locales.
    """
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor no encontrado.")

    if not agent_gateway.is_agent_connected(server.id):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El agente del servidor remoto no está conectado en este momento.",
        )

    try:
        res = await agent_gateway.send_agent_request(
            server_id=server.id,
            module="storage",
            operation="overview",
            payload={},
            timeout_seconds=20,
        )
        if not res.get("success"):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=res.get("error", "Error desconocido al consultar almacenamiento del agente."),
            )
        return res.get("data", {})
    except (ConnectionError, TimeoutError) as e:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(e))

