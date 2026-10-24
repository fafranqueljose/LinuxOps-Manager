"""
LinuxOps Agent — Configuración y Parámetros Operativos
"""

import os
from dataclasses import dataclass


@dataclass
class AgentConfig:
    SERVER_URL: str = os.getenv("LINUXOPS_SERVER_URL", "http://localhost:8000")
    SERVER_ID: str = os.getenv("LINUXOPS_SERVER_ID", "")
    DATA_DIR: str = os.getenv("LINUXOPS_DATA_DIR", "/var/lib/linuxops-agent")
    CONFIG_DIR: str = os.getenv("LINUXOPS_CONFIG_DIR", "/etc/linuxops-agent")
    
    # Rutas de Certificados mTLS
    CA_CERT_PATH: str = os.getenv("LINUXOPS_CA_CERT", "/etc/linuxops-agent/certs/ca.crt")
    AGENT_CERT_PATH: str = os.getenv("LINUXOPS_AGENT_CERT", "/etc/linuxops-agent/certs/agent.crt")
    AGENT_KEY_PATH: str = os.getenv("LINUXOPS_AGENT_KEY", "/etc/linuxops-agent/certs/agent.key")
    
    # Intervalos y Timeouts
    HEARTBEAT_INTERVAL_SECONDS: int = int(os.getenv("LINUXOPS_HEARTBEAT_INTERVAL", "15"))
    RECONNECT_DELAY_SECONDS: int = int(os.getenv("LINUXOPS_RECONNECT_DELAY", "5"))
    REQUEST_TTL_SECONDS: int = 45
    
    # Usuario sin privilegios para sesiones PTY de terminal
    PTY_DEFAULT_USER: str = os.getenv("LINUXOPS_PTY_USER", "linuxops-pty")
    AGENT_VERSION: str = "1.0.0"

    @property
    def ws_url(self) -> str:
        base = self.SERVER_URL.replace("http://", "ws://").replace("https://", "wss://")
        return f"{base}/api/v1/ws/agent/{self.SERVER_ID}"


config = AgentConfig()

