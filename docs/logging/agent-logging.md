# Operación del Recolector y Buffer en el Agente LinuxOps

## 1. Componentes del Agente

El agente autónomo incorpora tres submódulos dedicados al procesamiento de registros:

1. **`LogCollector` (`linuxops_agent.collectors.log_collector`)**:
   - **Docker**: Utiliza el SDK oficial `docker-py` (`container.logs(timestamps=True, since=...)`). No accede directamente a `/var/lib/docker/containers/`, garantizando compatibilidad con usuarios sin privilegios y sockets seguros.
   - **systemd**: Utiliza `journalctl -u <unit> --output=json` con sudoers específico sin contraseña (`/etc/sudoers.d/linuxops-agent`).
   - **Checkpoints**: Mantiene cursores de lectura por cada contenedor y unidad en la tabla `checkpoints` para prevenir relecturas duplicadas tras reinicios.

2. **`LogBuffer` (`linuxops_agent.collectors.log_buffer`)**:
   - Base de datos SQLite local persistente en modo WAL (`PRAGMA journal_mode=WAL`).
   - Ubicación predeterminada: `/var/lib/linuxops-agent/log_buffer.db`.
   - Límite de tamaño configurable: `LINUXOPS_LOG_MAX_BUFFER_MB` (por defecto 256 MB).
   - Política FIFO ante sobrecupo: elimina los registros más antiguos no confirmados para asegurar que el disco nunca se llene por acumulación de logs.

3. **`LogShipper` (`linuxops_agent.collectors.log_shipper`)**:
   - Bucle asíncrono no bloqueante en hilo dedicado (`asyncio.to_thread`).
   - Consume lotes de hasta 100 registros y los despacha mediante HTTPS POST a `/api/v1/logs/ingest`.
   - Presenta certificado de cliente mTLS (`agent.crt` y `agent.key`).
   - Purga registros del buffer local únicamente tras recibir código HTTP 200/202 del backend.
   - Aplica retroceso exponencial con fluctuación aleatoria (jitter) ante indisponibilidad del servidor.

---

## 2. Variables de Entorno del Agente (`agent.env`)

| Variable | Valor Predeterminado | Descripción |
| :--- | :--- | :--- |
| `LINUXOPS_LOGS_ENABLED` | `true` | Habilita o deshabilita la recolección de logs |
| `LINUXOPS_LOG_BUFFER_PATH` | `/var/lib/linuxops-agent/log_buffer.db` | Ruta del archivo SQLite del buffer |
| `LINUXOPS_LOG_BATCH_SIZE` | `100` | Tamaño de lote por cada envío HTTPS |
| `LINUXOPS_LOG_FLUSH_INTERVAL` | `5` | Intervalo en segundos para despachar logs pendientes |
| `LINUXOPS_LOG_COLLECT_INTERVAL` | `10` | Intervalo en segundos para recolectar Docker y systemd |
| `LINUXOPS_LOG_MAX_BUFFER_MB` | `256` | Límite máximo en MB del archivo de buffer local |

