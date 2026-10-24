"""
LinuxOps Manager — Router de Servicios del Sistema (systemd)
Permite consultar y administrar unidades systemd de forma segura y auditada.
"""

from typing import List, Optional
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_permission
from app.models.server import Server
from app.models.user import User
from app.schemas.systemd import (
    SystemdActionRequest,
    SystemdUnitDetailOut,
    SystemdUnitOut,
)
from app.services.agent_gateway import agent_gateway
from app.services.audit_service import AuditService

router = APIRouter(prefix="/servers/{server_id}/systemd", tags=["Servicios Linux (systemd)"])


@router.get("/units", response_model=List[SystemdUnitOut])
async def list_systemd_units(
    server_id: UUID,
    state_filter: Optional[str] = Query(None, alias="state"),  # active, failed, inactive
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("systemd:read")),
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
            module="systemd",
            operation="unit.list",
            payload={"state": state_filter},
            timeout_seconds=20,
        )
        if not res.get("success"):
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=res.get("error"))
        return res.get("data", [])
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/units/{unit_name}", response_model=SystemdUnitDetailOut)
async def inspect_systemd_unit(
    server_id: UUID,
    unit_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("systemd:read")),
):
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor no encontrado.")

    try:
        res = await agent_gateway.send_agent_request(
            server_id=server.id,
            module="systemd",
            operation="unit.inspect",
            payload={"unit": unit_name},
            timeout_seconds=20,
        )
        if not res.get("success"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=res.get("error"))
        return res.get("data")
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/units/action")
async def execute_systemd_action(
    server_id: UUID,
    req: SystemdActionRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("systemd:manage")),
):
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor no encontrado.")

    correlation_id = str(uuid4())
    client_ip = request.client.host if request.client else "unknown"

    try:
        res = await agent_gateway.send_agent_request(
            server_id=server.id,
            module="systemd",
            operation=f"unit.{req.action}",
            payload={"unit": req.unit},
            timeout_seconds=30,
        )

        status_result = "success" if res.get("success") else "failure"
        err_code = None if res.get("success") else "SYSTEMD_ACTION_FAILED"

        await AuditService.log_event(
            db=db,
            correlation_id=correlation_id,
            operation=f"systemd.unit.{req.action}",
            resource_type="service",
            resource_id=req.unit,
            server_id=server.id,
            status=status_result,
            error_code=err_code,
            user_id=current_user.id,
            username=current_user.username,
            client_ip=client_ip,
            details={"unit": req.unit, "action": req.action},
        )

        if not res.get("success"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=res.get("error"))

        return {"status": "success", "message": f"Servicio '{req.unit}' {req.action} ejecutado con éxito."}

    except Exception as e:
        await AuditService.log_event(
            db=db,
            correlation_id=correlation_id,
            operation=f"systemd.unit.{req.action}",
            resource_type="service",
            resource_id=req.unit,
            server_id=server.id,
            status="failure",
            error_code="GATEWAY_ERROR",
            user_id=current_user.id,
            username=current_user.username,
            client_ip=client_ip,
            details={"error": str(e)},
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/units/{unit_name}/journal")
async def get_systemd_journal(
    server_id: UUID,
    unit_name: str,
    lines: int = Query(200, ge=10, le=2000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("systemd:read")),
):
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor no encontrado.")

    try:
        res = await agent_gateway.send_agent_request(
            server_id=server.id,
            module="systemd",
            operation="unit.journal",
            payload={"unit": unit_name, "lines": lines},
            timeout_seconds=25,
        )
        if not res.get("success"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=res.get("error"))
        return {"logs": res.get("data", "")}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

