"""
LinuxOps Agent — CLI de Incorporación Inicial y Negociación de Certificados
Ejecutado durante la instalación para generar claves locales y obtener certificado mTLS.
"""

import argparse
import json
import os
import sys
import requests
from linuxops_agent.collectors.system_collector import system_collector
from linuxops_agent.security.csr_generator import generate_agent_key_and_csr


def enroll(server_url: str, token: str, server_id: str, cert_dir: str):
    print(f"[*] Iniciando incorporación segura en {server_url}...")
    os.makedirs(cert_dir, exist_ok=True)
    key_path = os.path.join(cert_dir, "agent.key")
    cert_path = os.path.join(cert_dir, "agent.crt")
    ca_path = os.path.join(cert_dir, "ca.crt")

    # 1. Generar par de claves localmente y CSR
    print("[*] Generando par de claves RSA local (la clave privada nunca se transmite)...")
    csr_pem = generate_agent_key_and_csr(server_id=server_id, key_path=key_path)

    # 2. Recopilar datos estáticos de SO
    os_info = system_collector.get_static_os_info()

    # 3. Enviar CSR y token al endpoint de enrolamiento
    enroll_url = f"{server_url.rstrip('/')}/api/v1/agents/enroll"
    payload = {
        "token": token,
        "csr_pem": csr_pem,
        "agent_version": "1.0.0",
        "os_info": os_info,
    }

    try:
        resp = requests.post(enroll_url, json=payload, timeout=20)
        if resp.status_code != 200:
            print(f"[!] Error de enrolamiento ({resp.status_code}): {resp.text}", file=sys.stderr)
            sys.exit(1)

        data = resp.json()
        # Guardar certificados emitidos
        with open(cert_path, "w") as f:
            f.write(data["certificate_pem"])
        with open(ca_path, "w") as f:
            f.write(data["ca_certificate_pem"])

        # Restringir permisos de lectura
        try:
            os.chmod(cert_path, 0o644)
            os.chmod(ca_path, 0o644)
            os.chmod(key_path, 0o600)
        except Exception:
            pass

        print("[+] Certificados de cliente mTLS y CA instalados exitosamente.")
        print(f"[+] Servidor ID: {server_id} registrado y listo.")

    except Exception as e:
        print(f"[!] Error al comunicarse con el servidor central: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LinuxOps Agent Enrollment Helper")
    parser.add_argument("--server-url", required=True, help="URL del servidor central")
    parser.add_argument("--token", required=True, help="Token de enrolamiento de un solo uso")
    parser.add_argument("--server-id", required=True, help="UUID del servidor en el inventario")
    parser.add_argument("--cert-dir", default="/etc/linuxops-agent/certs", help="Directorio de certificados")

    args = parser.parse_args()
    enroll(args.server_url, args.token, args.server_id, args.cert_dir)

