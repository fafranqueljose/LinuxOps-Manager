"""
LinuxOps Manager — Router de Dashboard Central
Calcula métricas agregadas reales y estados a partir del inventario activo.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_permission
from app.models.alert import Alert
from app.models.server import Server
from app.models.user import User
from app.schemas.metric import DashboardSummaryOut
from app.api.v1.servers import calculate_server_live_status

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardSummaryOut)
async def get_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("servers:read")),
):
    stmt = select(Server)
    res = await db.execute(stmt)
    servers = res.scalars().all()

    total_servers = len(servers)
    online_servers = 0
    offline_servers = 0
    degraded_servers = 0

    total_containers = 0
    running_containers = 0
    failed_services_total = 0

    cpu_sum = 0.0
    ram_sum = 0.0
    active_with_metrics = 0

    for s in servers:
        st = calculate_server_live_status(s)
        if st == "online":
            online_servers += 1
            cpu_sum += s.cpu_percent
            ram_sum += s.ram_percent
            active_with_metrics += 1
            total_containers += s.container_count
            running_containers += s.container_count  # reportado por agente
            failed_services_total += s.failed_services_count
        elif st == "degraded":
            degraded_servers += 1
            cpu_sum += s.cpu_percent
            ram_sum += s.ram_percent
            active_with_metrics += 1
            total_containers += s.container_count
            failed_services_total += s.failed_services_count
        else:
            offline_servers += 1

    avg_cpu = round(cpu_sum / active_with_metrics, 2) if active_with_metrics > 0 else 0.0
    avg_ram = round(ram_sum / active_with_metrics, 2) if active_with_metrics > 0 else 0.0

    # Contar alertas activas no resueltas
    alert_stmt = select(func.count(Alert.id)).where(Alert.is_resolved.is_(False))
    alert_count = (await db.execute(alert_stmt)).scalar() or 0

    return DashboardSummaryOut(
        total_servers=total_servers,
        online_servers=online_servers,
        offline_servers=offline_servers,
        degraded_servers=degraded_servers,
        total_containers=total_containers,
        running_containers=running_containers,
        stopped_containers=total_containers - running_containers,
        failed_services_total=failed_services_total,
        avg_cpu_percent=avg_cpu,
        avg_ram_percent=avg_ram,
        calculation_method="Media aritmética sobre servidores en estado 'online' o 'degraded' reportados en su último heartbeat.",
        recent_alerts_count=alert_count,
    )

