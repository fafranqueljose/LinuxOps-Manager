import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Container } from '@/types';
import { Play, Square, RotateCw, FileText, Info, X, AlertTriangle } from 'lucide-react';

interface ContainersTabProps {
  serverId: string;
}

export const ContainersTab: React.FC<ContainersTabProps> = ({ serverId }) => {
  const queryClient = useQueryClient();
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<'logs' | 'inspect' | null>(null);
  const [logsContent, setLogsContent] = useState<string>('');
  const [inspectData, setInspectData] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data: containers, isLoading, error } = useQuery<Container[]>({
    queryKey: ['docker-containers', serverId],
    queryFn: () => api.get<Container[]>(`/servers/${serverId}/docker/containers`),
    refetchInterval: 10000,
  });

  const containerActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      api.post(`/servers/${serverId}/docker/containers/${id}/action`, { action, timeout_seconds: 10 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docker-containers', serverId] });
      setActionLoading(null);
    },
    onError: () => setActionLoading(null),
  });

  const handleAction = (id: string, action: string) => {
    setActionLoading(`${id}-${action}`);
    containerActionMutation.mutate({ id, action });
  };

  const openLogs = async (id: string) => {
    setSelectedContainer(id);
    setModalMode('logs');
    setLogsContent('Cargando registros del contenedor...');
    try {
      const res = await api.get<{ logs: string }>(`/servers/${serverId}/docker/containers/${id}/logs?tail=300`);
      setLogsContent(res.logs || 'Sin registros disponibles.');
    } catch (e: any) {
      setLogsContent(`Error al obtener registros: ${e.message}`);
    }
  };

  const openInspect = async (id: string) => {
    setSelectedContainer(id);
    setModalMode('inspect');
    setInspectData(null);
    try {
      const res = await api.get<any>(`/servers/${serverId}/docker/containers/${id}`);
      setInspectData(res);
    } catch (e: any) {
      setInspectData({ error: e.message });
    }
  };

  if (isLoading) {
    return (
      <div className="py-16 text-center text-slate-400">
        <div className="h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <span className="text-xs">Consultando Docker Engine mediante el agente...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>No se pudo comunicar con Docker Engine en este host: {(error as any).message}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
            <tr>
              <th className="py-3 px-4">Nombre / ID</th>
              <th className="py-3 px-4">Estado</th>
              <th className="py-3 px-4">Imagen</th>
              <th className="py-3 px-4">Puertos Expuestos</th>
              <th className="py-3 px-4">Proyecto Compose</th>
              <th className="py-3 px-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {containers?.map((c) => (
              <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="py-3.5 px-4">
                  <div className="font-bold text-slate-100">{c.names?.[0] || c.id.slice(0, 12)}</div>
                  <div className="text-[10px] font-mono text-slate-500">{c.id.slice(0, 12)}</div>
                </td>
                <td className="py-3.5 px-4">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      c.state === 'running'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {c.state}
                  </span>
                </td>
                <td className="py-3.5 px-4 font-mono text-slate-300 truncate max-w-xs">{c.image}</td>
                <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                  {c.ports.length > 0
                    ? c.ports.map((p) => (p.public_port ? `${p.public_port}:${p.private_port}` : `${p.private_port}`)).join(', ')
                    : '—'}
                </td>
                <td className="py-3.5 px-4 text-slate-400">{c.compose_project || '—'}</td>
                <td className="py-3.5 px-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {c.state !== 'running' ? (
                      <button
                        onClick={() => handleAction(c.id, 'start')}
                        title="Iniciar contenedor"
                        disabled={actionLoading === `${c.id}-start`}
                        className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAction(c.id, 'stop')}
                        title="Detener contenedor"
                        disabled={actionLoading === `${c.id}-stop`}
                        className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                      >
                        <Square className="h-3.5 w-3.5" />
                      </button>
                    )}

                    <button
                      onClick={() => handleAction(c.id, 'restart')}
                      title="Reiniciar contenedor"
                      disabled={actionLoading === `${c.id}-restart`}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </button>

                    <button
                      onClick={() => openLogs(c.id)}
                      title="Ver registros"
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </button>

                    <button
                      onClick={() => openInspect(c.id)}
                      title="Inspeccionar configuración"
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Logs / Inspect */}
      {modalMode && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-100 text-sm">
                {modalMode === 'logs' ? 'Registros del Contenedor' : 'Detalles de Configuración e Inspección'}
              </h3>
              <button onClick={() => setModalMode(null)} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs">
              {modalMode === 'logs' ? (
                <pre className="bg-slate-950 p-4 rounded-xl text-slate-300 whitespace-pre-wrap select-all max-h-[60vh] overflow-y-auto">
                  {logsContent}
                </pre>
              ) : inspectData ? (
                <div className="space-y-4">
                  <div>
                    <span className="text-slate-400 text-[11px] uppercase font-bold block mb-1">
                      Variables de Entorno (Ofuscadas de Forma Segura)
                    </span>
                    <div className="bg-slate-950 p-3 rounded-xl space-y-1">
                      {inspectData.env_safe?.map((item: string, idx: number) => (
                        <div key={idx} className="text-slate-300 break-all">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-400 text-[11px] uppercase font-bold block mb-1">Puntos de Montaje</span>
                    <pre className="bg-slate-950 p-3 rounded-xl text-slate-300 overflow-x-auto">
                      {JSON.stringify(inspectData.mounts, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">Cargando inspección...</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

