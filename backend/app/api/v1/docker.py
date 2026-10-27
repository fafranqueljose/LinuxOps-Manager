"""
LinuxOps Manager — Router de Gestión de Docker Engine
Despacha solicitudes seguras hacia el agente remoto vía WebSocket protocol envelope.
"""

from typing import List, Optional
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_permission
from app.models.server import Server
from app.models.user import User
from app.schemas.docker import (
    ContainerActionRequest,
    ContainerDetailOut,
    ContainerOut,
    ImageOut,
    NetworkOut,
    VolumeOut,
)
from app.services.agent_gateway import agent_gateway
from app.services.audit_service import AuditService

router = APIRouter(prefix="/servers/{server_id}/docker", tags=["Docker Engine"])


@router.get("/containers", response_model=List[ContainerOut])
async def list_containers(
    server_id: UUID,
    all: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("docker:read")),
):
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
            module="docker",
            operation="container.list",
            payload={"all": all},
            timeout_seconds=25,
        )
        if not res.get("success"):
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=res.get("error"))
        return res.get("data", [])
    except (ConnectionError, TimeoutError) as e:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(e))


@router.get("/containers/{container_id}", response_model=ContainerDetailOut)
async def inspect_container(
    server_id: UUID,
    container_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("docker:read")),
):
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
            module="docker",
            operation="container.inspect",
            payload={"container_id": container_id},
            timeout_seconds=25,
        )
        if not res.get("success"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=res.get("error"))
        return res.get("data")
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/containers/{container_id}/action")
async def execute_container_action(
    server_id: UUID,
    container_id: str,
    req: ContainerActionRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("docker:manage")),
):
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor no encontrado.")

    if not agent_gateway.is_agent_connected(server.id):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El agente del servidor remoto no está conectado en este momento.",
        )

    correlation_id = str(uuid4())
    client_ip = request.client.host if request.client else "unknown"

    try:
        res = await agent_gateway.send_agent_request(
            server_id=server.id,
            module="docker",
            operation=f"container.{req.action}",
            payload={"container_id": container_id, "timeout": req.timeout_seconds},
            timeout_seconds=req.timeout_seconds + 10,
        )

        status_result = "success" if res.get("success") else "failure"
        err_code = None if res.get("success") else "DOCKER_ACTION_FAILED"

        await AuditService.log_event(
            db=db,
            correlation_id=correlation_id,
            operation=f"docker.container.{req.action}",
            resource_type="container",
            resource_id=container_id,
            server_id=server.id,
            status=status_result,
            error_code=err_code,
            user_id=current_user.id,
            username=current_user.username,
            client_ip=client_ip,
            details={"action": req.action, "timeout": req.timeout_seconds},
        )

        if not res.get("success"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=res.get("error"))

        return {"status": "success", "message": f"Acción '{req.action}' ejecutada con éxito."}

    except Exception as e:
        await AuditService.log_event(
            db=db,
            correlation_id=correlation_id,
            operation=f"docker.container.{req.action}",
            resource_type="container",
            resource_id=container_id,
            server_id=server.id,
            status="failure",
            error_code="GATEWAY_ERROR",
            user_id=current_user.id,
            username=current_user.username,
            client_ip=client_ip,
            details={"error": str(e)},
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/containers/{container_id}/logs")
async def get_container_logs(
    server_id: UUID,
    container_id: str,
    tail: int = Query(200, ge=10, le=2000),
    timestamps: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("docker:read")),
):
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
            module="docker",
            operation="container.logs",
            payload={"container_id": container_id, "tail": tail, "timestamps": timestamps},
            timeout_seconds=25,
        )
        if not res.get("success"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=res.get("error"))
        return {"logs": res.get("data", "")}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/images", response_model=List[ImageOut])
async def list_images(
    server_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("docker:read")),
):
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
            module="docker",
            operation="image.list",
            payload={},
            timeout_seconds=25,
        )
        if not res.get("success"):
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=res.get("error"))
        return res.get("data", [])
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/networks", response_model=List[NetworkOut])
async def list_networks(
    server_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("docker:read")),
):
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
            module="docker",
            operation="network.list",
            payload={},
            timeout_seconds=25,
        )
        if not res.get("success"):
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=res.get("error"))
        return res.get("data", [])
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/volumes", response_model=List[VolumeOut])
async def list_volumes(
    server_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("docker:read")),
):
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
            module="docker",
            operation="volume.list",
            payload={},
            timeout_seconds=25,
        )
        if not res.get("success"):
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=res.get("error"))
        return res.get("data", [])
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

