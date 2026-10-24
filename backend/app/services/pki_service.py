"""
LinuxOps Manager — Servicio de Infraestructura de Clave Pública (PKI) y CA Interna
Maneja la Autoridad Certificadora interna para mTLS con los agentes:
- Inicialización y custodia segura de la CA raíz.
- Firma de CSR (Certificate Signing Request) generadas localmente por los agentes.
- Cálculo de huellas SHA-256 e inspección de certificados X.509.
- Verificación criptográfica de identidades y números de serie.
"""

import datetime
import hashlib
import os
from typing import Optional, Tuple
from cryptography import x509
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from app.core.config import settings


class PKIService:
    def __init__(self):
        self.ca_dir = settings.PKI_CA_DIR
        self.ca_cert_path = settings.PKI_CA_CERT
        self.ca_key_path = settings.PKI_CA_KEY

    def ensure_ca_initialized(self) -> None:
        """Asegura que el directorio y los certificados de la CA raíz existan."""
        os.makedirs(self.ca_dir, exist_ok=True)
        if not os.path.exists(self.ca_cert_path) or not os.path.exists(self.ca_key_path):
            self._generate_root_ca()

    def _generate_root_ca(self) -> None:
        """Genera una nueva Autoridad Certificadora Raíz interna de 4096 bits."""
        ca_private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=4096,
            backend=default_backend(),
        )

        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "ES"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "LinuxOps Manager"),
            x509.NameAttribute(NameOID.COMMON_NAME, "LinuxOps Internal Agent CA"),
        ])

        now = datetime.datetime.now(datetime.timezone.utc)
        ca_cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(ca_private_key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(minutes=5))
            .not_valid_after(now + datetime.timedelta(days=3650))  # 10 años
            .add_extension(
                x509.BasicConstraints(ca=True, path_length=0),
                critical=True,
            )
            .add_extension(
                x509.KeyUsage(
                    digital_signature=True,
                    content_commitment=False,
                    key_encipherment=False,
                    data_encipherment=False,
                    key_agreement=False,
                    key_cert_sign=True,
                    crl_sign=True,
                    encipher_only=False,
                    decipher_only=False,
                ),
                critical=True,
            )
            .sign(ca_private_key, hashes.SHA256(), default_backend())
        )

        # Guardar clave privada con permisos restrictivos
        key_encryption = serialization.NoEncryption()
        if settings.PKI_CA_PASSPHRASE:
            key_encryption = serialization.BestAvailableEncryption(settings.PKI_CA_PASSPHRASE.encode("utf-8"))

        with open(self.ca_key_path, "wb") as f:
            f.write(ca_private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=key_encryption,
            ))
        try:
            os.chmod(self.ca_key_path, 0o600)
        except Exception:
            pass

        with open(self.ca_cert_path, "wb") as f:
            f.write(ca_cert.public_bytes(serialization.Encoding.PEM))

    def get_ca_certificate_pem(self) -> str:
        """Obtiene el certificado público de la CA en formato PEM."""
        self.ensure_ca_initialized()
        with open(self.ca_cert_path, "rb") as f:
            return f.read().decode("utf-8")

    def sign_agent_csr(self, csr_pem: str, agent_id: str) -> Tuple[str, str, str]:
        """
        Firma una CSR enviada por el agente.
        Devuelve (cert_pem, cert_serial_hex, cert_fingerprint_sha256).
        """
        self.ensure_ca_initialized()
        csr = x509.load_pem_x509_csr(csr_pem.encode("utf-8"), default_backend())

        # Cargar CA privada y certificado
        with open(self.ca_key_path, "rb") as f:
            password = settings.PKI_CA_PASSPHRASE.encode("utf-8") if settings.PKI_CA_PASSPHRASE else None
            ca_key = serialization.load_pem_private_key(f.read(), password=password, backend=default_backend())

        with open(self.ca_cert_path, "rb") as f:
            ca_cert = x509.load_pem_x509_certificate(f.read(), default_backend())

        # Sujeto del certificado del agente
        agent_subject = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "ES"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "LinuxOps Managed Agent"),
            x509.NameAttribute(NameOID.COMMON_NAME, f"agent-{agent_id}"),
        ])

        now = datetime.datetime.now(datetime.timezone.utc)
        serial = x509.random_serial_number()
        validity_days = settings.AGENT_CERT_VALIDITY_DAYS

        agent_cert = (
            x509.CertificateBuilder()
            .subject_name(agent_subject)
            .issuer_name(ca_cert.subject)
            .public_key(csr.public_key())
            .serial_number(serial)
            .not_valid_before(now - datetime.timedelta(minutes=5))
            .not_valid_after(now + datetime.timedelta(days=validity_days))
            .add_extension(
                x509.BasicConstraints(ca=False, path_length=None),
                critical=True,
            )
            .add_extension(
                x509.KeyUsage(
                    digital_signature=True,
                    content_commitment=False,
                    key_encipherment=True,
                    data_encipherment=False,
                    key_agreement=False,
                    key_cert_sign=False,
                    crl_sign=False,
                    encipher_only=False,
                    decipher_only=False,
                ),
                critical=True,
            )
            .add_extension(
                x509.ExtendedKeyUsage([x509.ExtendedKeyUsageOID.CLIENT_AUTH]),
                critical=False,
            )
            .sign(ca_key, hashes.SHA256(), default_backend())
        )

        cert_bytes = agent_cert.public_bytes(serialization.Encoding.PEM)
        cert_pem = cert_bytes.decode("utf-8")
        serial_hex = f"{serial:x}"
        fingerprint = hashlib.sha256(agent_cert.public_bytes(serialization.Encoding.DER)).hexdigest()

        return cert_pem, serial_hex, fingerprint


pki_service = PKIService()

