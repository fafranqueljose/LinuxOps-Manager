"""
LinuxOps Manager — Servicio de Auditoría con Cadena Criptográfica Anti-Manipulación
"""

import datetime
from typing import Any, Dict, Optional, Tuple
from uuid import UUID
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit import AuditLog

# Palabras clave de campos sensibles que DEBEN ser ofuscados
SENSITIVE_KEYS = {
    "password", "secret", "token", "key", "private", "credential", 
    "dsn", "authorization", "bearer", "cookie", "totp", "mfa"
}


def sanitize_audit_payload(data: Any) -> Any:
    """Filtra recursivamente cualquier clave o contenido sensible."""
    if isinstance(data, dict):
        sanitized = {}
        for k, v in data.items():
            k_lower = str(k).lower()
            if any(s in k_lower for s in SENSITIVE_KEYS):
                sanitized[k] = "[REDACTED]"
            else:
                sanitized[k] = sanitize_audit_payload(v)
        return sanitized
    elif isinstance(data, list):
        return [sanitize_audit_payload(item) for item in data]
    return data


class AuditService:
    GENESIS_HASH = "0" * 64

    @staticmethod
    async def log_event(
        db: AsyncSession,
        correlation_id: str,
        operation: str,
        resource_type: str,
        status: str,  # success, failure, denied
        user_id: Optional[UUID] = None,
        username: Optional[str] = None,
        server_id: Optional[UUID] = None,
        agent_id: Optional[UUID] = None,
        resource_id: Optional[str] = None,
        error_code: Optional[str] = None,
        client_ip: Optional[str] = None,
        duration_ms: int = 0,
        details: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        """
        Registra un evento en la tabla append-only de auditoría con encadenamiento criptográfico.
        """
        safe_details = sanitize_audit_payload(details or {})
        
        # Obtener el hash del último registro registrado
        stmt = select(AuditLog.entry_hash).order_by(desc(AuditLog.created_at)).limit(1)
        res = await db.execute(stmt)
        last_hash = res.scalar_one_or_none()
        prev_hash = last_hash if last_hash else AuditService.GENESIS_HASH

        now_utc = datetime.datetime.utcnow()
        now_iso = now_utc.isoformat()

        entry_hash = AuditLog.calculate_entry_hash(
            prev_hash=prev_hash,
            correlation_id=correlation_id,
            user_id=str(user_id) if user_id else "system",
            operation=operation,
            resource_type=resource_type,
            resource_id=resource_id or "",
            status=status,
            created_at_iso=now_iso,
            details=safe_details,
        )

        audit_entry = AuditLog(
            correlation_id=correlation_id,
            user_id=user_id,
            username=username,
            server_id=server_id,
            agent_id=agent_id,
            operation=operation,
            resource_type=resource_type,
            resource_id=resource_id,
            status=status,
            error_code=error_code,
            client_ip=client_ip,
            duration_ms=duration_ms,
            details=safe_details,
            prev_hash=prev_hash,
            entry_hash=entry_hash,
            created_at=now_utc,
        )
        db.add(audit_entry)
        await db.flush()
        return audit_entry

    @staticmethod
    async def verify_audit_trail(db: AsyncSession) -> Tuple[bool, int, int, Optional[UUID]]:
        """
        Verifica la integridad de la cadena criptográfica completa de auditoría.
        Devuelve (es_valida, total_revisados, corruptos_encontrados, primer_id_corrupto).
        """
        stmt = select(AuditLog).order_by(AuditLog.created_at.asc())
        res = await db.execute(stmt)
        logs = res.scalars().all()

        if not logs:
            return True, 0, 0, None

        expected_prev = AuditService.GENESIS_HASH
        corrupted_count = 0
        first_bad_id = None

        for entry in logs:
            if entry.prev_hash != expected_prev:
                corrupted_count += 1
                if not first_bad_id:
                    first_bad_id = entry.id

            calculated = AuditLog.calculate_entry_hash(
                prev_hash=entry.prev_hash,
                correlation_id=entry.correlation_id,
                user_id=str(entry.user_id) if entry.user_id else "system",
                operation=entry.operation,
                resource_type=entry.resource_type,
                resource_id=entry.resource_id or "",
                status=entry.status,
                created_at_iso=entry.created_at.isoformat(),
                details=entry.details,
            )

            if calculated != entry.entry_hash:
                corrupted_count += 1
                if not first_bad_id:
                    first_bad_id = entry.id

            expected_prev = entry.entry_hash

        is_valid = (corrupted_count == 0)
        return is_valid, len(logs), corrupted_count, first_bad_id

