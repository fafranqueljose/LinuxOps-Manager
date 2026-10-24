"""
LinuxOps Manager — Modelo de Métricas de Servidor (Series Temporales)
"""

import uuid
from datetime import datetime
from sqlalchemy import BigInteger, Column, DateTime, Float, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class ServerMetric(Base):
    """
    Registro histórico de métricas recolectadas periódicamente por el agente.
    """
    __tablename__ = "server_metrics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    server_id = Column(UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), nullable=False, index=True)
    
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    cpu_percent = Column(Float, nullable=False)
    ram_percent = Column(Float, nullable=False)
    ram_used_bytes = Column(BigInteger, nullable=False)
    disk_percent = Column(Float, nullable=False)
    disk_used_bytes = Column(BigInteger, nullable=False)
    load_1 = Column(Float, nullable=False)
    load_5 = Column(Float, nullable=False)
    load_15 = Column(Float, nullable=False)
    running_containers = Column(Integer, default=0, nullable=False)
    failed_services = Column(Integer, default=0, nullable=False)

    server = relationship("Server", back_populates="metrics")

