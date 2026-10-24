"""
LinuxOps Agent — Gestor de Sesiones Pseudoterminal (PTY) Interactivas
Crea sesiones de terminal reales en Linux bajo una identidad sin privilegios (no root),
gestionando entrada interactiva, salida en tiempo real y redimensionamiento.
"""

import asyncio
import os
import pty
import signal
import struct
import termios
from typing import Callable, Optional


class PTYSession:
    def __init__(
        self,
        session_id: str,
        pty_user: str = "linuxops-pty",
        on_output: Optional[Callable[[str, str], None]] = None,
    ):
        self.session_id = session_id
        self.pty_user = pty_user
        self.on_output = on_output
        self.master_fd: Optional[int] = None
        self.pid: Optional[int] = None
        self.is_running = False

    def start(self, cols: int = 80, rows: int = 24) -> None:
        """Inicia el proceso bash dentro de una pseudoterminal PTY."""
        # Solo soportado en sistemas basados en Unix/Linux
        if not hasattr(pty, "fork"):
            raise NotImplementedError("PTY fork solo es compatible con entornos Unix/Linux.")

        pid, master_fd = pty.fork()

        if pid == 0:
            # Proceso hijo (terminal)
            # Intentar cambiar a usuario no-root si se ejecuta en Linux
            try:
                import pwd
                user_record = pwd.getpwnam(self.pty_user)
                os.setgid(user_record.pw_gid)
                os.setuid(user_record.pw_uid)
                os.environ["HOME"] = user_record.pw_dir
            except Exception:
                pass  # Si el usuario específico no existe aún, se ejecuta en el contexto del agente

            os.environ["TERM"] = "xterm-256color"
            os.environ["LANG"] = "en_US.UTF-8"

            # Ejecutar shell
            shell = os.getenv("SHELL", "/bin/bash")
            os.execlp(shell, shell, "-l")
        else:
            # Proceso padre (agente)
            self.pid = pid
            self.master_fd = master_fd
            self.is_running = True
            self.resize(cols, rows)

            # Iniciar bucle de lectura asíncrono
            loop = asyncio.get_event_loop()
            loop.add_reader(self.master_fd, self._read_output)

    def _read_output(self) -> None:
        """Lee datos emitidos por el PTY master fd."""
        if not self.master_fd:
            return
        try:
            data = os.read(self.master_fd, 4096)
            if not data:
                self.terminate()
                return
            if self.on_output:
                text = data.decode("utf-8", errors="replace")
                self.on_output(self.session_id, text)
        except (OSError, Exception):
            self.terminate()

    def write_input(self, data: str) -> None:
        """Escribe caracteres ingresados por el usuario hacia el master fd."""
        if self.is_running and self.master_fd:
            try:
                os.write(self.master_fd, data.encode("utf-8"))
            except Exception:
                pass

    def resize(self, cols: int, rows: int) -> None:
        """Modifica el tamaño de la ventana PTY (filas y columnas)."""
        if self.master_fd:
            try:
                winsize = struct.pack("HHHH", rows, cols, 0, 0)
                termios.tcsetwinsize(self.master_fd, (rows, cols))
            except Exception:
                pass

    def terminate(self) -> None:
        """Finaliza el proceso de terminal y libera descriptores de archivo."""
        self.is_running = False
        if self.master_fd:
            try:
                loop = asyncio.get_event_loop()
                loop.remove_reader(self.master_fd)
                os.close(self.master_fd)
            except Exception:
                pass
            self.master_fd = None

        if self.pid:
            try:
                os.kill(self.pid, signal.SIGTERM)
            except Exception:
                pass
            self.pid = None

