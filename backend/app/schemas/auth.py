"""
LinuxOps Manager — Esquemas de Autenticación y Sesión
"""

from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=8)
    totp_code: Optional[str] = Field(None, min_length=6, max_length=6)


class LoginResponse(BaseModel):
    status: str  # "authenticated" o "mfa_required"
    message: str
    user_id: Optional[UUID] = None
    username: Optional[str] = None
    email: Optional[str] = None
    roles: list[str] = []
    permissions: list[str] = []
    requires_mfa: bool = False


class MFASetupResponse(BaseModel):
    secret: str
    otpauth_url: str


class MFAVerifyRequest(BaseModel):
    totp_code: str = Field(..., min_length=6, max_length=6)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=8)
    new_password: str = Field(..., min_length=10)


class UserSessionOut(BaseModel):
    id: UUID
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    is_revoked: bool

    class Config:
        from_attributes = True

