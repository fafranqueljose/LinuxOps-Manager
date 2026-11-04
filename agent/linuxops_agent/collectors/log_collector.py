"""
LinuxOps Agent — Recolector Incremental de Logs (Docker y systemd)
Lee registros de forma no bloqueante, detecta niveles, sanitiza secretos y encola en buffer local.
"""

import datetime
import json
import logging
import re
import subprocess
import time
from typing import Any, Dict, List, Optional
from linuxops_agent.collectors.log_buffer import LogBuffer
from linuxops_agent.docker_manager.manager import docker_manager
from linuxops_agent.security.redactor import sanitize_log_message, sanitize_log_metadata
from linuxops_agent.systemd_manager.manager import systemd_manager

logger = logging.getLogger("linuxops.agent.log_collector")

# Patrones para inferir severidad en líneas de log no estructuradas
LEVEL_PATTERNS = [
    (re.compile(r"(?i)\b(emerg|panic|fatal|critical|crit)\b"), "critical"),
    (re.compile(r"(?i)\b(err|error|failed|failure|exception|traceback)\b"), "error"),
    (re.compile(r"(?i)\b(warn|warning)\b"), "warning"),
    (re.compile(r"(?i)\b(notice)\b"), "notice"),
    (re.compile(r"(?i)\b(debug|trace)\b"), "debug"),
]


def infer_log_level(message: str) -> str:
    for pattern, level in LEVEL_PATTERNS:
        if pattern.search(message):
            return level
    return "info"


