"""
LinuxOps Manager — WebSocket de Comunicación Central con Agentes Remotos
Maneja latidos periódicos (heartbeat), métricas en tiempo real, recepción de respuestas
de tareas y streaming de terminal interactiva.
"""

import datetime
import json
import logging
from uuid import UUID
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.metric import ServerMetric
from app.models.server import Agent, ConnectivityEvent, Server
from app.services.agent_gateway import agent_gateway

logger = logging.getLogger("linuxops.ws.agent")
router = APIRouter(prefix="/ws", tags=["WebSocket"])


@router.websocket("/agent/{server_id}")
async def agent_websocket_endpoint(websocket: WebSocket, server_id: UUID):
    await websocket.accept()

    async with AsyncSessionLocal() as db:
        server = await db.get(Server, server_id)
        if not server:
            logger.warning(f"Rechazada conexión WS de servidor inexistente: {server_id}")
            await websocket.close(code=1008, reason="Servidor no registrado")
            return

        agent_stmt = select(Agent).where(Agent.server_id == server_id)
        agent_res = await db.execute(agent_stmt)
        agent = agent_res.scalar_one_or_none()

        if not agent or agent.is_revoked:
            logger.warning(f"Rechazada conexión WS de agente revocado o no registrado: {server_id}")
            await websocket.close(code=1008, reason="Agente no registrado o revocado")
            return

        # Registrar evento de conectividad
        conn_event = ConnectivityEvent(
            server_id=server.id,
            event_type="connected",
            details="Agente estableció conexión WebSocket saliente mTLS.",
        )
        db.add(conn_event)
        server.status = "online"
        server.last_heartbeat_at = datetime.datetime.utcnow()
        await db.commit()

    agent_gateway.register_agent(server_id, websocket)

    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                msg = json.loads(raw_text)
            except Exception:
                continue

            msg_type = msg.get("type")

            if msg_type == "heartbeat":
                metrics_data = msg.get("metrics", {})
                now = datetime.datetime.utcnow()

                async with AsyncSessionLocal() as db:
                    s = await db.get(Server, server_id)
                    if s:
                        s.last_heartbeat_at = now
                        s.uptime_seconds = metrics_data.get("uptime_seconds", s.uptime_seconds)
                        s.cpu_percent = metrics_data.get("cpu_percent", s.cpu_percent)
                        s.ram_percent = metrics_data.get("ram_percent", s.ram_percent)
                        s.free_ram_bytes = metrics_data.get("free_ram_bytes", s.free_ram_bytes)
                        s.total_ram_bytes = metrics_data.get("total_ram_bytes", s.total_ram_bytes)
                        s.disk_percent = metrics_data.get("disk_percent", s.disk_percent)
                        s.free_disk_bytes = metrics_data.get("free_disk_bytes", s.free_disk_bytes)
                        s.total_disk_bytes = metrics_data.get("total_disk_bytes", s.total_disk_bytes)
                        s.load_1 = metrics_data.get("load_1", s.load_1)
                        s.load_5 = metrics_data.get("load_5", s.load_5)
                        s.load_15 = metrics_data.get("load_15", s.load_15)
                        s.container_count = metrics_data.get("container_count", s.container_count)
                        s.failed_services_count = metrics_data.get("failed_services_count", s.failed_services_count)

                        # Guardar métrica histórica
                        metric_entry = ServerMetric(
                            server_id=server_id,
                            timestamp=now,
                            cpu_percent=s.cpu_percent,
                            ram_percent=s.ram_percent,
                            ram_used_bytes=s.total_ram_bytes - s.free_ram_bytes,
                            disk_percent=s.disk_percent,
                            disk_used_bytes=s.total_disk_bytes - s.free_disk_bytes,
                            load_1=s.load_1,
                            load_5=s.load_5,
                            load_15=s.load_15,
                            running_containers=s.container_count,
                            failed_services=s.failed_services_count,
                        )
                        db.add(metric_entry)
                        await db.commit()

            elif msg_type == "response":
                req_id = msg.get("request_id")
                if req_id:
                    agent_gateway.resolve_agent_response(req_id, msg)

            elif msg_type == "terminal_output":
                term_session_id_str = msg.get("session_id")
                data = msg.get("data", "")
                if term_session_id_str:
                    try:
                        ts_id = UUID(term_session_id_str)
                        browser_ws = agent_gateway.active_terminals.get(ts_id)
                        if browser_ws:
                            await browser_ws.send_text(json.dumps({"type": "output", "data": data}))
                    except Exception as e:
                        logger.error(f"Error reenviando terminal output: {e}")

    except WebSocketDisconnect:
        logger.info(f"WebSocket desconectado para servidor: {server_id}")
    finally:
        agent_gateway.unregister_agent(server_id)
        async with AsyncSessionLocal() as db:
            s = await db.get(Server, server_id)
            if s:
                s.status = "offline"
                evt = ConnectivityEvent(
                    server_id=server_id,
                    event_type="disconnected",
                    details="Canal WebSocket saliente cerrado.",
                )
                db.add(evt)
                await db.commit()

