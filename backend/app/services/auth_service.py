"""
LinuxOps Manager — Servicio de Autenticación, MFA y Control de Fuerza Bruta
"""

import datetime
from typing import Optional, Tuple
from uuid import UUID
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.security import (
    encrypt_data,
    decrypt_data,
    generate_secure_token,
    generate_totp_secret,
    get_totp_uri,
    hash_password,
    hash_token,
    is_password_rehash_needed,
    verify_password,
    verify_totp_code,
)
from app.models.user import User, UserSession
from app.models.role import UserRole, Role, RolePermission, Permission


class AuthService:
    @staticmethod
    async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
        stmt = select(User).where(User.username == username)
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    @staticmethod
    async def get_user_by_id(db: AsyncSession, user_id: UUID) -> Optional[User]:
        stmt = select(User).where(User.id == user_id)
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    @staticmethod
    async def authenticate_user(
        db: AsyncSession,
        username: str,
        password: str,
        totp_code: Optional[str] = None,
    ) -> Tuple[Optional[User], str, bool]:
        """
        Autentica al usuario aplicando mitigación de fuerza bruta y validación MFA.
        Devuelve (user, error_message, requires_mfa).
        """
        user = await AuthService.get_user_by_username(db, username)
        if not user:
            return None, "Credenciales inválidas.", False

        if not user.is_active:
            return None, "La cuenta de usuario está desactivada.", False

        now = datetime.datetime.utcnow()
        # Verificar bloqueo temporal por intentos fallidos
        if user.locked_until and user.locked_until > now:
            minutes_left = int((user.locked_until - now).total_seconds() / 60) + 1
            return None, f"Cuenta bloqueada temporalmente por intentos fallidos. Reintente en {minutes_left} minutos.", False

        # Verificar contraseña con Argon2id
        if not verify_password(password, user.hashed_password):
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= settings.LOGIN_MAX_FAILED_ATTEMPTS:
                user.locked_until = now + datetime.timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
            await db.flush()
            return None, "Credenciales inválidas.", False

        # Actualizar rehash si los parámetros criptográficos se modificaron
        if is_password_rehash_needed(user.hashed_password):
            user.hashed_password = hash_password(password)

        # Si el usuario tiene MFA activado y no proporcionó código
        if user.mfa_enabled:
            if not totp_code:
                return user, "Código MFA requerido.", True
            
            # Validar código TOTP
            decrypted_secret = decrypt_data(user.mfa_secret_encrypted)
            if not decrypted_secret or not verify_totp_code(decrypted_secret, totp_code):
                return None, "Código MFA inválido o expirado.", False

        # Reiniciar contador de intentos fallidos tras login exitoso
        user.failed_login_attempts = 0
        user.locked_until = None
        await db.flush()

        return user, "", False

    @staticmethod
    async def create_user_session(
        db: AsyncSession,
        user_id: UUID,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Tuple[UserSession, str]:
        """
        Crea una sesión de usuario con token opaco seguro.
        Devuelve (objeto_sesion, raw_token_plano).
        Solo el hash SHA-256 se persiste en base de datos.
        """
        raw_token = generate_secure_token(32)
        token_hash = hash_token(raw_token)
        now = datetime.datetime.utcnow()
        expires_at = now + datetime.timedelta(minutes=settings.SESSION_EXPIRE_MINUTES)

        session = UserSession(
            user_id=user_id,
            session_token_hash=token_hash,
            ip_address=ip_address,
            user_agent=user_agent,
            expires_at=expires_at,
            created_at=now,
            last_seen_at=now,
            is_revoked=False,
        )
        db.add(session)
        await db.flush()
        return session, raw_token

    @staticmethod
    async def validate_session_token(db: AsyncSession, raw_token: str) -> Optional[User]:
        """Valida el token de sesión y devuelve el usuario si es válida y no ha expirado."""
        if not raw_token:
            return None
        token_hash = hash_token(raw_token)
        now = datetime.datetime.utcnow()

        stmt = (
            select(UserSession, User)
            .join(User, UserSession.user_id == User.id)
            .where(
                UserSession.session_token_hash == token_hash,
                UserSession.is_revoked.is_(False),
                UserSession.expires_at > now,
                User.is_active.is_(True),
            )
        )
        res = await db.execute(stmt)
        record = res.first()
        if not record:
            return None

        session, user = record
        session.last_seen_at = now
        await db.flush()
        return user

    @staticmethod
    async def revoke_session(db: AsyncSession, raw_token: str) -> bool:
        if not raw_token:
            return False
        token_hash = hash_token(raw_token)
        stmt = (
            update(UserSession)
            .where(UserSession.session_token_hash == token_hash)
            .values(is_revoked=True)
        )
        await db.execute(stmt)
        return True

    @staticmethod
    async def get_user_permissions(db: AsyncSession, user_id: UUID) -> Tuple[list[str], list[str]]:
        """Obtiene la lista de códigos de rol y permisos asociados al usuario."""
        # Roles
        role_stmt = select(Role.name).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == user_id)
        roles_res = await db.execute(role_stmt)
        roles = list(roles_res.scalars().all())

        # Permisos
        perm_stmt = (
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(UserRole, UserRole.role_id == RolePermission.role_id)
            .where(UserRole.user_id == user_id)
            .distinct()
        )
        perms_res = await db.execute(perm_stmt)
        perms = list(perms_res.scalars().all())

        return roles, perms

