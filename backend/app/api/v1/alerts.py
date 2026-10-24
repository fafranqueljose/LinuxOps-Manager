"""
LinuxOps Manager — Router de Alertas Operativas
"""

import datetime
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_permission
from app.models.alert import Alert
from app.models.server import Server
from app.models.user import User
from app.schemas.alert import AlertOut, AlertResolveRequest

router = APIRouter(prefix="/alerts", tags=["Alertas"])


@router.get("", response_model=List[AlertOut])
async def list_alerts(
    resolved: Optional[bool] = Query(False),
    severity: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("servers:read")),
):
    stmt = select(Alert).order_by(desc(Alert.created_at)).limit(limit)
    if resolved is not None:
        stmt = stmt.where(Alert.is_resolved == resolved)
    if severity:
        stmt = stmt.where(Alert.severity == severity)

    res = await db.execute(stmt)
    alerts = res.scalars().all()

    output = []
    for a in alerts:
        server_name = None
        if a.server_id:
            s = await db.get(Server, a.server_id)
            if s:
                server_name = s.name

        output.append(
            AlertOut(
                id=a.id,
                server_id=a.server_id,
                server_name=server_name,
                severity=a.severity,
                title=a.title,
                message=a.message,
                is_resolved=a.is_resolved,
                resolved_at=a.resolved_at,
                created_at=a.created_at,
            )
        )
    return output


@router.post("/{alert_id}/resolve", response_model=AlertOut)
async def resolve_alert(
    alert_id: UUID,
    req: AlertResolveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("servers:manage")),
):
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alerta no encontrada.")

    alert.is_resolved = req.resolved
    alert.resolved_at = datetime.datetime.utcnow() if req.resolved else None
    alert.resolved_by_user_id = current_user.id if req.resolved else None
    await db.flush()

    return AlertOut(
        id=alert.id,
        server_id=alert.server_id,
        severity=alert.severity,
        title=alert.title,
        message=alert.message,
        is_resolved=alert.is_resolved,
        resolved_at=alert.resolved_at,
        created_at=alert.created_at,
    )

