"""
LinuxOps Agent — Pruebas Unitarias para Buffer de Logs y Recolector
"""

import os
import tempfile
import pytest
from linuxops_agent.collectors.log_buffer import LogBuffer
from linuxops_agent.collectors.log_collector import infer_log_level
from linuxops_agent.security.redactor import sanitize_log_message, sanitize_log_metadata


def test_log_level_inference():
    assert infer_log_level("Connection timeout occurred") == "info"
    assert infer_log_level("ERROR: Failed to connect to socket") == "error"
    assert infer_log_level("CRITICAL: Out of memory panic") == "critical"
    assert infer_log_level("Warning: disk usage above 80%") == "warning"
    assert infer_log_level("debug: trace query executed in 1ms") == "debug"


def test_agent_redactor():
    raw = 'User logged in password="superSecretPass123" with token=eyJhbGciOiJIUzI1NiJ9'
    clean = sanitize_log_message(raw)
    assert "superSecretPass123" not in clean
    assert "REDACTED" in clean


def test_log_buffer_operations():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_buffer.db")
        buf = LogBuffer(db_path=db_path, max_size_mb=10)

        # 1. Enqueue
        records = [
            {
                "timestamp": "2026-11-04T12:00:00Z",
                "source": "docker",
                "service": "api-gateway",
                "level": "info",
                "stream": "stdout",
                "message": "Service started on :8000",
                "metadata": {"version": "1.0"},
            },
            {
                "timestamp": "2026-11-04T12:00:01Z",
                "source": "docker",
                "service": "api-gateway",
                "level": "error",
                "stream": "stderr",
                "message": "DB connection failed",
            },
        ]
        inserted = buf.enqueue_records(records)
        assert inserted == 2
        assert buf.get_queue_size() == 2

        # 2. Fetch unacked
        batch = buf.fetch_batch(limit=10)
        assert len(batch) == 2
        assert batch[0]["service"] == "api-gateway"
        assert batch[0]["metadata"] == {"version": "1.0"}

        # 3. Ack batch
        batch_ids = [b["id"] for b in batch]
        deleted = buf.ack_batch(batch_ids)
        assert deleted == 2
        assert buf.get_queue_size() == 0

        # 4. Checkpoints
        buf.set_checkpoint("docker", "api-gateway", "1730721600")
        assert buf.get_checkpoint("docker", "api-gateway") == "1730721600"
        assert buf.get_checkpoint("docker", "non_existent") is None

