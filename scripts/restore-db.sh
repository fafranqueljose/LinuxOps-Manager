#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Uso: $0 <ruta_al_archivo_backup.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "[!] El archivo especificado no existe: $BACKUP_FILE"
  exit 1
fi

echo "=========================================================="
echo "ADVERTENCIA: Esta operación sobrescribirá la base de datos actual."
read -p "¿Desea continuar? (s/N): " -r CONFIRM
if [[ ! "$CONFIRM" =~ ^[sS]$ ]]; then
  echo "Operación cancelada."
  exit 0
fi

echo "Restaurando base de datos desde $BACKUP_FILE..."
gunzip -c "$BACKUP_FILE" | docker exec -i linuxops-db psql -U linuxops_user -d linuxops_db

echo "[+] Restauración finalizada con éxito."

