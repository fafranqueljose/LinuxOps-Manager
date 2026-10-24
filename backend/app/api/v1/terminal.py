"""
LinuxOps Manager — Router de Gestión de Sesiones de Terminal Web (PTY)
"""

import datetime
from typing import List
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_permission
from app.models.server import Server
from app.models.task import TerminalSession
from app.models.user import User
from app.schemas.terminal import TerminalOpenRequest, TerminalSessionOut
from app.services.agent_gateway import agent_gateway
from app.services.audit_service import AuditService

router = APIRouter(prefix="/servers/{server_id}/terminal", tags=["Terminal Remota"])


@router.post("/open", response_model=TerminalSessionOut)
async def open_terminal_session(
    server_id: UUID,
    req: TerminalOpenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("terminal:access")),
):
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor no encontrado.")

    if not agent_gateway.is_agent_connected(server.id):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El servidor no tiene un agente conectado en este momento.",
        )

    # Verificar límite de sesiones concurrentes por usuario
    stmt = select(TerminalSession).where(
        TerminalSession.user_id == current_user.id,
        TerminalSession.status == "active",
    )
    res = await db.execute(stmt)
    active_count = len(res.scalars().all())

    if active_count >= settings.TERMINAL_MAX_CONCURRENT_SESSIONS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Ha alcanzado el límite máximo de {settings.TERMINAL_MAX_CONCURRENT_SESSIONS_PER_USER} sesiones de terminal simultáneas.",
        )

    correlation_id = str(uuid4())
    client_ip = request.client.host if request.client else "unknown"

    # Registrar sesión en base de datos
    terminal_session = TerminalSession(
        server_id=server.id,
        user_id=current_user.id,
        pty_user="linuxops-pty",
        status="active",
        client_ip=client_ip,
        started_at=datetime.datetime.utcnow(),
    )
    db.add(terminal_session)
    await db.flush()

    await AuditService.log_event(
        db=db,
        correlation_id=correlation_id,
        operation="terminal.open",
        resource_type="terminal_session",
        resource_id=str(terminal_session.id),
        server_id=server.id,
        status="success",
        user_id=current_user.id,
        username=current_user.username,
        client_ip=client_ip,
        details={"pty_user": terminal_session.pty_user},
    )

    return terminal_session


@router.post("/sessions/{session_id}/terminate")
async def terminate_terminal_session(
    server_id: UUID,
    session_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("terminal:access")),
):
    session = await db.get(TerminalSession, session_id)
    if not session or session.server_id != server_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión de terminal no encontrada.")

    # Solo el propietario o un superadmin pueden cerrarla
    if session.user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permisos para revocar esta sesión.")

    session.status = "terminated_by_admin"
    session.closed_at = datetime.datetime.utcnow()
    session.duration_seconds = int((session.closed_at - session.started_at).total_seconds())
    await db.flush()

    correlation_id = str(uuid4())
    client_ip = request.client.host if request.client else "unknown"
    await AuditService.log_event(
        db=db,
        correlation_id=correlation_id,
        operation="terminal.terminate",
        resource_type="terminal_session",
        resource_id=str(session.id),
        server_id=server_id,
        status="success",
        user_id=current_user.id,
        username=current_user.username,
        client_ip=client_ip,
        details={"duration_seconds": session.duration_seconds},
    )

    return {"status": "success", "message": "Sesión de terminal finalizada."}

