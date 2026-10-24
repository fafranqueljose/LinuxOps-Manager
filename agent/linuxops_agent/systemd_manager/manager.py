"""
LinuxOps Agent — Gestor Seguro de Unidades Linux (systemd)
Ejecuta únicamente operaciones autorizadas mediante subprocess sin shell=True
y con validación estricta de expresiones regulares.
"""

import logging
import re
import subprocess
from typing import Any, Dict, List, Optional

logger = logging.getLogger("linuxops.agent.systemd")

UNIT_REGEX = re.compile(r"^[a-zA-Z0-9@_.-]+\.service$")
ALLOWED_ACTIONS = {"start", "stop", "restart", "reload"}


class SystemdManager:
    @staticmethod
    def validate_unit_name(unit: str) -> None:
        if not unit or not UNIT_REGEX.match(unit):
            raise ValueError(f"Nombre de unidad systemd inválido: '{unit}'")

    def list_units(self, state_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Lista unidades de tipo service usando 'systemctl list-units --type=service'.
        """
        cmd = ["systemctl", "list-units", "--type=service", "--all", "--no-legend", "--no-pager"]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=10, shell=False)

        if res.returncode != 0:
            raise RuntimeError(f"Error ejecutando systemctl: {res.stderr}")

        units = []
        for line in res.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            parts = line.split(maxsplit=4)
            if len(parts) >= 4:
                unit_name = parts[0]
                if not unit_name.endswith(".service"):
                    continue

                load_state = parts[1]
                active_state = parts[2]
                sub_state = parts[3]
                desc = parts[4] if len(parts) > 4 else ""

                if state_filter and active_state != state_filter:
                    continue

                units.append({
                    "unit": unit_name,
                    "load_state": load_state,
                    "active_state": active_state,
                    "sub_state": sub_state,
                    "description": desc,
                })
        return units

    def inspect_unit(self, unit: str) -> Dict[str, Any]:
        """Obtiene propiedades detalladas de la unidad mediante 'systemctl show'."""
        self.validate_unit_name(unit)

        cmd = [
            "systemctl", "show", unit,
            "--property=Id,Description,LoadState,ActiveState,SubState,UnitFileState,MainPID,ExecStart"
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=5, shell=False)
        if res.returncode != 0:
            raise RuntimeError(f"Error al inspeccionar unidad {unit}: {res.stderr}")

        props = {}
        for line in res.stdout.splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                props[k.strip()] = v.strip()

        return {
            "unit": props.get("Id", unit),
            "description": props.get("Description", ""),
            "load_state": props.get("LoadState", "unknown"),
            "active_state": props.get("ActiveState", "unknown"),
            "sub_state": props.get("SubState", "unknown"),
            "unit_file_state": props.get("UnitFileState", "unknown"),
            "main_pid": int(props.get("MainPID", 0)) if props.get("MainPID", "").isdigit() else None,
            "exec_start": props.get("ExecStart", ""),
        }

    def execute_action(self, unit: str, action: str) -> None:
        """Ejecuta una acción permitida sobre el servicio."""
        self.validate_unit_name(unit)
        if action not in ALLOWED_ACTIONS:
            raise ValueError(f"Acción sobre servicio no permitida: '{action}'")

        cmd = ["sudo", "/usr/bin/systemctl", action, unit]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=15, shell=False)

        if res.returncode != 0:
            raise RuntimeError(f"Fallo al ejecutar '{action}' en {unit}: {res.stderr.strip() or res.stdout.strip()}")

    def get_journal_logs(self, unit: str, lines: int = 200) -> str:
        """Obtiene las últimas líneas del registro del servicio mediante journalctl."""
        self.validate_unit_name(unit)
        lines = max(10, min(lines, 2000))

        cmd = ["journalctl", "-u", unit, "-n", str(lines), "--no-pager"]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=10, shell=False)

        if res.returncode != 0:
            raise RuntimeError(f"Error al consultar logs de {unit}: {res.stderr}")

        return res.stdout


systemd_manager = SystemdManager()

