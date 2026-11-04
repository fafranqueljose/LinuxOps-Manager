"""
LinuxOps Manager — Servicio de Integración con Grafana Loki
Maneja la ingestión interna de logs, compilación segura de LogQL y consultas range.
"""

import datetime
import json
import logging
import time
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID
import httpx
from app.core.config import settings
from app.core.redactor import sanitize_log_message, sanitize_log_metadata
from app.schemas.logs import LogEventIn, LogHealthStatus, LogRecordOut

logger = logging.getLogger("linuxops.services.loki")


class LokiService:
    def __init__(self):
        self.base_url = settings.LOKI_URL.rstrip("/")
        self.tenant_id = settings.LOKI_TENANT_ID
        self.timeout = settings.LOKI_TIMEOUT_SECONDS

    def _get_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.tenant_id:
            headers["X-Scope-OrgID"] = self.tenant_id
        return headers

    async def check_health(self) -> LogHealthStatus:
        """Verifica si el servicio interno de Loki está listo para aceptar consultas y logs."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.get(f"{self.base_url}/ready")
                if res.status_code == 200:
                    return LogHealthStatus(
                        status="ready",
                        loki_ready=True,
                        loki_url=self.base_url,
                        tenant_id=self.tenant_id,
                        details="Loki está operativo y en estado 'ready'.",
                    )
                return LogHealthStatus(
                    status="unhealthy",
                    loki_ready=False,
                    loki_url=self.base_url,
                    tenant_id=self.tenant_id,
                    details=f"Loki respondió con código HTTP {res.status_code}: {res.text[:100]}",
                )
        except Exception as e:
            logger.warning(f"Error comprobando estado de Loki ({self.base_url}): {e}")
            return LogHealthStatus(
                status="unavailable",
                loki_ready=False,
                loki_url=self.base_url,
                tenant_id=self.tenant_id,
                details=f"No se pudo contactar a Loki: {str(e)}",
            )

    async def push_logs(
        self,
        server_id: UUID,
        server_name: str,
        records: List[LogEventIn],
    ) -> int:
        """
        Agrupa los registros por etiquetas de flujo (stream labels) y los empuja a Loki.
        Sanitiza secretos y garantiza timestamps estrictamente ascendentes.
        """
        if not records:
            return 0

        streams_map: Dict[Tuple[str, str, str, str, str, str], List[Tuple[int, str]]] = {}

        for rec in records:
            clean_message = sanitize_log_message(rec.message)
            clean_meta = sanitize_log_metadata(rec.metadata or {})

            source = str(rec.source or "unknown").strip().lower()
            service = str(rec.service or "generic").strip()
            level = str(rec.level or "info").strip().lower()
            stream = str(rec.stream or "stdout").strip().lower()
            s_name = server_name.strip() if server_name else str(server_id)
            s_id = str(server_id).lower()

            key = (s_id, s_name, source, service, level, stream)
            if key not in streams_map:
                streams_map[key] = []

            ts = rec.timestamp
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=datetime.timezone.utc)
            nanos_int = int(ts.timestamp() * 1e9)

            if clean_meta:
                payload_entry = {
                    "msg": clean_message,
                    "meta": clean_meta,
                }
                log_line = json.dumps(payload_entry, ensure_ascii=False)
            else:
                log_line = clean_message

            streams_map[key].append((nanos_int, log_line))

        loki_streams = []
        for (sid, sname, src, svc, lvl, strm), values in streams_map.items():
            # Ordenar valores por timestamp ascendente y asegurar monotonía estricta
            values.sort(key=lambda x: x[0])
            unique_values = []
            last_ts = 0
            for ts_int, line in values:
                if ts_int <= last_ts:
                    ts_int = last_ts + 1
                last_ts = ts_int
                unique_values.append([str(ts_int), line])

            loki_streams.append({
                "stream": {
                    "server_id": sid,
                    "server_name": sname,
                    "source": src,
                    "service": svc,
                    "level": lvl,
                    "stream": strm,
                },
                "values": unique_values,
            })

        push_payload = {"streams": loki_streams}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            res = await client.post(
                f"{self.base_url}/loki/api/v1/push",
                headers=self._get_headers(),
                json=push_payload,
            )
            if res.status_code not in (200, 204):
                err_msg = f"Error al enviar logs a Loki ({res.status_code}): {res.text[:200]}"
                logger.error(err_msg)
                raise RuntimeError(err_msg)

        logger.info(f"Loki push exitoso: {len(records)} registros guardados para servidor {server_id} ({server_name})")
        return len(records)

    async def query_range(
        self,
        server_ids: Optional[List[UUID]] = None,
        source: Optional[str] = None,
        service: Optional[str] = None,
        level: Optional[str] = None,
        search: Optional[str] = None,
        start_time: Optional[datetime.datetime] = None,
        end_time: Optional[datetime.datetime] = None,
        limit: int = 200,
        direction: str = "BACKWARD",
    ) -> Tuple[List[LogRecordOut], float, str]:
        """
        Ejecuta una consulta LogQL estructurada contra el endpoint /loki/api/v1/query_range.
        """
        start_t = time.time()
        selectors: List[str] = []

        if server_ids:
            if len(server_ids) == 1:
                clean_id = str(server_ids[0]).lower().replace('"', "")
                selectors.append(f'server_id="{clean_id}"')
            else:
                regex_ids = "|".join(str(s).lower().replace('"', "") for s in server_ids)
                selectors.append(f'server_id=~"{regex_ids}"')

        if source and source.strip() and source.strip().lower() != "all":
            clean_src = source.strip().lower().replace('"', "")
            selectors.append(f'source="{clean_src}"')

        if service and service.strip() and service.strip().lower() != "all":
            clean_svc = service.strip().replace('"', "")
            selectors.append(f'service="{clean_svc}"')

        if level and level.strip() and level.strip().lower() != "all":
            clean_lvl = level.strip().lower().replace('"', "")
            selectors.append(f'level="{clean_lvl}"')

        if selectors:
            stream_selector = "{" + ", ".join(selectors) + "}"
        else:
            stream_selector = '{server_id=~".+"}'

        logql = stream_selector
        if search and search.strip():
            clean_search = search.strip().replace('\\', '\\\\').replace('"', '\\"')
            logql += f' |= "{clean_search}"'

        params: Dict[str, Any] = {
            "query": logql,
            "limit": min(limit, 2000),
            "direction": "BACKWARD" if direction.upper() != "FORWARD" else "FORWARD",
        }

        if start_time:
            if start_time.tzinfo is None:
                start_time = start_time.replace(tzinfo=datetime.timezone.utc)
            params["start"] = str(int(start_time.timestamp() * 1e9))

        if end_time:
            if end_time.tzinfo is None:
                end_time = end_time.replace(tzinfo=datetime.timezone.utc)
            params["end"] = str(int(end_time.timestamp() * 1e9))

        records: List[LogRecordOut] = []
        loki_status = "ok"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.get(
                    f"{self.base_url}/loki/api/v1/query_range",
                    headers=self._get_headers(),
                    params=params,
                )

                if res.status_code != 200:
                    loki_status = f"error_{res.status_code}"
                    logger.warning(f"Loki query_range error {res.status_code}: {res.text[:200]}")
                    return [], (time.time() - start_t) * 1000, loki_status

                data = res.json()
                results = data.get("data", {}).get("result", [])

                for item in results:
                    stream_labels = item.get("stream", {})
                    sid = stream_labels.get("server_id")
                    sname = stream_labels.get("server_name")
                    src = stream_labels.get("source", "unknown")
                    svc = stream_labels.get("service", "generic")
                    lvl = stream_labels.get("level", "info")
                    strm = stream_labels.get("stream", "stdout")

                    parsed_sid = UUID(sid) if sid else UUID("00000000-0000-0000-0000-000000000000")

                    values = item.get("values", [])
                    for val in values:
                        ts_nanos = int(val[0])
                        raw_line = val[1]
                        dt = datetime.datetime.fromtimestamp(ts_nanos / 1e9, tz=datetime.timezone.utc)

                        meta_dict = None
                        msg_text = raw_line
                        if raw_line.startswith('{"msg":'):
                            try:
                                parsed_json = json.loads(raw_line)
                                msg_text = parsed_json.get("msg", raw_line)
                                meta_dict = parsed_json.get("meta", None)
                            except Exception:
                                pass

                        records.append(
                            LogRecordOut(
                                id=f"{sid}_{ts_nanos}_{abs(hash(msg_text)) & 0xffffffff}",
                                timestamp=dt,
                                server_id=parsed_sid,
                                server_name=sname,
                                source=src,
                                service=svc,
                                level=lvl,
                                message=msg_text,
                                stream=strm,
                                metadata=meta_dict,
                            )
                        )

        except Exception as e:
            logger.error(f"Error consultando Loki: {e}")
            loki_status = "unavailable"

        records.sort(
            key=lambda r: r.timestamp,
            reverse=(params["direction"] == "BACKWARD"),
        )

        duration_ms = (time.time() - start_t) * 1000
        logger.info(f"Loki query ({logql}): {len(records)} registros retornados en {duration_ms:.1f}ms")
        return records[:limit], duration_ms, loki_status

    async def get_label_values(self, label_name: str) -> List[str]:
        """Obtiene valores únicos disponibles para una etiqueta (ej. service, source)."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.get(
                    f"{self.base_url}/loki/api/v1/label/{label_name}/values",
                    headers=self._get_headers(),
                )
                if res.status_code == 200:
                    data = res.json()
                    return data.get("data", [])
        except Exception as e:
            logger.debug(f"Error obteniendo valores de label {label_name}: {e}")
        return []


loki_service = LokiService()
