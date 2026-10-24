# Modelo de Seguridad y DevSecOps — LinuxOps Manager

Este documento detalla los controles de seguridad, políticas de acceso y mitigación de amenazas implementadas en la plataforma.

---

## 1. Control de Acceso Basado en Roles (RBAC Granular)

LinuxOps Manager implementa control de acceso estricto tanto en el Backend Central como en la política local del Agente.

### Roles Predefinidos del Sistema

| Rol | Descripción | Permisos Clave |
| :--- | :--- | :--- |
| **Superadministrador** | Control total de la plataforma | Gestión de usuarios, roles, políticas globales, revocación de certificados y auditoría completa. |
| **Administrador de Infraestructura** | Operaciones avanzadas | Administración de servidores, Docker, systemd, apertura de terminal PTY y consulta de auditoría. |
| **Operador** | Operaciones cotidianas | Monitoreo, lectura de logs, reinicio de contenedores y servicios autorizados. **Sin acceso a terminal.** |
| **Auditor** | Cumplimiento y seguridad | Lectura de inventario, consulta de auditoría y verificación de integridad criptográfica SHA-256. |
| **Solo Lectura** | Visualización | Consulta de dashboards, métricas y estado de recursos sin permisos de modificación. |

---

## 2. Auditoría Inmutable y Cadena de Integridad (Tamper-Evident)

No se asume que una base de datos relacional ordinaria sea inmutable si un superusuario de base de datos puede modificarla. Por ello, LinuxOps Manager implementa:

1. **Encadenamiento Criptográfico SHA-256**: Cada registro de auditoría almacena:
   - `prev_hash`: El hash de la entrada anterior.
   - `entry_hash`: El hash calculado a partir de `prev_hash + correlation_id + user_id + operation + resource_type + status + created_at + details`.
2. **Verificación Automatizada**: El endpoint `GET /api/v1/audit/verify-integrity` recorre toda la cadena desde el bloque génesis y alerta de forma inmediata si algún registro ha sido modificado, eliminado o insertado fuera de orden.
3. **Ofuscación de Secretos**: La función `sanitize_audit_payload` elimina y reemplaza automáticamente con `[REDACTED]` cualquier campo que contenga contraseñas, tokens, credenciales, claves privadas o cadenas de conexión.

---

## 3. Seguridad del Acceso a Docker

- **Sin Exposición de Sockets por TCP**: `/var/run/docker.sock` nunca se expone a través de la red ni se mapea dentro del contenedor del backend.
- **Ofuscación de Variables de Entorno**: Al inspeccionar un contenedor, el agente filtra automáticamente cualquier variable cuyo nombre coincida con patrones sensibles (`PASSWORD`, `SECRET`, `TOKEN`, `KEY`, `CREDENTIAL`, `DSN`, `AUTH`).
- **Validación de Identificadores**: Los identificadores de contenedor se validan contra expresiones regulares para evitar inyecciones.

---

## 4. Seguridad de Servicios systemd

- **Prohibición de `shell=True`**: Ningún comando de servicio se ejecuta mediante un shell interactivo. Todos los llamados utilizan listas de argumentos delimitadas.
- **Validación Estricta de Nombres**: Se exige que el nombre de la unidad cumpla con la expresión regular `^[a-zA-Z0-9@_.-]+\.service$`.
- **Reglas Sudoers Restrictivas**: El agente opera bajo el usuario de sistema `linuxops-agent` y solo tiene privilegios sudo para el binario `/usr/bin/systemctl` con los verbos autorizados (`start`, `stop`, `restart`, `reload`, `show`, `status`).

---

## 5. Seguridad de la Terminal Remota (PTY)

- **Deshabilitada por Defecto**: Requiere permiso explícito `terminal:access`.
- **Identidad no root**: Las pseudoterminales se abren bajo el usuario `linuxops-pty` sin privilegios administrativos.
- **Límites de Concurrencia y Tiempo**: Máximo 3 sesiones simultáneas por usuario y cierre automático por inactividad tras 10 minutos.
- **Auditoría de Sesión**: Se registra el usuario, servidor, hora de inicio, hora de finalización, duración e IP de origen de cada sesión de terminal.

