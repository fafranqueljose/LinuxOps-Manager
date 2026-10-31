"""
Pruebas del Servicio de Configuración y Enlaces de Agente
Verifica:
- Prioridad de DNS y puerto en SettingsService.
- Generación correcta del comando curl de instalación.
- Inclusión del flag --insecure cuando agent_insecure_tls está habilitado.
- Esquemas Pydantic para SystemSettingOut, SystemSettingsBatchUpdate, y AgentConnectionPreviewOut.
"""

import pytest
from app.models.alert import SystemSetting
from app.schemas.alert import (
    AgentConnectionPreviewOut,
    SystemSettingOut,
    SystemSettingsBatchUpdate,
    SystemSettingUpdate,
)
from app.services.settings_service import SettingsService
from app.tests.conftest import TestingSessionLocal


@pytest.mark.asyncio
async def test_effective_agent_connection_custom_dns_and_port():
    async with TestingSessionLocal() as session:
        # 1. Configurar DNS y Puerto personalizado (ej: proxy inverso externo)
        session.add(SystemSetting(key="server_dns", value="lnxops.crcltd.com.do", is_read_only=False))
        session.add(SystemSetting(key="server_port", value=8443, is_read_only=False))
        session.add(SystemSetting(key="server_protocol", value="https", is_read_only=False))
        session.add(SystemSetting(key="agent_insecure_tls", value=True, is_read_only=False))
        await session.commit()

        conn = await SettingsService.get_effective_agent_connection(session)

        # Verificar URL base con puerto no estándar
        assert conn["base_url"] == "https://lnxops.crcltd.com.do:8443"
        assert conn["dns"] == "lnxops.crcltd.com.do"
        assert conn["port"] == 8443
        assert conn["protocol"] == "https"
        assert conn["insecure"] is True

        # Verificar que el comando incluya el flag --insecure y -k
        assert "--insecure" in conn["sample_install_command"]
        assert " -k " in conn["sample_install_command"]
        assert "https://lnxops.crcltd.com.do:8443" in conn["sample_install_command"]
        assert conn["download_url"] == "https://lnxops.crcltd.com.do:8443/install-agent.sh"


@pytest.mark.asyncio
async def test_effective_agent_connection_standard_https_port():
    async with TestingSessionLocal() as session:
        # Puerto 443 estándar no debe añadir ':443' en la URL base limpia
        session.add(SystemSetting(key="server_dns", value="ops.example.com", is_read_only=False))
        session.add(SystemSetting(key="server_port", value=443, is_read_only=False))
        session.add(SystemSetting(key="server_protocol", value="https", is_read_only=False))
        session.add(SystemSetting(key="agent_insecure_tls", value=False, is_read_only=False))
        await session.commit()

        conn = await SettingsService.get_effective_agent_connection(session)

        assert conn["base_url"] == "https://ops.example.com"
        assert ":443" not in conn["base_url"]
        assert "--insecure" not in conn["sample_install_command"]
        assert " -k " not in conn["sample_install_command"]


def test_system_settings_schemas():
    batch = SystemSettingsBatchUpdate(
        settings={
            "server_dns": "lnxops.crcltd.com.do",
            "server_port": 443,
            "agent_heartbeat_timeout_seconds": 60,
        }
    )
    assert batch.settings["server_dns"] == "lnxops.crcltd.com.do"
    assert batch.settings["server_port"] == 443

    preview = AgentConnectionPreviewOut(
        base_url="https://lnxops.crcltd.com.do",
        dns="lnxops.crcltd.com.do",
        port=443,
        protocol="https",
        insecure=False,
        sample_install_command="curl -sSL https://lnxops.crcltd.com.do/install-agent.sh | sudo bash -s --",
        download_url="https://lnxops.crcltd.com.do/install-agent.sh",
    )
    assert preview.dns == "lnxops.crcltd.com.do"
    assert preview.protocol == "https"

