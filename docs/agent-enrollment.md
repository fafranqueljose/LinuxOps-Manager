# Protocolo de Incorporación Segura y mTLS del Agente

Este documento describe el flujo criptográfico de incorporación (enrollment), autenticación mutua y ciclo de vida de los certificados en **LinuxOps Manager**.

---

## 1. Principios de Diseño
- **Claves Privadas Aisladas**: La clave privada RSA del agente se genera localmente en el servidor administrado y **nunca** se transmite a través de la red ni se expone al backend.
- **Tokens de Un Solo Uso**: El registro utiliza tokens efímeros (caducidad por defecto: 30 minutos). El backend solo almacena el hash SHA-256 del token en la base de datos.
- **Identidad mTLS Individual**: Cada agente dispone de un certificado X.509 de cliente único emitido por la CA interna de LinuxOps Manager, cuyo Common Name (CN) corresponde al identificador `agent-<SERVER_ID>`.
- **Conexión Saliente**: El agente inicia la conexión hacia el servidor central. No es necesario abrir puertos de entrada en el servidor remoto ni exponer interfaces SSH o Docker TCP.

---

## 2. Diagrama de Secuencia del Handshake

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Administrador
    participant UI as Consola Web
    participant Central as Backend Central / PKI
    participant Host as Servidor Administrado
    participant Agent as LinuxOps Agent

    Admin->>UI: Registra nuevo servidor
    UI->>Central: POST /api/v1/servers (name="srv-app01")
    Central->>Central: Genera token un-solo-uso (32 bytes) y calcula SHA-256
    Central-->>UI: Devuelve token y comando de instalación
    Admin->>Host: Ejecuta script de instalación (curl ... | bash)
    Host->>Agent: Inicia proceso de instalación
    Agent->>Agent: Genera par de claves RSA 3072 bits localmente
    Agent->>Agent: Genera CSR X.509 con CN="agent-<SERVER_ID>"
    Agent->>Central: POST /api/v1/agents/enroll (token, csr_pem, os_info)
    Central->>Central: Valida token (hash, no usado, no caducado)
    Central->>Central: Firma CSR con CA Raíz interna (validez 365 días)
    Central->>Central: Marca token como usado y guarda serial + fingerprint
    Central-->>Agent: Devuelve agent.crt y ca.crt
    Agent->>Agent: Guarda certificados en /etc/linuxops-agent/certs/
    Agent->>Host: Inicia servicio systemd linuxops-agent
    Agent->>Central: Abre conexión WebSocket saliente wss://... con mTLS
    Central-->>Agent: Valida certificado mTLS y acepta conexión
    Agent->>Central: Envía primer heartbeat con métricas reales
    Central->>UI: Servidor cambia de estado a ONLINE
```

---

## 3. Revocación de Agentes

Si un servidor es retirado o comprometido, un administrador con permiso `agents:revoke` puede revocarlo desde la interfaz:

1. Se ejecuta `POST /api/v1/agents/{agent_id}/revoke`.
2. El backend marca el certificado como revocado (`is_revoked = True`) y guarda la marca de tiempo y el motivo.
3. El `AgentGateway` cierra inmediatamente la conexión WebSocket activa con código de cierre de política `1008`.
4. Si el agente intenta reconectarse, el backend rechaza la conexión durante la verificación de identidad.
5. El servidor pasa al estado **Revocado** en el inventario.

