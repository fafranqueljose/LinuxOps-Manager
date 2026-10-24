"""
LinuxOps Manager — Criptografía y Seguridad
Implementa:
- Hashing de contraseñas con Argon2id.
- Autenticación multifactor TOTP con PyOTP.
- Cifrado simétrico autenticado AES-256-GCM para secretos en reposo.
- Generación y hash criptográfico (SHA-256) de tokens de sesión e incorporación.
"""

import base64
import hashlib
import os
import secrets
from typing import Optional, Tuple
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import pyotp
from app.core.config import settings

# Inicialización de Argon2id con parámetros recomendados por OWASP
_ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,  # 64 MiB
    parallelism=4,
    hash_len=32,
    salt_len=16,
)


def hash_password(password: str) -> str:
    """Calcula el hash Argon2id de la contraseña dada."""
    return _ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica si la contraseña coincide con el hash Argon2id."""
    try:
        return _ph.verify(hashed_password, plain_password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def is_password_rehash_needed(hashed_password: str) -> bool:
    """Comprueba si el hash requiere actualización de parámetros criptográficos."""
    try:
        return _ph.check_needs_rehash(hashed_password)
    except Exception:
        return True


# --------------------------------------------------------------------------
# Generación y Hash de Tokens de Sesión e Incorporación (Anti-Exposición)
# --------------------------------------------------------------------------

def generate_secure_token(length_bytes: int = 32) -> str:
    """Genera un token seguro URL-safe."""
    return secrets.token_urlsafe(length_bytes)


def hash_token(raw_token: str) -> str:
    """
    Calcula el hash SHA-256 de un token en texto plano.
    Solo el hash se almacena en base de datos para prevenir robo ante volcados.
    """
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------
# Cifrado Simétrico Autenticado (AES-256-GCM) para Datos Sensibles en Reposo
# --------------------------------------------------------------------------

def _get_aes_key() -> bytes:
    """Obtiene y valida la clave de 32 bytes para AESGCM."""
    raw = settings.ENCRYPTION_KEY
    try:
        decoded = base64.b64decode(raw)
        if len(decoded) == 32:
            return decoded
    except Exception:
        pass
    # Fallback determinista seguro derivado de SECRET_KEY
    return hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()


def encrypt_data(plaintext: str) -> str:
    """
    Cifra una cadena usando AES-256-GCM.
    Devuelve base64 de (nonce + ciphertext + tag).
    """
    if not plaintext:
        return ""
    key = _get_aes_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # Nonce de 96 bits recomendado para GCM
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ciphertext).decode("utf-8")


def decrypt_data(encrypted_payload: str) -> Optional[str]:
    """
    Descifra una cadena cifrada con AES-256-GCM.
    """
    if not encrypted_payload:
        return None
    try:
        key = _get_aes_key()
        raw = base64.b64decode(encrypted_payload.encode("utf-8"))
        if len(raw) < 28:  # 12 nonce + 16 tag mínimo
            return None
        nonce = raw[:12]
        ciphertext = raw[12:]
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        return plaintext.decode("utf-8")
    except Exception:
        return None


# --------------------------------------------------------------------------
# Autenticación Multifactor TOTP (PyOTP)
# --------------------------------------------------------------------------

def generate_totp_secret() -> str:
    """Genera un nuevo secreto aleatorio en Base32 para TOTP."""
    return pyotp.random_base32()


def get_totp_uri(secret: str, username: str) -> str:
    """Genera la URI estandarizada otpauth:// para escaneo QR."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=username, issuer_name=settings.APP_NAME)


def verify_totp_code(secret: str, code: str, valid_window: int = 1) -> bool:
    """
    Verifica un código TOTP de 6 dígitos con ventana de tolerancia de ±1 paso (30s).
    """
    if not secret or not code:
        return False
    try:
        totp = pyotp.TOTP(secret)
        return totp.verify(code.strip(), valid_window=valid_window)
    except Exception:
        return False

