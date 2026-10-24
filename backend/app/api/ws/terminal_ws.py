"""
LinuxOps Manager — WebSocket de Terminal Web Interactiva para Navegador
Canaliza pulsaciones de teclas y redimensionamientos de pantalla (xterm.js) hacia el agente PTY.
"""

import json
import logging
from uuid import UUID
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.task import TerminalSession
from app.services.agent_gateway import agent_gateway

logger = logging.getLogger("linuxops.ws.terminal")
router = APIRouter(prefix="/ws", tags=["WebSocket Terminal"])


@router.websocket("/terminal/{session_id}")
async def browser_terminal_websocket(
    websocket: WebSocket,
    session_id: UUID,
):
    await websocket.accept()

    async with AsyncSessionLocal() as db:
        session = await db.get(TerminalSession, session_id)
        if not session or session.status != "active":
            await websocket.close(code=1008, reason="Sesión de terminal no válida o inactiva")
            return
        server_id = session.server_id

    agent_ws = agent_gateway.active_agents.get(server_id)
    if not agent_ws:
        await websocket.close(code=1011, reason="El servidor remoto no está conectado")
        return

    agent_gateway.active_terminals[session_id] = websocket

    # Notificar al agente para iniciar la sesión PTY
    await agent_ws.send_text(json.dumps({
        "protocol_version": "1.0",
        "type": "terminal_open",
        "session_id": str(session_id),
        "pty_user": session.pty_user,
    }))

    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                event = json.loads(raw_text)
            except Exception:
                continue

            event_type = event.get("type")

            if event_type == "input":
                # Reenviar entrada de teclado al agente
                await agent_ws.send_text(json.dumps({
                    "protocol_version": "1.0",
                    "type": "terminal_input",
                    "session_id": str(session_id),
                    "data": event.get("data", ""),
                }))
            elif event_type == "resize":
                # Notificar nuevo tamaño de columnas/filas
                await agent_ws.send_text(json.dumps({
                    "protocol_version": "1.0",
                    "type": "terminal_resize",
                    "session_id": str(session_id),
                    "cols": event.get("cols", 80),
                    "rows": event.get("rows", 24),
                }))

    except WebSocketDisconnect:
        logger.info(f"Sesión de terminal {session_id} desconectada por el navegador.")
    finally:
        agent_gateway.active_terminals.pop(session_id, None)
        # Notificar al agente que cierre la pseudoterminal
        try:
            if agent_gateway.is_agent_connected(server_id):
                await agent_ws.send_text(json.dumps({
                    "protocol_version": "1.0",
                    "type": "terminal_close",
                    "session_id": str(session_id),
                }))
        except Exception:
            pass

        async with AsyncSessionLocal() as db:
            s = await db.get(TerminalSession, session_id)
            if s and s.status == "active":
                s.status = "closed"
                await db.commit()

