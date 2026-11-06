"""
LinuxOps Manager — Modelo de Documentación y Clasificación de Contenedores Docker
"""

import uuid
from datetime import datetime
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class ContainerDocumentation(Base):
    """
    Ficha administrativa de documentación y catálogo para contenedores Docker.
    Garantiza durabilidad ante la recreación de contenedores usando identity_key.
    """
    __tablename__ = "container_documentation"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    server_id = Column(UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Clave lógica duradera: 'compose:<project>:<service>' o 'name:<container_name>'
    identity_key = Column(String(190), nullable=False, index=True)
    
    # ID temporal de Docker (varía al recrear el contenedor)
    container_id = Column(String(64), nullable=True, index=True)
    container_name = Column(String(128), nullable=False)
    compose_project = Column(String(64), nullable=True, index=True)
    compose_service = Column(String(64), nullable=True, index=True)
    image_name = Column(String(255), nullable=True)

    # Documentación administrativa
    description = Column(Text, nullable=True)
    purpose = Column(Text, nullable=True)
    application_name = Column(String(128), nullable=True, index=True)
    category = Column(String(64), default="other", nullable=False, index=True)
    owner = Column(String(128), nullable=True)
    environment = Column(String(32), default="production", nullable=False, index=True)

    # Metadatos del origen y estado del ciclo de vida
    # manual: editado por usuario en LinuxOps Manager (inmune a sobreescritura automática)
    # docker_labels: sincronizado desde etiquetas linuxops.* de Docker Compose
    # auto: inferido automáticamente por el motor de reglas
    documentation_source = Column(String(32), default="auto", nullable=False)
    
    # undocumented, suggested, documented, review_pending
    documentation_status = Column(String(32), default="undocumented", nullable=False, index=True)

    # Última sugerencia generada por el motor de reglas o IA (preservada para comparación)
    generated_description = Column(Text, nullable=True)
    generated_purpose = Column(Text, nullable=True)
    generated_category = Column(String(64), nullable=True)

    # Copia de seguridad de las etiquetas leídas en Docker
    labels_snapshot = Column(JSONB, default=dict, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    updated_by = Column(String(64), nullable=True)

    server = relationship("Server", backref="container_documentations")

    __table_args__ = (
        UniqueConstraint("server_id", "identity_key", name="uq_server_container_identity"),
        Index("idx_container_doc_server_status", "server_id", "documentation_status"),
        Index("idx_container_doc_app_cat", "application_name", "category"),
    )
