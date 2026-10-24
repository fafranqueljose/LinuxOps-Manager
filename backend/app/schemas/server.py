"""
LinuxOps Manager — Esquemas de Servidores, Grupos y Registro de Agentes
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class ServerGroupCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=64)
    description: Optional[str] = None
    environment: str = Field("production", min_length=2, max_length=32)
    tags: Dict[str, Any] = {}


class ServerGroupOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    environment: str
    tags: Dict[str, Any] = {}
    created_at: datetime

    class Config:
        from_attributes = True


class ServerCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=128)
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    group_id: Optional[UUID] = None
    tags: Dict[str, Any] = {}


class ServerUpdate(BaseModel):
    name: Optional[str] = None
    group_id: Optional[UUID] = None
    tags: Optional[Dict[str, Any]] = None


class AgentOut(BaseModel):
    id: UUID
    agent_version: str
    cert_serial: Optional[str]
    cert_fingerprint_sha256: Optional[str]
    is_revoked: bool
    revoked_at: Optional[datetime]
    revoked_reason: Optional[str]
    last_seen_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class ServerOut(BaseModel):
    id: UUID
    name: str
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    group_id: Optional[UUID] = None
    group_name: Optional[str] = None
    status: str
    os_name: Optional[str] = None
    os_version: Optional[str] = None
    kernel: Optional[str] = None
    architecture: Optional[str] = None
    python_version: Optional[str] = None
    uptime_seconds: int = 0
    cpu_count: int = 1
    cpu_percent: float = 0.0
    total_ram_bytes: int = 0
    free_ram_bytes: int = 0
    ram_percent: float = 0.0
    total_disk_bytes: int = 0
    free_disk_bytes: int = 0
    disk_percent: float = 0.0
    load_1: float = 0.0
    load_5: float = 0.0
    load_15: float = 0.0
    container_count: int = 0
    failed_services_count: int = 0
    tags: Dict[str, Any] = {}
    last_heartbeat_at: Optional[datetime] = None
    created_at: datetime
    agent: Optional[AgentOut] = None

    class Config:
        from_attributes = True


class ServerDetailOut(ServerOut):
    connectivity_status: str = "offline"
    agent_status: str = "uninstalled"


class EnrollmentInitResponse(BaseModel):
    server_id: UUID
    enrollment_token: str  # Token plano de un solo uso que se muestra únicamente al crearse
    expires_at: datetime
    install_command: str


class EnrollmentConfirmRequest(BaseModel):
    token: str
    csr_pem: str
    agent_version: str = "1.0.0"
    os_info: Dict[str, Any] = {}

