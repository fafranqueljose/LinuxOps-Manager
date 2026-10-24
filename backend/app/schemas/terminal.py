"""
LinuxOps Manager — Esquemas de Terminal Web
"""

from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field


class TerminalOpenRequest(BaseModel):
    cols: int = Field(80, ge=20, le=300)
    rows: int = Field(24, ge=5, le=100)
    sudo_required: bool = False
    step_up_token: Optional[str] = None  # Requerido para servidores en producción


class TerminalSessionOut(BaseModel):
    id: UUID
    server_id: UUID
    user_id: UUID
    pty_user: str
    status: str
    client_ip: Optional[str]
    started_at: datetime
    closed_at: Optional[datetime]
    duration_seconds: int

    class Config:
        from_attributes = True

