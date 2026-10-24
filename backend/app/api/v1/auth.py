"""
LinuxOps Manager — Router de Autenticación, MFA y Control de Sesión
"""

from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import (
    decrypt_data,
    encrypt_data,
    generate_totp_secret,
    get_totp_uri,
    hash_password,
    verify_password,
    verify_totp_code,
)
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    MFASetupResponse,
    MFAVerifyRequest,
    PasswordChangeRequest,
)
from app.services.auth_service import AuthService
from app.services.audit_service import AuditService

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.post("/login", response_model=LoginResponse)
async def login(
    req: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    correlation_id = str(uuid4())
    client_ip = request.client.host if request.client else "unknown"

    user, err_msg, requires_mfa = await AuthService.authenticate_user(
        db, req.username, req.password, req.totp_code
    )

    if requires_mfa:
        return LoginResponse(
            status="mfa_required",
            message="Se requiere código de autenticación multifactor.",
            requires_mfa=True,
        )

    if not user:
        await AuditService.log_event(
            db=db,
            correlation_id=correlation_id,
            operation="auth.login_failed",
            resource_type="auth",
            status="failure",
            username=req.username,
            client_ip=client_ip,
            error_code="INVALID_CREDENTIALS",
            details={"reason": err_msg},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=err_msg or "Credenciales inválidas.",
        )

    # Crear sesión de usuario
    user_agent = request.headers.get("user-agent")
    session, raw_token = await AuthService.create_user_session(
        db, user.id, ip_address=client_ip, user_agent=user_agent
    )

    # Establecer Cookie HttpOnly Segura
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=raw_token,
        max_age=settings.SESSION_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=settings.SESSION_SECURE_COOKIE,
        samesite=settings.SESSION_SAME_SITE,
        path="/",
    )

    roles, perms = await AuthService.get_user_permissions(db, user.id)

    await AuditService.log_event(
        db=db,
        correlation_id=correlation_id,
        operation="auth.login_success",
        resource_type="user",
        status="success",
        user_id=user.id,
        username=user.username,
        client_ip=client_ip,
        details={"session_id": str(session.id)},
    )

    return LoginResponse(
        status="authenticated",
        message="Inicio de sesión exitoso.",
        user_id=user.id,
        username=user.username,
        email=user.email,
        roles=roles,
        permissions=perms,
        requires_mfa=False,
    )


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if token:
        await AuthService.revoke_session(db, token)

    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        path="/",
        secure=settings.SESSION_SECURE_COOKIE,
        samesite=settings.SESSION_SAME_SITE,
    )

    correlation_id = str(uuid4())
    client_ip = request.client.host if request.client else "unknown"
    await AuditService.log_event(
        db=db,
        correlation_id=correlation_id,
        operation="auth.logout",
        resource_type="user",
        status="success",
        user_id=current_user.id,
        username=current_user.username,
        client_ip=client_ip,
    )

    return {"status": "success", "message": "Sesión cerrada correctamente."}


@router.get("/me")
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    roles, perms = await AuthService.get_user_permissions(db, current_user.id)
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "is_active": current_user.is_active,
        "is_superuser": current_user.is_superuser,
        "mfa_enabled": current_user.mfa_enabled,
        "roles": roles,
        "permissions": perms,
    }


@router.post("/mfa/setup", response_model=MFASetupResponse)
async def setup_mfa(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    secret = generate_totp_secret()
    # Guardar secreto temporalmente cifrado
    current_user.mfa_secret_encrypted = encrypt_data(secret)
    await db.flush()

    otpauth_url = get_totp_uri(secret, current_user.username)
    return MFASetupResponse(secret=secret, otpauth_url=otpauth_url)


@router.post("/mfa/verify")
async def verify_and_enable_mfa(
    req: MFAVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.mfa_secret_encrypted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debe iniciar la configuración de MFA antes de verificar.",
        )

    secret = decrypt_data(current_user.mfa_secret_encrypted)
    if not secret or not verify_totp_code(secret, req.totp_code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Código de verificación TOTP inválido.",
        )

    current_user.mfa_enabled = True
    await db.flush()

    return {"status": "success", "message": "Autenticación multifactor habilitada correctamente."}


@router.post("/change-password")
async def change_password(
    req: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(req.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual es incorrecta.",
        )

    current_user.hashed_password = hash_password(req.new_password)
    await db.flush()

    return {"status": "success", "message": "Contraseña actualizada exitosamente."}

