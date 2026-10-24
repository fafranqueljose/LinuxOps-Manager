#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# LinuxOps Agent — Script de Desinstalación Limpia
# ==============================================================================

echo "Desinstalando LinuxOps Agent..."

# Detener y deshabilitar servicio systemd
if systemctl is-active --quiet linuxops-agent; then
  systemctl stop linuxops-agent
fi
if systemctl is-enabled --quiet linuxops-agent 2>/dev/null; then
  systemctl disable linuxops-agent
fi

# Eliminar archivo de servicio
rm -f /etc/systemd/system/linuxops-agent.service
systemctl daemon-reload

# Eliminar reglas sudoers
rm -f /etc/sudoers.d/linuxops-agent

# Eliminar directorios de instalación, datos y logs
rm -rf /opt/linuxops-agent
rm -rf /etc/linuxops-agent
rm -rf /var/lib/linuxops-agent
rm -rf /var/log/linuxops-agent

# Eliminar usuario y grupo
if id "linuxops-agent" &>/dev/null; then
  userdel linuxops-agent || true
fi

echo "LinuxOps Agent desinstalado completamente."

