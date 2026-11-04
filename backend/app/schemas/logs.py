"""
LinuxOps Manager — Esquemas Pydantic para Logs Centralizados
"""

import datetime
import re
from typing import Any, Dict, List, Optional, Union
from uuid import UUID
from pydantic import BaseModel, Field, field_validator


class LogEventIn(BaseModel):
    timestamp: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)
    source: str = Field(..., description="Origen: docker, systemd, syslog, custom")
    service: str = Field(..., description="Nombre del contenedor o servicio systemd")
    level: str = Field(default="info", description="debug, info, notice, warning, error, critical")
    message: str = Field(..., description="Mensaje de log")
    stream: Optional[str] = Field(default="stdout", description="stdout, stderr, journal")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)

    @field_validator("timestamp", mode="before")
    def parse_flexible_timestamp(cls, v: Any) -> datetime.datetime:
        if isinstance(v, datetime.datetime):
            return v
        if isinstance(v, (int, float)):
            # Timestamp unix epoch
            return datetime.datetime.fromtimestamp(v, tz=datetime.timezone.utc)
        if isinstance(v, str):
            clean = v.strip()
            # Truncar nanosegundos (más de 6 dígitos después del punto) a microsegundos
            clean = re.sub(r"(\.\d{6})\d+", r"\1", clean)
            if clean.endswith("Z"):
                clean = clean[:-1] + "+00:00"
            try:
                return datetime.datetime.fromisoformat(clean)
            except Exception:
                pass
        return datetime.datetime.utcnow()


class LogBatchIngestIn(BaseModel):
    server_id: UUID = Field(..., description="ID del servidor emisor")
    batch_id: str = Field(..., description="UUID único del lote para idempotencia")
    sent_at: Optional[datetime.datetime] = Field(default_factory=datetime.datetime.utcnow)
    records: List[LogEventIn] = Field(..., description="Lista de registros de log")

    @field_validator("sent_at", mode="before")
    def parse_sent_at(cls, v: Any) -> datetime.datetime:
        if isinstance(v, datetime.datetime):
            return v
        if isinstance(v, str):
            clean = v.strip()
            clean = re.sub(r"(\.\d{6})\d+", r"\1", clean)
            if clean.endswith("Z"):
                clean = clean[:-1] + "+00:00"
            try:
                return datetime.datetime.fromisoformat(clean)
            except Exception:
                pass
        return datetime.datetime.utcnow()


class LogBatchIngestOut(BaseModel):
    status: str = "accepted"
    batch_id: str
    accepted_count: int
    server_id: UUID


class LogRecordOut(BaseModel):
    id: str
    timestamp: datetime.datetime
    server_id: UUID
    server_name: Optional[str] = None
    source: str
    service: str
    level: str
    message: str
    stream: Optional[str] = "stdout"
    metadata: Optional[Dict[str, Any]] = None


class LogQueryRequest(BaseModel):
    server_id: Optional[UUID] = None
    source: Optional[str] = None
    service: Optional[str] = None
    level: Optional[str] = None
    search: Optional[str] = None
    start_time: Optional[datetime.datetime] = None
    end_time: Optional[datetime.datetime] = None
    limit: int = Field(default=200, ge=1, le=2000)
    direction: str = Field(default="BACKWARD", description="BACKWARD o FORWARD")


class LogQueryResultOut(BaseModel):
    total: int
    records: List[LogRecordOut]
    query_duration_ms: float
    loki_status: str


class LogSourceItemOut(BaseModel):
    server_id: UUID
    server_name: str
    sources: List[str]
    containers: List[str]
    services: List[str]


class LogHealthStatus(BaseModel):
    status: str
    loki_ready: bool
    loki_url: str
    tenant_id: str
    details: Optional[str] = None
