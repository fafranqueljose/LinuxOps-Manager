# Integración Backend y Endpoints de Logs — LinuxOps Manager

## 1. Endpoints REST v1 (`/api/v1/logs`)

### 1.1 Ingestión de Lotes de Logs
- **Ruta**: `POST /api/v1/logs/ingest`
- **Autenticación**: Validación mTLS de agente o cabecera `X-SSL-Client-Fingerprint` inyectada por el proxy inverso.
- **Entrada (`LogBatchIngestIn`)**:
  ```json
  {
    "server_id": "a1b2c3d4-0000-0000-0000-000000000000",
    "batch_id": "99b384ff-b4e2-4751-a957-c50f8361b369",
    "sent_at": "2026-11-04T12:00:00Z",
    "records": [
      {
        "timestamp": "2026-11-04T12:00:00Z",
        "source": "docker",
        "service": "api-gateway",
        "level": "info",
        "stream": "stdout",
        "message": "Petición procesada en 12ms",
        "metadata": { "container_id": "ab1234cd" }
      }
    ]
  }
  ```
- **Respuesta**: HTTP 202 Accepted con `accepted_count` y `batch_id`.

---

### 1.2 Consulta de Logs (`query_range`)
- **Ruta**: `GET /api/v1/logs/query`
- **Permiso Requerido**: `logs:read`
- **Parámetros**:
  - `server_id`: (Opcional) UUID del servidor.
  - `source`: `docker`, `systemd`, `syslog`, `all`.
  - `service`: Nombre del contenedor o servicio.
  - `level`: `debug`, `info`, `notice`, `warning`, `error`, `critical`.
  - `search`: Texto a filtrar.
  - `start_time`, `end_time`: Ventana temporal en formato ISO UTC.
  - `limit`: Cantidad de resultados (1 a 2,000).
  - `direction`: `BACKWARD` (más recientes primero) o `FORWARD`.
- **RBAC**: Si el usuario no es superadmin, se valida acceso a nivel de servidor individual (`ResourcePermission`).

---

### 1.3 Exportación de Registros
- **Ruta**: `GET /api/v1/logs/export`
- **Permiso Requerido**: `logs:export`
- **Formatos Disponibles**: `csv`, `json`, `txt`.
- **Auditoría**: Genera automáticamente un evento en la tabla `audit_logs` con operación `logs.export`, asegurando trazabilidad forense.

---

### 1.4 Fuentes Dinámicas
- **Ruta**: `GET /api/v1/logs/sources`
- **Permiso Requerido**: `logs:read`
- **Retorno**: Lista de contenedores y servicios activos obtenidos dinámicamente desde las etiquetas indexadas en Loki.

---

### 1.5 Estado del Motor
- **Ruta**: `GET /api/v1/logs/health`
- **Retorno**: Estado de preparación (`ready`, `unhealthy`, `unavailable`) de Loki en la red interna.

