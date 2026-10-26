#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# LinuxOps Agent — Script de Instalación y Registro Automático Remoto/Local
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
  echo "Uso: curl -sSL <URL>/install-agent.sh | sudo bash -s -- --server-url <URL> --token <TOKEN> --server-id <UUID> [--insecure]"
  exit 1
fi

# Sanitizar SERVER_URL (remover /install-agent.sh o barras finales si fueron pegadas por error)
SERVER_URL="${SERVER_URL%/}"
SERVER_URL="${SERVER_URL%/install-agent.sh}"
SERVER_URL="${SERVER_URL%/install.sh}"
SERVER_URL="${SERVER_URL%/}"

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
  DETECTED_IP=$(ifconfig 2>/dev/null | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -n1 || true)
fi

echo "=========================================================="
echo "Instalando LinuxOps Agent en $DETECTED_HOSTNAME..."
echo "Servidor Central:   $SERVER_URL"
echo "Servidor ID:        $SERVER_ID"
echo "Hostname Detectado: $DETECTED_HOSTNAME"
echo "IP Principal:       ${DETECTED_IP:-No detectada}"
echo "=========================================================="

# 0. Instalar dependencias esenciales de sistema si faltan
if command -v apt-get &>/dev/null; then
  if ! command -v python3 &>/dev/null || ! python3 -c "import venv" &>/dev/null || ! command -v curl &>/dev/null || ! command -v tar &>/dev/null; then
    echo "[*] Instalando dependencias base (python3, python3-venv, python3-pip, curl, tar)..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y -qq && apt-get install -y -qq python3 python3-venv python3-pip curl tar
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

# 3. Obtener código fuente del agente (local o descargado desde SERVER_URL)
SCRIPT_DIR=""
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd || true)"
fi

if [[ -n "$SCRIPT_DIR" && -d "$SCRIPT_DIR/linuxops_agent" ]]; then
  echo "[*] Copiando archivos de agente desde el repositorio local..."
  cp -r "$SCRIPT_DIR/linuxops_agent" "$INSTALL_DIR/"
  cp "$SCRIPT_DIR/requirements.txt" "$INSTALL_DIR/"
  mkdir -p "$INSTALL_DIR/packaging"
  cp "$SCRIPT_DIR/packaging/enroll.py" "$INSTALL_DIR/packaging/"
  cp "$SCRIPT_DIR/packaging/linuxops-agent.service" /etc/systemd/system/
else
  CLEAN_URL="${SERVER_URL}"
  BUNDLE_URL="${CLEAN_URL}/agent-bundle.tar.gz"
  echo "[*] Descargando paquete del agente desde $BUNDLE_URL..."
  CURL_OPTS=("-sSLf")
  if [[ "$INSECURE" == "1" ]]; then
    CURL_OPTS+=("-k")
  fi

  TMP_TAR=$(mktemp /tmp/linuxops-agent-XXXXXX.tar.gz)
  if ! curl "${CURL_OPTS[@]}" "$BUNDLE_URL" -o "$TMP_TAR"; then
    BUNDLE_URL="${CLEAN_URL}/api/v1/agents/bundle.tar.gz"
    echo "[*] Reintentando descarga desde $BUNDLE_URL..."
    if ! curl "${CURL_OPTS[@]}" "$BUNDLE_URL" -o "$TMP_TAR"; then
      echo "[!] Error: No se pudo descargar el paquete del agente desde $CLEAN_URL." >&2
      echo "[!] Verifique que el servidor central esté accesible y la URL sea correcta." >&2
      rm -f "$TMP_TAR"
      exit 1
    fi
  fi

  if ! tar -tzf "$TMP_TAR" >/dev/null 2>&1; then
    echo "[!] Error: El archivo recibido desde $BUNDLE_URL no es un paquete comprimido válido (tar.gz)." >&2
    echo "[!] Contenido de la respuesta recibida:" >&2
    head -n 5 "$TMP_TAR" >&2
    rm -f "$TMP_TAR"
    exit 1
  fi

  tar -xzf "$TMP_TAR" -C "$INSTALL_DIR"
  rm -f "$TMP_TAR"

  if [[ -f "$INSTALL_DIR/packaging/linuxops-agent.service" ]]; then
    cp "$INSTALL_DIR/packaging/linuxops-agent.service" /etc/systemd/system/
  fi
