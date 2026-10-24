import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '@/lib/api';
import { TerminalSessionOut } from '@/types';
import { Terminal as TerminalIcon, ShieldAlert, WifiOff, RefreshCw } from 'lucide-react';

interface WebTerminalProps {
  serverId: string;
}

export const WebTerminal: React.FC<WebTerminalProps> = ({ serverId }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<TerminalSessionOut | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const initSession = async () => {
    setError(null);
    setIsConnected(false);

    try {
      // 1. Abrir sesión en el backend
      const sess = await api.post<TerminalSessionOut>(`/servers/${serverId}/terminal/open`, {
        cols: 80,
        rows: 24,
      });
      setSession(sess);

      // 2. Iniciar terminal xterm.js
      if (!termInstanceRef.current && terminalRef.current) {
        const term = new Terminal({
          cursorBlink: true,
          fontFamily: 'monospace',
          fontSize: 13,
          theme: {
            background: '#020617', // slate-950
            foreground: '#f8fafc',
            cursor: '#38bdf8',
            selectionBackground: '#0284c7',
          },
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();

        termInstanceRef.current = term;
        fitAddonRef.current = fitAddon;
      }

      const term = termInstanceRef.current!;
      term.clear();
      term.writeln('\x1b[1;36m=== Conectando a la sesión de terminal segura (PTY)... ===\x1b[0m');

      // 3. Conectar WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/v1/ws/terminal/${sess.id}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        term.writeln('\x1b[1;32m[+] Conexión establecida. Usuario no privilegiado: linuxops-pty\x1b[0m\r\n');

        // Notificar tamaño inicial
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));

        // Capturar entrada de teclado
        term.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'input', data }));
          }
        });
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'output' && payload.data) {
            term.write(payload.data);
          }
        } catch {
          term.write(event.data);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        term.writeln('\r\n\x1b[1;31m[!] Sesión de terminal desconectada o finalizada.\x1b[0m');
      };

      ws.onerror = () => {
        setIsConnected(false);
        setError('Error en la conexión WebSocket de la terminal.');
      };

      // Manejar redimensionamiento
      const handleResize = () => {
        if (fitAddonRef.current && ws.readyState === WebSocket.OPEN) {
          fitAddonRef.current.fit();
          ws.send(
            JSON.stringify({
              type: 'resize',
              cols: term.cols,
              rows: term.rows,
            })
          );
        }
      };
      window.addEventListener('resize', handleResize);
    } catch (e: any) {
      setError(e.message || 'Error al iniciar la sesión de terminal');
    }
  };

  useEffect(() => {
    initSession();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (termInstanceRef.current) {
        termInstanceRef.current.dispose();
        termInstanceRef.current = null;
      }
    };
  }, [serverId]);

  return (
    <div className="space-y-4">
      {/* Banner de Advertencia de Seguridad */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
          <span>
            Sesión interactiva aislada bajo pseudoterminal (PTY). Todas las sesiones quedan registradas en la auditoría.
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-mono text-[11px]">
            <span
              className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}
            />
            {isConnected ? 'Conectado (linuxops-pty)' : 'Desconectado'}
          </span>
          <button
            onClick={initSession}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
            title="Reconectar sesión"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
          <WifiOff className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {/* Contenedor de xterm.js */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-2xl overflow-hidden min-h-[500px]">
        <div ref={terminalRef} className="h-[480px] w-full" />
      </div>
    </div>
  );
};

