#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# LinuxOps Agent — Script de Instalación y Registro Automático
# Compatible con: Ubuntu, Debian, RHEL, Rocky Linux, AlmaLinux
# ==============================================================================

SERVER_URL=""
TOKEN=""
SERVER_ID=""
INSECURE=0

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
    --insecure|-k)
      INSECURE=1
      shift
      ;;
    *)
      echo "Parámetro desconocido: $1"
      exit 1
      ;;
  esac
done

if [[ -z "$SERVER_URL" || -z "$TOKEN" || -z "$SERVER_ID" ]]; then
  echo "Uso: sudo bash install.sh --server-url <URL> --token <TOKEN> --server-id <UUID> [--insecure]"
  exit 1
fi

# Detectar Hostname del servidor
DETECTED_HOSTNAME=$(hostname -f 2>/dev/null || hostname 2>/dev/null || uname -n)

# Detectar Dirección IP Principal de la máquina
DETECTED_IP=""
if command -v ip &>/dev/null; then
  DETECTED_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')
  if [[ -z "$DETECTED_IP" ]]; then
    DETECTED_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi
elif command -v ifconfig &>/dev/null; then
  DETECTED_IP=$(ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -n1)
fi

echo "=========================================================="
echo "Instalando LinuxOps Agent en $DETECTED_HOSTNAME..."
echo "Servidor Central:  $SERVER_URL"
echo "Servidor ID:       $SERVER_ID"
echo "Hostname Detectado: $DETECTED_HOSTNAME"
echo "IP Principal:      ${DETECTED_IP:-No detectada}"
echo "=========================================================="

# 0. Instalar dependencias esenciales de sistema si faltan
if command -v apt-get &>/dev/null; then
  if ! command -v python3 &>/dev/null || ! python3 -c "import venv" &>/dev/null || ! command -v curl &>/dev/null || ! command -v tar &>/dev/null; then
    echo "[*] Instalando dependencias base (python3, python3-venv, python3-pip, curl, tar)..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y && apt-get install -y python3 python3-venv python3-pip curl tar
  fi
elif command -v dnf &>/dev/null; then
  if ! command -v python3 &>/dev/null || ! command -v curl &>/dev/null || ! command -v tar &>/dev/null; then
    echo "[*] Instalando dependencias base con dnf..."
    dnf install -y python3 python3-pip curl tar
  fi
elif command -v yum &>/dev/null; then
  if ! command -v python3 &>/dev/null || ! command -v curl &>/dev/null || ! command -v tar &>/dev/null; then
    echo "[*] Instalando dependencias base con yum..."
    yum install -y python3 python3-pip curl tar
  fi
fi

# 1. Crear usuario y grupo de servicio no privilegiados
if ! id "linuxops-agent" &>/dev/null; then
  echo "[*] Creando usuario de sistema 'linuxops-agent'..."
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
chown -R linuxops-agent:linuxops-agent "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR" "$INSTALL_DIR"
chmod 750 "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR"

# 3. Descargar y extraer el paquete del agente desde el Servidor Central
echo "[*] Descargando componentes del agente..."
CURL_OPTS=("-sSL")
if [[ "$INSECURE" == "1" ]]; then
  CURL_OPTS+=("-k")
fi

BUNDLE_URL="${SERVER_URL%/}/agent-bundle.tar.gz"
TMP_TAR=$(mktemp /tmp/linuxops-agent-XXXXXX.tar.gz)

# Intentar descargar el bundle
if ! curl "${CURL_OPTS[@]}" "$BUNDLE_URL" -o "$TMP_TAR"; then
  # Fallback a /api/v1/agents/bundle.tar.gz
  BUNDLE_URL="${SERVER_URL%/}/api/v1/agents/bundle.tar.gz"
  curl "${CURL_OPTS[@]}" "$BUNDLE_URL" -o "$TMP_TAR"
fi

tar -xzf "$TMP_TAR" -C "$INSTALL_DIR"
rm -f "$TMP_TAR"
chown -R linuxops-agent:linuxops-agent "$INSTALL_DIR"

# 4. Crear entorno virtual Python e instalar requerimientos
echo "[*] Creando entorno virtual Python..."
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --upgrade pip --quiet
"$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt" --quiet

# 5. Ejecutar incorporación segura y obtención de certificados mTLS
echo "[*] Negociando credenciales mTLS y registrando agente..."
ENROLL_ARGS=(
  "--server-url" "$SERVER_URL"
  "--token" "$TOKEN"
  "--server-id" "$SERVER_ID"
  "--cert-dir" "$CONFIG_DIR/certs"
  "--hostname" "$DETECTED_HOSTNAME"
  "--ip-address" "$DETECTED_IP"
)
if [[ "$INSECURE" == "1" ]]; then
  ENROLL_ARGS+=("--insecure")
fi

PYTHONPATH="$INSTALL_DIR" "$INSTALL_DIR/venv/bin/python" "$INSTALL_DIR/packaging/enroll.py" "${ENROLL_ARGS[@]}"

chown -R linuxops-agent:linuxops-agent "$CONFIG_DIR/certs"
chmod 600 "$CONFIG_DIR/certs/agent.key"
chmod 644 "$CONFIG_DIR/certs/agent.crt" "$CONFIG_DIR/certs/ca.crt"

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

# 7. Configurar sudoers restrictivo solo para systemctl y journalctl sin password
cat <<EOF > /etc/sudoers.d/linuxops-agent
linuxops-agent ALL=(ALL) NOPASSWD: /usr/bin/systemctl start *, /usr/bin/systemctl stop *, /usr/bin/systemctl restart *, /usr/bin/systemctl reload *, /usr/bin/systemctl show *, /usr/bin/systemctl status *, /usr/bin/journalctl *
EOF
chmod 440 /etc/sudoers.d/linuxops-agent

# 8. Instalar y arrancar servicio systemd
cp "$INSTALL_DIR/packaging/linuxops-agent.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now linuxops-agent

echo "=========================================================="
echo "LinuxOps Agent instalado y activo correctamente."
echo "Estado del servicio: $(systemctl is-active linuxops-agent)"
echo "=========================================================="
