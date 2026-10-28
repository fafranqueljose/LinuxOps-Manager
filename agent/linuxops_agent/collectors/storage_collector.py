"""
LinuxOps Agent — Recolector de Almacenamiento y Sistemas de Archivos
Recopila:
1. Unidades configuradas por usuarios en /etc/fstab (NFS, CIFS, discos adicionales).
2. Sistemas de archivos reales del sistema operativo.
3. Árbol jerárquico de directorios distinguiendo puntos de montaje reales vs directorios estándar.
"""

import json
import logging
import os
import re
import subprocess
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("linuxops.storage")

# Tipos de sistemas de archivos virtuales o pseudo-sistemas a excluir de unidades de usuario
PSEUDO_FSTYPES = {
    "proc", "sysfs", "devpts", "devtmpfs", "tmpfs", "cgroup", "cgroup2",
    "overlay", "mqueue", "hugetlbfs", "debugfs", "tracefs", "securityfs",
    "pstore", "bpf", "autofs", "fusectl", "configfs", "binfmt_misc",
    "ramfs", "efivarfs", "squashfs", "rpc_pipefs", "nfsd", "selinuxfs",
    "nsfs", "pipefs", "sockfs", "bdev"
}

# Puntos de montaje estándar del sistema operativo que NO son unidades añadidas por usuarios
SYSTEM_MOUNT_TARGETS = {
    "/", "/boot", "/boot/efi", "/boot/EFI", "/usr", "/usr/local"
}

# Máscara para ocultar contraseñas en opciones de montaje
PASSWORD_REGEX = re.compile(r'(password|pass|secret|token)=([^,]+)', re.IGNORECASE)
CREDENTIALS_REGEX = re.compile(r'(?:credentials|cred)=([^,]+)', re.IGNORECASE)
UID_REGEX = re.compile(r'uid=([^,]+)', re.IGNORECASE)
GID_REGEX = re.compile(r'gid=([^,]+)', re.IGNORECASE)
FILE_MODE_REGEX = re.compile(r'file_mode=([^,]+)', re.IGNORECASE)
DIR_MODE_REGEX = re.compile(r'dir_mode=([^,]+)', re.IGNORECASE)
UMASK_REGEX = re.compile(r'umask=([^,]+)', re.IGNORECASE)
DMASK_REGEX = re.compile(r'dmask=([^,]+)', re.IGNORECASE)
FMASK_REGEX = re.compile(r'fmask=([^,]+)', re.IGNORECASE)


def sanitize_mount_options(options: str) -> str:
    """Oculta contraseñas o tokens en texto plano dentro de la cadena de opciones."""
    if not options:
        return ""
    return PASSWORD_REGEX.sub(r'\1=***', options)


def extract_mount_options_metadata(options: str) -> Dict[str, Any]:
    """Extrae metadatos de opciones: credenciales (solo ruta), permisos y modo ro/rw."""
    if not options:
        return {
            "credentials_file": None,
            "permissions": None,
            "access_mode": "rw",
            "is_read_only": False,
            "sanitized_options": ""
        }

    # Ruta del archivo de credenciales (NUNCA leer su contenido)
    cred_match = CREDENTIALS_REGEX.search(options)
    credentials_file = cred_match.group(1).strip() if cred_match else None

    # Permisos
    perms: Dict[str, str] = {}
    for name, regex in [
        ("uid", UID_REGEX),
        ("gid", GID_REGEX),
        ("file_mode", FILE_MODE_REGEX),
        ("dir_mode", DIR_MODE_REGEX),
        ("umask", UMASK_REGEX),
        ("dmask", DMASK_REGEX),
        ("fmask", FMASK_REGEX),
    ]:
        m = regex.search(options)
        if m:
            perms[name] = m.group(1).strip()

    # Modo de acceso
    opts_list = [o.strip() for o in options.split(",")]
    is_ro = "ro" in opts_list
    access_mode = "ro" if is_ro else "rw"

    return {
        "credentials_file": credentials_file,
        "permissions": perms if perms else None,
        "access_mode": access_mode,
        "is_read_only": is_ro,
        "sanitized_options": sanitize_mount_options(options),
    }


