"""
LinuxOps Agent — Buffer Persistente Local con SQLite WAL
Garantiza entrega confiable (at-least-once) ante caídas de red o reinicios del agente,
con límite de almacenamiento en disco acotado y rotación FIFO.
"""

import json
import logging
import os
import sqlite3
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("linuxops.agent.log_buffer")


class LogBuffer:
    def __init__(self, db_path: str, max_size_mb: int = 256):
        self.db_path = db_path
        self.max_size_bytes = max_size_mb * 1024 * 1024
        self._lock = threading.Lock()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        """Inicializa las tablas y el modo WAL de SQLite."""
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
        with self._lock:
            with self._get_connection() as conn:
                conn.execute("PRAGMA journal_mode=WAL;")
                conn.execute("PRAGMA synchronous=NORMAL;")
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS log_queue (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        source TEXT NOT NULL,
                        service TEXT NOT NULL,
                        level TEXT NOT NULL,
                        stream TEXT NOT NULL,
                        message TEXT NOT NULL,
                        metadata TEXT,
                        created_at REAL NOT NULL
                    );
                """)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS checkpoints (
                        source_type TEXT NOT NULL,
                        item_name TEXT NOT NULL,
                        last_cursor TEXT NOT NULL,
                        updated_at REAL NOT NULL,
                        PRIMARY KEY (source_type, item_name)
                    );
                """)
                conn.execute("CREATE INDEX IF NOT EXISTS idx_log_queue_id ON log_queue(id);")
                conn.commit()

    def enqueue_records(self, records: List[Dict[str, Any]]) -> int:
        """
        Inserta un conjunto de registros en el buffer local.
        Aplica poda FIFO si el archivo sobrepasa el tamaño máximo configurado.
        """
        if not records:
            return 0

        now = time.time()
        rows = [
            (
                r.get("timestamp"),
                r.get("source", "unknown"),
                r.get("service", "generic"),
                r.get("level", "info"),
                r.get("stream", "stdout"),
                r.get("message", ""),
                json.dumps(r.get("metadata", {}), ensure_ascii=False) if r.get("metadata") else None,
                now,
            )
            for r in records
        ]

        with self._lock:
            with self._get_connection() as conn:
                conn.executemany("""
                    INSERT INTO log_queue (timestamp, source, service, level, stream, message, metadata, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                """, rows)
                conn.commit()

            # Verificar tamaño del archivo de base de datos
            self._enforce_size_limit()

        return len(records)

    def fetch_batch(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Recupera hasta 'limit' registros pendientes en orden cronológico (id ascendente)."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.execute("""
                    SELECT id, timestamp, source, service, level, stream, message, metadata
                    FROM log_queue
                    ORDER BY id ASC
                    LIMIT ?;
                """, (limit,))
                results = []
                for row in cursor.fetchall():
                    meta = None
                    if row["metadata"]:
                        try:
                            meta = json.loads(row["metadata"])
                        except Exception:
                            meta = None
                    results.append({
                        "id": row["id"],
                        "timestamp": row["timestamp"],
                        "source": row["source"],
                        "service": row["service"],
                        "level": row["level"],
                        "stream": row["stream"],
                        "message": row["message"],
                        "metadata": meta,
                    })
                return results

    def ack_batch(self, record_ids: List[int]) -> int:
        """Elimina del buffer los registros confirmados por el backend."""
        if not record_ids:
            return 0

        with self._lock:
            with self._get_connection() as conn:
                placeholders = ",".join("?" for _ in record_ids)
                cur = conn.execute(f"DELETE FROM log_queue WHERE id IN ({placeholders});", record_ids)
                conn.commit()
                return cur.rowcount

    def get_checkpoint(self, source_type: str, item_name: str) -> Optional[str]:
        """Obtiene el último cursor o timestamp procesado para una fuente."""
        with self._lock:
            with self._get_connection() as conn:
                cur = conn.execute("""
                    SELECT last_cursor FROM checkpoints
                    WHERE source_type = ? AND item_name = ?;
                """, (source_type, item_name))
                row = cur.fetchone()
                return row["last_cursor"] if row else None

    def set_checkpoint(self, source_type: str, item_name: str, cursor: str):
        """Actualiza el cursor de lectura de una fuente."""
        with self._lock:
            with self._get_connection() as conn:
                conn.execute("""
                    INSERT INTO checkpoints (source_type, item_name, last_cursor, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(source_type, item_name) DO UPDATE SET
                        last_cursor = excluded.last_cursor,
                        updated_at = excluded.updated_at;
                """, (source_type, item_name, cursor, time.time()))
                conn.commit()

    def get_queue_size(self) -> int:
        """Retorna el número de registros pendientes en la cola."""
        with self._lock:
            with self._get_connection() as conn:
                cur = conn.execute("SELECT COUNT(*) FROM log_queue;")
                return cur.fetchone()[0]

    def _enforce_size_limit(self):
        """Poda registros antiguos si el archivo en disco excede la cuota máxima."""
        try:
            if not os.path.exists(self.db_path):
                return
            size = os.path.getsize(self.db_path)
            if size > self.max_size_bytes:
                # Eliminar los 500 registros más antiguos
                with self._get_connection() as conn:
                    conn.execute("""
                        DELETE FROM log_queue
                        WHERE id IN (SELECT id FROM log_queue ORDER BY id ASC LIMIT 500);
                    """)
                    conn.commit()
                logger.warning(f"Buffer SQLite superó {self.max_size_bytes // (1024*1024)}MB. Podados registros antiguos.")
        except Exception as e:
            logger.error(f"Error comprobando tamaño de buffer: {e}")

