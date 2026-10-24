"""
LinuxOps Manager — Pasarela de Conexión y Protocolo Central-Agente
Gestiona los canales WebSocket salientes de los agentes, despacho de tareas
con protección anti-repetición y enrutamiento en tiempo real.
"""

import asyncio
import datetime
import json
import logging
from typing import Any, Dict, Optional
from uuid import UUID, uuid4
from fastapi import WebSocket

logger = logging.getLogger("linuxops.agent_gateway")


class AgentGateway:
    def __init__(self):
        # Mapeo de server_id (UUID) -> WebSocket del agente
        self.active_agents: Dict[UUID, WebSocket] = {}
        # Mapeo de request_id (str) -> asyncio.Future para respuestas correlacionadas
        self.pending_requests: Dict[str, asyncio.Future] = {}
        # Mapeo de terminal_session_id (UUID) -> WebSocket del navegador
        self.active_terminals: Dict[UUID, WebSocket] = {}

    def register_agent(self, server_id: UUID, websocket: WebSocket) -> None:
        """Registra un agente conectado."""
        self.active_agents[server_id] = websocket
        logger.info(f"Agente conectado para el servidor {server_id}")

    def unregister_agent(self, server_id: UUID) -> None:
        """Elimina el registro de un agente desconectado."""
        if server_id in self.active_agents:
            del self.active_agents[server_id]
            logger.info(f"Agente desconectado para el servidor {server_id}")

    def is_agent_connected(self, server_id: UUID) -> bool:
        return server_id in self.active_agents

    async def send_agent_request(
        self,
        server_id: UUID,
        module: str,
        operation: str,
        payload: Dict[str, Any],
        timeout_seconds: int = 30,
    ) -> Dict[str, Any]:
        """
        Envía una solicitud tipada al agente conectado usando el protocolo versionado 1.0.
        Espera la respuesta de forma asíncrona mediante correlación de request_id.
        """
        ws = self.active_agents.get(server_id)
        if not ws:
            raise ConnectionError(f"El agente del servidor {server_id} no está conectado actualmente.")

        request_id = str(uuid4())
        now = datetime.datetime.now(datetime.timezone.utc)
        expires_at = now + datetime.timedelta(seconds=timeout_seconds)

        envelope = {
            "protocol_version": "1.0",
            "request_id": request_id,
            "issued_at": now.isoformat(),
            "expires_at": expires_at.isoformat(),
            "module": module,
            "operation": operation,
            "payload": payload,
        }

        loop = asyncio.get_running_loop()
        future: asyncio.Future = loop.create_future()
        self.pending_requests[request_id] = future

        try:
            await ws.send_text(json.dumps(envelope))
            response = await asyncio.wait_for(future, timeout=timeout_seconds)
            return response
        except asyncio.TimeoutError:
            raise TimeoutError(f"Tiempo de espera agotado ({timeout_seconds}s) esperando respuesta del agente.")
        finally:
            self.pending_requests.pop(request_id, None)

    def resolve_agent_response(self, request_id: str, response_payload: Dict[str, Any]) -> None:
        """Resuelve el Future asociado a una respuesta recibida del agente."""
        future = self.pending_requests.get(request_id)
        if future and not future.done():
            future.set_result(response_payload)


agent_gateway = AgentGateway()

