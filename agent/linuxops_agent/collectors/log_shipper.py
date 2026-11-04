"""
LinuxOps Agent — Shipper Confiable de Logs hacia Backend Central (HTTPS + mTLS)
Consume registros del buffer local persistente y los envía en lotes al endpoint /api/v1/logs/ingest
con reintentos y retroceso exponencial ante contingencias de red.
"""

import asyncio
import datetime
import logging
import os
import random
import time
import uuid
from typing import Optional
import requests
from linuxops_agent.collectors.log_buffer import LogBuffer
from linuxops_agent.config import config

logger = logging.getLogger("linuxops.agent.log_shipper")


class LogShipper:
    def __init__(self, buffer: LogBuffer):
        self.buffer = buffer
        self.running = False
        self.ingest_url = f"{config.SERVER_URL.rstrip('/')}/api/v1/logs/ingest"
        self._backoff_seconds = 2.0
        self._max_backoff = 60.0

    def _prepare_tls_params(self):
        """Prepara parámetros de cliente mTLS y CA para la sesión requests."""
        cert_param = None
        if os.path.exists(config.AGENT_CERT_PATH) and os.path.exists(config.AGENT_KEY_PATH):
            cert_param = (config.AGENT_CERT_PATH, config.AGENT_KEY_PATH)

        verify_param = True
        if config.INSECURE:
            verify_param = False
        elif os.path.exists(config.CA_CERT_PATH):
            verify_param = config.CA_CERT_PATH

        return cert_param, verify_param

    def ship_pending_batch(self, batch_size: int = 100) -> int:
        """
        Envía un lote de registros pendientes. Retorna la cantidad de registros transmitidos y confirmados.
        Ejecución síncrona pensada para invocarse en un hilo executor desde asyncio.
        """
        records = self.buffer.fetch_batch(limit=batch_size)
        if not records:
            return 0

        record_ids = [r["id"] for r in records]
        # Remover 'id' antes de enviar el payload al backend
        payload_records = []
        for r in records:
            clean_rec = dict(r)
            clean_rec.pop("id", None)
            payload_records.append(clean_rec)

        batch_id = str(uuid.uuid4())
        payload = {
            "server_id": config.SERVER_ID,
            "batch_id": batch_id,
            "sent_at": datetime.datetime.utcnow().isoformat() + "Z",
            "records": payload_records,
        }

        cert_param, verify_param = self._prepare_tls_params()
        headers = {
            "Content-Type": "application/json",
            "User-Agent": f"LinuxOpsAgent/{config.AGENT_VERSION}",
        }

        try:
            res = requests.post(
                self.ingest_url,
                json=payload,
                headers=headers,
                cert=cert_param,
                verify=verify_param,
                timeout=12.0,
            )

            if res.status_code in (200, 202):
                # Éxito: confirmar y purgar registros del buffer local
                self.buffer.ack_batch(record_ids)
                self._backoff_seconds = 2.0  # Resetear backoff
                return len(payload_records)
            else:
                logger.warning(f"Backend rechazó lote de logs {batch_id}: HTTP {res.status_code} - {res.text[:100]}")
                return -1

        except Exception as e:
            logger.debug(f"Error transmitiendo lote de logs a {self.ingest_url}: {e}")
            return -1

    async def run_loop(self, flush_interval: int = 5, batch_size: int = 100):
        """Bucle asíncrono continuo de transmisión."""
        self.running = True
        logger.info(f"Log shipper iniciado hacia {self.ingest_url}")

        while self.running:
            try:
                # Ejecutar el envío en un hilo separado para no bloquear el bucle de eventos asyncio
                count = await asyncio.to_thread(self.ship_pending_batch, batch_size)

                if count > 0:
                    # Si había datos y se enviaron con éxito, verificar si aún queda cola
                    queue_size = self.buffer.get_queue_size()
                    if queue_size > 0:
                        await asyncio.sleep(0.5)
                        continue
                elif count == -1:
                    # Hubo error en la transmisión, aplicar retroceso con jitter
                    jitter = random.uniform(0.8, 1.2)
                    sleep_time = min(self._backoff_seconds * jitter, self._max_backoff)
                    self._backoff_seconds = min(self._backoff_seconds * 1.5, self._max_backoff)
                    await asyncio.sleep(sleep_time)
                    continue

            except Exception as e:
                logger.error(f"Error en bucle del log shipper: {e}")

            await asyncio.sleep(flush_interval)

    def stop(self):
        self.running = False

