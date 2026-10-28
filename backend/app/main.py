"""
LinuxOps Manager — Backend Central (FastAPI)
"""

import datetime
import io
import logging
import os
import tarfile
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine, Base
from app.core.security import hash_password
from app.models.role import Permission, Role, RolePermission, UserRole
from app.models.user import User
from app.services.pki_service import pki_service

# Routers API v1
from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.roles import router as roles_router
from app.api.v1.servers import router as servers_router
from app.api.v1.server_groups import router as server_groups_router
from app.api.v1.agents import router as agents_router
from app.api.v1.docker import router as docker_router
from app.api.v1.systemd import router as systemd_router
from app.api.v1.terminal import router as terminal_router
from app.api.v1.audit import router as audit_router
from app.api.v1.alerts import router as alerts_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.settings import router as settings_router
from app.api.v1.storage import router as storage_router

# Routers WebSockets
from app.api.ws.agent_ws import router as ws_agent_router
from app.api.ws.terminal_ws import router as ws_terminal_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("linuxops.main")

# Catálogo predefinido de permisos granulares
PERMISSIONS_CATALOG = [
    ("servers:read", "servers", "Consultar inventario y detalles de servidores"),
    ("servers:create", "servers", "Registrar nuevos servidores en el inventario"),
    ("servers:manage", "servers", "Modificar etiquetas y configuración de servidores"),
    ("servers:delete", "servers", "Eliminar servidores del inventario"),
    ("agents:read", "agents", "Consultar agentes y certificados mTLS"),
    ("agents:enroll", "agents", "Generar tokens de incorporación para nuevos agentes"),
    ("agents:revoke", "agents", "Revocar certificados de agentes"),
    ("docker:read", "docker", "Consultar contenedores, imágenes, redes y volúmenes"),
    ("docker:manage", "docker", "Iniciar, detener y reiniciar contenedores"),
    ("docker:delete", "docker", "Eliminar contenedores, imágenes y volúmenes no utilizados"),
    ("systemd:read", "systemd", "Consultar unidades systemd y ver registros journal"),
    ("systemd:manage", "systemd", "Iniciar, detener, reiniciar y recargar servicios"),
    ("terminal:access", "terminal", "Abrir sesiones pseudoterminal interactivas"),
    ("users:read", "users", "Consultar usuarios"),
    ("users:manage", "users", "Crear y modificar usuarios"),
    ("roles:read", "roles", "Consultar roles y matriz de permisos"),
    ("roles:manage", "roles", "Crear y modificar roles"),
    ("audit:read", "audit", "Consultar registros de auditoría"),
    ("audit:verify", "audit", "Verificar la integridad criptográfica de la auditoría"),
]


async def seed_initial_data():
    """Siembra permisos, roles predeterminados y superadmin inicial si la BD está limpia."""
    async with AsyncSessionLocal() as db:
        # 1. Crear permisos si no existen
        for code, module, desc in PERMISSIONS_CATALOG:
            res = await db.execute(select(Permission).where(Permission.code == code))
            if not res.scalar_one_or_none():
                db.add(Permission(code=code, module=module, description=desc))
        await db.flush()

        # 2. Roles del sistema
        system_roles = {
            "superadmin": [p[0] for p in PERMISSIONS_CATALOG],
            "infra_admin": [
                "servers:read", "servers:create", "servers:manage",
                "agents:read", "agents:enroll",
                "docker:read", "docker:manage",
                "systemd:read", "systemd:manage",
                "terminal:access", "audit:read",
            ],
            "operator": [
                "servers:read", "agents:read",
                "docker:read", "docker:manage",
                "systemd:read", "systemd:manage",
            ],
            "auditor": ["servers:read", "agents:read", "docker:read", "systemd:read", "audit:read", "audit:verify"],
            "readonly": ["servers:read", "docker:read", "systemd:read"],
        }

        for role_name, perm_codes in system_roles.items():
            r_res = await db.execute(select(Role).where(Role.name == role_name))
            role = r_res.scalar_one_or_none()
            if not role:
                role = Role(name=role_name, description=f"Rol predefinido del sistema: {role_name}", is_system_role=True)
                db.add(role)
                await db.flush()

            # Asociar permisos
            for code in perm_codes:
                p_res = await db.execute(select(Permission).where(Permission.code == code))
                perm = p_res.scalar_one_or_none()
                if perm:
                    rp_res = await db.execute(
                        select(RolePermission).where(
                            RolePermission.role_id == role.id,
                            RolePermission.permission_id == perm.id,
                        )
                    )
                    if not rp_res.scalar_one_or_none():
                        db.add(RolePermission(role_id=role.id, permission_id=perm.id))
        await db.flush()

        # 3. Superadministrador inicial
        admin_res = await db.execute(select(User).where(User.username == "admin"))
        if not admin_res.scalar_one_or_none():
            logger.info("Inicializando usuario Superadministrador predeterminado...")
            initial_password = "LinuxOpsAdmin_2026!ChangeMe"
            admin = User(
                username="admin",
                email="admin@linuxops.local",
                full_name="Super Administrador LinuxOps",
                hashed_password=hash_password(initial_password),
                is_active=True,
                is_superuser=True,
            )
            db.add(admin)
            await db.flush()

            super_role_res = await db.execute(select(Role).where(Role.name == "superadmin"))
            super_role = super_role_res.scalar_one_or_none()
            if super_role:
                db.add(UserRole(user_id=admin.id, role_id=super_role.id))

            logger.warning("=================================================================")
            logger.warning("USUARIO INICIAL CREADO:")
            logger.warning("Usuario: admin | Contraseña temporal: LinuxOpsAdmin_2026!ChangeMe")
            logger.warning("POR FAVOR CAMBIE ESTA CONTRASEÑA EN SU PRIMER INICIO DE SESIÓN")
            logger.warning("=================================================================")

        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Inicio: inicializar CA y esquema de base de datos
    logger.info("Iniciando LinuxOps Manager Backend...")
    try:
        pki_service.ensure_ca_initialized()
    except Exception as e:
        logger.warning(f"No se pudo inicializar la CA interna en local (se creará en contenedor): {e}")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    await seed_initial_data()
    yield
    # Cierre ordenado
    await engine.dispose()
    logger.info("LinuxOps Manager Backend detenido.")


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Plataforma empresarial de administración centralizada de servidores Linux, Docker y systemd.",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Middleware de Cabeceras de Seguridad y Correlación
@app.middleware("http")
async def security_and_correlation_headers_middleware(request: Request, call_next):
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
    request.state.correlation_id = corr_id

    response: Response = await call_next(request)

    response.headers["X-Correlation-ID"] = corr_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# Endpoints de Salud y Estado
