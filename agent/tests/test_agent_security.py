"""
Pruebas de Seguridad del Agente Linux
Verifica:
- Prevención de ataques de repetición (Anti-Replay)
- Rechazo de solicitudes caducadas (Anti-Expired)
- Validación de versión de protocolo
- Lista blanca de operaciones autorizadas
- Prevención de inyección de comandos en nombres de unidades systemd
- Ofuscación de variables de entorno sensibles en Docker
"""

import datetime
from uuid import uuid4
import pytest
from linuxops_agent.security.request_validator import RequestValidator
from linuxops_agent.docker_manager.manager import sanitize_env_list


def test_request_validator_success():
    validator = RequestValidator()
    now = datetime.datetime.now(datetime.timezone.utc)
    future = now + datetime.timedelta(seconds=30)

    envelope = {
        "protocol_version": "1.0",
        "request_id": str(uuid4()),
        "issued_at": now.isoformat(),
        "expires_at": future.isoformat(),
        "module": "docker",
        "operation": "container.list",
        "payload": {"all": True},
    }

    is_valid, err = validator.validate_envelope(envelope)
    assert is_valid is True
    assert err is None


def test_request_validator_unsupported_version():
    validator = RequestValidator()
    now = datetime.datetime.now(datetime.timezone.utc)
    envelope = {
        "protocol_version": "2.0",
        "request_id": str(uuid4()),
        "expires_at": (now + datetime.timedelta(seconds=30)).isoformat(),
        "module": "docker",
        "operation": "container.list",
    }
    is_valid, err = validator.validate_envelope(envelope)
    assert is_valid is False
    assert "no soportada" in err


def test_request_validator_expired_request():
    validator = RequestValidator()
    now = datetime.datetime.now(datetime.timezone.utc)
    past = now - datetime.timedelta(seconds=10)

    envelope = {
        "protocol_version": "1.0",
        "request_id": str(uuid4()),
        "expires_at": past.isoformat(),
        "module": "docker",
        "operation": "container.list",
    }
    is_valid, err = validator.validate_envelope(envelope)
    assert is_valid is False
    assert "ha caducado" in err


def test_request_validator_replay_attack():
    validator = RequestValidator()
    now = datetime.datetime.now(datetime.timezone.utc)
    req_id = str(uuid4())

    envelope = {
        "protocol_version": "1.0",
        "request_id": req_id,
        "expires_at": (now + datetime.timedelta(seconds=30)).isoformat(),
        "module": "docker",
        "operation": "container.list",
    }

    # Primera ejecución: exitosa
    is_valid, _ = validator.validate_envelope(envelope)
    assert is_valid is True

    # Segunda ejecución con el mismo request_id: rechazo por ataque de repetición
    is_valid_2, err_2 = validator.validate_envelope(envelope)
    assert is_valid_2 is False
    assert "Ataque de repetición detectado" in err_2


def test_request_validator_disallowed_operation():
    validator = RequestValidator()
    now = datetime.datetime.now(datetime.timezone.utc)

    envelope = {
        "protocol_version": "1.0",
        "request_id": str(uuid4()),
        "expires_at": (now + datetime.timedelta(seconds=30)).isoformat(),
        "module": "system",
        "operation": "arbitrary_shell_exec",
    }
    is_valid, err = validator.validate_envelope(envelope)
    assert is_valid is False
    assert "denegada por política local" in err


def test_systemd_unit_injection_prevention():
    validator = RequestValidator()
    now = datetime.datetime.now(datetime.timezone.utc)

    # Intento de inyección de comandos en el nombre del servicio
    malicious_unit = "nginx.service; cat /etc/shadow"
    envelope = {
        "protocol_version": "1.0",
        "request_id": str(uuid4()),
        "expires_at": (now + datetime.timedelta(seconds=30)).isoformat(),
        "module": "systemd",
        "operation": "unit.start",
        "payload": {"unit": malicious_unit},
    }
    is_valid, err = validator.validate_envelope(envelope)
    assert is_valid is False
    assert "malformado o no permitido" in err


def test_docker_env_sanitization():
    raw_env = [
        "APP_ENV=production",
        "DB_PASSWORD=SuperSecretPassWord123!",
        "API_SECRET_KEY=abcdef123456",
        "JWT_TOKEN=eyJhbGciOi...",
        "PORT=8080",
    ]
    safe_env = sanitize_env_list(raw_env)

    assert "APP_ENV=production" in safe_env
    assert "PORT=8080" in safe_env
    assert "DB_PASSWORD=[REDACTED]" in safe_env
    assert "API_SECRET_KEY=[REDACTED]" in safe_env
    assert "JWT_TOKEN=[REDACTED]" in safe_env
    assert "SuperSecretPassWord123!" not in str(safe_env)

