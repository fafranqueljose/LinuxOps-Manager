# Despliegue y Configuración de Grafana Loki

## 1. Topología del Servicio

Loki se ejecuta en modo **monolítico autónomo** (`SingleProcess`) dentro del archivo `deploy/docker-compose.yml`, aislado en la red privada de Docker `linuxops-internal`.

### Especificación en Docker Compose:
```yaml
  loki:
    image: grafana/loki:3.0.0
    container_name: linuxops-loki
    restart: unless-stopped
    command: -config.file=/etc/loki/local-config.yaml -config.expand-env=true
    volumes:
      - ./loki/loki-config.yaml:/etc/loki/local-config.yaml:ro
      - loki_data:/loki
    networks:
      - linuxops-internal
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3100/ready || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

---

## 2. Configuración (`deploy/loki/loki-config.yaml`)

- **Multi-tenancy (`auth_enabled: true`)**:
  Obliga a incluir la cabecera `X-Scope-OrgID: linuxops` en todas las peticiones internas realizadas por el backend FastAPI, garantizando estricta segregación e indexación.
- **Esquema de Almacenamiento (TSDB v13)**:
  - Motor de índices: `tsdb` (Time Series Database optimizado para Loki 3.x).
  - Almacén de chunks: sistema de archivos local persistente configurado en `common.storage.filesystem` (`/loki/chunks`).
  - Período de indexación: fragmentos diarios de 24 horas con prefijo `index_`.
- **Retención y Compactación**:
  - `compactor.retention_enabled: true`
  - Período de retención predeterminado: 336 horas (14 días).
  - Intervalo de compactación: cada 10 minutos.
- **Límites de Ingestión**:
  - Ingestion rate: 16 MB/s con ráfaga hasta 32 MB/s.
  - Límite máximo de entradas devueltas por consulta: 5,000 registros.

---

## 3. Verificación del Estado de Salud

El backend monitorea la disponibilidad de Loki mediante el endpoint `/ready`:

```bash
# Dentro del contenedor o red interna:
curl -i http://loki:3100/ready
# Respuesta esperada:
# HTTP/1.1 200 OK
# ready
```
