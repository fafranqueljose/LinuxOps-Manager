"""
LinuxOps Agent — Demonio Principal del Agente Linux
Establece conexión saliente persistente hacia el backend central,
reporta latidos y métricas periódicas, y procesa solicitudes autorizadas.
"""

import asyncio
import json
import logging
import os
import signal
import ssl
import sys
from typing import Dict, Optional
import websockets

from linuxops_agent.config import config
from linuxops_agent.collectors.system_collector import system_collector
from linuxops_agent.collectors.storage_collector import storage_collector
from linuxops_agent.docker_manager.manager import docker_manager
from linuxops_agent.systemd_manager.manager import systemd_manager
from linuxops_agent.security.request_validator import request_validator
from linuxops_agent.terminal_manager.pty_session import PTYSession

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [Agent] %(message)s")
logger = logging.getLogger("linuxops.agent")


class AgentDaemon:
    def __init__(self):
        self.running = True
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.terminal_sessions: Dict[str, PTYSession] = {}

    def _setup_ssl_context(self) -> Optional[ssl.SSLContext]:
        """Configura el contexto TLS/mTLS con certificados de cliente y confianza de CA."""
        if config.ws_url.startswith("ws://"):
            return None

        # Si se especifica modo inseguro explícito
        if config.INSECURE:
            logger.info("Modo SSL inseguro activado (verificación de certificado de servidor desactivada).")
            ctx = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            if os.path.exists(config.AGENT_CERT_PATH) and os.path.exists(config.AGENT_KEY_PATH):
                try:
                    ctx.load_cert_chain(certfile=config.AGENT_CERT_PATH, keyfile=config.AGENT_KEY_PATH)
                except Exception as e:
                    logger.warning(f"No se pudo cargar certificado de cliente mTLS: {e}")
            return ctx

        # Contexto estándar: carga los certificados CA raíz de confianza del sistema operativo
        ctx = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
        ctx.check_hostname = False

        # Incorporar la CA interna de LinuxOps a las CA de confianza si existe
        if os.path.exists(config.CA_CERT_PATH):
            try:
                ctx.load_verify_locations(cafile=config.CA_CERT_PATH)
            except Exception as e:
                logger.debug(f"No se pudo cargar CA interna ({config.CA_CERT_PATH}): {e}")

        # Cargar certificado y clave privada del agente para autenticación mTLS
        if os.path.exists(config.AGENT_CERT_PATH) and os.path.exists(config.AGENT_KEY_PATH):
            try:
                ctx.load_cert_chain(certfile=config.AGENT_CERT_PATH, keyfile=config.AGENT_KEY_PATH)
            except Exception as e:
                logger.warning(f"No se pudo cargar certificado de cliente mTLS: {e}")

        return ctx
    async def start(self):
        """Bucle principal del agente con reconexión automática tras caídas de red."""
        logger.info(f"Iniciando LinuxOps Agent v{config.AGENT_VERSION} para Servidor ID: {config.SERVER_ID}")

        ssl_ctx = self._setup_ssl_context()

        while self.running:
            try:
                logger.info(f"Conectando al servidor central: {config.ws_url}...")
                async with websockets.connect(config.ws_url, ssl=ssl_ctx, ping_interval=20, ping_timeout=20) as ws:
                    self.ws = ws
                    logger.info("Conexión saliente establecida con el servidor central.")

                    # Iniciar tarea de envío de heartbeat
                    heartbeat_task = asyncio.create_task(self._heartbeat_loop())

                    try:
                        while self.running:
                            message = await ws.recv()
                            await self._handle_message(message)
                    finally:
                        heartbeat_task.cancel()

            except (websockets.ConnectionClosed, ConnectionRefusedError, OSError) as e:
                logger.warning(f"Conexión con el servidor central interrumpida: {e}. Reintentando en {config.RECONNECT_DELAY_SECONDS}s...")
                await asyncio.sleep(config.RECONNECT_DELAY_SECONDS)
            except Exception as e:
                logger.error(f"Error inesperado en el agente: {e}", exc_info=True)
                await asyncio.sleep(config.RECONNECT_DELAY_SECONDS)

    async def _heartbeat_loop(self):
        """Envía periódicamente el estado y las métricas en tiempo real del host."""
        while self.running and self.ws:
            try:
                metrics = system_collector.get_live_metrics()
                # Añadir conteo de contenedores Docker activos si Docker está disponible
                if docker_manager.is_docker_available():
                    try:
                        containers = docker_manager.list_containers(all=False)
                        metrics["container_count"] = len(containers)
                    except Exception:
                        metrics["container_count"] = 0

                payload = {
                    "type": "heartbeat",
                    "agent_version": config.AGENT_VERSION,
                    "metrics": metrics,
                }
                await self.ws.send(json.dumps(payload))
            except Exception as e:
                logger.error(f"Error enviando heartbeat: {e}")

            await asyncio.sleep(config.HEARTBEAT_INTERVAL_SECONDS)

    async def _handle_message(self, raw_message: str):
        """Valida y procesa mensajes entrantes enviados por el servidor central."""
        try:
            msg = json.loads(raw_message)
        except Exception:
            return

        msg_type = msg.get("type")

        # 1. Eventos de Terminal Web
        if msg_type == "terminal_open":
            session_id = msg.get("session_id")
            pty_user = msg.get("pty_user", config.PTY_DEFAULT_USER)
            session = PTYSession(
                session_id=session_id,
                pty_user=pty_user,
                on_output=self._send_terminal_output,
            )
            try:
                session.start()
                self.terminal_sessions[session_id] = session
            except Exception as e:
                logger.error(f"No se pudo iniciar la sesión PTY: {e}")
            return

        elif msg_type == "terminal_input":
            session_id = msg.get("session_id")
            session = self.terminal_sessions.get(session_id)
            if session:
                session.write_input(msg.get("data", ""))
            return

        elif msg_type == "terminal_resize":
            session_id = msg.get("session_id")
            session = self.terminal_sessions.get(session_id)
            if session:
                session.resize(msg.get("cols", 80), msg.get("rows", 24))
            return

        elif msg_type == "terminal_close":
            session_id = msg.get("session_id")
            session = self.terminal_sessions.pop(session_id, None)
            if session:
                session.terminate()
            return

        # 2. Solicitudes de Tareas y Operaciones
        request_id = msg.get("request_id")
        is_valid, err_reason = request_validator.validate_envelope(msg)

        if not is_valid:
            logger.warning(f"Solicitud {request_id} rechazada por política local: {err_reason}")
            await self._send_response(request_id, success=False, error=err_reason)
            return

        # Despacho de operación autorizada
        module = msg.get("module")
        operation = msg.get("operation")
        payload = msg.get("payload", {})

        try:
            result = await self._dispatch_operation(module, operation, payload)
            await self._send_response(request_id, success=True, data=result)
        except Exception as e:
            logger.error(f"Fallo al ejecutar operación {module}.{operation}: {e}")
            await self._send_response(request_id, success=False, error=str(e))

    async def _dispatch_operation(self, module: str, operation: str, payload: dict):
        """Ejecuta la operación localmente utilizando los módulos aislados."""
        if module == "docker":
            if operation == "container.list":
                return docker_manager.list_containers(all=payload.get("all", True))
            elif operation == "container.inspect":
                return docker_manager.inspect_container(payload.get("container_id"))
            elif operation.startswith("container."):
                action = operation.split(".", 1)[1]
                docker_manager.execute_container_action(
                    container_id=payload.get("container_id"),
                    action=action,
                    timeout=payload.get("timeout", 10),
                )
                return {"action": action, "status": "executed"}
            elif operation == "container.logs":
                return docker_manager.get_container_logs(
                    container_id=payload.get("container_id"),
                    tail=payload.get("tail", 200),
                    timestamps=payload.get("timestamps", True),
                )
            elif operation == "image.list":
                return docker_manager.list_images()
            elif operation == "network.list":
                return docker_manager.list_networks()
            elif operation == "volume.list":
                return docker_manager.list_volumes()

        elif module == "systemd":
            if operation == "unit.list":
                return systemd_manager.list_units(state_filter=payload.get("state"))
            elif operation == "unit.inspect":
                return systemd_manager.inspect_unit(payload.get("unit"))
            elif operation.startswith("unit."):
                action = operation.split(".", 1)[1]
                if action == "journal":
                    return systemd_manager.get_journal_logs(
                        unit=payload.get("unit"),
                        lines=payload.get("lines", 200),
                    )
                else:
                    systemd_manager.execute_action(unit=payload.get("unit"), action=action)
                    return {"action": action, "unit": payload.get("unit"), "status": "executed"}

        elif module == "system":
            if operation == "info":
                return system_collector.get_static_os_info()
        elif module == "storage":
            if operation == "overview":
                return storage_collector.get_storage_overview()

        raise NotImplementedError(f"Operación no implementada: {module}.{operation}")

    def _send_terminal_output(self, session_id: str, text: str):
        """Callback invocado por la PTY cuando hay nueva salida en consola."""
        if self.ws:
            asyncio.create_task(self.ws.send(json.dumps({
                "type": "terminal_output",
                "session_id": session_id,
                "data": text,
            })))

    async def _send_response(self, request_id: str, success: bool, data: any = None, error: str = None):
        if self.ws:
            res = {
                "type": "response",
                "request_id": request_id,
                "success": success,
                "data": data,
                "error": error,
            }
            await self.ws.send(json.dumps(res))

    def stop(self):
        """Apagado ordenado del agente."""
        logger.info("Deteniendo LinuxOps Agent...")
        self.running = False
        for session in self.terminal_sessions.values():
            session.terminate()
        self.terminal_sessions.clear()


def main():
    daemon = AgentDaemon()

    def _signal_handler(sig, frame):
        daemon.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    asyncio.run(daemon.start())


if __name__ == "__main__":
    main()

