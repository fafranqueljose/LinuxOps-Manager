"""
Pruebas de Autenticación, MFA y Protección de Fuerza Bruta
"""

import pytest
from httpx import AsyncClient
from app.core.security import hash_password
from app.models.user import User
from app.tests.conftest import TestingSessionLocal


@pytest.mark.asyncio
async def test_login_invalid_credentials(async_client: AsyncClient):
    response = await async_client.post(
        "/api/v1/auth/login",
        json={"username": "nonexistent_user", "password": "WrongPassword123!"},
    )
    assert response.status_code == 401
    assert "Credenciales inválidas" in response.json()["detail"]


@pytest.mark.asyncio
async def test_login_success_and_cookie_set(async_client: AsyncClient):
    # Crear usuario de prueba
    async with TestingSessionLocal() as session:
        test_user = User(
            username="tester",
            email="tester@example.com",
            hashed_password=hash_password("SuperSecret123!"),
            is_active=True,
            is_superuser=False,
        )
        session.add(test_user)
        await session.commit()

    response = await async_client.post(
        "/api/v1/auth/login",
        json={"username": "tester", "password": "SuperSecret123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "authenticated"
    assert data["username"] == "tester"
    # Verificar presencia de Cookie HttpOnly
    assert "linuxops_session" in response.cookies


@pytest.mark.asyncio
async def test_brute_force_lockout(async_client: AsyncClient):
    async with TestingSessionLocal() as session:
        victim = User(
            username="lockout_victim",
            email="victim@example.com",
            hashed_password=hash_password("RealPassword123!"),
            is_active=True,
            failed_login_attempts=0,
        )
        session.add(victim)
        await session.commit()

    # Realizar 5 intentos fallidos sucesivos
    for i in range(5):
        res = await async_client.post(
            "/api/v1/auth/login",
            json={"username": "lockout_victim", "password": "BadPassword123!"},
        )
        assert res.status_code == 401

    # El 6to intento debe indicar que la cuenta está bloqueada temporalmente
    lockout_res = await async_client.post(
        "/api/v1/auth/login",
        json={"username": "lockout_victim", "password": "RealPassword123!"},
    )
    assert lockout_res.status_code == 401
    assert "bloqueada temporalmente" in lockout_res.json()["detail"]

