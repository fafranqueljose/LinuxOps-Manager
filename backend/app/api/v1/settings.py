"""
LinuxOps Manager — Router de Configuración del Sistema
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_superuser
from app.models.alert import SystemSetting
from app.models.user import User
from app.schemas.alert import SystemSettingOut, SystemSettingUpdate

router = APIRouter(prefix="/settings", tags=["Configuración"])


@router.get("", response_model=List[SystemSettingOut])
async def list_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_superuser),
):
    stmt = select(SystemSetting).order_by(SystemSetting.key)
    res = await db.execute(stmt)
    return res.scalars().all()


@router.put("/{key}", response_model=SystemSettingOut)
async def update_setting(
    key: str,
    req: SystemSettingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_superuser),
):
    setting = await db.get(SystemSetting, key)
    if not setting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parámetro no encontrado.")

    if setting.is_read_only:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este parámetro es de solo lectura y no puede modificarse en tiempo de ejecución.",
        )

    setting.value = req.value
    await db.flush()
    return setting

