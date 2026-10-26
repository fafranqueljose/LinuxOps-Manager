"""
LinuxOps Agent — Gestor de Docker Engine
Interactúa directamente con la API de Docker Engine mediante docker-py.
Aplica ofuscación estricta de variables de entorno sensibles.
"""

import logging
from typing import Any, Dict, List, Optional
import docker

logger = logging.getLogger("linuxops.agent.docker")

SENSITIVE_ENV_PATTERNS = {
    "PASSWORD", "SECRET", "TOKEN", "KEY", "PRIVATE", "CREDENTIAL",
    "DSN", "AUTH", "APIKEY", "JWT", "CERT", "SIGNATURE"
}


def sanitize_env_list(env_vars: List[str]) -> List[str]:
    """Ofusca los valores de las variables de entorno que contengan claves sensibles."""
    safe_list = []
    for item in env_vars:
        if "=" in item:
            key, val = item.split("=", 1)
            key_upper = key.upper()
            if any(p in key_upper for p in SENSITIVE_ENV_PATTERNS):
                safe_list.append(f"{key}=[REDACTED]")
            else:
                safe_list.append(item)
        else:
            safe_list.append(item)
    return safe_list


class DockerManager:
    def __init__(self):
        self._client: Optional[docker.DockerClient] = None

    def _get_client(self) -> docker.DockerClient:
        if self._client is None:
            self._client = docker.from_env(timeout=15)
        return self._client

    def is_docker_available(self) -> bool:
        try:
            client = self._get_client()
            client.ping()
            return True
        except Exception:
            return False

    def list_containers(self, all: bool = True) -> List[Dict[str, Any]]:
        client = self._get_client()
        containers = client.containers.list(all=all)
        result = []

        for c in containers:
            attrs = c.attrs
            labels = attrs.get("Config", {}).get("Labels", {}) or {}
            
            # Detectar si pertenece a un proyecto Docker Compose
            compose_project = labels.get("com.docker.compose.project")
            compose_service = labels.get("com.docker.compose.service")

            # Formatear puertos expuestos
            raw_ports = attrs.get("NetworkSettings", {}).get("Ports", {}) or {}
            ports_list = []
            for container_p, bindings in raw_ports.items():
                p_parts = container_p.split("/")
                p_num = int(p_parts[0]) if p_parts[0].isdigit() else 0
                p_type = p_parts[1] if len(p_parts) > 1 else "tcp"

                if bindings:
                    for b in bindings:
                        ports_list.append({
                            "ip": b.get("HostIp"),
                            "private_port": p_num,
                            "public_port": int(b.get("HostPort", 0)),
                            "type": p_type,
                        })
                else:
                    ports_list.append({
                        "ip": None,
                        "private_port": p_num,
                        "public_port": None,
                        "type": p_type,
                    })

            # Obtener image_id de forma segura sin disparar excepción 404 si la imagen fue borrada
            image_id = attrs.get("Image", "")
            if not image_id:
                try:
                    image_id = c.image.id if c.image else ""
                except Exception:
                    image_id = ""

            raw_created = attrs.get("Created", 0)
            created_ts = 0
            if isinstance(raw_created, (int, float)):
                created_ts = int(raw_created)
            elif isinstance(raw_created, str):
                if raw_created.isdigit():
                    created_ts = int(raw_created[:10])
                else:
                    try:
                        import datetime
                        dt = datetime.datetime.fromisoformat(raw_created.replace("Z", "+00:00"))
                        created_ts = int(dt.timestamp())
                    except Exception:
                        created_ts = 0

            result.append({
                "id": c.id,
                "names": [attrs.get("Name", "").lstrip("/")],
                "image": attrs.get("Config", {}).get("Image", "") or image_id[:12] or "unknown",
                "image_id": image_id,
                "state": c.status,
                "status": attrs.get("State", {}).get("Status", c.status),
                "created": created_ts,
                "ports": ports_list,
                "compose_project": compose_project,
                "compose_service": compose_service,
            })
        return result

    def inspect_container(self, container_id: str) -> Dict[str, Any]:
        client = self._get_client()
        c = client.containers.get(container_id)
        attrs = c.attrs

        raw_env = attrs.get("Config", {}).get("Env", []) or []
        safe_env = sanitize_env_list(raw_env)

        return {
            "id": c.id,
            "name": attrs.get("Name", "").lstrip("/"),
            "image": attrs.get("Config", {}).get("Image", ""),
            "created_at": attrs.get("Created", ""),
            "state": attrs.get("State", {}),
            "restart_policy": attrs.get("HostConfig", {}).get("RestartPolicy", {}),
            "network_settings": attrs.get("NetworkSettings", {}),
            "mounts": attrs.get("Mounts", []),
            "env_safe": safe_env,
        }

    def execute_container_action(self, container_id: str, action: str, timeout: int = 10) -> None:
        client = self._get_client()
        c = client.containers.get(container_id)

        if action == "start":
            c.start()
        elif action == "stop":
            c.stop(timeout=timeout)
        elif action == "restart":
            c.restart(timeout=timeout)
        elif action == "pause":
            c.pause()
        elif action == "unpause":
            c.unpause()
        else:
            raise ValueError(f"Acción no soportada: {action}")

    def get_container_logs(self, container_id: str, tail: int = 200, timestamps: bool = True) -> str:
        client = self._get_client()
        c = client.containers.get(container_id)
        logs_bytes = c.logs(tail=tail, timestamps=timestamps)
        return logs_bytes.decode("utf-8", errors="replace")

    def list_images(self) -> List[Dict[str, Any]]:
        client = self._get_client()
        images = client.images.list()
        containers = client.containers.list(all=True)

        used_image_ids = set()
        for c in containers:
            img_id = c.attrs.get("Image")
            if img_id:
                used_image_ids.add(img_id)

        result = []
        for img in images:
            result.append({
                "id": img.id,
                "tags": img.tags or ["<none>:<none>"],
                "size_bytes": img.attrs.get("Size", 0),
                "created": img.attrs.get("Created", 0),
                "in_use": img.id in used_image_ids,
            })
        return result

    def list_networks(self) -> List[Dict[str, Any]]:
        client = self._get_client()
        networks = client.networks.list()
        result = []
        for net in networks:
            attrs = net.attrs
            result.append({
                "id": net.id,
                "name": net.name,
                "driver": attrs.get("Driver", ""),
                "scope": attrs.get("Scope", ""),
                "internal": attrs.get("Internal", False),
                "containers": attrs.get("Containers", {}),
            })
        return result

    def list_volumes(self) -> List[Dict[str, Any]]:
        client = self._get_client()
        volumes = client.volumes.list()
        containers = client.containers.list(all=True)

        used_volumes: Dict[str, List[str]] = {}
        for c in containers:
            c_name = c.attrs.get("Name", "").lstrip("/")
            for m in c.attrs.get("Mounts", []):
                if m.get("Type") == "volume" and m.get("Name"):
                    v_name = m.get("Name")
                    used_volumes.setdefault(v_name, []).append(c_name)

        result = []
        for v in volumes:
            name = v.name
            attached = used_volumes.get(name, [])
            result.append({
                "name": name,
                "driver": v.attrs.get("Driver", "local"),
                "mountpoint": v.attrs.get("Mountpoint", ""),
                "in_use": len(attached) > 0,
                "containers": attached,
            })
        return result


docker_manager = DockerManager()

