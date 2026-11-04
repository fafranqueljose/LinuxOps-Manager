"""
LinuxOps Agent — Módulo de Redacción y Sanitización de Secretos
Elimina tokens, contraseñas y claves privadas antes de persistir o transmitir logs.
"""

import re
from typing import Any, Dict

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
    """Sanitiza el contenido de texto de un log antes de enviarlo o guardarlo."""
    if not message or not isinstance(message, str):
        return message or ""

    # Claves privadas
    message = PRIVATE_KEY_REGEX.sub("[REDACTED_PRIVATE_KEY]", message)
    # URLs con usuario:password
    message = URI_CREDENTIALS_REGEX.sub(r"\1:***REDACTED***@", message)
    # Bearer tokens
    message = BEARER_TOKEN_REGEX.sub(r"\1***REDACTED_TOKEN***", message)
    # Formatos JSON
    message = JSON_SECRET_REGEX.sub(r'"\1": "***REDACTED***"', message)
    # Formatos clave=valor
    message = KEY_VALUE_SECRET_REGEX.sub(r'\1\2"***REDACTED***"', message)

    return message


def sanitize_log_metadata(meta: Dict[str, Any]) -> Dict[str, Any]:
    """Sanitiza recursivamente diccionarios de metadatos."""
    if not isinstance(meta, dict):
        return {}

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

