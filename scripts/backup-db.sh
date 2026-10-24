#!/usr/bin/env bash
set -euo pipefail

# Script de Respaldo de Base de Datos PostgreSQL
BACKUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../backups" && pwd)"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/linuxops_backup_$TIMESTAMP.sql.gz"

echo "Iniciando respaldo de la base de datos LinuxOps..."
docker exec linuxops-db pg_dump -U linuxops_user linuxops_db | gzip > "$BACKUP_FILE"

echo "[+] Respaldo completado exitosamente: $BACKUP_FILE"
echo "[+] Tamaño: $(du -h "$BACKUP_FILE" | cut -f1)"

