# Manual de Operaciones y Mantenimiento — LinuxOps Manager

Este documento contiene los procedimientos operativos para la administración, supervisión y resolución de problemas de LinuxOps Manager.

---

## 1. Monitoreo de Servicios Centrales

### Comprobar Estado de Contenedores
```bash
cd deploy
docker compose ps
```

### Consultar Registros en Tiempo Real
```bash
# Registros del Backend
docker compose logs -f backend

# Registros del Reverse Proxy Nginx
docker compose logs -f proxy

# Registros de PostgreSQL
docker compose logs -f db
```

### Healthcheck Manual
```bash
curl -k https://localhost/health
```
Respuesta esperada:
```json
{
  "status": "healthy",
  "app": "LinuxOps Manager",
  "environment": "production",
  "timestamp": "2026-10-24T12:00:00.000000"
}
```

---

## 2. Administración del Agente en Servidores Remotos

### Consultar Estado del Servicio
```bash
systemctl status linuxops-agent
```

### Reiniciar el Agente
```bash
sudo systemctl restart linuxops-agent
```

### Ver Registros del Agente con Journalctl
```bash
journalctl -u linuxops-agent -f
```

---

## 3. Rotación de Certificados de Agentes

Los certificados de cliente mTLS se emiten con una validez de 365 días. Para rotar el certificado de un agente antes de su vencimiento:

1. Genere un nuevo token de incorporación para el servidor desde la consola web.
2. Ejecute en el servidor remoto:
   ```bash
   sudo /opt/linuxops-agent/venv/bin/python /opt/linuxops-agent/enroll.py \
     --server-url https://linuxops.local \
     --token <NUEVO_TOKEN> \
     --server-id <SERVER_ID>
   ```
3. Reinicie el servicio:
   ```bash
   sudo systemctl restart linuxops-agent
   ```

