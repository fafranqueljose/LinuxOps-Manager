"""
LinuxOps Manager — Router de Inventario y Gestión de Servidores Linux
"""

import datetime
from typing import List, Optional
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_permission
from app.core.security import generate_secure_token, hash_token
from app.models.server import Agent, EnrollmentToken, Server, ServerGroup
from app.models.metric import ServerMetric
from app.models.user import User
from app.schemas.metric import ServerMetricOut
from app.schemas.server import (
    EnrollmentInitResponse,
    ServerCreate,
    ServerDetailOut,
    ServerOut,
    ServerUpdate,
    AgentOut,
)
from app.services.audit_service import AuditService
from app.services.agent_gateway import agent_gateway

router = APIRouter(prefix="/servers", tags=["Servidores"])


def calculate_server_live_status(server: Server) -> str:
    """
    Calcula el estado real del servidor según el último heartbeat recibido.
    No asume que está online solo porque exista en la base de datos.
    """
    if server.status == "revoked":
        return "revoked"
    if server.status == "pending_enrollment":
        return "pending_enrollment"

    if not server.last_heartbeat_at:
        return "offline"

    now = datetime.datetime.utcnow()
    delta_seconds = (now - server.last_heartbeat_at).total_seconds()

    if delta_seconds <= settings.AGENT_HEARTBEAT_TIMEOUT_SECONDS:
        return "online"
    elif delta_seconds <= settings.AGENT_DEGRADED_THRESHOLD_SECONDS:
        return "degraded"
    else:
        return "offline"


@router.get("", response_model=List[ServerOut])
async def list_servers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("servers:read")),
    status_filter: Optional[str] = Query(None, alias="status"),
    group_id: Optional[UUID] = Query(None),
    search: Optional[str] = Query(None),
):
    stmt = select(Server).order_by(Server.created_at.desc())
    if group_id:
        stmt = stmt.where(Server.group_id == group_id)

    res = await db.execute(stmt)
    servers = res.scalars().all()

    output = []
    for s in servers:
        live_status = calculate_server_live_status(s)
        if status_filter and live_status != status_filter:
            continue

        if search:
            q = search.lower()
            name_match = q in (s.name or "").lower()
            host_match = q in (s.hostname or "").lower()
            ip_match = q in (s.ip_address or "").lower()
            if not (name_match or host_match or ip_match):
                continue

        # Obtener agente si existe
        agent_stmt = select(Agent).where(Agent.server_id == s.id)
        agent_res = await db.execute(agent_stmt)
        agent = agent_res.scalar_one_or_none()

        group_name = None
        if s.group_id:
            g = await db.get(ServerGroup, s.group_id)
            if g:
                group_name = g.name

        agent_out = None
        if agent:
            agent_out = AgentOut(
                id=agent.id,
                agent_version=agent.agent_version,
                cert_serial=agent.cert_serial,
                cert_fingerprint_sha256=agent.cert_fingerprint_sha256,
                is_revoked=agent.is_revoked,
                revoked_at=agent.revoked_at,
                revoked_reason=agent.revoked_reason,
                last_seen_at=agent.last_seen_at,
                created_at=agent.created_at,
            )

        output.append(
            ServerOut(
                id=s.id,
                name=s.name,
                hostname=s.hostname,
                ip_address=s.ip_address,
                group_id=s.group_id,
                group_name=group_name,
                status=live_status,
                os_name=s.os_name,
                os_version=s.os_version,
                kernel=s.kernel,
                architecture=s.architecture,
                python_version=s.python_version,
                uptime_seconds=s.uptime_seconds,
                cpu_count=s.cpu_count,
                cpu_percent=s.cpu_percent,
                total_ram_bytes=s.total_ram_bytes,
                free_ram_bytes=s.free_ram_bytes,
                ram_percent=s.ram_percent,
                total_disk_bytes=s.total_disk_bytes,
                free_disk_bytes=s.free_disk_bytes,
                disk_percent=s.disk_percent,
                load_1=s.load_1,
                load_5=s.load_5,
                load_15=s.load_15,
                container_count=s.container_count,
                failed_services_count=s.failed_services_count,
                tags=s.tags or {},
                last_heartbeat_at=s.last_heartbeat_at,
                created_at=s.created_at,
                agent=agent_out,
            )
        )
    return output