class LogCollector:
    def __init__(self, buffer: LogBuffer):
        self.buffer = buffer

    def collect_docker_logs(self, max_lines_per_container: int = 100) -> int:
        """Recolecta logs recientes e incrementales de todos los contenedores Docker locales."""
        if not docker_manager.is_docker_available():
            return 0

        client = docker_manager.get_client()
        if not client:
            return 0

        total_collected = 0
        try:
            containers = client.containers.list(all=False)
        except Exception as e:
            logger.debug(f"No se pudieron listar contenedores para logs: {e}")
            return 0

        for container in containers:
            c_name = container.name
            c_id = container.id[:12]
            checkpoint_key = f"docker_{c_name}"

            # Obtener timestamp del último log procesado
            last_cursor = self.buffer.get_checkpoint("docker", checkpoint_key)
            since_param = None
            if last_cursor:
                try:
                    # Convertir a epoch float o int
                    since_param = int(float(last_cursor)) + 1
                except Exception:
                    since_param = None

            try:
                # Docker SDK container.logs() con timestamps=True
                raw_logs = container.logs(
                    stdout=True,
                    stderr=True,
                    timestamps=True,
                    since=since_param,
                    tail=max_lines_per_container if since_param is None else None,
                )

                if not raw_logs:
                    continue

                lines = raw_logs.decode("utf-8", errors="replace").splitlines()
                batch_records: List[Dict[str, Any]] = []
                latest_ts_epoch = None

                for line in lines:
                    line = line.strip()
                    if not line:
                        continue

                    # Docker prefija cada línea con timestamp RFC3339Nano (ej: 2026-11-04T12:00:00.123456789Z)
                    parts = line.split(" ", 1)
                    if len(parts) == 2 and ("T" in parts[0] and "Z" in parts[0]):
                        ts_str = parts[0]
                        msg_str = parts[1]
                    else:
                        ts_str = datetime.datetime.utcnow().isoformat() + "Z"
                        msg_str = line

                    # Parsear timestamp a epoch para checkpoint
                    try:
                        clean_ts = ts_str.rstrip("Z")
                        if "." in clean_ts:
                            dt = datetime.datetime.fromisoformat(clean_ts[:26])
                        else:
                            dt = datetime.datetime.fromisoformat(clean_ts)
                        epoch_val = dt.timestamp()
                        if latest_ts_epoch is None or epoch_val > latest_ts_epoch:
                            latest_ts_epoch = epoch_val
                    except Exception:
                        pass

                    level = infer_log_level(msg_str)
                    clean_msg = sanitize_log_message(msg_str)

                    batch_records.append({
                        "timestamp": ts_str,
                        "source": "docker",
                        "service": c_name,
                        "level": level,
                        "stream": "stdout",
                        "message": clean_msg,
                        "metadata": {
                            "container_id": c_id,
                            "image": container.image.tags[0] if container.image.tags else "unknown",
                        },
                    })

                if batch_records:
                    self.buffer.enqueue_records(batch_records)
                    total_collected += len(batch_records)

                if latest_ts_epoch:
                    self.buffer.set_checkpoint("docker", checkpoint_key, str(latest_ts_epoch))

            except Exception as e:
                logger.debug(f"Error recolectando logs del contenedor {c_name}: {e}")

        return total_collected

    def collect_systemd_logs(self, monitored_units: Optional[List[str]] = None, max_lines_per_unit: int = 50) -> int:
        """
        Recolecta registros de unidades de systemd utilizando journalctl --output=json.
        No requiere privilegios de root (utiliza sudoers preconfigurado para journalctl).
        """
        total_collected = 0

        # Si no se especifican unidades, inspeccionar los principales servicios del sistema
        if not monitored_units:
            monitored_units = [
                "ssh.service",
                "sshd.service",
                "docker.service",
                "nginx.service",
                "systemd-journald.service",
                "cron.service",
                "crond.service",
            ]

        for unit in monitored_units:
            checkpoint_key = f"systemd_{unit}"
            last_cursor = self.buffer.get_checkpoint("systemd", checkpoint_key)

            cmd = ["journalctl", "-u", unit, "--output=json", "--no-pager"]
            if last_cursor:
                cmd.extend(["--since", f"@{last_cursor}"])
            else:
                cmd.extend(["-n", str(max_lines_per_unit)])

            # Intentar ejecutar directamente o con sudo si no es root
            exec_cmd = cmd
            if hasattr(subprocess, "run"):
                try:
                    p = subprocess.run(
                        exec_cmd,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                        timeout=5.0,
                        shell=False,
                    )
                    if p.returncode != 0 and "sudo" not in exec_cmd:
                        exec_cmd = ["sudo", "-n"] + cmd
                        p = subprocess.run(
                            exec_cmd,
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE,
                            text=True,
                            timeout=5.0,
                            shell=False,
                        )
                except Exception as e:
                    logger.debug(f"No se pudo ejecutar journalctl para {unit}: {e}")
                    continue

                if p.returncode != 0 or not p.stdout:
                    continue

                batch_records: List[Dict[str, Any]] = []
                latest_epoch = None

                for line in p.stdout.splitlines():
                    line = line.strip()
                    if not line or not line.startswith("{"):
                        continue
                    try:
                        entry = json.loads(line)
                    except Exception:
                        continue

                    raw_msg = entry.get("MESSAGE", "")
                    if not raw_msg or not isinstance(raw_msg, str):
                        continue

                    # Timestamp en microsegundos (__REALTIME_TIMESTAMP)
                    rt_ts = entry.get("__REALTIME_TIMESTAMP")
                    if rt_ts:
                        epoch_val = float(rt_ts) / 1000000.0
                        dt = datetime.datetime.fromtimestamp(epoch_val, tz=datetime.timezone.utc)
                        ts_str = dt.isoformat()
                        if latest_epoch is None or epoch_val > latest_epoch:
                            latest_epoch = epoch_val
                    else:
                        ts_str = datetime.datetime.utcnow().isoformat() + "Z"

                    # Mapear prioridad numérica de syslog (0=emerg, 3=err, 4=warning, 6=info, 7=debug)
                    prio = str(entry.get("PRIORITY", "6"))
                    if prio in ("0", "1", "2"):
                        lvl = "critical"
                    elif prio == "3":
                        lvl = "error"
                    elif prio == "4":
                        lvl = "warning"
                    elif prio == "5":
                        lvl = "notice"
                    elif prio == "7":
                        lvl = "debug"
                    else:
                        lvl = infer_log_level(raw_msg)

                    clean_msg = sanitize_log_message(raw_msg)
                    meta = {
                        "pid": entry.get("_PID"),
                        "exe": entry.get("_EXE"),
                        "unit": unit,
                    }

                    batch_records.append({
                        "timestamp": ts_str,
                        "source": "systemd",
                        "service": unit,
                        "level": lvl,
                        "stream": "journal",
                        "message": clean_msg,
                        "metadata": sanitize_log_metadata(meta),
                    })

                if batch_records:
                    self.buffer.enqueue_records(batch_records)
                    total_collected += len(batch_records)

                if latest_epoch:
                    # Guardar checkpoint sumando 1 segundo para evitar relectura
                    self.buffer.set_checkpoint("systemd", checkpoint_key, str(int(latest_epoch) + 1))

        return total_collected

