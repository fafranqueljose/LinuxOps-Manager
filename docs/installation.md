# Guía de Instalación y Despliegue — LinuxOps Manager

Este documento detalla el procedimiento para desplegar la plataforma central de LinuxOps Manager y conectar servidores Linux administrados.

---

## 1. Requisitos Previos

### Servidor Central (Plataforma de Control)
- **Sistema Operativo**: Servidor Linux (Ubuntu 22.04+, Debian 12+, RHEL/Rocky 9+).
- **Herramientas**: Docker Engine (24.0+) y Docker Compose v2.
- **Puertos de Red**:
  - `80/TCP`: Redirección HTTP a HTTPS.
  - `443/TCP`: Interfaz web (HTTPS) y punto de entrada para WebSocket seguro de agentes (`/api/v1/ws/agent/*`).
- **Recursos Mínimos**: 2 vCPU, 2 GB de RAM, 20 GB de almacenamiento SSD.

### Servidores Administrados (Nodos Remotos)
- **Distribuciones Soportadas**:
  - Ubuntu (20.04, 22.04, 24.04)
  - Debian (11, 12)
  - Red Hat Enterprise Linux / Rocky Linux / AlmaLinux (8, 9)
- **Requisitos de Software**:
  - Python 3.9 o superior.
  - `systemd` como gestor de inicio.
  - Docker Engine instalado (si se desea administrar contenedores).
- **Conectividad**: Acceso saliente hacia el servidor central en el puerto `443/TCP`. **No requiere abrir puertos entrantes en el servidor remoto.**

---

## 2. Despliegue del Servidor Central con Docker Compose

### Paso 1: Clonar el Repositorio
```bash
git clone https://github.com/organization/linuxops-manager.git
cd linuxops-manager
```

### Paso 2: Configurar las Variables de Entorno
Copie la plantilla de variables de entorno:
```bash
cp .env.example .env
```
Edite `.env` y configure claves seguras:
- Genere claves criptográficas con:
  ```bash
  openssl rand -hex 32
  ```
- Establezca `SECRET_KEY`, `POSTGRES_PASSWORD`, `ENCRYPTION_KEY` y `APP_URL`.

### Paso 3: Generar Certificados TLS para Nginx
Para entornos de prueba o desarrollo:
```bash
bash scripts/generate-dev-certs.sh
```
*(En entornos de producción, monte certificados emitidos por una AC corporativa o Let's Encrypt en `deploy/nginx/certs/server.crt` y `deploy/nginx/certs/server.key`)*.

### Paso 4: Iniciar los Servicios
```bash
cd deploy
docker compose up -d --build
```

Verifique que todos los contenedores (`linuxops-db`, `linuxops-backend`, `linuxops-frontend`, `linuxops-proxy`) estén saludables:
```bash
docker compose ps
```

---

## 3. Primer Acceso y Credenciales Iniciales

1. Abra su navegador web y navegue a `https://<IP_O_DOMINIO_DEL_SERVIDOR>`.
2. Inicie sesión con el superadministrador inicial creado durante la inicialización:
   - **Usuario**: `admin`
   - **Contraseña temporal**: `LinuxOpsAdmin_2026!ChangeMe`
3. **Paso crítico**: Diríjase inmediatamente a la configuración de usuario y cambie su contraseña. Active la autenticación multifactor (MFA TOTP) mediante Google Authenticator u otra app compatible.

---

## 4. Instalación del Agente en Servidores Remotos

1. En la consola web de LinuxOps Manager, navegue a **Servidores** y haga clic en **Incorporar Servidor**.
2. Ingrese el nombre del servidor (ej. `srv-db-prod01`).
3. El sistema generará un token de incorporación de un solo uso con el comando curl correspondiente:
   ```bash
   curl -sSL https://linuxops.local/install-agent.sh | sudo bash -s -- \
     --server-url https://linuxops.local \
     --token <TOKEN_DE_UN_SOLO_USO> \
     --server-id <UUID_DEL_SERVIDOR>
   ```
4. Ejecute el comando en el servidor Linux remoto con privilegios de root (`sudo`).
5. El instalador:
   - Crea el usuario sin privilegios `linuxops-agent`.
   - Genera localmente el par de claves RSA (la clave privada nunca sale del host).
   - Negocia el certificado mTLS con el backend.
   - Configura las reglas sudoers mínimas para `systemctl`.
   - Habilita y arranca el servicio systemd `linuxops-agent`.
6. En cuestión de segundos, el servidor aparecerá con estado **Online** en el panel de control.

