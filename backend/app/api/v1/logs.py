"""
LinuxOps Manager — API de Gestión, Ingestión y Consulta de Logs Centralizados
"""

import csv
import datetime
import io
import json
import logging
from typing import List, Optional
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import check_server_resource_access, get_current_user, require_permission
from app.models.server import Agent, Server
from app.models.user import User
from app.schemas.logs import (
    LogBatchIngestIn,
    LogBatchIngestOut,
    LogHealthStatus,
    LogQueryResultOut,
    LogSourceItemOut,
)
from app.services.audit_service import AuditService
from app.services.loki_service import loki_service

logger = logging.getLogger("linuxops.api.logs")
router = APIRouter(prefix="/logs", tags=["Logs"])


@router.post("/ingest", response_model=LogBatchIngestOut, status_code=status.HTTP_202_ACCEPTED)
async def ingest_logs(
    payload: LogBatchIngestIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_ssl_client_fingerprint: Optional[str] = Header(None, alias="X-SSL-Client-Fingerprint"),
    x_ssl_client_serial: Optional[str] = Header(None, alias="X-SSL-Client-Serial"),
):
    """
    Punto de ingestión HTTPS para el agente remoto de LinuxOps.
    Valida la existencia del servidor y el estado activo/no revocado de su agente mTLS.
    Envía los registros sanitizados directamente a Grafana Loki en la red interna.
    """
    server_id = payload.server_id
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Servidor emisor no encontrado en el inventario.",
        )

    # Validar que el agente registrado no esté revocado
    agent_stmt = select(Agent).where(Agent.server_id == server_id)
    agent_res = await db.execute(agent_stmt)
    agent = agent_res.scalar_one_or_none()

    if not agent or agent.is_revoked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El agente del servidor no está registrado o se encuentra revocado.",
        )

    # Si se recibe verificación mTLS desde proxy inverso (Nginx), contrastar huella digital
    if x_ssl_client_fingerprint and agent.cert_fingerprint_sha256:
        if x_ssl_client_fingerprint.lower() != agent.cert_fingerprint_sha256.lower():
            logger.warning(
                f"Huella mTLS no coincide para servidor {server_id}: "
                f"esperada={agent.cert_fingerprint_sha256}, recibida={x_ssl_client_fingerprint}"
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Huella digital de certificado mTLS no coincide.",
            )

    if not payload.records:
        return LogBatchIngestOut(
            status="accepted",
            batch_id=payload.batch_id,
            accepted_count=0,
            server_id=server_id,
        )

    # Empujar registros a Loki de manera interna y segura
    try:
        pushed_count = await loki_service.push_logs(
            server_id=server_id,
            server_name=server.name,
            records=payload.records,
        )
    except Exception as e:
        logger.error(f"Error procesando lote de logs {payload.batch_id} para servidor {server_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Fallo al persistir registros en Loki: {str(e)}",
        )

    return LogBatchIngestOut(
        status="accepted",
        batch_id=payload.batch_id,
        accepted_count=pushed_count,
        server_id=server_id,
    )


@router.get("/health", response_model=LogHealthStatus)
async def get_logging_health(
    current_user: User = Depends(get_current_user),
):
    """Comprueba el estado de disponibilidad del subsistema de logs (Loki)."""
    return await loki_service.check_health()


@router.get("/query", response_model=LogQueryResultOut)
async def query_logs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("logs:read")),
    server_id: Optional[UUID] = Query(None, description="Filtrar por servidor específico"),
    source: Optional[str] = Query(None, description="docker | systemd | syslog | all"),
    service: Optional[str] = Query(None, description="Nombre de contenedor o unidad systemd"),
    level: Optional[str] = Query(None, description="debug | info | warning | error | critical"),
    search: Optional[str] = Query(None, description="Término de búsqueda de texto"),
    start_time: Optional[datetime.datetime] = Query(None, description="Fecha de inicio UTC"),
    end_time: Optional[datetime.datetime] = Query(None, description="Fecha de fin UTC"),
    limit: int = Query(200, ge=1, le=2000, description="Límite de registros"),
    direction: str = Query("BACKWARD", description="BACKWARD o FORWARD"),
):
    """
    Consulta registros de logs con filtros combinados, respetando el control de acceso granular por servidor.
    """
    # 1. Determinar servidores autorizados
    target_server_ids: List[UUID] = []

    if server_id:
        has_access = await check_server_resource_access(
            server_id=server_id,
            module="logs",
            action="read",
            user=current_user,
            db=db,
        )
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tiene autorización para visualizar los logs de este servidor.",
            )
        target_server_ids = [server_id]
    else:
        # Consulta global: filtrar a todos los servidores permitidos para el usuario
        all_servers_stmt = select(Server.id)
        srv_res = await db.execute(all_servers_stmt)
        all_ids = srv_res.scalars().all()

        if current_user.is_superuser:
            target_server_ids = all_ids
        else:
            for s_id in all_ids:
                if await check_server_resource_access(s_id, "logs", "read", current_user, db):
                    target_server_ids.append(s_id)

    if not target_server_ids:
        return LogQueryResultOut(
            total=0,
            records=[],
            query_duration_ms=0.0,
            loki_status="ok",
        )

    # 2. Consultar Loki
    records, duration_ms, loki_status = await loki_service.query_range(
        server_ids=target_server_ids,
        source=source,
        service=service,
        level=level,
        search=search,
        start_time=start_time,
        end_time=end_time,
        limit=limit,
        direction=direction,
    )

    return LogQueryResultOut(
        total=len(records),
        records=records,
        query_duration_ms=duration_ms,
        loki_status=loki_status,
    )


