"""
LinuxOps Manager — Esquemas de Validación Pydantic v2
"""

from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    MFASetupResponse,
    MFAVerifyRequest,
    PasswordChangeRequest,
    UserSessionOut,
)
from app.schemas.user import (
    UserCreate,
    UserUpdate,
    UserOut,
    RoleCreate,
    RoleUpdate,
    RoleOut,
    PermissionOut,
)
from app.schemas.server import (
    ServerCreate,
    ServerUpdate,
    ServerOut,
    ServerDetailOut,
    ServerGroupCreate,
    ServerGroupOut,
    EnrollmentInitResponse,
    EnrollmentConfirmRequest,
    AgentOut,
)
from app.schemas.metric import MetricRecordIn, DashboardSummaryOut
from app.schemas.docker import (
    ContainerOut,
    ContainerDetailOut,
    ContainerActionRequest,
    ImageOut,
    NetworkOut,
    VolumeOut,
)
from app.schemas.systemd import (
    SystemdUnitOut,
    SystemdUnitDetailOut,
    SystemdActionRequest,
)
from app.schemas.terminal import TerminalOpenRequest, TerminalSessionOut
from app.schemas.audit import AuditLogOut, AuditIntegrityReportOut
from app.schemas.alert import AlertOut, SystemSettingOut, SystemSettingUpdate

__all__ = [
    "LoginRequest",
    "LoginResponse",
    "MFASetupResponse",
    "MFAVerifyRequest",
    "PasswordChangeRequest",
    "UserSessionOut",
    "UserCreate",
    "UserUpdate",
    "UserOut",
    "RoleCreate",
    "RoleUpdate",
    "RoleOut",
    "PermissionOut",
    "ServerCreate",
    "ServerUpdate",
    "ServerOut",
    "ServerDetailOut",
    "ServerGroupCreate",
    "ServerGroupOut",
    "EnrollmentInitResponse",
    "EnrollmentConfirmRequest",
    "AgentOut",
    "MetricRecordIn",
    "DashboardSummaryOut",
    "ContainerOut",
    "ContainerDetailOut",
    "ContainerActionRequest",
    "ImageOut",
    "NetworkOut",
    "VolumeOut",
    "SystemdUnitOut",
    "SystemdUnitDetailOut",
    "SystemdActionRequest",
    "TerminalOpenRequest",
    "TerminalSessionOut",
    "AuditLogOut",
    "AuditIntegrityReportOut",
    "AlertOut",
    "SystemSettingOut",
    "SystemSettingUpdate",
]

