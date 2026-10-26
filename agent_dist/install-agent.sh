#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# LinuxOps Agent — Script de Instalación y Registro Automático Remoto/Local
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
  echo "Uso: curl -sSL <URL>/install-agent.sh | sudo bash -s -- --server-url <URL> --token <TOKEN> --server-id <UUID>"
  exit 1
fi

echo "=========================================================="
echo "Instalando LinuxOps Agent en $(hostname)..."
echo "Servidor Central: $SERVER_URL"
echo "Servidor ID: $SERVER_ID"
echo "=========================================================="

# 0. Instalar dependencias si python3 o python3-venv no existen
if ! command -v python3 &>/dev/null || ! python3 -m venv --help &>/dev/null; then
  echo "[*] Instalando dependencias de sistema (python3, python3-venv, curl)..."
  if command -v apt-get &>/dev/null; then
    apt-get update -qq && apt-get install -y -qq python3 python3-venv python3-pip curl tar
  elif command -v dnf &>/dev/null; then
    dnf install -y python3 python3-pip curl tar
  elif command -v yum &>/dev/null; then
    yum install -y python3 python3-pip curl tar
  fi
fi

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

# 3. Obtener código fuente del agente (local o descargado desde SERVER_URL)
SCRIPT_DIR=""
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

if [[ -n "$SCRIPT_DIR" && -d "$SCRIPT_DIR/linuxops_agent" ]]; then
  echo "[*] Copiando archivos de agente desde el repositorio local..."
  cp -r "$SCRIPT_DIR/linuxops_agent" "$INSTALL_DIR/"
  cp "$SCRIPT_DIR/requirements.txt" "$INSTALL_DIR/"
  mkdir -p "$INSTALL_DIR/packaging"
  cp "$SCRIPT_DIR/packaging/enroll.py" "$INSTALL_DIR/packaging/"
  cp "$SCRIPT_DIR/packaging/linuxops-agent.service" /etc/systemd/system/
else
  CLEAN_URL="${SERVER_URL%/}"
  BUNDLE_URL="${CLEAN_URL}/agent-bundle.tar.gz"
  echo "[*] Descargando paquete del agente desde $BUNDLE_URL..."
  curl -sSL "$BUNDLE_URL" -o /tmp/agent-bundle.tar.gz
  tar -xzf /tmp/agent-bundle.tar.gz -C "$INSTALL_DIR"
  cp "$INSTALL_DIR/packaging/linuxops-agent.service" /etc/systemd/system/
  rm -f /tmp/agent-bundle.tar.gz
fi

# 4. Crear entorno virtual Python e instalar dependencias
echo "[*] Creando entorno virtual en $INSTALL_DIR/venv..."
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --upgrade pip -q
"$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt" -q

# Asegurar __init__.py y registrar path permanente en venv
touch "$INSTALL_DIR/linuxops_agent/__init__.py" \
      "$INSTALL_DIR/linuxops_agent/collectors/__init__.py" \
      "$INSTALL_DIR/linuxops_agent/docker_manager/__init__.py" \
      "$INSTALL_DIR/linuxops_agent/security/__init__.py" \
      "$INSTALL_DIR/linuxops_agent/systemd_manager/__init__.py" \
      "$INSTALL_DIR/linuxops_agent/terminal_manager/__init__.py"
echo "$INSTALL_DIR" > "$INSTALL_DIR/venv/lib/"python3*/site-packages/linuxops.pth

# 5. Ejecutar incorporación segura y obtención de certificados mTLS
echo "[*] Negociando certificado de agente con el servidor central..."
ENROLL_SCRIPT="$INSTALL_DIR/packaging/enroll.py"
[[ ! -f "$ENROLL_SCRIPT" ]] && ENROLL_SCRIPT="$INSTALL_DIR/enroll.py"

PYTHONPATH="$INSTALL_DIR" "$INSTALL_DIR/venv/bin/python" "$ENROLL_SCRIPT" \
  --server-url "$SERVER_URL" \
  --token "$TOKEN" \
  --server-id "$SERVER_ID" \
  --cert-dir "$CONFIG_DIR/certs"

chown -R linuxops-agent:linuxops-agent "$CONFIG_DIR/certs"
chmod 600 "$CONFIG_DIR/certs/agent.key"

# 6. Escribir archivo de variables de entorno
cat <<EOF > "$CONFIG_DIR/agent.env"
PYTHONPATH=$INSTALL_DIR
LINUXOPS_SERVER_URL=$SERVER_URL
LINUXOPS_SERVER_ID=$SERVER_ID
LINUXOPS_CA_CERT=$CONFIG_DIR/certs/ca.crt
LINUXOPS_AGENT_CERT=$CONFIG_DIR/certs/agent.crt
LINUXOPS_AGENT_KEY=$CONFIG_DIR/certs/agent.key
LINUXOPS_DATA_DIR=$DATA_DIR
EOF
chmod 600 "$CONFIG_DIR/agent.env"
chown linuxops-agent:linuxops-agent "$CONFIG_DIR/agent.env"
chown -R linuxops-agent:linuxops-agent "$INSTALL_DIR"

# 7. Configurar sudoers restrictivo solo para systemctl sin password
cat <<EOF > /etc/sudoers.d/linuxops-agent
linuxops-agent ALL=(ALL) NOPASSWD: /usr/bin/systemctl start *, /usr/bin/systemctl stop *, /usr/bin/systemctl restart *, /usr/bin/systemctl reload *, /usr/bin/systemctl show *, /usr/bin/systemctl status *
EOF
chmod 440 /etc/sudoers.d/linuxops-agent

# 8. Instalar y arrancar servicio systemd
systemctl daemon-reload
systemctl enable --now linuxops-agent

echo "=========================================================="
echo "LinuxOps Agent instalado y activo correctamente."
echo "Estado: $(systemctl is-active linuxops-agent)"
echo "=========================================================="

