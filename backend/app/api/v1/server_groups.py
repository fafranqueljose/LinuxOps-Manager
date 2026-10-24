"""
LinuxOps Manager — Router de Grupos de Servidores
"""

from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_permission
from app.models.server import ServerGroup
from app.models.user import User
from app.schemas.server import ServerGroupCreate, ServerGroupOut

router = APIRouter(prefix="/server-groups", tags=["Grupos de Servidores"])


@router.get("", response_model=List[ServerGroupOut])
async def list_server_groups(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("servers:read")),
):
    stmt = select(ServerGroup).order_by(ServerGroup.name)
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post("", response_model=ServerGroupOut, status_code=status.HTTP_201_CREATED)
async def create_server_group(
    req: ServerGroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("servers:manage")),
):
    existing = await db.execute(select(ServerGroup).where(ServerGroup.name == req.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El nombre del grupo ya existe.")

    group = ServerGroup(
        name=req.name,
        description=req.description,
        environment=req.environment,
        tags=req.tags or {},
    )
    db.add(group)
    await db.flush()
    return group

