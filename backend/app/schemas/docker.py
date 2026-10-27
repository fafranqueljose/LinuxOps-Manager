"""
LinuxOps Manager — Esquemas de Docker Engine
"""

from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


class ContainerPort(BaseModel):
    ip: Optional[str] = None
    private_port: int
    public_port: Optional[int] = None
    type: str = "tcp"


class ContainerOut(BaseModel):
    id: str
    names: List[str]
    image: str
    image_id: str
    state: str  # running, exited, paused, restarting
    status: str
    created: Union[int, str] = 0
    ports: List[ContainerPort] = []
    compose_project: Optional[str] = None
    compose_service: Optional[str] = None


class ContainerDetailOut(BaseModel):
    id: str
    name: str
    image: str
    created_at: str
    state: Dict[str, Any]
    restart_policy: Dict[str, Any]
    network_settings: Dict[str, Any]
    mounts: List[Dict[str, Any]]
    env_safe: List[str] = []  # Claves y valores filtrados para ocultar contraseñas/secretos
    stats: Optional[Dict[str, Any]] = None


class ContainerActionRequest(BaseModel):
    action: str = Field(..., pattern="^(start|stop|restart|pause|unpause)$")
    timeout_seconds: Optional[int] = Field(10, ge=1, le=120)


class ImageOut(BaseModel):
    id: str
    tags: List[str]
    size_bytes: int
    created: Union[int, str] = 0
    in_use: bool = False
    containers_count: int = 0


class NetworkOut(BaseModel):
    id: str
    name: str
    driver: str
    scope: str
    internal: bool = False
    containers: Dict[str, Any] = {}


class VolumeOut(BaseModel):
    name: str
    driver: str
    mountpoint: str
    in_use: bool = False
    containers: List[str] = []

