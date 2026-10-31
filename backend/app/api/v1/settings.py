"""
LinuxOps Manager — Router de Configuración del Sistema
Permite consultar y modificar parámetros operativos, DNS/puerto para agentes y políticas.
"""

from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_superuser
from app.models.alert import SystemSetting
from app.models.user import User
from app.schemas.alert import (
    AgentConnectionPreviewOut,
    SystemSettingOut,
    SystemSettingUpdate,
    SystemSettingsBatchUpdate,
)
from app.services.settings_service import SettingsService

router = APIRouter(prefix="/settings", tags=["Configuración"])


@router.get("", response_model=List[SystemSettingOut])
async def list_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retorna todos los parámetros de configuración del sistema."""
    stmt = select(SystemSetting).order_by(SystemSetting.key)
    res = await db.execute(stmt)
    return res.scalars().all()


@router.get("/preview-agent-connection", response_model=AgentConnectionPreviewOut)
async def preview_agent_connection(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retorna la URL base calculada y vista previa del comando de instalación
    según el nombre DNS y puerto configurados.
    """
    preview = await SettingsService.get_effective_agent_connection(db, request)
    return preview


@router.put("/batch", response_model=List[SystemSettingOut])
async def update_settings_batch(
    req: SystemSettingsBatchUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_superuser),
):
    """Actualiza múltiples parámetros de configuración en una única operación."""
    updated = []
    for key, value in req.settings.items():
        setting = await db.get(SystemSetting, key)
        if not setting:
            setting = SystemSetting(
                key=key,
                value=value,
                description=f"Parámetro {key}",
                is_read_only=False,
            )
            db.add(setting)
        else:
            if setting.is_read_only:
                continue
            setting.value = value
        updated.append(setting)

    await db.flush()
    return updated


@router.put("/{key}", response_model=SystemSettingOut)
async def update_setting(
    key: str,
    req: SystemSettingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_superuser),
):
    """Actualiza o crea un parámetro individual de configuración."""
    setting = await db.get(SystemSetting, key)
    if not setting:
        setting = SystemSetting(
            key=key,
            value=req.value,
            description=req.description or f"Parámetro {key}",
            is_read_only=False,
        )
        db.add(setting)
    else:
        if setting.is_read_only:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Este parámetro es de solo lectura y no puede modificarse en tiempo de ejecución.",
            )
        setting.value = req.value
        if req.description:
            setting.description = req.description

    await db.flush()
    return setting
