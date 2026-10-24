"""
LinuxOps Manager — Modelos de Tareas Asíncronas y Sesiones de Terminal
"""

import uuid
from datetime import datetime
from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class Task(Base):
    """
    Registro y seguimiento de operaciones remotas enviadas a los agentes.
    """
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    correlation_id = Column(String(64), nullable=False, index=True)
    server_id = Column(UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id = Column(UUID(as_uuid=True), nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    
    module = Column(String(32), nullable=False)      # docker, systemd, system
    operation = Column(String(64), nullable=False)   # container.restart, unit.start, etc.
    payload = Column(JSONB, default=dict, nullable=False)
    
    # pending, running, completed, failed, timed_out
    status = Column(String(32), default="pending", nullable=False, index=True)
    result = Column(JSONB, nullable=True)
    error_message = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    server = relationship("Server", back_populates="tasks")
    user = relationship("User", back_populates="tasks")


class TerminalSession(Base):
    """
    Control y auditoría de sesiones pseudoterminal (PTY) interactivas.
    """
    __tablename__ = "terminal_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    server_id = Column(UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    pty_user = Column(String(64), default="linuxops-pty", nullable=False)
    
    # active, closed, terminated_by_admin, timed_out
    status = Column(String(32), default="active", nullable=False, index=True)
    client_ip = Column(String(45), nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    closed_at = Column(DateTime, nullable=True)
    duration_seconds = Column(BigInteger, default=0, nullable=False)
    
    bytes_sent = Column(BigInteger, default=0, nullable=False)
    bytes_received = Column(BigInteger, default=0, nullable=False)

    server = relationship("Server", back_populates="terminal_sessions")
    user = relationship("User", back_populates="terminal_sessions")

