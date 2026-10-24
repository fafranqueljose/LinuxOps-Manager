# Procedimientos de Recuperación ante Desastres — LinuxOps Manager

Este documento define la estrategia de copias de seguridad, restauración y recuperación de la plataforma central y sus identidades criptográficas.

---

## 1. Política de Respaldo

LinuxOps Manager requiere respaldar dos componentes fundamentales:
1. **Base de Datos PostgreSQL**: Contiene el inventario de servidores, usuarios, sesiones, configuración, eventos, tareas y la cadena de auditoría inmutable.
2. **Volumen de la CA Interna (`pki_data`)**: Contiene la clave privada raíz (`ca.key`) y el certificado público (`ca.crt`) de la Autoridad Certificadora que valida todos los agentes mTLS.

---

## 2. Ejecución de Copias de Seguridad

### Respaldo de la Base de Datos
Utilice el script automatizado provisto en el repositorio:
```bash
bash scripts/backup-db.sh
```
El archivo comprimido se almacenará en el directorio `backups/linuxops_backup_<TIMESTAMP>.sql.gz`.

### Respaldo de la Clave Raíz de la CA
```bash
docker run --rm \
  -v linuxops-manager_pki_data:/pki:ro \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/ca_backup_$(date +%Y%m%d).tar.gz -C /pki .
```
> [!CAUTION]
> El archivo `ca_backup_*.tar.gz` contiene la clave privada raíz de la CA. Debe almacenarse en un almacén de secretos seguro cifrado (Vault, AWS Secrets Manager, etc.) con acceso restringido.

---

## 3. Procedimiento de Restauración ante Desastres

En caso de fallo catastrófico del host central:

### Paso 1: Levantar los Contenedores Limpios
```bash
cd deploy
docker compose up -d db
```

### Paso 2: Restaurar los Certificados de la CA
```bash
docker run --rm \
  -v linuxops-manager_pki_data:/pki \
  -v $(pwd)/backups:/backup \
  alpine sh -c "tar xzf /backup/ca_backup_<FECHA>.tar.gz -C /pki"
```

### Paso 3: Restaurar la Base de Datos
```bash
bash scripts/restore-db.sh backups/linuxops_backup_<TIMESTAMP>.sql.gz
```

### Paso 4: Iniciar la Plataforma Completa
```bash
docker compose up -d
```

### Paso 5: Verificación de Integridad
Una vez restaurado el sistema:
1. Verifique el healthcheck: `curl -k https://localhost/health`.
2. Inicie sesión en la consola web.
3. Diríjase a **Auditoría** y presione **Verificar Integridad Criptográfica**. La verificación debe reportar que la cadena de hashes SHA-256 está completa e intacta.