def classify_user_mount(target: str, source: str, fstype: str) -> Tuple[str, str]:
    """
    Clasifica dinámicamente la unidad según TARGET, SOURCE y FSTYPE.
    Retorna (tipo_codigo, etiqueta_legible).
    """
    fstype_lower = (fstype or "").lower()
    source_lower = (source or "").lower()
    target_lower = (target or "").lower()

    # 1. NFS
    if fstype_lower in ("nfs", "nfs4") or (":" in source and not source.startswith("/dev")):
        return "nfs", "Compartición de red NFS"

    # 2. CIFS / SMB
    if fstype_lower in ("cifs", "smbfs") or source.startswith("//") or source.startswith(r"\\"):
        return "cifs", "Compartición de red CIFS/SMB"

    # 3. Discos / particiones adicionales locales
    known_block_fs = {"ext4", "ext3", "ext2", "xfs", "btrfs", "ntfs", "vfat", "fat", "f2fs", "zfs", "exfat"}
    is_block_source = (
        source.startswith("/dev/")
        or source_lower.startswith("uuid=")
        or source_lower.startswith("label=")
    )

    is_user_path = (
        target_lower.startswith("/data")
        or target_lower.startswith("/mnt")
        or target_lower.startswith("/srv")
        or target_lower.startswith("/storage")
        or target_lower.startswith("/backup")
        or target_lower.startswith("/disks")
        or target_lower.startswith("/media")
        or target_lower.startswith("/opt")
    )

    if (fstype_lower in known_block_fs or is_block_source) and (is_user_path or target not in SYSTEM_MOUNT_TARGETS):
        return "disk", "Disco o partición adicional"

    return "other", "Pendiente de clasificación"