@app.get("/health", tags=["Salud"])
async def health_check():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.datetime.utcnow().isoformat(),
    }


# Endpoints de Distribución del Agente Linux
@app.get("/install-agent.sh", response_class=PlainTextResponse, tags=["Agente"])
@app.get("/api/v1/agents/install.sh", response_class=PlainTextResponse, tags=["Agente"])
async def get_install_agent_script():
    """
    Retorna el script de instalación bash para ejecutar en el servidor remoto.
    """
    possible_paths = [
        "/app/agent_source/packaging/install.sh",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../agent/packaging/install.sh")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../../agent/packaging/install.sh")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../agent/packaging/install.sh")),
    ]
    for p in possible_paths:
        if os.path.isfile(p):
            with open(p, "r", encoding="utf-8") as f:
                return PlainTextResponse(f.read(), media_type="text/x-shellscript")

    raise HTTPException(status_code=404, detail="Script de instalación no encontrado en el servidor central.")


@app.get("/agent-bundle.tar.gz", tags=["Agente"])
@app.get("/api/v1/agents/bundle.tar.gz", tags=["Agente"])
async def get_agent_bundle():
    """
    Retorna el archivo comprimido (.tar.gz) con el código fuente y empaquetado del agente.
    """
    prebuilt_tar = "/app/agent_bundle.tar.gz"
    if os.path.isfile(prebuilt_tar):
        return FileResponse(prebuilt_tar, media_type="application/gzip", filename="linuxops-agent-bundle.tar.gz")

    possible_dirs = [
        "/app/agent_source",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../agent")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../../agent")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../agent")),
    ]
    agent_dir = None
    for d in possible_dirs:
        if os.path.isdir(d):
            agent_dir = d
            break

    if not agent_dir:
        raise HTTPException(status_code=404, detail="Paquete del agente no encontrado en el servidor.")

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        tar.add(agent_dir, arcname=".")
    buf.seek(0)

    return Response(
        content=buf.getvalue(),
        media_type="application/gzip",
        headers={"Content-Disposition": 'attachment; filename="linuxops-agent-bundle.tar.gz"'},
    )


# Registrar Routers REST v1
api_prefix = settings.API_V1_PREFIX
app.include_router(auth_router, prefix=api_prefix)
app.include_router(users_router, prefix=api_prefix)
app.include_router(roles_router, prefix=api_prefix)
app.include_router(servers_router, prefix=api_prefix)
app.include_router(server_groups_router, prefix=api_prefix)
app.include_router(agents_router, prefix=api_prefix)
app.include_router(docker_router, prefix=api_prefix)
app.include_router(systemd_router, prefix=api_prefix)
app.include_router(terminal_router, prefix=api_prefix)
app.include_router(audit_router, prefix=api_prefix)
app.include_router(alerts_router, prefix=api_prefix)
app.include_router(dashboard_router, prefix=api_prefix)
app.include_router(settings_router, prefix=api_prefix)
app.include_router(storage_router, prefix=api_prefix)

# Registrar Routers WebSockets (compatibles con /api/v1/ws/... y /ws/...)
app.include_router(ws_agent_router, prefix=api_prefix)
app.include_router(ws_terminal_router, prefix=api_prefix)
app.include_router(ws_agent_router)
app.include_router(ws_terminal_router)

