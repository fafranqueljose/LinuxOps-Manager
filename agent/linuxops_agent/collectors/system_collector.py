"""
LinuxOps Agent — Recolector de Métricas de Sistema y Recursos
Utiliza psutil y archivos de procfs para recopilar métricas sin bloquear.
"""

import os
import platform
import subprocess
import time
from typing import Any, Dict
import psutil


class SystemCollector:
    @staticmethod
    def get_static_os_info() -> Dict[str, Any]:
        """Obtiene información estática del sistema operativo y entorno."""
        os_name = platform.system()
        os_version = platform.release()
        
        # En sistemas Linux, leer /etc/os-release
        if os.path.exists("/etc/os-release"):
            try:
                with open("/etc/os-release", "r") as f:
                    for line in f:
                        if line.startswith("PRETTY_NAME="):
                            os_name = line.split("=", 1)[1].strip().strip('"')
            except Exception:
                pass

        return {
            "hostname": platform.node(),
            "os_name": os_name,
            "os_version": platform.release(),
            "kernel": platform.uname().release,
            "architecture": platform.machine(),
            "python_version": platform.python_version(),
        }

    @staticmethod
    def get_live_metrics() -> Dict[str, Any]:
        """Obtiene métricas en tiempo real de CPU, RAM, almacenamiento y carga."""
        # 1. CPU y Uptime
        cpu_pct = psutil.cpu_percent(interval=None)
        cpu_count = psutil.cpu_count(logical=True) or 1
        boot_time = psutil.boot_time()
        uptime_seconds = int(time.time() - boot_time)

        # 2. Memoria RAM
        mem = psutil.virtual_memory()
        
        # 3. Disco principal
        disk = psutil.disk_usage("/")

        # 4. Carga del sistema
        load_1, load_5, load_15 = 0.0, 0.0, 0.0
        if hasattr(os, "getloadavg"):
            try:
                load_1, load_5, load_15 = os.getloadavg()
            except Exception:
                pass

        # 5. Contenedores y servicios fallidos
        failed_services = SystemCollector._count_failed_services()

        return {
            "uptime_seconds": uptime_seconds,
            "cpu_count": cpu_count,
            "cpu_percent": round(cpu_pct, 1),
            "total_ram_bytes": mem.total,
            "free_ram_bytes": mem.available,
            "ram_percent": round(mem.percent, 1),
            "total_disk_bytes": disk.total,
            "free_disk_bytes": disk.free,
            "disk_percent": round(disk.percent, 1),
            "load_1": round(load_1, 2),
            "load_5": round(load_5, 2),
            "load_15": round(load_15, 2),
            "failed_services_count": failed_services,
        }

    @staticmethod
    def _count_failed_services() -> int:
        """Cuenta unidades systemd en estado fallido."""
        try:
            res = subprocess.run(
                ["systemctl", "list-units", "--state=failed", "--no-legend", "--no-pager"],
                capture_output=True,
                text=True,
                timeout=3,
                shell=False,
            )
            if res.returncode == 0:
                lines = [line.strip() for line in res.stdout.splitlines() if line.strip()]
                return len(lines)
        except Exception:
            pass
        return 0


system_collector = SystemCollector()

