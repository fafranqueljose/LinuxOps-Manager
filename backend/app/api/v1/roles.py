"""
LinuxOps Manager — Router de Roles y Catálogo de Permisos
"""

from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_permission, require_superuser
from app.models.role import Permission, Role, RolePermission
from app.models.user import User
from app.schemas.user import PermissionOut, RoleCreate, RoleOut, RoleUpdate

router = APIRouter(prefix="/roles", tags=["Roles y Permisos"])


@router.get("/permissions", response_model=List[PermissionOut])
async def list_permissions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Permission).order_by(Permission.module, Permission.code)
    res = await db.execute(stmt)
    return res.scalars().all()


@router.get("", response_model=List[RoleOut])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Role).order_by(Role.is_system_role.desc(), Role.name)
    res = await db.execute(stmt)
    roles = res.scalars().all()

    output = []
    for r in roles:
        perm_stmt = (
            select(Permission)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == r.id)
        )
        perm_res = await db.execute(perm_stmt)
        perms = perm_res.scalars().all()

        output.append(
            RoleOut(
                id=r.id,
                name=r.name,
                description=r.description,
                is_system_role=r.is_system_role,
                permissions=[PermissionOut.from_orm(p) for p in perms],
                created_at=r.created_at,
            )
        )
    return output


@router.post("", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
async def create_role(
    req: RoleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("roles:manage")),
):
    existing = await db.execute(select(Role).where(Role.name == req.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El nombre del rol ya existe.")

    role = Role(name=req.name, description=req.description, is_system_role=False)
    db.add(role)
    await db.flush()

    perms_added = []
    if req.permission_ids:
        for p_id in req.permission_ids:
            perm = await db.get(Permission, p_id)
            if perm:
                db.add(RolePermission(role_id=role.id, permission_id=perm.id))
                perms_added.append(perm)
        await db.flush()

    return RoleOut(
        id=role.id,
        name=role.name,
        description=role.description,
        is_system_role=role.is_system_role,
        permissions=[PermissionOut.from_orm(p) for p in perms_added],
        created_at=role.created_at,
    )

