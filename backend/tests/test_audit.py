"""
Pruebas de Integridad Criptográfica de la Cadena de Auditoría
"""

import pytest
from app.services.audit_service import AuditService
from app.tests.conftest import TestingSessionLocal


@pytest.mark.asyncio
async def test_audit_hash_chain_and_tamper_detection():
    async with TestingSessionLocal() as session:
        # Registrar tres eventos normales
        log1 = await AuditService.log_event(
            db=session,
            correlation_id="corr-1",
            operation="test.op1",
            resource_type="server",
            status="success",
            details={"key": "val1"},
        )
        log2 = await AuditService.log_event(
            db=session,
            correlation_id="corr-2",
            operation="test.op2",
            resource_type="server",
            status="success",
            details={"key": "val2"},
        )
        log3 = await AuditService.log_event(
            db=session,
            correlation_id="corr-3",
            operation="test.op3",
            resource_type="server",
            status="success",
            details={"key": "val3"},
        )
        await session.commit()

        # Verificar integridad
        is_valid, checked, bad_count, bad_id = await AuditService.verify_audit_trail(session)
        assert is_valid is True
        assert checked == 3
        assert bad_count == 0

        # Simular ataque de manipulación directa en base de datos alterando los detalles de log2
        log2.details = {"key": "malicious_tamper"}
        await session.commit()

        # Verificar que el detector criptográfico identifica la corrupción
        is_valid_after_tamper, checked_2, bad_count_2, bad_id_2 = await AuditService.verify_audit_trail(session)
        assert is_valid_after_tamper is False
        assert bad_count_2 > 0
        assert bad_id_2 == log2.id

