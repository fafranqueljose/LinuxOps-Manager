"""
LinuxOps Manager — Esquemas de Alertas y Configuración
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class AlertOut(BaseModel):
    id: UUID
    server_id: Optional[UUID]
    server_name: Optional[str] = None
    severity: str
    title: str
    message: str
    is_resolved: bool
    resolved_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class AlertResolveRequest(BaseModel):
    resolved: bool = True


class SystemSettingOut(BaseModel):
    key: str
    value: Any
    description: Optional[str] = None
    is_read_only: bool
    updated_at: datetime

    class Config:
        from_attributes = True


class SystemSettingUpdate(BaseModel):
    value: Any

