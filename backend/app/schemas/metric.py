"""
LinuxOps Manager — Esquemas de Métricas y Dashboard
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel


class MetricRecordIn(BaseModel):
    timestamp: Optional[datetime] = None
    cpu_percent: float
    ram_percent: float
    ram_used_bytes: int
    disk_percent: float
    disk_used_bytes: int
    load_1: float
    load_5: float
    load_15: float
    running_containers: int = 0
    failed_services: int = 0


class ServerMetricOut(BaseModel):
    timestamp: datetime
    cpu_percent: float
    ram_percent: float
    ram_used_bytes: int
    disk_percent: float
    disk_used_bytes: int
    load_1: float
    load_5: float
    load_15: float

    class Config:
        from_attributes = True


class DashboardSummaryOut(BaseModel):
    total_servers: int = 0
    online_servers: int = 0
    offline_servers: int = 0
    degraded_servers: int = 0
    total_containers: int = 0
    running_containers: int = 0
    stopped_containers: int = 0
    failed_services_total: int = 0
    avg_cpu_percent: float = 0.0
    avg_ram_percent: float = 0.0
    calculation_method: str = "Media ponderada sobre servidores activos reportados en los últimos 5 minutos"
    recent_alerts_count: int = 0

