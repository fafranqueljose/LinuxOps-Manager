"""
LinuxOps Manager — Esquemas de Usuarios, Roles y Permisos
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field


class PermissionOut(BaseModel):
    id: UUID
    code: str
    module: str
    description: Optional[str] = None

    class Config:
        from_attributes = True


class RoleCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=64)
    description: Optional[str] = None
    permission_ids: List[UUID] = []


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permission_ids: Optional[List[UUID]] = None


class RoleOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    is_system_role: bool
    permissions: List[PermissionOut] = []
    created_at: datetime

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    email: EmailStr
    full_name: Optional[str] = None
    password: str = Field(..., min_length=8)
    role_ids: List[UUID] = []


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    role_ids: Optional[List[UUID]] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


class AdminResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8)


class UserOut(BaseModel):
    id: UUID
    username: str
    email: str
    full_name: Optional[str] = None
    is_active: bool
    is_superuser: bool
    mfa_enabled: bool
    roles: List[str] = []
    created_at: datetime

    class Config:
        from_attributes = True
