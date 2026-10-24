"""
LinuxOps Agent — Generación Local de Claves y Solicitud de Certificado (CSR)
La clave privada NUNCA abandona el servidor remoto.
"""

import os
from typing import Tuple
from cryptography import x509
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID


def generate_agent_key_and_csr(server_id: str, key_path: str) -> str:
    """
    Genera una clave privada RSA de 3072 bits y una CSR.
    Guarda la clave privada localmente con permisos 0600 y retorna el PEM de la CSR.
    """
    # 1. Generar clave privada
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=3072,
        backend=default_backend(),
    )

    # Asegurar directorio de claves
    key_dir = os.path.dirname(key_path)
    if key_dir:
        os.makedirs(key_dir, exist_ok=True)

    # 2. Guardar clave privada con permisos restrictivos
    with open(key_path, "wb") as f:
        f.write(private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))
    try:
        os.chmod(key_path, 0o600)
    except Exception:
        pass

    # 3. Construir CSR
    subject = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "ES"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "LinuxOps Managed Agent"),
        x509.NameAttribute(NameOID.COMMON_NAME, f"agent-{server_id}"),
    ])

    csr = (
        x509.CertificateSigningRequestBuilder()
        .subject_name(subject)
        .sign(private_key, hashes.SHA256(), default_backend())
    )

    csr_pem = csr.public_bytes(serialization.Encoding.PEM).decode("utf-8")
    return csr_pem

