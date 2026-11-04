"""
LinuxOps Manager — Pruebas Unitarias y de Integración para el Módulo de Logs
"""

import datetime
from unittest.mock import AsyncMock, patch
from uuid import uuid4
import pytest
from httpx import ASGITransport, AsyncClient
from app.core.redactor import sanitize_log_message, sanitize_log_metadata
from app.main import app
from app.schemas.logs import LogBatchIngestIn, LogEventIn, LogRecordOut


def test_redactor_passwords_and_tokens():
    raw_message = (
        'Error connecting to db: postgres://user:mySuperSecret123@localhost:5432/app '
        'with password="SuperSecretPassword!" and auth_token: eyJhbGciOiJIUzI1NiJ9.test '
        'and Authorization: Bearer token1234567890abcdef'
    )
    cleaned = sanitize_log_message(raw_message)

    assert "mySuperSecret123" not in cleaned
    assert "SuperSecretPassword!" not in cleaned
    assert "token1234567890abcdef" not in cleaned
    assert "REDACTED" in cleaned


def test_redactor_private_keys():
    raw_key = (
        "Server starting\n"
        "-----BEGIN RSA PRIVATE KEY-----\n"
        "MIIEowIBAAKCAQEA0123456789abcdef\n"
        "-----END RSA PRIVATE KEY-----\n"
        "Server ready"
    )
    cleaned = sanitize_log_message(raw_key)

    assert "-----BEGIN RSA PRIVATE KEY-----" not in cleaned
    assert "[REDACTED_PRIVATE_KEY]" in cleaned
    assert "Server ready" in cleaned


def test_redactor_metadata():
    meta = {
        "user": "admin",
        "api_key": "secret_api_key_value",
        "nested": {
            "password": "hidden_password",
            "normal": "value",
        },
    }
    cleaned = sanitize_log_metadata(meta)

    assert cleaned["user"] == "admin"
    assert cleaned["api_key"] == "***REDACTED***"
    assert cleaned["nested"]["password"] == "***REDACTED***"
    assert cleaned["nested"]["normal"] == "value"


@pytest.mark.asyncio
async def test_loki_service_query_mock():
    with patch("app.services.loki_service.loki_service.query_range", new_callable=AsyncMock) as mock_query:
        fake_id = uuid4()
        now = datetime.datetime.utcnow()
        mock_query.return_value = (
            [
                LogRecordOut(
                    id="log_1",
                    timestamp=now,
                    server_id=fake_id,
                    server_name="test-server",
                    source="docker",
                    service="nginx-app",
                    level="info",
                    message="GET / 200 OK",
                    stream="stdout",
                )
            ],
            12.5,
            "ok",
        )

        records, duration, status = await mock_query(server_ids=[fake_id])
        assert len(records) == 1
        assert records[0].service == "nginx-app"
        assert status == "ok"

