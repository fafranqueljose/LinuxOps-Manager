"""
LinuxOps Manager — Esquemas de Servicios Linux (systemd)
"""

from typing import Optional
from pydantic import BaseModel, Field


class SystemdUnitOut(BaseModel):
    unit: str
    load_state: str     # loaded, not-found, bad-setting, error, masked
    active_state: str   # active, reloading, inactive, failed, activating, deactivating
    sub_state: str      # running, exited, failed, dead
    description: str
    unit_file_state: Optional[str] = None  # enabled, disabled, static, masked


class SystemdUnitDetailOut(SystemdUnitOut):
    main_pid: Optional[int] = None
    memory_current_bytes: Optional[int] = None
    cpu_usage_nsec: Optional[int] = None
    started_at: Optional[str] = None
    exec_start: Optional[str] = None


class SystemdActionRequest(BaseModel):
    unit: str = Field(..., pattern=r"^[a-zA-Z0-9@_.-]+\.service$")
    action: str = Field(..., pattern="^(start|stop|restart|reload)$")

