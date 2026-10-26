"""
LinuxOps Manager — Router de Incorporación, Identidad mTLS y Revocación de Agentes
"""

import datetime
from typing import List, Optional
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_permission
from app.core.security import hash_token
from app.models.server import Agent, EnrollmentToken, Server
from app.models.user import User
from app.schemas.server import AgentOut, EnrollmentConfirmRequest
from app.services.audit_service import AuditService
from app.services.pki_service import pki_service
from app.services.agent_gateway import agent_gateway

router = APIRouter(prefix="/agents", tags=["Agentes"])


@router.post("/enroll")
async def enroll_agent(
    req: EnrollmentConfirmRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Endpoint de incorporación pública/restringida para el agente remoto.
    Valida el token de un solo uso, firma la CSR y emite el certificado de cliente mTLS.
    """
    token_hash = hash_token(req.token)
    now = datetime.datetime.utcnow()

    stmt = select(EnrollmentToken).where(
        EnrollmentToken.token_hash == token_hash,
        EnrollmentToken.is_used.is_(False),
        EnrollmentToken.expires_at > now,
    )
    res = await db.execute(stmt)
    token_record = res.scalar_one_or_none()

    if not token_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de incorporación inválido, expirado o ya utilizado.",
        )

    server = await db.get(Server, token_record.server_id)
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor asociado no encontrado.")

    # Firmar la CSR del agente con la CA interna
    try:
        cert_pem, cert_serial, cert_fingerprint = pki_service.sign_agent_csr(
            csr_pem=req.csr_pem,
            agent_id=str(server.id),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error al procesar y firmar la solicitud CSR: {str(e)}",
        )

    # Actualizar o crear registro de Agente
    agent_stmt = select(Agent).where(Agent.server_id == server.id)
    agent_res = await db.execute(agent_stmt)
    agent = agent_res.scalar_one_or_none()

    if not agent:
        agent = Agent(
            server_id=server.id,
            agent_version=req.agent_version,
            cert_serial=cert_serial,
            cert_fingerprint_sha256=cert_fingerprint,
            is_revoked=False,
            last_seen_at=now,
        )
        db.add(agent)
    else:
        agent.agent_version = req.agent_version
        agent.cert_serial = cert_serial
        agent.cert_fingerprint_sha256 = cert_fingerprint
        agent.is_revoked = False
        agent.revoked_at = None
        agent.revoked_reason = None
        agent.last_seen_at = now

    # Marcar token como utilizado
    token_record.is_used = True
    token_record.used_at = now

    # Actualizar datos de sistema del servidor
    os_info = req.os_info or {}
    server.status = "offline"  # Esperando primera conexión mTLS / heartbeat
    reported_hostname = os_info.get("hostname")
    if reported_hostname:
        server.hostname = reported_hostname

    reported_ip = os_info.get("ip_address")
    if reported_ip:
        server.ip_address = reported_ip
    elif not server.ip_address and request.client:
        server.ip_address = request.client.host
    server.os_name = os_info.get("os_name", server.os_name)
    server.os_version = os_info.get("os_version", server.os_version)
    server.kernel = os_info.get("kernel", server.kernel)
    server.architecture = os_info.get("architecture", server.architecture)
    server.python_version = os_info.get("python_version", server.python_version)

    await db.flush()

    correlation_id = str(uuid4())
    client_ip = request.client.host if request.client else "unknown"
    await AuditService.log_event(
        db=db,
        correlation_id=correlation_id,
        operation="agent.enroll_success",
        resource_type="agent",
        resource_id=str(agent.id),
        server_id=server.id,
        status="success",
        client_ip=client_ip,
        details={
            "server_name": server.name,
            "cert_serial": cert_serial,
            "fingerprint": cert_fingerprint,
        },
    )

    ca_pem = pki_service.get_ca_certificate_pem()

    return {
        "status": "enrolled",
        "server_id": server.id,
        "agent_id": agent.id,
        "certificate_pem": cert_pem,
        "ca_certificate_pem": ca_pem,
    }


@router.get("", response_model=List[AgentOut])
async def list_agents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("agents:read")),
):
    stmt = select(Agent).order_by(Agent.created_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post("/{agent_id}/revoke")
async def revoke_agent(
    agent_id: UUID,
    request: Request,
    reason: Optional[str] = "Revocación administrativa por el operador",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("agents:revoke")),
):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agente no encontrado.")

    agent.is_revoked = True
    agent.revoked_at = datetime.datetime.utcnow()
    agent.revoked_reason = reason

    server = await db.get(Server, agent.server_id)
    if server:
        server.status = "revoked"
        # Desconectar websocket activo inmediatamente
        agent_gateway.unregister_agent(server.id)

    await db.flush()

    correlation_id = str(uuid4())
    client_ip = request.client.host if request.client else "unknown"
    await AuditService.log_event(
        db=db,
        correlation_id=correlation_id,
        operation="agent.revoke",
        resource_type="agent",
        resource_id=str(agent.id),
        server_id=agent.server_id,
        status="success",
        user_id=current_user.id,
        username=current_user.username,
        client_ip=client_ip,
        details={"reason": reason, "cert_serial": agent.cert_serial},
    )

    return {"status": "success", "message": f"Agente {agent_id} revocado correctamente."}

