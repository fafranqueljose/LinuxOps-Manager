"""
Pruebas del Módulo de Almacenamiento (Backend)
Verifica:
- Validación de esquemas Pydantic (StorageOverviewOut, UserMountOut, SystemFilesystemOut, DirectoryTreeNodeOut).
- Sanitización de opciones y estructura del árbol de directorios sin duplicación de capacidades.
"""

from uuid import uuid4
import pytest
from app.schemas.storage import (
    DirectoryTreeNodeOut,
    StorageCapacityOut,
    StorageOverviewOut,
    SystemFilesystemOut,
    UserMountOut,
)


def test_storage_schemas_validation():
    # Esquema de Capacidad
    cap = StorageCapacityOut(
        total_bytes=107374182400,
        used_bytes=53687091200,
        available_bytes=53687091200,
        free_bytes=53687091200,
        usage_percent=50.0,
    )
    assert cap.usage_percent == 50.0

    # Unidad de Usuario
    mount = UserMountOut(
        name="backup",
        target="/mnt/backup",
        source="//192.168.1.100/backup",
        fstype="cifs",
        type="cifs",
        type_label="Compartición de red CIFS/SMB",
        status="mounted",
        is_read_only=False,
        access_mode="rw",
        credentials_file="/etc/samba/cred",
        permissions={"uid": "1000", "gid": "1000"},
        options="rw,credentials=/etc/samba/cred,password=***",
        capacity=cap,
    )
    assert mount.status == "mounted"
    assert mount.credentials_file == "/etc/samba/cred"
    assert "password=***" in mount.options

    # Sistema de archivos del SO
    sys_fs = SystemFilesystemOut(
        name="Disco Principal (/)",
        mount_point="/",
        device="/dev/sda2",
        fstype="ext4",
        total_bytes=107374182400,
        used_bytes=32212254720,
        available_bytes=75161927680,
        free_bytes=75161927680,
        usage_percent=30.0,
        is_root=True,
    )
    assert sys_fs.is_root is True

    # Árbol de directorios
    tree = DirectoryTreeNodeOut(
        name="/",
        path="/",
        is_mount_point=True,
        device_type="root_filesystem",
        capacity=cap,
        children=[
            DirectoryTreeNodeOut(
                name="var",
                path="/var",
                is_mount_point=False,
                device_type="directory",
                capacity=None,  # No duplica capacidad de raíz
                children=[],
            ),
            DirectoryTreeNodeOut(
                name="boot",
                path="/boot",
                is_mount_point=True,
                device_type="filesystem",
                capacity=StorageCapacityOut(
                    total_bytes=1073741824,
                    used_bytes=214748364,
                    available_bytes=858993460,
                    free_bytes=858993460,
                    usage_percent=20.0,
                ),
                children=[],
            ),
        ],
    )

    overview = StorageOverviewOut(
        user_mounts=[mount],
        system_filesystems=[sys_fs],
        directory_tree=tree,
    )

    assert len(overview.user_mounts) == 1
    assert len(overview.system_filesystems) == 1
    assert overview.directory_tree.children[0].capacity is None
    assert overview.directory_tree.children[1].capacity is not None

