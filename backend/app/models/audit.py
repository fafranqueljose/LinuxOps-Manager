"""
LinuxOps Manager — Modelo de Auditoría con Cadena de Integridad Criptográfica
"""

import hashlib
import json
import uuid
from datetime import datetime
from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from app.core.database import Base


class AuditLog(Base):
    """
    Registro append-only de auditoría con encadenamiento criptográfico SHA-256.
    Cada registro calcula su `entry_hash` a partir del hash del registro anterior (`prev_hash`)
    y sus propios atributos, permitiendo detectar cualquier alteración posterior en la tabla.
    """
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    correlation_id = Column(String(64), nullable=False, index=True)
    
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    username = Column(String(64), nullable=True, index=True)
    
    server_id = Column(UUID(as_uuid=True), ForeignKey("servers.id", ondelete="SET NULL"), nullable=True, index=True)
    agent_id = Column(UUID(as_uuid=True), nullable=True)
    
    operation = Column(String(64), nullable=False, index=True)  # auth.login, docker.start, systemd.stop, etc.
    resource_type = Column(String(32), nullable=False)          # server, container, service, user
    resource_id = Column(String(128), nullable=True)
    
    status = Column(String(16), nullable=False, index=True)     # success, failure, denied
    error_code = Column(String(64), nullable=True)
    client_ip = Column(String(45), nullable=True)
    duration_ms = Column(Integer, default=0, nullable=False)
    
    # Detalles filtrados: NUNCA almacena contraseñas, tokens ni secretos
    details = Column(JSONB, default=dict, nullable=False)
    
    # Encadenamiento criptográfico (Tamper-evident verification)
    prev_hash = Column(String(64), nullable=False)
    entry_hash = Column(String(64), nullable=False, index=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    @staticmethod
    def calculate_entry_hash(
        prev_hash: str,
        correlation_id: str,
        user_id: str,
        operation: str,
        resource_type: str,
        resource_id: str,
        status: str,
        created_at_iso: str,
        details: dict,
    ) -> str:
        """Calcula el hash SHA-256 inmutable de la entrada."""
        raw_payload = f"{prev_hash}|{correlation_id}|{user_id}|{operation}|{resource_type}|{resource_id}|{status}|{created_at_iso}|{json.dumps(details, sort_keys=True)}"
        return hashlib.sha256(raw_payload.encode("utf-8")).hexdigest()

