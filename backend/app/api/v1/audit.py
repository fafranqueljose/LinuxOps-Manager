"""
LinuxOps Manager — Router de Auditoría y Verificación Criptográfica de Integridad
"""

import datetime
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_permission
from app.models.audit import AuditLog
from app.models.user import User
from app.schemas.audit import AuditIntegrityReportOut, AuditLogOut
from app.services.audit_service import AuditService

router = APIRouter(prefix="/audit", tags=["Auditoría"])


@router.get("", response_model=List[AuditLogOut])
async def list_audit_logs(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    operation: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    username: Optional[str] = Query(None),
    server_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("audit:read")),
):
    stmt = select(AuditLog).order_by(desc(AuditLog.created_at)).offset(offset).limit(limit)

    if operation:
        stmt = stmt.where(AuditLog.operation == operation)
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type == resource_type)
    if status:
        stmt = stmt.where(AuditLog.status == status)
    if username:
        stmt = stmt.where(AuditLog.username == username)
    if server_id:
        stmt = stmt.where(AuditLog.server_id == server_id)

    res = await db.execute(stmt)
    return res.scalars().all()


@router.get("/verify-integrity", response_model=AuditIntegrityReportOut)
async def verify_audit_trail_integrity(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("audit:verify")),
):
    """
    Verifica criptográficamente el encadenamiento SHA-256 de todas las entradas de auditoría.
    Permite detectar alteraciones, eliminaciones o manipulaciones externas en la base de datos.
    """
    is_valid, total_checked, bad_count, first_bad_id = await AuditService.verify_audit_trail(db)

    return AuditIntegrityReportOut(
        is_valid=is_valid,
        total_records_checked=total_checked,
        corrupted_records_count=bad_count,
        first_corrupted_id=first_bad_id,
        verification_timestamp=datetime.datetime.utcnow(),
    )

