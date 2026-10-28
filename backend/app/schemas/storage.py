"""
LinuxOps Manager — Esquemas Pydantic para el Módulo de Almacenamiento
Define las estructuras para unidades de usuario, sistemas de archivos y árbol de directorios.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class StorageCapacityOut(BaseModel):
    """Métricas cuantitativas de espacio de almacenamiento."""
    total_bytes: int = Field(0, description="Capacidad total en bytes")
    used_bytes: int = Field(0, description="Espacio utilizado en bytes")
    available_bytes: int = Field(0, description="Espacio disponible para usuarios sin privilegios")
    free_bytes: int = Field(0, description="Espacio libre total en bytes")
    usage_percent: float = Field(0.0, description="Porcentaje de uso (0.0 - 100.0)")


class UserMountOut(BaseModel):
    """Unidad o sistema de archivos configurado por usuarios en /etc/fstab."""
    name: str = Field(..., description="Nombre descriptivo de la unidad")
    target: str = Field(..., description="Punto de montaje")
    source: str = Field(..., description="Origen o dispositivo")
    fstype: str = Field(..., description="Tipo de sistema de archivos (ej: nfs, cifs, ext4)")
    type: str = Field(..., description="Código de clasificación: nfs, cifs, disk, other")
    type_label: str = Field(..., description="Etiqueta legible de clasificación")
    status: str = Field(..., description="Estado en tiempo real: mounted, unmounted, not_available, error")
    is_read_only: bool = Field(False, description="Indica si está montado o configurado en solo lectura")
    access_mode: str = Field("rw", description="Modo de acceso: rw o ro")
    credentials_file: Optional[str] = Field(None, description="Ruta del archivo de credenciales (sin contenido)")
    permissions: Optional[Dict[str, str]] = Field(None, description="Permisos de montaje extraídos (uid, gid, etc.)")
    options: Optional[str] = Field("", description="Opciones de montaje sanitizadas sin contraseñas")
    capacity: Optional[StorageCapacityOut] = Field(None, description="Capacidad si está montada y disponible")
    error_message: Optional[str] = Field(None, description="Mensaje de error si la unidad falló al consultar")


class SystemFilesystemOut(BaseModel):
    """Sistema de archivos real montado en el sistema (ej: Disco Principal /, /boot)."""
    name: str = Field(..., description="Nombre del disco o partición (ej: Disco Principal (/))")
    mount_point: str = Field(..., description="Punto de montaje")
    device: str = Field(..., description="Dispositivo de bloque asociado")
    fstype: str = Field(..., description="Tipo de sistema de archivos")
    total_bytes: int = Field(0, description="Capacidad total en bytes")
    used_bytes: int = Field(0, description="Espacio utilizado en bytes")
    available_bytes: int = Field(0, description="Espacio disponible en bytes")
    free_bytes: int = Field(0, description="Espacio libre en bytes")
    usage_percent: float = Field(0.0, description="Porcentaje de uso")
    is_root: bool = Field(False, description="Indica si es el disco principal /")


class DirectoryTreeNodeOut(BaseModel):
    """Nodo en el árbol jerárquico de directorios del sistema Linux."""
    name: str = Field(..., description="Nombre del directorio")
    path: str = Field(..., description="Ruta absoluta")
    is_mount_point: bool = Field(False, description="Verdadero si tiene un st_dev diferente a su padre")
    device_type: str = Field("directory", description="Tipo de dispositivo: root_filesystem, filesystem, directory, virtual_fs")
    capacity: Optional[StorageCapacityOut] = Field(None, description="Métricas de capacidad solo si es un filesystem propio")
    children: List["DirectoryTreeNodeOut"] = Field(default_factory=list, description="Subdirectorios inmediatos")


class StorageOverviewOut(BaseModel):
    """Resumen completo del almacenamiento del servidor remoto."""
    user_mounts: List[UserMountOut] = Field(default_factory=list, description="Unidades configuradas por usuarios")
    system_filesystems: List[SystemFilesystemOut] = Field(default_factory=list, description="Sistemas de archivos del SO")
    directory_tree: DirectoryTreeNodeOut = Field(..., description="Árbol jerárquico de directorios del sistema")

