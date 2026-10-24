"""
LinuxOps Manager — Router de Usuarios y Administración RBAC
"""

from typing import List
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_permission, require_superuser
from app.core.security import hash_password
from app.models.role import Role, UserRole
from app.models.user import User
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services.audit_service import AuditService

router = APIRouter(prefix="/users", tags=["Usuarios"])


@router.get("", response_model=List[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("users:read")),
):
    stmt = select(User).order_by(User.created_at.desc())
    res = await db.execute(stmt)
    users = res.scalars().all()

    output = []
    for u in users:
        role_stmt = select(Role.name).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == u.id)
        role_res = await db.execute(role_stmt)
        roles = list(role_res.scalars().all())

        output.append(
            UserOut(
                id=u.id,
                username=u.username,
                email=u.email,
                full_name=u.full_name,
                is_active=u.is_active,
                is_superuser=u.is_superuser,
                mfa_enabled=u.mfa_enabled,
                roles=roles,
                created_at=u.created_at,
            )
        )
    return output


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    req: UserCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("users:manage")),
):
    # Verificar existencia previa
    existing = await db.execute(
        select(User).where((User.username == req.username) | (User.email == req.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre de usuario o correo electrónico ya está registrado.",
        )

    new_user = User(
        username=req.username,
        email=req.email,
        full_name=req.full_name,
        hashed_password=hash_password(req.password),
        is_active=True,
        is_superuser=False,
    )
    db.add(new_user)
    await db.flush()

    # Asignar roles
    assigned_roles = []
    if req.role_ids:
        for r_id in req.role_ids:
            role = await db.get(Role, r_id)
            if role:
                db.add(UserRole(user_id=new_user.id, role_id=role.id))
                assigned_roles.append(role.name)
        await db.flush()

    correlation_id = str(uuid4())
    client_ip = request.client.host if request.client else "unknown"
    await AuditService.log_event(
        db=db,
        correlation_id=correlation_id,
        operation="users.create",
        resource_type="user",
        resource_id=str(new_user.id),
        status="success",
        user_id=current_user.id,
        username=current_user.username,
        client_ip=client_ip,
        details={"created_username": new_user.username, "roles": assigned_roles},
    )

    return UserOut(
        id=new_user.id,
        username=new_user.username,
        email=new_user.email,
        full_name=new_user.full_name,
        is_active=new_user.is_active,
        is_superuser=new_user.is_superuser,
        mfa_enabled=new_user.mfa_enabled,
        roles=assigned_roles,
        created_at=new_user.created_at,
    )


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: UUID,
    req: UserUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("users:manage")),
):
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado.")

    if req.email is not None:
        target.email = req.email
    if req.full_name is not None:
        target.full_name = req.full_name
    if req.is_active is not None:
        # Prevenir auto-desactivación del superadmin
        if target.id == current_user.id and not req.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No puede desactivar su propia cuenta de usuario.",
            )
        target.is_active = req.is_active

    if req.role_ids is not None:
        # Reemplazar roles
        del_stmt = select(UserRole).where(UserRole.user_id == target.id)
        existing_roles = (await db.execute(del_stmt)).scalars().all()
        for ur in existing_roles:
            await db.delete(ur)
        
        for r_id in req.role_ids:
            role = await db.get(Role, r_id)
            if role:
                db.add(UserRole(user_id=target.id, role_id=role.id))

    await db.flush()

    role_stmt = select(Role.name).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == target.id)
    role_res = await db.execute(role_stmt)
    roles = list(role_res.scalars().all())

    correlation_id = str(uuid4())
    client_ip = request.client.host if request.client else "unknown"
    await AuditService.log_event(
        db=db,
        correlation_id=correlation_id,
        operation="users.update",
        resource_type="user",
        resource_id=str(target.id),
        status="success",
        user_id=current_user.id,
        username=current_user.username,
        client_ip=client_ip,
        details={"updated_username": target.username, "roles": roles},
    )

    return UserOut(
        id=target.id,
        username=target.username,
        email=target.email,
        full_name=target.full_name,
        is_active=target.is_active,
        is_superuser=target.is_superuser,
        mfa_enabled=target.mfa_enabled,
        roles=roles,
        created_at=target.created_at,
    )

