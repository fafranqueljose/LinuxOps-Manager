"""
LinuxOps Manager — Esquemas Pydantic para Catálogo y Documentación de Contenedores
"""

import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class ContainerDocumentationUpdateIn(BaseModel):
    description: Optional[str] = Field(None, description="Descripción detallada y comprensible del contenedor")
    purpose: Optional[str] = Field(None, description="Propósito o función específica del servicio")
    application_name: Optional[str] = Field(None, description="Nombre de la aplicación o sistema mayor al que pertenece")
    category: Optional[str] = Field("other", description="Categoría funcional (database, web-application, cache-queue, etc.)")
    owner: Optional[str] = Field(None, description="Área, equipo o persona responsable")
    environment: Optional[str] = Field("production", description="development, testing, staging, production")
    documentation_status: Optional[str] = Field("documented", description="undocumented, suggested, documented, review_pending")


class ContainerDocumentationGenerateOut(BaseModel):
    generated_description: str
    generated_purpose: str
    generated_category: str
    source_rule: str
    labels_detected: Dict[str, str] = Field(default_factory=dict)


class ContainerDocumentationOut(BaseModel):
    id: Optional[UUID] = None
    server_id: UUID
    server_name: Optional[str] = None
    identity_key: str
    container_id: Optional[str] = None
    container_name: str
    compose_project: Optional[str] = None
    compose_service: Optional[str] = None
    image_name: Optional[str] = None
    description: Optional[str] = None
    purpose: Optional[str] = None
    application_name: Optional[str] = None
    category: str = "other"
    owner: Optional[str] = None
    environment: str = "production"
    documentation_source: str = "auto"  # manual, docker_labels, auto
    documentation_status: str = "undocumented"  # undocumented, suggested, documented, review_pending
    generated_description: Optional[str] = None
    generated_purpose: Optional[str] = None
    generated_category: Optional[str] = None
    labels_snapshot: Dict[str, str] = Field(default_factory=dict)
    created_at: Optional[datetime.datetime] = None
    updated_at: Optional[datetime.datetime] = None
    updated_by: Optional[str] = None

    # Información técnica viva reportada por Docker (opcional al consultar ficha)
    state: Optional[str] = None
    status_text: Optional[str] = None
    created_epoch: Optional[int] = 0
    ports: Optional[List[Any]] = None
    networks: Optional[List[str]] = None
    mounts: Optional[List[Dict[str, Any]]] = None


class ContainerCatalogItemOut(BaseModel):
    id: Optional[UUID] = None
    server_id: UUID
    server_name: str
    container_id: str
    container_name: str
    image: str
    state: str
    status: str
    compose_project: Optional[str] = None
    compose_service: Optional[str] = None
    application_name: Optional[str] = None
    category: str = "other"
    owner: Optional[str] = None
    environment: str = "production"
    documentation_status: str = "undocumented"  # undocumented, suggested, documented, review_pending
    documentation_source: str = "auto"  # manual, docker_labels, auto
    description: Optional[str] = None
    purpose: Optional[str] = None
    has_labels: bool = False
    updated_at: Optional[datetime.datetime] = None


class ContainerCatalogSummaryOut(BaseModel):
    total_containers: int = 0
    documented_count: int = 0
    suggested_count: int = 0
    undocumented_count: int = 0
    review_pending_count: int = 0
    categories: Dict[str, int] = Field(default_factory=dict)
    environments: Dict[str, int] = Field(default_factory=dict)
    applications: Dict[str, int] = Field(default_factory=dict)
