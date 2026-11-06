"""
LinuxOps Manager — Router de Catálogo y Documentación de Contenedores Docker
Permite la clasificación, descripción comprensible, auditoría y persistencia
de documentación técnica y administrativa de contenedores a nivel global y por servidor.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_permission
from app.models.container_doc import ContainerDocumentation
from app.models.server import Server
from app.models.user import User
from app.schemas.container_doc import (
    ContainerCatalogItemOut,
    ContainerCatalogSummaryOut,
    ContainerDocumentationGenerateOut,
    ContainerDocumentationOut,
    ContainerDocumentationUpdateIn,
)
from app.services.agent_gateway import agent_gateway
from app.services.audit_service import AuditService
from app.services.container_doc_engine import (
    compute_identity_key,
    container_doc_engine,
    extract_linuxops_labels,
)

router = APIRouter(tags=["Catálogo de Contenedores"])


async def _get_container_live_info(server_id: UUID, container_id: str) -> Optional[Dict[str, Any]]:
    """Intenta inspeccionar el contenedor en vivo mediante el agente si está conectado."""
    if not agent_gateway.is_agent_connected(server_id):
        return None
    try:
        res = await agent_gateway.send_agent_request(
            server_id=server_id,
            module="docker",
            operation="container.inspect",
            payload={"container_id": container_id},
            timeout_seconds=10,
        )
        if res.get("success"):
            return res.get("data")
    except Exception:
        pass
    return None


@router.get("/docker/documentation", response_model=List[ContainerCatalogItemOut])
async def list_container_catalog(
    server_id: Optional[UUID] = Query(None, description="Filtrar por servidor específico"),
    application_name: Optional[str] = Query(None, description="Filtrar por aplicación"),
    category: Optional[str] = Query(None, description="Filtrar por categoría funcional"),
    environment: Optional[str] = Query(None, description="Filtrar por ambiente (production, development, etc.)"),
    documentation_status: Optional[str] = Query(None, description="undocumented, suggested, documented, review_pending"),
    search: Optional[str] = Query(None, description="Búsqueda por nombre de contenedor, servicio o descripción"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("docker:read")),
):
    """
    Lista el catálogo completo de contenedores documentados en toda la infraestructura.
    Sincroniza y fusiona información técnica viva con las fichas de PostgreSQL.
    """
    # 1. Obtener servidores válidos
    srv_stmt = select(Server)
    if server_id:
        srv_stmt = srv_stmt.where(Server.id == server_id)
    srv_res = await db.execute(srv_stmt)
    servers = {s.id: s.name for s in srv_res.scalars().all()}

    if not servers:
        return []

    # 2. Descubrir contenedores en vivo de agentes conectados para asegurar que nuevos contenedores aparezcan
    for s_id in list(servers.keys()):
        if agent_gateway.is_agent_connected(s_id):
            try:
                res = await agent_gateway.send_agent_request(
                    server_id=s_id,
                    module="docker",
                    operation="container.list",
                    payload={"all": True},
                    timeout_seconds=5,
                )
                if res.get("success") and isinstance(res.get("data"), list):
                    for c in res.get("data", []):
                        c_id = c.get("id")
                        names = c.get("names", [])
                        c_name = names[0] if names else c_id[:12]
                        c_proj = c.get("compose_project")
                        c_svc = c.get("compose_service")
                        c_img = c.get("image", "")
                        c_labels = c.get("labels", {}) or {}

                        ident_key = compute_identity_key(c_name, c_proj, c_svc)

                        # Buscar si ya existe la ficha
                        doc_stmt = select(ContainerDocumentation).where(
                            ContainerDocumentation.server_id == s_id,
                            ContainerDocumentation.identity_key == ident_key,
                        )
                        doc_res = await db.execute(doc_stmt)
                        existing_doc = doc_res.scalar_one_or_none()

                        if not existing_doc:
                            # Auto-sugerencia inicial
                            sugg = container_doc_engine.generate_documentation_suggestion(
                                container_name=c_name,
                                image_name=c_img,
                                compose_service=c_svc,
                                compose_project=c_proj,
                                labels=c_labels,
                            )
                            has_lbls = bool(sugg.get("labels_detected"))
                            new_doc = ContainerDocumentation(
                                server_id=s_id,
                                identity_key=ident_key,
                                container_id=c_id,
                                container_name=c_name,
                                compose_project=c_proj,
                                compose_service=c_svc,
                                image_name=c_img,
                                description=sugg["description"] if has_lbls else None,
                                purpose=sugg["purpose"] if has_lbls else None,
                                application_name=sugg["application_name"],
                                category=sugg["category"],
                                owner=sugg["owner"] if has_lbls else None,
                                environment=sugg["environment"],
                                documentation_source="docker_labels" if has_lbls else "auto",
                                documentation_status="documented" if has_lbls else "suggested",
                                generated_description=sugg["description"],
                                generated_purpose=sugg["purpose"],
                                generated_category=sugg["category"],
                                labels_snapshot=c_labels,
                            )
                            db.add(new_doc)
                        else:
                            # Actualizar container_id si fue recreado y sincronizar labels si no es manual
                            if existing_doc.container_id != c_id:
                                existing_doc.container_id = c_id
                            existing_doc.labels_snapshot = c_labels
                            if existing_doc.documentation_source != "manual":
                                l_ext = extract_linuxops_labels(c_labels)
                                if l_ext:
                                    if l_ext.get("description"):
                                        existing_doc.description = l_ext["description"]
                                    if l_ext.get("purpose"):
                                        existing_doc.purpose = l_ext["purpose"]
                                    if l_ext.get("application_name"):
                                        existing_doc.application_name = l_ext["application_name"]
                                    if l_ext.get("category"):
                                        existing_doc.category = l_ext["category"]
                                    if l_ext.get("owner"):
                                        existing_doc.owner = l_ext["owner"]
                                    if l_ext.get("environment"):
                                        existing_doc.environment = l_ext["environment"]
                                    existing_doc.documentation_source = "docker_labels"
                                    existing_doc.documentation_status = "documented"
                    await db.commit()
            except Exception:
                pass

    # 3. Consulta con filtros
    query = select(ContainerDocumentation)
    if server_id:
        query = query.where(ContainerDocumentation.server_id == server_id)
    if application_name and application_name.strip() and application_name.lower() != "all":
        query = query.where(ContainerDocumentation.application_name.ilike(f"%{application_name.strip()}%"))
    if category and category.strip() and category.lower() != "all":
        query = query.where(ContainerDocumentation.category == category.strip().lower())
    if environment and environment.strip() and environment.lower() != "all":
        query = query.where(ContainerDocumentation.environment == environment.strip().lower())
    if documentation_status and documentation_status.strip() and documentation_status.lower() != "all":
        query = query.where(ContainerDocumentation.documentation_status == documentation_status.strip().lower())
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.where(
            or_(
                ContainerDocumentation.container_name.ilike(term),
                ContainerDocumentation.compose_service.ilike(term),
                ContainerDocumentation.compose_project.ilike(term),
                ContainerDocumentation.application_name.ilike(term),
                ContainerDocumentation.description.ilike(term),
                ContainerDocumentation.image_name.ilike(term),
            )
        )

    query = query.order_by(ContainerDocumentation.application_name.asc(), ContainerDocumentation.container_name.asc())
    result = await db.execute(query)
    docs = result.scalars().all()

    catalog_items: List[ContainerCatalogItemOut] = []
    for d in docs:
        s_name = servers.get(d.server_id, "Servidor desconocido")
        catalog_items.append(
            ContainerCatalogItemOut(
                id=d.id,
                server_id=d.server_id,
                server_name=s_name,
                container_id=d.container_id or "",
                container_name=d.container_name,
                image=d.image_name or "unknown",
                state="registered",
                status="cataloged",
                compose_project=d.compose_project,
                compose_service=d.compose_service,
                application_name=d.application_name,
                category=d.category,
                owner=d.owner,
                environment=d.environment,
                documentation_status=d.documentation_status,
                documentation_source=d.documentation_source,
                description=d.description or d.generated_description,
                purpose=d.purpose or d.generated_purpose,
                has_labels=bool(d.labels_snapshot),
                updated_at=d.updated_at,
            )
        )

    return catalog_items


@router.get("/docker/documentation/summary", response_model=ContainerCatalogSummaryOut)
async def get_container_documentation_summary(
    server_id: Optional[UUID] = Query(None, description="Filtrar por servidor específico"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("docker:read")),
):
    """
    Retorna métricas consolidadas sobre el grado de documentación y distribución
    de los contenedores en el inventario.
    """
    base_query = select(ContainerDocumentation)
    if server_id:
        base_query = base_query.where(ContainerDocumentation.server_id == server_id)

    res = await db.execute(base_query)
    docs = res.scalars().all()

    total = len(docs)
    documented = 0
    suggested = 0
    undocumented = 0
    review_pending = 0
    cat_counts: Dict[str, int] = {}
    env_counts: Dict[str, int] = {}
    app_counts: Dict[str, int] = {}

    for d in docs:
        status_val = d.documentation_status or "undocumented"
        if status_val == "documented":
            documented += 1
        elif status_val == "suggested":
            suggested += 1
        elif status_val == "review_pending":
            review_pending += 1
        else:
            undocumented += 1

        cat = d.category or "other"
        cat_counts[cat] = cat_counts.get(cat, 0) + 1

        env = d.environment or "production"
        env_counts[env] = env_counts.get(env, 0) + 1

        app = d.application_name or "Sin Aplicación"
        app_counts[app] = app_counts.get(app, 0) + 1

    return ContainerCatalogSummaryOut(
        total_containers=total,
        documented_count=documented,
        suggested_count=suggested,
        undocumented_count=undocumented,
        review_pending_count=review_pending,
        categories=cat_counts,
        environments=env_counts,
        applications=app_counts,
    )


@router.get(
    "/servers/{server_id}/docker/containers/{container_id}/documentation",
    response_model=ContainerDocumentationOut,
)
async def get_container_documentation(
    server_id: UUID,
    container_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("docker:read")),
):
    """
    Obtiene la ficha técnica y administrativa completa de un contenedor específico.
    Si el contenedor no ha sido documentado aún, genera la sugerencia y crea el registro.
    """
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor no encontrado.")

    # 1. Inspeccionar contenedor en vivo si es posible
    live_data = await _get_container_live_info(server_id, container_id)

    c_name = container_id[:12]
    c_img = "unknown"
    c_proj = None
    c_svc = None
    c_labels: Dict[str, str] = {}
    c_state = "unknown"
    c_ports = []
    c_networks = []
    c_mounts = []

    if live_data:
        c_name = live_data.get("name") or c_name
        c_img = live_data.get("image") or c_img
        c_labels = live_data.get("labels", {}) or {}
        c_proj = c_labels.get("com.docker.compose.project")
        c_svc = c_labels.get("com.docker.compose.service")
        c_state = live_data.get("state", {}).get("Status", "unknown")
        c_mounts = live_data.get("mounts", [])
        net_settings = live_data.get("network_settings", {})
        c_networks = list(net_settings.get("Networks", {}).keys())

    ident_key = compute_identity_key(c_name, c_proj, c_svc)

    # 2. Buscar ficha en base de datos
    stmt = select(ContainerDocumentation).where(
        ContainerDocumentation.server_id == server_id,
        or_(
            ContainerDocumentation.identity_key == ident_key,
            ContainerDocumentation.container_id == container_id,
        ),
    )
    res = await db.execute(stmt)
    doc = res.scalar_one_or_none()

    # Si no existe, creamos la ficha inicial con la sugerencia por reglas y etiquetas
    if not doc:
        sugg = container_doc_engine.generate_documentation_suggestion(
            container_name=c_name,
            image_name=c_img,
            compose_service=c_svc,
            compose_project=c_proj,
            labels=c_labels,
        )
        has_lbls = bool(sugg.get("labels_detected"))

        doc = ContainerDocumentation(
            server_id=server_id,
            identity_key=ident_key,
            container_id=container_id,
            container_name=c_name,
            compose_project=c_proj,
            compose_service=c_svc,
            image_name=c_img,
            description=sugg["description"] if has_lbls else None,
            purpose=sugg["purpose"] if has_lbls else None,
            application_name=sugg["application_name"],
            category=sugg["category"],
            owner=sugg["owner"] if has_lbls else None,
            environment=sugg["environment"],
            documentation_source="docker_labels" if has_lbls else "auto",
            documentation_status="documented" if has_lbls else "suggested",
            generated_description=sugg["description"],
            generated_purpose=sugg["purpose"],
            generated_category=sugg["category"],
            labels_snapshot=c_labels,
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
    else:
        # Si fue recreado o cambió de container_id, actualizar puntero temporal
        if doc.container_id != container_id:
            doc.container_id = container_id
            await db.commit()

        # Si aún no tiene sugerencia generada, calcularla
        if not doc.generated_description:
            sugg = container_doc_engine.generate_documentation_suggestion(
                container_name=doc.container_name,
                image_name=doc.image_name or c_img,
                compose_service=doc.compose_service,
                compose_project=doc.compose_project,
                labels=doc.labels_snapshot or c_labels,
            )
            doc.generated_description = sugg["description"]
            doc.generated_purpose = sugg["purpose"]
            doc.generated_category = sugg["category"]
            await db.commit()

    return ContainerDocumentationOut(
        id=doc.id,
        server_id=doc.server_id,
        server_name=server.name,
        identity_key=doc.identity_key,
        container_id=doc.container_id,
        container_name=doc.container_name,
        compose_project=doc.compose_project,
        compose_service=doc.compose_service,
        image_name=doc.image_name,
        description=doc.description,
        purpose=doc.purpose,
        application_name=doc.application_name,
        category=doc.category,
        owner=doc.owner,
        environment=doc.environment,
        documentation_source=doc.documentation_source,
        documentation_status=doc.documentation_status,
        generated_description=doc.generated_description,
        generated_purpose=doc.generated_purpose,
        generated_category=doc.generated_category,
        labels_snapshot=doc.labels_snapshot or {},
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        updated_by=doc.updated_by,
        state=c_state,
        networks=c_networks,
        mounts=c_mounts,
    )


@router.put(
    "/servers/{server_id}/docker/containers/{container_id}/documentation",
    response_model=ContainerDocumentationOut,
)
async def update_container_documentation(
    server_id: UUID,
    container_id: str,
    payload: ContainerDocumentationUpdateIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("docker:manage")),
):
    """
    Guarda o edita manualmente la documentación de un contenedor.
    Marca el origen como 'manual' garantizando que actualizaciones automáticas
    no destruyan la información documentada.
    """
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor no encontrado.")

    # Localizar registro por identity_key o container_id
    live_data = await _get_container_live_info(server_id, container_id)
    c_name = container_id[:12]
    c_proj = None
    c_svc = None
    c_img = "unknown"
    c_labels: Dict[str, str] = {}

    if live_data:
        c_name = live_data.get("name") or c_name
        c_img = live_data.get("image") or c_img
        c_labels = live_data.get("labels", {}) or {}
        c_proj = c_labels.get("com.docker.compose.project")
        c_svc = c_labels.get("com.docker.compose.service")

    ident_key = compute_identity_key(c_name, c_proj, c_svc)

    stmt = select(ContainerDocumentation).where(
        ContainerDocumentation.server_id == server_id,
        or_(
            ContainerDocumentation.identity_key == ident_key,
            ContainerDocumentation.container_id == container_id,
        ),
    )
    res = await db.execute(stmt)
    doc = res.scalar_one_or_none()

    if not doc:
        doc = ContainerDocumentation(
            server_id=server_id,
            identity_key=ident_key,
            container_id=container_id,
            container_name=c_name,
            compose_project=c_proj,
            compose_service=c_svc,
            image_name=c_img,
            labels_snapshot=c_labels,
        )
        db.add(doc)

    old_values = {
        "description": doc.description,
        "purpose": doc.purpose,
        "application_name": doc.application_name,
        "category": doc.category,
        "owner": doc.owner,
        "environment": doc.environment,
        "documentation_status": doc.documentation_status,
    }

    # Aplicar cambios manuales
    if payload.description is not None:
        doc.description = payload.description.strip()
    if payload.purpose is not None:
        doc.purpose = payload.purpose.strip()
    if payload.application_name is not None:
        doc.application_name = payload.application_name.strip()
    if payload.category is not None:
        doc.category = payload.category.strip().lower()
    if payload.owner is not None:
        doc.owner = payload.owner.strip()
    if payload.environment is not None:
        doc.environment = payload.environment.strip().lower()
    if payload.documentation_status is not None:
        doc.documentation_status = payload.documentation_status.strip().lower()

    doc.documentation_source = "manual"
    doc.updated_by = current_user.username
    doc.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(doc)

    # Registro de auditoría
    client_ip = request.client.host if request.client else "unknown"
    await AuditService.log_event(
        db=db,
        correlation_id=str(uuid4()),
        operation="docker.documentation.update",
        resource_type="container_documentation",
        resource_id=str(doc.id),
        server_id=server_id,
        status="success",
        user_id=current_user.id,
        username=current_user.username,
        client_ip=client_ip,
        details={
            "container_name": doc.container_name,
            "identity_key": doc.identity_key,
            "old_values": old_values,
            "new_values": {
                "description": doc.description,
                "purpose": doc.purpose,
                "application_name": doc.application_name,
                "category": doc.category,
                "owner": doc.owner,
                "environment": doc.environment,
                "documentation_status": doc.documentation_status,
            },
        },
    )

    return ContainerDocumentationOut(
        id=doc.id,
        server_id=doc.server_id,
        server_name=server.name,
        identity_key=doc.identity_key,
        container_id=doc.container_id,
        container_name=doc.container_name,
        compose_project=doc.compose_project,
        compose_service=doc.compose_service,
        image_name=doc.image_name,
        description=doc.description,
        purpose=doc.purpose,
        application_name=doc.application_name,
        category=doc.category,
        owner=doc.owner,
        environment=doc.environment,
        documentation_source=doc.documentation_source,
        documentation_status=doc.documentation_status,
        generated_description=doc.generated_description,
        generated_purpose=doc.generated_purpose,
        generated_category=doc.generated_category,
        labels_snapshot=doc.labels_snapshot or {},
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        updated_by=doc.updated_by,
    )


@router.post(
    "/servers/{server_id}/docker/containers/{container_id}/documentation/generate",
    response_model=ContainerDocumentationGenerateOut,
)
async def generate_container_documentation_proposal(
    server_id: UUID,
    container_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("docker:manage")),
):
    """
    Calcula una propuesta automática fresca basada en reglas deterministas y etiquetas
    sin sobrescribir la documentación manual guardada.
    """
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor no encontrado.")

    live_data = await _get_container_live_info(server_id, container_id)
    c_name = container_id[:12]
    c_proj = None
    c_svc = None
    c_img = "unknown"
    c_labels: Dict[str, str] = {}

    if live_data:
        c_name = live_data.get("name") or c_name
        c_img = live_data.get("image") or c_img
        c_labels = live_data.get("labels", {}) or {}
        c_proj = c_labels.get("com.docker.compose.project")
        c_svc = c_labels.get("com.docker.compose.service")

    ident_key = compute_identity_key(c_name, c_proj, c_svc)

    # Obtener o crear ficha
    stmt = select(ContainerDocumentation).where(
        ContainerDocumentation.server_id == server_id,
        or_(
            ContainerDocumentation.identity_key == ident_key,
            ContainerDocumentation.container_id == container_id,
        ),
    )
    res = await db.execute(stmt)
    doc = res.scalar_one_or_none()

    sugg = container_doc_engine.generate_documentation_suggestion(
        container_name=c_name,
        image_name=c_img,
        compose_service=c_svc,
        compose_project=c_proj,
        labels=c_labels,
    )

    if doc:
        doc.generated_description = sugg["description"]
        doc.generated_purpose = sugg["purpose"]
        doc.generated_category = sugg["category"]
        await db.commit()

    return ContainerDocumentationGenerateOut(
        generated_description=sugg["description"],
        generated_purpose=sugg["purpose"],
        generated_category=sugg["category"],
        source_rule=sugg["source_rule"],
        labels_detected=sugg["labels_detected"],
    )


@router.post(
    "/servers/{server_id}/docker/containers/{container_id}/documentation/confirm",
    response_model=ContainerDocumentationOut,
)
async def confirm_container_documentation(
    server_id: UUID,
    container_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("docker:manage")),
):
    """
    Acepta formalmente la descripción y propuesta sugerida como documentación
    oficial del contenedor, cambiando su estado a 'documented'.
    """
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor no encontrado.")

    live_data = await _get_container_live_info(server_id, container_id)
    c_name = container_id[:12]
    c_proj = None
    c_svc = None
    c_img = "unknown"
    c_labels: Dict[str, str] = {}

    if live_data:
        c_name = live_data.get("name") or c_name
        c_img = live_data.get("image") or c_img
        c_labels = live_data.get("labels", {}) or {}
        c_proj = c_labels.get("com.docker.compose.project")
        c_svc = c_labels.get("com.docker.compose.service")

    ident_key = compute_identity_key(c_name, c_proj, c_svc)

    stmt = select(ContainerDocumentation).where(
        ContainerDocumentation.server_id == server_id,
        or_(
            ContainerDocumentation.identity_key == ident_key,
            ContainerDocumentation.container_id == container_id,
        ),
    )
    res = await db.execute(stmt)
    doc = res.scalar_one_or_none()

    if not doc:
        sugg = container_doc_engine.generate_documentation_suggestion(
            container_name=c_name,
            image_name=c_img,
            compose_service=c_svc,
            compose_project=c_proj,
            labels=c_labels,
        )
        doc = ContainerDocumentation(
            server_id=server_id,
            identity_key=ident_key,
            container_id=container_id,
            container_name=c_name,
            compose_project=c_proj,
            compose_service=c_svc,
            image_name=c_img,
            description=sugg["description"],
            purpose=sugg["purpose"],
            application_name=sugg["application_name"],
            category=sugg["category"],
            owner=sugg["owner"],
            environment=sugg["environment"],
            documentation_source="auto" if not sugg["labels_detected"] else "docker_labels",
            documentation_status="documented",
            generated_description=sugg["description"],
            generated_purpose=sugg["purpose"],
            generated_category=sugg["category"],
            labels_snapshot=c_labels,
            updated_by=current_user.username,
        )
        db.add(doc)
    else:
        # Promover la sugerencia a oficial
        doc.description = doc.generated_description or doc.description
        doc.purpose = doc.generated_purpose or doc.purpose
        if doc.generated_category:
            doc.category = doc.generated_category
        doc.documentation_status = "documented"
        doc.updated_by = current_user.username
        doc.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(doc)

    client_ip = request.client.host if request.client else "unknown"
    await AuditService.log_event(
        db=db,
        correlation_id=str(uuid4()),
        operation="docker.documentation.confirm",
        resource_type="container_documentation",
        resource_id=str(doc.id),
        server_id=server_id,
        status="success",
        user_id=current_user.id,
        username=current_user.username,
        client_ip=client_ip,
        details={
            "container_name": doc.container_name,
            "confirmed_description": doc.description,
            "category": doc.category,
        },
    )

    return ContainerDocumentationOut(
        id=doc.id,
        server_id=doc.server_id,
        server_name=server.name,
        identity_key=doc.identity_key,
        container_id=doc.container_id,
        container_name=doc.container_name,
        compose_project=doc.compose_project,
        compose_service=doc.compose_service,
        image_name=doc.image_name,
        description=doc.description,
        purpose=doc.purpose,
        application_name=doc.application_name,
        category=doc.category,
        owner=doc.owner,
        environment=doc.environment,
        documentation_source=doc.documentation_source,
        documentation_status=doc.documentation_status,
        generated_description=doc.generated_description,
        generated_purpose=doc.generated_purpose,
        generated_category=doc.generated_category,
        labels_snapshot=doc.labels_snapshot or {},
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        updated_by=doc.updated_by,
    )
