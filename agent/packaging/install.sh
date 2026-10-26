#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# LinuxOps Agent — Script de Instalación y Registro Automático
# Compatible con: Ubuntu, Debian, RHEL, Rocky Linux, AlmaLinux
# ==============================================================================

SERVER_URL=""
TOKEN=""
SERVER_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server-url)
      SERVER_URL="$2"
      shift 2
      ;;
    --token)
      TOKEN="$2"
      shift 2
      ;;
    --server-id)
      SERVER_ID="$2"
      shift 2
      ;;
    *)
      echo "Parámetro desconocido: $1"
      exit 1
      ;;
  esac
done

if [[ -z "$SERVER_URL" || -z "$TOKEN" || -z "$SERVER_ID" ]]; then
  echo "Uso: sudo bash install.sh --server-url <URL> --token <TOKEN> --server-id <UUID>"
  exit 1
fi

echo "=========================================================="
echo "Instalando LinuxOps Agent en $(hostname)..."
echo "=========================================================="

# 1. Crear usuario y grupo de servicio no privilegiados
if ! id "linuxops-agent" &>/dev/null; then
  useradd --system --shell /usr/sbin/nologin --user-group linuxops-agent
fi

# Agregar al grupo docker si existe para permitir administración sin root
if getent group docker >/dev/null; then
  usermod -aG docker linuxops-agent
fi

# 2. Crear directorios de ejecución con permisos estrictos
INSTALL_DIR="/opt/linuxops-agent"
CONFIG_DIR="/etc/linuxops-agent"
DATA_DIR="/var/lib/linuxops-agent"
LOG_DIR="/var/log/linuxops-agent"

mkdir -p "$INSTALL_DIR" "$CONFIG_DIR/certs" "$DATA_DIR" "$LOG_DIR"
chown -R linuxops-agent:linuxops-agent "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR"
chmod 750 "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR"

# 3. Copiar código fuente del agente
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cp -r "$SCRIPT_DIR/linuxops_agent" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/requirements.txt" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/packaging/enroll.py" "$INSTALL_DIR/"

# 4. Crear entorno virtual Python
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"

# 5. Ejecutar incorporación segura y obtención de certificados mTLS
echo "Iniciando incorporación segura..."
PYTHONPATH="$INSTALL_DIR" "$INSTALL_DIR/venv/bin/python" "$INSTALL_DIR/enroll.py" \
  --server-url "$SERVER_URL" \
  --token "$TOKEN" \
  --server-id "$SERVER_ID" \
  --cert-dir "$CONFIG_DIR/certs"

chown -R linuxops-agent:linuxops-agent "$CONFIG_DIR/certs"
chmod 600 "$CONFIG_DIR/certs/agent.key"

# 6. Escribir archivo de variables de entorno
cat <<EOF > "$CONFIG_DIR/agent.env"
LINUXOPS_SERVER_URL=$SERVER_URL
LINUXOPS_SERVER_ID=$SERVER_ID
LINUXOPS_CA_CERT=$CONFIG_DIR/certs/ca.crt
LINUXOPS_AGENT_CERT=$CONFIG_DIR/certs/agent.crt
LINUXOPS_AGENT_KEY=$CONFIG_DIR/certs/agent.key
LINUXOPS_DATA_DIR=$DATA_DIR
EOF
chmod 600 "$CONFIG_DIR/agent.env"
chown linuxops-agent:linuxops-agent "$CONFIG_DIR/agent.env"

# 7. Configurar sudoers restrictivo solo para systemctl sin password
cat <<EOF > /etc/sudoers.d/linuxops-agent
linuxops-agent ALL=(ALL) NOPASSWD: /usr/bin/systemctl start *, /usr/bin/systemctl stop *, /usr/bin/systemctl restart *, /usr/bin/systemctl reload *, /usr/bin/systemctl show *, /usr/bin/systemctl status *
EOF
chmod 440 /etc/sudoers.d/linuxops-agent

# 8. Instalar y arrancar servicio systemd
cp "$SCRIPT_DIR/packaging/linuxops-agent.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now linuxops-agent

echo "=========================================================="
echo "LinuxOps Agent instalado y activo correctamente."
echo "Estado: $(systemctl is-active linuxops-agent)"
echo "=========================================================="

