import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ServerDetail } from '@/types';
import { Header } from '@/components/layout/Header';
import { formatBytes, formatUptime, formatDate } from '@/lib/utils';
import { DockerView } from '@/modules/docker/DockerView';
import { ServicesTab } from '@/modules/systemd/ServicesTab';
import { WebTerminal } from '@/modules/terminal/WebTerminal';
import { StorageTab } from '@/modules/storage/StorageTab';
import {
  Server,
  Cpu,
  Activity,
  HardDrive,
  Box,
  Layers,
  Terminal,
  Shield,
  Clock,
  ArrowLeft,
  Key,
  KeyRound,
  Trash2,
  Copy,
  Check,
  X,
} from 'lucide-react';

export const ServerDetailView: React.FC = () => {
  const { serverId } = useParams<{ serverId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'docker' | 'systemd' | 'storage' | 'terminal' | 'details'>('docker');
  const [enrollmentData, setEnrollmentData] = useState<{ install_command: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: server, isLoading } = useQuery<ServerDetail>({
    queryKey: ['server-detail', serverId],
    queryFn: () => api.get<ServerDetail>(`/servers/${serverId}`),
    refetchInterval: 10000,
  });

  const reissueTokenMutation = useMutation({
    mutationFn: () => api.post<any>(`/servers/${serverId}/reissue-token`),
    onSuccess: (data: any) => {
      setEnrollmentData({
        install_command: data.install_command,
        token: data.enrollment_token,
      });
      queryClient.invalidateQueries({ queryKey: ['server-detail', serverId] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
    onError: (err: any) => alert(err?.message || 'Error al recrear token'),
  });

  const deleteServerMutation = useMutation({
    mutationFn: () => api.delete(`/servers/${serverId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      navigate('/servers');
    },
    onError: (err: any) => alert(err?.message || 'Error al eliminar servidor'),
  });

  const handleDelete = () => {
    if (!server) return;
    if (confirm(`¿Está seguro de que desea eliminar permanentemente el servidor "${server.name}"?\nEsta acción es irreversible y desconectará su agente.`)) {
      deleteServerMutation.mutate();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading || !server) {
    return (
      <div className="flex-1 flex flex-col">
        <Header title="Detalle de Servidor" />
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title={server.name}
        subtitle={`${server.hostname || 'Sin hostname'} • ${server.ip_address || 'Sin IP'}`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/servers"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Volver</span>
            </Link>

            <button
              onClick={() => reissueTokenMutation.mutate()}
              disabled={reissueTokenMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors"
              title="Generar nuevo token de un solo uso para reinstalar o reconectar el agente"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>{reissueTokenMutation.isPending ? 'Generando...' : 'Recrear Token'}</span>
            </button>

            <button
              onClick={handleDelete}
              disabled={deleteServerMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-semibold transition-colors"
              title="Eliminar este servidor y sus registros del sistema"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{deleteServerMutation.isPending ? 'Eliminando...' : 'Eliminar'}</span>
            </button>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        {/* Banner de Estado y Recursos en Tiempo Real */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* CPU Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-brand-400" /> CPU ({server.cpu_count} cores)
              </span>
              <span className="font-mono font-bold text-slate-200">{server.cpu_percent}%</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-brand-500 h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.max(0, server.cpu_percent))}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-2">
              Carga: {server.load_1} / {server.load_5} / {server.load_15}
            </div>
          </div>

          {/* RAM Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-indigo-400" /> Memoria RAM
              </span>
              <span className="font-mono font-bold text-slate-200">{server.ram_percent}%</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-indigo-500 h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.max(0, server.ram_percent))}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-2">
              Libre: {formatBytes(server.free_ram_bytes)} de {formatBytes(server.total_ram_bytes)}
            </div>
          </div>

          {/* Disco Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold flex items-center gap-1.5">
                <HardDrive className="h-4 w-4 text-amber-400" /> Disco Principal (/)
              </span>
              <span className="font-mono font-bold text-slate-200">{server.disk_percent}%</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.max(0, server.disk_percent))}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-2">
              Libre: {formatBytes(server.free_disk_bytes)} de {formatBytes(server.total_disk_bytes)}
            </div>
          </div>

          {/* Uptime & Info */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span className="font-semibold flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-emerald-400" /> Tiempo Activo
                </span>
                <span className="font-mono font-bold text-emerald-400">{formatUptime(server.uptime_seconds)}</span>
              </div>
              <div className="text-[11px] text-slate-400 truncate mt-1">
                SO: {server.os_name || 'Desconocido'} ({server.architecture || 'x86_64'})
              </div>
            </div>
            <div className="text-[10px] text-slate-500 font-mono truncate">
              Kernel: {server.kernel || '—'}
            </div>
          </div>
        </div>

        {/* Selector de Pestañas */}
        <div className="flex border-b border-slate-800 gap-6 text-sm font-semibold">
          <button
            onClick={() => setActiveTab('docker')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'docker'
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Box className="h-4 w-4" />
            <span>Ecosistema Docker ({server.container_count})</span>
          </button>

          <button
            onClick={() => setActiveTab('systemd')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'systemd'
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Servicios systemd</span>
          </button>

          <button
            onClick={() => setActiveTab('storage')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'storage'
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HardDrive className="h-4 w-4" />
            <span>Almacenamiento</span>
          </button>

          <button
            onClick={() => setActiveTab('terminal')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'terminal'
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="h-4 w-4" />
            <span>Terminal Remota (PTY)</span>
          </button>

          <button
            onClick={() => setActiveTab('details')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'details'
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="h-4 w-4" />
            <span>Identidad mTLS y Agente</span>
          </button>
        </div>

        {/* Contenido de la Pestaña Activa */}
        <div>
          {activeTab === 'docker' && <DockerView serverId={server.id} />}
          {activeTab === 'systemd' && <ServicesTab serverId={server.id} />}
          {activeTab === 'storage' && <StorageTab serverId={server.id} />}
          {activeTab === 'terminal' && <WebTerminal serverId={server.id} />}
          {activeTab === 'details' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 max-w-2xl text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">Identidad Criptográfica del Agente</h3>
                  <p className="text-slate-500 text-[11px]">Certificados mTLS y estado de vinculación</p>
                </div>
                <button
                  onClick={() => reissueTokenMutation.mutate()}
                  disabled={reissueTokenMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Recrear Token</span>
                </button>
              </div>

              <div className="space-y-3 font-mono">
                <div>
                  <span className="text-slate-500 block text-[11px]">Versión del Agente</span>
                  <span className="text-slate-200">{server.agent?.agent_version || '1.0.0'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Número de Serie del Certificado X.509</span>
                  <span className="text-slate-200 break-all">{server.agent?.cert_serial || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Huella Digital SHA-256</span>
                  <span className="text-slate-200 break-all">{server.agent?.cert_fingerprint_sha256 || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Estado del Agente</span>
                  <span className="text-slate-200">
                    {server.agent?.is_revoked ? 'REVOCADO' : server.agent ? 'Activo y Válido' : 'Pendiente de instalación'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Fecha de Incorporación</span>
                  <span className="text-slate-200">{formatDate(server.agent?.created_at)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Recrear Token */}
      {enrollmentData && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl relative space-y-4 animate-fadeIn">
            <button
              onClick={() => setEnrollmentData(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-amber-500/20 border border-amber-500/30 rounded-xl flex items-center justify-center text-amber-400">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-base">Nuevo Token de Instalación Generado</h3>
                <p className="text-xs text-slate-400">Válido por 30 minutos para `{server.name}`</p>
              </div>
            </div>

            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400">
              Copie y ejecute este comando en el servidor remoto con permisos de superusuario (`sudo`):
            </div>

            <div className="relative">
              <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-slate-200 overflow-x-auto whitespace-pre-wrap select-all">
                {enrollmentData.install_command}
              </pre>
              <button
                onClick={() => copyToClipboard(enrollmentData.install_command)}
                className="absolute top-2.5 right-2.5 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs flex items-center gap-1 transition-colors"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>

            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-[11px] text-slate-400 space-y-1">
              <p><span className="font-semibold text-slate-300">Token:</span> <span className="font-mono text-amber-400">{enrollmentData.token}</span></p>
              <p className="text-slate-500">El instalador detectará automáticamente el hostname e IP del servidor remoto y establecerá la conexión mTLS.</p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setEnrollmentData(null)}
                className="px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