@router.post("", response_model=EnrollmentInitResponse, status_code=status.HTTP_201_CREATED)
async def create_server_and_init_enrollment(
    req: ServerCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("servers:create")),
):
    """
    Registra un servidor en el inventario y genera un token de incorporación seguro
    de un solo uso con caducidad limitada y comando curl listo para ejecutar en el servidor remoto.
    """
    existing = await db.execute(select(Server).where(Server.name == req.name))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ya existe un servidor con el nombre '{req.name}'.",
        )

    server = Server(
        name=req.name,
        hostname=req.hostname,
        ip_address=req.ip_address,
        group_id=req.group_id,
        status="pending_enrollment",
        tags=req.tags or {},
    )
    db.add(server)
    await db.flush()

    # Generar token de incorporación de un solo uso
    raw_enrollment_token = generate_secure_token(32)
    token_hash = hash_token(raw_enrollment_token)
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(
        minutes=settings.AGENT_ENROLLMENT_TOKEN_EXPIRE_MINUTES
    )

    token_record = EnrollmentToken(
        server_id=server.id,
        token_hash=token_hash,
        expires_at=expires_at,
        is_used=False,
        created_by_user_id=current_user.id,
    )
    db.add(token_record)
    await db.flush()

    correlation_id = str(uuid4())
    client_ip = request.client.host if request.client else "unknown"
    await AuditService.log_event(
        db=db,
        correlation_id=correlation_id,
        operation="servers.create",
        resource_type="server",
        resource_id=str(server.id),
        status="success",
        user_id=current_user.id,
        username=current_user.username,
        client_ip=client_ip,
        details={"server_name": server.name},
    )

    install_cmd = (
        f"curl -sSL {settings.APP_URL}/install-agent.sh | sudo bash -s -- "
        f"--server-url {settings.APP_URL} --token {raw_enrollment_token} --server-id {server.id}"
    )

    return EnrollmentInitResponse(
        server_id=server.id,
        enrollment_token=raw_enrollment_token,
        expires_at=expires_at,
        install_command=install_cmd,
    )


@router.get("/{server_id}", response_model=ServerDetailOut)
async def get_server_detail(
    server_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("servers:read")),
):
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor no encontrado.")

    live_status = calculate_server_live_status(server)
    is_connected = agent_gateway.is_agent_connected(server.id)

    agent_stmt = select(Agent).where(Agent.server_id == server.id)
    agent_res = await db.execute(agent_stmt)
    agent = agent_res.scalar_one_or_none()

    group_name = None
    if server.group_id:
        g = await db.get(ServerGroup, server.group_id)
        if g:
            group_name = g.name

    agent_out = None
    agent_status_str = "uninstalled"
    if agent:
        if agent.is_revoked:
            agent_status_str = "revoked"
        elif is_connected:
            agent_status_str = "connected"
        else:
            agent_status_str = "disconnected"

        agent_out = AgentOut(
            id=agent.id,
            agent_version=agent.agent_version,
            cert_serial=agent.cert_serial,
            cert_fingerprint_sha256=agent.cert_fingerprint_sha256,
            is_revoked=agent.is_revoked,
            revoked_at=agent.revoked_at,
            revoked_reason=agent.revoked_reason,
            last_seen_at=agent.last_seen_at,
            created_at=agent.created_at,
        )

    return ServerDetailOut(
        id=server.id,
        name=server.name,
        hostname=server.hostname,
        ip_address=server.ip_address,
        group_id=server.group_id,
        group_name=group_name,
        status=live_status,
        os_name=server.os_name,
        os_version=server.os_version,
        kernel=server.kernel,
        architecture=server.architecture,
        python_version=server.python_version,
        uptime_seconds=server.uptime_seconds,
        cpu_count=server.cpu_count,
        cpu_percent=server.cpu_percent,
        total_ram_bytes=server.total_ram_bytes,
        free_ram_bytes=server.free_ram_bytes,
        ram_percent=server.ram_percent,
        total_disk_bytes=server.total_disk_bytes,
        free_disk_bytes=server.free_disk_bytes,
        disk_percent=server.disk_percent,
        load_1=server.load_1,
        load_5=server.load_5,
        load_15=server.load_15,
        container_count=server.container_count,
        failed_services_count=server.failed_services_count,
        tags=server.tags or {},
        last_heartbeat_at=server.last_heartbeat_at,
        created_at=server.created_at,
        agent=agent_out,
        connectivity_status="connected" if is_connected else "disconnected",
        agent_status=agent_status_str,
    )


@router.get("/{server_id}/metrics", response_model=List[ServerMetricOut])
async def get_server_metrics_history(
    server_id: UUID,
    hours: int = Query(6, ge=1, le=72),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("servers:read")),
):
    since = datetime.datetime.utcnow() - datetime.timedelta(hours=hours)
    stmt = (
        select(ServerMetric)
        .where(ServerMetric.server_id == server_id, ServerMetric.timestamp >= since)
        .order_by(ServerMetric.timestamp.asc())
    )
    res = await db.execute(stmt)
    records = res.scalars().all()
    return records


@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_server(
    server_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("servers:delete")),
):
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor no encontrado.")

    correlation_id = str(uuid4())
    client_ip = request.client.host if request.client else "unknown"
    await AuditService.log_event(
        db=db,
        correlation_id=correlation_id,
        operation="servers.delete",
        resource_type="server",
        resource_id=str(server.id),
        status="success",
        user_id=current_user.id,
        username=current_user.username,
        client_ip=client_ip,
        details={"server_name": server.name},
    )

    await db.delete(server)
    await db.flush()
    return None

