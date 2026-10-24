"""
LinuxOps Manager — Modelos de Servidores, Agentes y Registro
"""

import uuid
from datetime import datetime
from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class ServerGroup(Base):
    __tablename__ = "server_groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(64), unique=True, nullable=False, index=True)
    description = Column(String(255), nullable=True)
    environment = Column(String(32), default="production", nullable=False)  # prod, staging, dev
    tags = Column(JSONB, default=dict, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    servers = relationship("Server", back_populates="group")


class Server(Base):
    __tablename__ = "servers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128), unique=True, nullable=False, index=True)
    hostname = Column(String(255), nullable=True)
    ip_address = Column(String(45), nullable=True)
    group_id = Column(UUID(as_uuid=True), ForeignKey("server_groups.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Estados: online, offline, degraded, pending_enrollment, revoked
    status = Column(String(32), default="pending_enrollment", nullable=False, index=True)
    
    # Información del sistema reportada por el agente
    os_name = Column(String(64), nullable=True)
    os_version = Column(String(64), nullable=True)
    kernel = Column(String(128), nullable=True)
    architecture = Column(String(32), nullable=True)
    python_version = Column(String(32), nullable=True)
    
    # Métricas actuales
    uptime_seconds = Column(BigInteger, default=0, nullable=False)
    cpu_count = Column(Integer, default=1, nullable=False)
    cpu_percent = Column(Float, default=0.0, nullable=False)
    total_ram_bytes = Column(BigInteger, default=0, nullable=False)
    free_ram_bytes = Column(BigInteger, default=0, nullable=False)
    ram_percent = Column(Float, default=0.0, nullable=False)
    total_disk_bytes = Column(BigInteger, default=0, nullable=False)
    free_disk_bytes = Column(BigInteger, default=0, nullable=False)
    disk_percent = Column(Float, default=0.0, nullable=False)
    load_1 = Column(Float, default=0.0, nullable=False)
    load_5 = Column(Float, default=0.0, nullable=False)
    load_15 = Column(Float, default=0.0, nullable=False)
    container_count = Column(Integer, default=0, nullable=False)
    failed_services_count = Column(Integer, default=0, nullable=False)
    
    tags = Column(JSONB, default=dict, nullable=False)
    last_heartbeat_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relaciones
    group = relationship("ServerGroup", back_populates="servers")
    agent = relationship("Agent", back_populates="server", uselist=False, cascade="all, delete-orphan")
    enrollment_tokens = relationship("EnrollmentToken", back_populates="server", cascade="all, delete-orphan")
    connectivity_events = relationship("ConnectivityEvent", back_populates="server", cascade="all, delete-orphan")
    metrics = relationship("ServerMetric", back_populates="server", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="server", cascade="all, delete-orphan")
    terminal_sessions = relationship("TerminalSession", back_populates="server", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="server", cascade="all, delete-orphan")


class Agent(Base):
    __tablename__ = "agents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    server_id = Column(UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), unique=True, nullable=False)
    agent_version = Column(String(32), default="1.0.0", nullable=False)
    
    # Identidad criptográfica mTLS
    cert_serial = Column(String(64), nullable=True, unique=True)
    cert_fingerprint_sha256 = Column(String(64), nullable=True, index=True)
    
    is_revoked = Column(Boolean, default=False, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True)
    revoked_reason = Column(String(255), nullable=True)
    
    last_seen_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    server = relationship("Server", back_populates="agent")


class EnrollmentToken(Base):
    """
    Token de incorporación de un solo uso con caducidad corta.
    Solo el hash SHA-256 se persiste en la base de datos.
    """
    __tablename__ = "enrollment_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    server_id = Column(UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    is_used = Column(Boolean, default=False, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    server = relationship("Server", back_populates="enrollment_tokens")


class ConnectivityEvent(Base):
    __tablename__ = "connectivity_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    server_id = Column(UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(32), nullable=False)  # connected, disconnected, heartbeat_missed, cert_expiring
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    server = relationship("Server", back_populates="connectivity_events")

