"""
LinuxOps Manager — Esquemas de Auditoría
"""

from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID
from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: UUID
    correlation_id: str
    user_id: Optional[UUID]
    username: Optional[str]
    server_id: Optional[UUID]
    agent_id: Optional[UUID]
    operation: str
    resource_type: str
    resource_id: Optional[str]
    status: str
    error_code: Optional[str]
    client_ip: Optional[str]
    duration_ms: int
    details: Dict[str, Any]
    prev_hash: str
    entry_hash: str
    created_at: datetime

    class Config:
        from_attributes = True


class AuditIntegrityReportOut(BaseModel):
    is_valid: bool
    total_records_checked: int
    corrupted_records_count: int
    first_corrupted_id: Optional[UUID] = None
    verification_timestamp: datetime