@router.get("/export")
async def export_logs(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("logs:export")),
    format: str = Query("csv", description="Formato de exportación: csv | json | txt"),
    server_id: Optional[UUID] = Query(None),
    source: Optional[str] = Query(None),
    service: Optional[str] = Query(None),
    level: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    start_time: Optional[datetime.datetime] = Query(None),
    end_time: Optional[datetime.datetime] = Query(None),
    limit: int = Query(1000, ge=1, le=5000),
):
    """
    Exporta registros de logs filtrados en formatos CSV, JSON estructurado o texto plano.
    Registra el evento de exportación en la pista criptográfica de auditoría.
    """
    # Validar permisos de acceso al servidor
    target_server_ids: List[UUID] = []
    if server_id:
        has_access = await check_server_resource_access(
            server_id=server_id,
            module="logs",
            action="export",
            user=current_user,
            db=db,
        )
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tiene permiso para exportar logs de este servidor.",
            )
        target_server_ids = [server_id]
    else:
        all_servers_stmt = select(Server.id)
        srv_res = await db.execute(all_servers_stmt)
        all_ids = srv_res.scalars().all()
        if current_user.is_superuser:
            target_server_ids = all_ids
        else:
            for s_id in all_ids:
                if await check_server_resource_access(s_id, "logs", "export", current_user, db):
                    target_server_ids.append(s_id)

    records, _, _ = await loki_service.query_range(
        server_ids=target_server_ids,
        source=source,
        service=service,
        level=level,
        search=search,
        start_time=start_time,
        end_time=end_time,
        limit=limit,
        direction="FORWARD",
    )

    # Auditar evento de exportación
    client_ip = request.client.host if request.client else "unknown"
    await AuditService.log_event(
        db=db,
        correlation_id=str(uuid4()),
        operation="logs.export",
        resource_type="logs",
        resource_id=str(server_id) if server_id else "all",
        server_id=server_id,
        user_id=current_user.id,
        username=current_user.username,
        status="success",
        client_ip=client_ip,
        details={
            "format": format,
            "record_count": len(records),
            "filters": {
                "source": source,
                "service": service,
                "level": level,
                "search": search,
            },
        },
    )

    timestamp_str = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"linuxops_logs_{timestamp_str}.{format.lower()}"

    if format.lower() == "json":
        json_data = json.dumps([r.model_dump(mode="json") for r in records], indent=2, ensure_ascii=False)
        return Response(
            content=json_data,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    elif format.lower() == "txt":
        txt_lines = []
        for r in records:
            dt = r.timestamp.strftime("%Y-%m-%d %H:%M:%S UTC")
            sname = r.server_name or str(r.server_id)
            txt_lines.append(f"[{dt}] [{sname}] [{r.source}] [{r.service}] [{r.level.upper()}] {r.message}")
        content = "\n".join(txt_lines)
        return Response(
            content=content,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    else:  # CSV por defecto
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["timestamp", "server_id", "server_name", "source", "service", "level", "stream", "message"])
        for r in records:
            writer.writerow([
                r.timestamp.isoformat(),
                str(r.server_id),
                r.server_name or "",
                r.source,
                r.service,
                r.level,
                r.stream or "",
                r.message,
            ])
        output.seek(0)
        return Response(
            content=output.getvalue(),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


@router.get("/sources", response_model=List[LogSourceItemOut])
async def get_log_sources(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("logs:read")),
    server_id: Optional[UUID] = Query(None),
):
    """
    Retorna la lista de orígenes, servicios y contenedores disponibles para poblar
    los selectores de filtro en la interfaz gráfica.
    """
    query = select(Server).where(Server.status != "revoked")
    if server_id:
        query = query.where(Server.id == server_id)

    res = await db.execute(query)
    servers = res.scalars().all()

    # Obtener etiquetas dinámicas desde Loki
    active_services = await loki_service.get_label_values("service")

    items: List[LogSourceItemOut] = []
    for s in servers:
        # Separar nombres que parezcan servicios systemd (.service) de contenedores docker
        containers = [svc for svc in active_services if not svc.endswith(".service")]
        services = [svc for svc in active_services if svc.endswith(".service")]

        items.append(
            LogSourceItemOut(
                server_id=s.id,
                server_name=s.name,
                sources=["docker", "systemd", "syslog"],
                containers=containers,
                services=services,
            )
        )

    return items

