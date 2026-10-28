"""
Pruebas Unitarias del Recolector de Almacenamiento (LinuxOps Agent)
Verifica:
- Filtrado estricto de sistemas virtuales y del SO (/etc/fstab).
- Clasificación dinámica de NFS, CIFS y Discos adicionales.
- Ocultación y sanitización de contraseñas en opciones de montaje.
- Extracción de ruta de credenciales sin revelar contenido.
- Lógica de detección de sistemas de archivos independientes vs directorios estándar.
"""

from unittest.mock import MagicMock, patch
import pytest

from linuxops_agent.collectors.storage_collector import (
    classify_user_mount,
    extract_mount_options_metadata,
    sanitize_mount_options,
    StorageCollector,
)


def test_sanitize_mount_options():
    raw = "rw,username=backup_user,password=SuperSecretPassword123,iocharset=utf8"
    sanitized = sanitize_mount_options(raw)
    assert "SuperSecretPassword123" not in sanitized
    assert "password=***" in sanitized
    assert "username=backup_user" in sanitized


def test_extract_mount_options_metadata():
    opts = "credentials=/etc/samba/smb-credentials,uid=1000,gid=1000,file_mode=0640,dir_mode=0750,ro"
    meta = extract_mount_options_metadata(opts)

    assert meta["credentials_file"] == "/etc/samba/smb-credentials"
    assert meta["is_read_only"] is True
    assert meta["access_mode"] == "ro"
    assert meta["permissions"] == {
        "uid": "1000",
        "gid": "1000",
        "file_mode": "0640",
        "dir_mode": "0750",
    }


def test_classify_user_mount():
    # NFS
    t1, l1 = classify_user_mount("/mnt/nfs_share", "192.168.1.50:/volume1/data", "nfs4")
    assert t1 == "nfs"
    assert "NFS" in l1

    # CIFS
    t2, l2 = classify_user_mount("/media/backup", "//192.168.1.100/backup", "cifs")
    assert t2 == "cifs"
    assert "CIFS" in l2

    # Disco adicional
    t3, l3 = classify_user_mount("/data", "/dev/sdb1", "ext4")
    assert t3 == "disk"
    assert "Disco" in l3

    # Disco adicional montado en /mnt/storage por UUID
    t4, l4 = classify_user_mount("/mnt/storage", "UUID=1234-5678-ABCD", "xfs")
    assert t4 == "disk"


def test_get_user_mounts_filters():
    mock_fstab = [
        # Sistema estándar - Debe filtrarse
        {"target": "/", "source": "/dev/sda2", "fstype": "ext4", "options": "defaults"},
        {"target": "/boot", "source": "/dev/sda1", "fstype": "ext4", "options": "defaults"},
        {"target": "/boot/efi", "source": "/dev/sda3", "fstype": "vfat", "options": "umask=0077"},
        {"target": "swap", "source": "/dev/sda4", "fstype": "swap", "options": "sw"},
        {"target": "/tmp", "source": "tmpfs", "fstype": "tmpfs", "options": "defaults"},

        # Unidades añadidas por el usuario - Deben incluirse
        {"target": "/mnt/nas", "source": "nas.local:/shares/media", "fstype": "nfs", "options": "rw,soft"},
        {"target": "/mnt/win_share", "source": "//srv/share", "fstype": "cifs", "options": "credentials=/etc/cred.conf,password=secret,uid=1000"},
        {"target": "/data", "source": "/dev/sdb1", "fstype": "xfs", "options": "defaults"},
    ]

    mock_live = {
        "/": {"target": "/", "source": "/dev/sda2", "fstype": "ext4"},
        "/data": {"target": "/data", "source": "/dev/sdb1", "fstype": "xfs"},
    }

    with patch.object(StorageCollector, "_run_findmnt", return_value=mock_fstab):
        with patch.object(StorageCollector, "_get_statvfs_capacity") as mock_statvfs:
            mock_statvfs.side_effect = lambda target: {
                "total_bytes": 100000000000,
                "used_bytes": 40000000000,
                "available_bytes": 60000000000,
                "free_bytes": 60000000000,
                "usage_percent": 40.0,
            } if target == "/data" else None

            user_mounts = StorageCollector.get_user_mounts(mock_live)

            assert len(user_mounts) == 3
            targets = [m["target"] for m in user_mounts]
            assert "/mnt/nas" in targets
            assert "/mnt/win_share" in targets
            assert "/data" in targets

            # / y /boot no deben estar presentes
            assert "/" not in targets
            assert "/boot" not in targets

            # Estado en vivo y capacidad
            data_mount = next(m for m in user_mounts if m["target"] == "/data")
            assert data_mount["status"] == "mounted"
            assert data_mount["capacity"] is not None
            assert data_mount["capacity"]["usage_percent"] == 40.0

            # Win share no montada
            win_mount = next(m for m in user_mounts if m["target"] == "/mnt/win_share")
            assert win_mount["status"] == "unmounted"
            assert win_mount["capacity"] is None
            assert "secret" not in win_mount["options"]
            assert win_mount["credentials_file"] == "/etc/cred.conf"

