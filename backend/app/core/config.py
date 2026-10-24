"""
LinuxOps Manager — Configuración Global de la Aplicación
Utiliza Pydantic Settings para cargar variables de entorno y validar tipos.
"""

from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    ENVIRONMENT: str = "production"
    DEBUG: bool = False
    APP_NAME: str = "LinuxOps Manager"
    APP_URL: str = "https://linuxops.local"
    API_V1_PREFIX: str = "/api/v1"

    # Claves secretas y seguridad
    SECRET_KEY: str = "SUPER_SECRET_KEY_MUST_BE_REPLACED_IN_PRODUCTION_ENV_FILE_32_BYTES"
    SESSION_COOKIE_NAME: str = "linuxops_session"
    SESSION_EXPIRE_MINUTES: int = 480  # 8 horas
    SESSION_SECURE_COOKIE: bool = True
    SESSION_SAME_SITE: str = "lax"
    ENCRYPTION_KEY: str = "c2VjdXJlX2tleV8zMl9ieXRlc19leGFtcGxlXzEyMzQ1Njc="  # Base64 32 bytes

    # Base de datos PostgreSQL
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "linuxops_db"
    POSTGRES_USER: str = "linuxops_user"
    POSTGRES_PASSWORD: str = "linuxops_password"
    DATABASE_URL: str = ""

    @field_validator("DATABASE_URL", mode="before")
    def assemble_db_connection(cls, v: str, info) -> str:
        if isinstance(v, str) and v:
            return v
        data = info.data
        user = data.get("POSTGRES_USER", "linuxops_user")
        pwd = data.get("POSTGRES_PASSWORD", "linuxops_password")
        srv = data.get("POSTGRES_SERVER", "localhost")
        prt = data.get("POSTGRES_PORT", 5432)
        db = data.get("POSTGRES_DB", "linuxops_db")
        return f"postgresql+asyncpg://{user}:{pwd}@{srv}:{prt}/{db}"

    # CA Interna y Certificados mTLS para Agentes
    PKI_CA_DIR: str = "/etc/linuxops/pki"
    PKI_CA_CERT: str = "/etc/linuxops/pki/ca.crt"
    PKI_CA_KEY: str = "/etc/linuxops/pki/ca.key"
    PKI_CA_PASSPHRASE: str = ""
    AGENT_CERT_VALIDITY_DAYS: int = 365
    AGENT_ENROLLMENT_TOKEN_EXPIRE_MINUTES: int = 30

    # Umbrales de Heartbeat y Latencia
    AGENT_HEARTBEAT_TIMEOUT_SECONDS: int = 45
    AGENT_DEGRADED_THRESHOLD_SECONDS: int = 90

    # Rate Limiting y Control de Fuerza Bruta
    LOGIN_MAX_FAILED_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15
    RATE_LIMIT_PER_MINUTE: int = 120

    # CORS
    CORS_ORIGINS: List[str] = [
        "https://linuxops.local",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    def parse_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return []

    # Configuración de Terminal Web
    TERMINAL_IDLE_TIMEOUT_SECONDS: int = 600  # 10 minutos de inactividad
    TERMINAL_MAX_CONCURRENT_SESSIONS_PER_USER: int = 3


settings = Settings()