class StorageCollector:
    @staticmethod
    def _run_findmnt(extra_args: List[str]) -> List[Dict[str, Any]]:
        """Ejecuta findmnt --json con los argumentos dados y retorna la lista plana de montajes."""
        cmd = ["findmnt", "--json", "--output", "TARGET,SOURCE,FSTYPE,OPTIONS"] + extra_args
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            if res.returncode == 0 and res.stdout.strip():
                data = json.loads(res.stdout)
                entries = []

                def _flatten(node: Dict[str, Any]):
                    flat_node = {
                        "target": node.get("target"),
                        "source": node.get("source"),
                        "fstype": node.get("fstype"),
                        "options": node.get("options", ""),
                    }
                    if flat_node["target"]:
                        entries.append(flat_node)
                    for child in node.get("children", []):
                        _flatten(child)

                for item in data.get("filesystems", []):
                    _flatten(item)
                return entries
        except Exception as e:
            logger.debug(f"findmnt no disponible o falló ({extra_args}): {e}")

        return []

    @staticmethod
    def _parse_fstab_fallback() -> List[Dict[str, Any]]:
        """Lectura de respaldo directa de /etc/fstab si findmnt --fstab falla."""
        entries = []
        if not os.path.exists("/etc/fstab"):
            return entries

        try:
            with open("/etc/fstab", "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    parts = line.split()
                    if len(parts) >= 3:
                        source = parts[0]
                        target = parts[1]
                        fstype = parts[2]
                        options = parts[3] if len(parts) >= 4 else "defaults"
                        entries.append({
                            "target": target,
                            "source": source,
                            "fstype": fstype,
                            "options": options,
                        })
        except Exception as e:
            logger.error(f"Error leyendo /etc/fstab: {e}")

        return entries

    @staticmethod
    def _get_live_mounts() -> Dict[str, Dict[str, Any]]:
        """Obtiene montajes activos actualmente en el kernel como diccionario {target: entry}."""
        live_list = StorageCollector._run_findmnt([])
        if live_list:
            return {entry["target"]: entry for entry in live_list if entry.get("target")}

        # Fallback a /proc/mounts si findmnt no funcionó
        live_dict = {}
        if os.path.exists("/proc/mounts"):
            try:
                with open("/proc/mounts", "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        parts = line.strip().split()
                        if len(parts) >= 4:
                            live_dict[parts[1]] = {
                                "target": parts[1],
                                "source": parts[0],
                                "fstype": parts[2],
                                "options": parts[3],
                            }
            except Exception as e:
                logger.error(f"Error leyendo /proc/mounts: {e}")
        return live_dict

    @staticmethod
    def _get_statvfs_capacity(path: str) -> Optional[Dict[str, Any]]:
        """Obtiene métricas de capacidad reales sin inventar ni simular."""
        try:
            # os.statvfs solo está disponible en sistemas tipo Unix/Linux
            if hasattr(os, "statvfs"):
                vfs = os.statvfs(path)
                total = vfs.f_blocks * vfs.f_frsize
                free = vfs.f_bfree * vfs.f_frsize
                available = vfs.f_bavail * vfs.f_frsize
                used = total - free
                pct = round((used / total) * 100, 1) if total > 0 else 0.0
                return {
                    "total_bytes": total,
                    "used_bytes": used,
                    "available_bytes": available,
                    "free_bytes": free,
                    "usage_percent": pct,
                }
        except Exception as e:
            logger.debug(f"statvfs falló para {path}: {e}")
        return None

    @classmethod
    def get_user_mounts(cls, live_mounts: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Sección 1: Unidades configuradas por usuarios en /etc/fstab.
        Aplica filtros estrictos, clasificación dinámica y extracción segura de opciones.
        """
        fstab_entries = cls._run_findmnt(["--fstab"])
        if not fstab_entries:
            fstab_entries = cls._parse_fstab_fallback()

        user_mounts = []
        for entry in fstab_entries:
            target = entry.get("target") or ""
            source = entry.get("source") or ""
            fstype = (entry.get("fstype") or "").lower()
            options = entry.get("options") or ""

            # Filtros de exclusión:
            # 1. Pseudo sistemas de archivos o swap
            if fstype in PSEUDO_FSTYPES or fstype == "swap" or target.lower() == "swap":
                continue
            if source.lower() == "none":
                continue

            # 2. Puntos estándar de arranque del sistema operativo
            if target in SYSTEM_MOUNT_TARGETS:
                continue

            # Clasificación dinámica
            type_code, type_label = classify_user_mount(target, source, fstype)

            # Extracción segura de opciones
            opts_meta = extract_mount_options_metadata(options)

            # Estado en tiempo real y capacidad
            status = "unmounted"
            capacity = None
            error_message = None

            if target in live_mounts:
                # Comprobar accesibilidad con statvfs
                cap = cls._get_statvfs_capacity(target)
                if cap is not None:
                    status = "mounted"
                    capacity = cap
                else:
                    # El montaje figura en el kernel pero no responde (e.g. NFS offline o permiso denegado)
                    status = "not_available"
                    error_message = "El punto de montaje no responde a solicitudes de estado I/O."
            else:
                status = "unmounted"

            user_mounts.append({
                "name": os.path.basename(target.rstrip("/")) or target,
                "target": target,
                "source": source,
                "fstype": fstype,
                "type": type_code,
                "type_label": type_label,
                "status": status,
                "is_read_only": opts_meta["is_read_only"],
                "access_mode": opts_meta["access_mode"],
                "credentials_file": opts_meta["credentials_file"],
                "permissions": opts_meta["permissions"],
                "options": opts_meta["sanitized_options"],
                "capacity": capacity,
                "error_message": error_message,
            })

        return user_mounts

    @classmethod
    def get_system_filesystems(cls, live_mounts: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Sección 2.1: Tarjetas de los sistemas de archivos reales del sistema.
        Incluye Disco Principal (/) y particiones reales montadas.
        """
        filesystems = []
        # Encontrar primero la raíz /
        root_entry = live_mounts.get("/")

        # Recorrer montajes en vivo filtrando virtuales
        for target, entry in sorted(live_mounts.items(), key=lambda x: (x[0] != "/", x[0])):
            fstype = (entry.get("fstype") or "").lower()
            source = entry.get("source") or ""

            # Excluir virtuales
            if fstype in PSEUDO_FSTYPES or fstype == "swap":
                continue
            if not source.startswith("/dev") and fstype not in {"ext4", "xfs", "btrfs", "zfs", "vfat"}:
                # Solo sistemas de archivos de bloque o raíz
                if target != "/":
                    continue

            cap = cls._get_statvfs_capacity(target)
            if not cap:
                continue

            name = "Disco Principal (/)" if target == "/" else f"Partición {target}"
            filesystems.append({
                "name": name,
                "mount_point": target,
                "device": source,
                "fstype": fstype,
                "total_bytes": cap["total_bytes"],
                "used_bytes": cap["used_bytes"],
                "available_bytes": cap["available_bytes"],
                "free_bytes": cap["free_bytes"],
                "usage_percent": cap["usage_percent"],
                "is_root": target == "/",
            })

        return filesystems

    @classmethod
    def get_directory_tree(cls, live_mounts: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        """
        Sección 2.2: Árbol de directorios del sistema Linux.
        Regla técnica crítica: compara os.stat(path).st_dev != os.stat(parent).st_dev
        para no duplicar capacidades totales de / en directorios normales.
        """
        root_path = "/"
        try:
            root_stat = os.stat(root_path)
            root_dev = root_stat.st_dev
        except Exception:
            root_dev = None

        root_cap = cls._get_statvfs_capacity(root_path)

        # Directorios estándar esperados en la raíz de un sistema Linux
        STANDARD_ROOT_DIRS = [
            "boot", "dev", "etc", "home", "mnt", "opt", "root", "run", "srv", "tmp", "usr", "var"
        ]

        def inspect_node(path: str, name: str, parent_dev: Optional[int], depth: int = 1) -> Dict[str, Any]:
            node_dev = None
            is_mount = False
            cap = None

            try:
                st = os.stat(path)
                node_dev = st.st_dev
                # Comprobación de dispositivo separado vs padre
                if parent_dev is not None and node_dev != parent_dev:
                    is_mount = True
                    cap = cls._get_statvfs_capacity(path)
            except Exception:
                pass

            children = []
            # Para el nivel 1 o 2, listar subdirectorios existentes sin recursión infinita
            if depth <= 2 and os.path.exists(path) and os.path.isdir(path):
                try:
                    entries = sorted(os.scandir(path), key=lambda e: e.name)
                    for item in entries:
                        if item.is_dir(follow_symlinks=False):
                            # Evitar entrar en /proc, /sys o directorios virtuales muy profundos
                            if path == "/" and item.name in {"proc", "sys"}:
                                children.append({
                                    "name": item.name,
                                    "path": f"/{item.name}",
                                    "is_mount_point": True,
                                    "device_type": "virtual_fs",
                                    "capacity": None,
                                    "children": [],
                                })
                                continue

                            child_path = os.path.join(path, item.name).replace("\\", "/")
                            # Si estamos en profundidad 2, solo inspeccionamos si es mountpoint o si tiene pocos items
                            if depth == 1:
                                children.append(inspect_node(child_path, item.name, node_dev, depth + 1))
                            elif depth == 2:
                                # Comprobar rápidamente si el subdirectorio es mountpoint
                                try:
                                    c_dev = os.stat(child_path).st_dev
                                    c_is_mount = (node_dev is not None and c_dev != node_dev)
                                    c_cap = cls._get_statvfs_capacity(child_path) if c_is_mount else None
                                    children.append({
                                        "name": item.name,
                                        "path": child_path,
                                        "is_mount_point": c_is_mount,
                                        "device_type": "filesystem" if c_is_mount else "directory",
                                        "capacity": c_cap,
                                        "children": [],
                                    })
                                except Exception:
                                    pass
                except (PermissionError, FileNotFoundError, OSError):
                    pass

            return {
                "name": name,
                "path": path,
                "is_mount_point": is_mount if path != "/" else True,
                "device_type": "root_filesystem" if path == "/" else ("filesystem" if is_mount else "directory"),
                "capacity": cap if path != "/" else root_cap,
                "children": children,
            }

        # Construir raíz
        root_node = inspect_node(root_path, "/", None, depth=1)

        # Si en Windows de desarrollo no existen /var, /boot, etc., proveer una jerarquía sintética coherente para testing
        if not root_node.get("children") and os.name == "nt":
            root_node["children"] = [
                {
                    "name": d,
                    "path": f"/{d}",
                    "is_mount_point": d in ("boot", "mnt"),
                    "device_type": "filesystem" if d in ("boot", "mnt") else "directory",
                    "capacity": root_cap if d in ("boot", "mnt") else None,
                    "children": [],
                }
                for d in STANDARD_ROOT_DIRS
            ]

        return root_node

    @classmethod
    def get_storage_overview(cls) -> Dict[str, Any]:
        """Punto de entrada unificado para la operación storage.overview."""
        live_mounts = cls._get_live_mounts()
        user_mounts = cls.get_user_mounts(live_mounts)
        system_filesystems = cls.get_system_filesystems(live_mounts)
        directory_tree = cls.get_directory_tree(live_mounts)

        return {
            "user_mounts": user_mounts,
            "system_filesystems": system_filesystems,
            "directory_tree": directory_tree,
        }


storage_collector = StorageCollector()

