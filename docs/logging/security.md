# Seguridad, mTLS y Redacción de Secretos en Logs

## 1. Sanitización Automática de Secretos

Para evitar la fuga inadvertida de credenciales en el almacenamiento y visualización de logs, tanto el **Agente** (`linuxops_agent.security.redactor`) como el **Backend** (`app.core.redactor`) aplican un pipeline de sanitización con expresiones regulares optimizadas:

1. **Claves Privadas PEM**:
   Reemplaza bloques completos `-----BEGIN [A-Z0-9_\s]+ PRIVATE KEY-----...` por `[REDACTED_PRIVATE_KEY]`.
2. **Credenciales en URIs**:
   Detecta esquemas `protocol://user:password@host` y oculta la contraseña (`protocol://user:***REDACTED***@host`).
3. **Tokens de Autorización Bearer**:
   Oculta tokens JWT o tokens de sesión en cabeceras (`Bearer ***REDACTED_TOKEN***`).
4. **Campos Sensibles en JSON y Clave=Valor**:
   Detecta claves como `password`, `secret`, `api_key`, `token`, `access_token`, `client_secret` y enmascara su valor por `***REDACTED***`.

---

## 2. Autenticación y Autorización mTLS

- **Canal Seguro**:
  El envío de logs hacia el endpoint `/api/v1/logs/ingest` requiere certificados de cliente emitidos y firmados por la CA interna de LinuxOps Manager (`/etc/linuxops/pki/ca.crt`).
- **Validación de Identidad**:
  El backend contrasta la huella digital SHA-256 (`cert_fingerprint_sha256`) o número de serie del certificado con la base de datos para confirmar que el agente está activo y no ha sido revocado administrativamente.
- **Segregación Multi-Tenant**:
  Loki corre con `auth_enabled: true` forzando la cabecera `X-Scope-OrgID: linuxops` en todas las interacciones. Los accesos son gestionados únicamente a través de la capa de API de LinuxOps.

---

## 3. Matriz de Permisos RBAC para Logs

| Permiso | Módulo | Descripción |
| :--- | :--- | :--- |
| `logs:read` | `logs` | Consultar y filtrar logs centralizados en tiempo real |
| `logs:export` | `logs` | Descargar y exportar registros en formato CSV, JSON o TXT |
| `logs:manage` | `logs` | Modificar configuración y cuotas de retención de logs |

Todos los accesos y descargas de logs son registrados en la cadena SHA-256 de auditoría del sistema.