fi

# 4. Crear entorno virtual Python e instalar dependencias
echo "[*] Creando entorno virtual en $INSTALL_DIR/venv..."
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --upgrade pip -q
"$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt" -q

# Asegurar __init__.py en módulos
touch "$INSTALL_DIR/linuxops_agent/__init__.py" \
      "$INSTALL_DIR/linuxops_agent/collectors/__init__.py" \
      "$INSTALL_DIR/linuxops_agent/docker_manager/__init__.py" \
      "$INSTALL_DIR/linuxops_agent/security/__init__.py" \
      "$INSTALL_DIR/linuxops_agent/systemd_manager/__init__.py" \
      "$INSTALL_DIR/linuxops_agent/terminal_manager/__init__.py"

# Registrar path del agente en site-packages usando el intérprete de Python (seguro y portable)
"$INSTALL_DIR/venv/bin/python" -c "import site, os; p = site.getsitepackages(); [open(os.path.join(d, 'linuxops.pth'), 'w').write('$INSTALL_DIR\n') for d in p if os.path.isdir(d)]" || true

# 5. Ejecutar incorporación segura y obtención de certificados mTLS
echo "[*] Negociando certificado de agente con el servidor central..."
ENROLL_SCRIPT="$INSTALL_DIR/packaging/enroll.py"
[[ ! -f "$ENROLL_SCRIPT" ]] && ENROLL_SCRIPT="$INSTALL_DIR/enroll.py"

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

PYTHONPATH="$INSTALL_DIR" "$INSTALL_DIR/venv/bin/python" "$ENROLL_SCRIPT" "${ENROLL_ARGS[@]}"

chown -R linuxops-agent:linuxops-agent "$CONFIG_DIR/certs"
chmod 600 "$CONFIG_DIR/certs/agent.key"
chmod 644 "$CONFIG_DIR/certs/agent.crt" "$CONFIG_DIR/certs/ca.crt"

# 6. Escribir archivo de variables de entorno
cat <<EOF > "$CONFIG_DIR/agent.env"
PYTHONPATH=$INSTALL_DIR
LINUXOPS_SERVER_URL=$SERVER_URL
LINUXOPS_SERVER_ID=$SERVER_ID
LINUXOPS_CA_CERT=$CONFIG_DIR/certs/ca.crt
LINUXOPS_AGENT_CERT=$CONFIG_DIR/certs/agent.crt
LINUXOPS_AGENT_KEY=$CONFIG_DIR/certs/agent.key
LINUXOPS_DATA_DIR=$DATA_DIR
LINUXOPS_INSECURE=$([[ "$INSECURE" == "1" ]] && echo "true" || echo "false")
EOF
chmod 600 "$CONFIG_DIR/agent.env"
chown linuxops-agent:linuxops-agent "$CONFIG_DIR/agent.env"
chown -R linuxops-agent:linuxops-agent "$INSTALL_DIR"

# 7. Configurar sudoers restrictivo solo para systemctl y journalctl sin password
cat <<EOF > /etc/sudoers.d/linuxops-agent
linuxops-agent ALL=(ALL) NOPASSWD: /usr/bin/systemctl start *, /usr/bin/systemctl stop *, /usr/bin/systemctl restart *, /usr/bin/systemctl reload *, /usr/bin/systemctl show *, /usr/bin/systemctl status *, /usr/bin/journalctl *
EOF
chmod 440 /etc/sudoers.d/linuxops-agent

# 8. Instalar y arrancar servicio systemd
systemctl daemon-reload
systemctl enable --now linuxops-agent

echo "=========================================================="
echo "LinuxOps Agent instalado y activo correctamente."
echo "Estado: $(systemctl is-active linuxops-agent)"
echo "=========================================================="
