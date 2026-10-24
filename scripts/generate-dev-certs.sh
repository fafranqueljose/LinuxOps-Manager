#!/usr/bin/env bash
set -euo pipefail

# Generador de certificados TLS autofirmados para el Proxy Nginx (Desarrollo/Pruebas)
CERTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../deploy/nginx/certs" && pwd)"
mkdir -p "$CERTS_DIR"

if [[ ! -f "$CERTS_DIR/server.key" || ! -f "$CERTS_DIR/server.crt" ]]; then
  echo "Generando certificados TLS para Nginx en $CERTS_DIR..."
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$CERTS_DIR/server.key" \
    -out "$CERTS_DIR/server.crt" \
    -subj "/C=ES/ST=Madrid/L=Madrid/O=LinuxOps/CN=linuxops.local"
  chmod 600 "$CERTS_DIR/server.key"
  echo "Certificados generados exitosamente."
else
  echo "Los certificados TLS de Nginx ya existen."
fi

