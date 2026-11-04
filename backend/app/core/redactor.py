"""
LinuxOps Manager — Módulo de Sanitización y Redacción de Secretos en Logs
Previene la fuga accidental de credenciales, tokens, claves privadas y secretos.
"""

import re
from typing import Any, Dict

# Expresiones regulares para detección de secretos
PRIVATE_KEY_REGEX = re.compile(
    r"-----BEGIN [A-Z0-9_\s]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9_\s]+ PRIVATE KEY-----",
    re.MULTILINE,
)

BEARER_TOKEN_REGEX = re.compile(
    r"(?i)\b(bearer\s+)([A-Za-z0-9\-_\.=]{15,})",
)

URI_CREDENTIALS_REGEX = re.compile(
    r"([a-zA-Z][a-zA-Z0-9+.-]*://[^:\s@]+):([^@\s]+)@",
)

KEY_VALUE_SECRET_REGEX = re.compile(
    r'(?i)\b(password|passwd|pwd|secret|api_key|apikey|access_token|auth_token|client_secret|private_key|token)\b\s*([:=])\s*["\']?([^"\'\s,;]{3,})["\']?',
)

JSON_SECRET_REGEX = re.compile(
    r'(?i)"(password|passwd|pwd|secret|api_key|apikey|access_token|auth_token|client_secret|private_key|token)"\s*:\s*"([^"]+)"',
)


def sanitize_log_message(message: str) -> str:
    """
    Sanitiza un mensaje de log reemplazando información sensible por marcadores protegidos.
    """
    if not message or not isinstance(message, str):
        return message

    # 1. Claves privadas PEM
    message = PRIVATE_KEY_REGEX.sub("[REDACTED_PRIVATE_KEY]", message)

    # 2. URLs con usuario:contraseña (p.ej. postgres://user:pass@host)
    message = URI_CREDENTIALS_REGEX.sub(r"\1:***REDACTED***@", message)

    # 3. Cabeceras Bearer Tokens
    message = BEARER_TOKEN_REGEX.sub(r"\1***REDACTED_TOKEN***", message)

    # 4. JSON estructurado con claves sensibles
    message = JSON_SECRET_REGEX.sub(r'"\1": "***REDACTED***"', message)

    # 5. Formato clave=valor o clave: valor
    message = KEY_VALUE_SECRET_REGEX.sub(r'\1\2"***REDACTED***"', message)

    return message


def sanitize_log_metadata(meta: Dict[str, Any]) -> Dict[str, Any]:
    """
    Limpia recursivamente metadatos para evitar campos sensibles.
    """
    if not isinstance(meta, dict):
        return meta

    cleaned = {}
    sensitive_keys = {
        "password", "passwd", "secret", "token", "api_key", "apikey",
        "authorization", "auth", "private_key", "client_secret",
    }

    for k, v in meta.items():
        k_lower = str(k).lower()
        if any(sens in k_lower for sens in sensitive_keys):
            cleaned[k] = "***REDACTED***"
        elif isinstance(v, dict):
            cleaned[k] = sanitize_log_metadata(v)
        elif isinstance(v, str):
            cleaned[k] = sanitize_log_message(v)
        else:
            cleaned[k] = v

    return cleaned

