"""
LinuxOps Manager — Dependencias de Inyección para FastAPI
Control de autenticación por Cookie HttpOnly / Bearer y Autorización RBAC.
"""

from typing import Callable, Optional
from uuid import UUID
from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.database import get_db
from app.models.role import ResourcePermission, Role, RolePermission, UserRole, Permission
from app.models.user import User
from app.services.auth_service import AuthService


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    linuxops_session: Optional[str] = Cookie(None),
    authorization: Optional[str] = Header(None),
) -> User:
    """
    Recupera y valida el usuario actual desde la Cookie HttpOnly de sesión
    o desde la cabecera Authorization (formato: Bearer <token>).
    """
    token = None
    if linuxops_session:
        token = linuxops_session
    elif authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticación requerida. No se proporcionó sesión válida.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await AuthService.validate_session_token(db, token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión expirada o inválida. Inicie sesión nuevamente.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Inyectar atributos útiles en request.state
    request.state.user = user
    return user


def require_permission(permission_code: str) -> Callable:
    """
    Fábrica de dependencias para verificar si el usuario tiene un permiso específico o es superadmin.
    """
    async def _permission_checker(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        if current_user.is_superuser:
            return current_user

        _, perms = await AuthService.get_user_permissions(db, current_user.id)
        if permission_code not in perms:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permiso insuficiente. Se requiere '{permission_code}'.",
            )
        return current_user

    return _permission_checker


async def require_superuser(
    current_user: User = Depends(get_current_user),
) -> User:
    """Requiere que el usuario sea Superadministrador del sistema."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operación restringida a Superadministradores.",
        )
    return current_user


async def check_server_resource_access(
    server_id: UUID,
    module: str,
    action: str,
    user: User,
    db: AsyncSession,
) -> bool:
    """
    Verifica si el usuario tiene permiso a nivel de servidor individual o grupo.
    Si no hay restricciones explícitas de recurso para este usuario/rol,
    hereda los permisos globales RBAC.
    """
    if user.is_superuser:
        return True

    # Buscar restricciones explícitas
    stmt = select(ResourcePermission).where(
        (ResourcePermission.user_id == user.id),
        (ResourcePermission.server_id == server_id) | (ResourcePermission.server_id.is_(None)),
        (ResourcePermission.module == module) | (ResourcePermission.module == "*"),
        (ResourcePermission.action == action) | (ResourcePermission.action == "*"),
    )
    res = await db.execute(stmt)
    rule = res.scalar_one_or_none()

    if rule is not None:
        return rule.is_allowed

    # Por defecto permitido si pasó la validación general de permisos
    return True

