import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SystemdUnit } from '@/types';
import { Play, Square, RotateCw, FileText, X, AlertTriangle } from 'lucide-react';

interface ServicesTabProps {
  serverId: string;
}

export const ServicesTab: React.FC<ServicesTabProps> = ({ serverId }) => {
  const queryClient = useQueryClient();
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [journalContent, setJournalContent] = useState<string>('');
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data: units, isLoading, error } = useQuery<SystemdUnit[]>({
    queryKey: ['systemd-units', serverId],
    queryFn: () => api.get<SystemdUnit[]>(`/servers/${serverId}/systemd/units`),
    refetchInterval: 15000,
  });

  const actionMutation = useMutation({
    mutationFn: ({ unit, action }: { unit: string; action: string }) =>
      api.post(`/servers/${serverId}/systemd/units/action`, { unit, action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemd-units', serverId] });
      setActionLoading(null);
    },
    onError: () => setActionLoading(null),
  });

  const handleAction = (unit: string, action: string) => {
    setActionLoading(`${unit}-${action}`);
    actionMutation.mutate({ unit, action });
  };

  const openJournal = async (unit: string) => {
    setSelectedUnit(unit);
    setIsJournalOpen(true);
    setJournalContent('Cargando journalctl...');
    try {
      const res = await api.get<{ logs: string }>(`/servers/${serverId}/systemd/units/${unit}/journal?lines=200`);
      setJournalContent(res.logs || 'Sin registros recientes.');
    } catch (e: any) {
      setJournalContent(`Error: ${e.message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="py-16 text-center text-slate-400">
        <div className="h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <span className="text-xs">Consultando servicios systemd mediante el agente...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>No se pudo comunicar con systemd en este host: {(error as any).message}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
            <tr>
              <th className="py-3 px-4">Unidad (.service)</th>
              <th className="py-3 px-4">Estado Activo</th>
              <th className="py-3 px-4">Sub-estado</th>
              <th className="py-3 px-4">Descripción</th>
              <th className="py-3 px-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {units?.map((u) => (
              <tr key={u.unit} className="hover:bg-slate-800/30 transition-colors">
                <td className="py-3.5 px-4 font-mono font-bold text-slate-200">{u.unit}</td>
                <td className="py-3.5 px-4">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      u.active_state === 'active'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : u.active_state === 'failed'
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {u.active_state}
                  </span>
                </td>
                <td className="py-3.5 px-4 font-mono text-slate-400">{u.sub_state}</td>
                <td className="py-3.5 px-4 text-slate-300 truncate max-w-sm">{u.description || '—'}</td>
                <td className="py-3.5 px-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {u.active_state !== 'active' ? (
                      <button
                        onClick={() => handleAction(u.unit, 'start')}
                        title="Iniciar servicio"
                        disabled={actionLoading === `${u.unit}-start`}
                        className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAction(u.unit, 'stop')}
                        title="Detener servicio"
                        disabled={actionLoading === `${u.unit}-stop`}
                        className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                      >
                        <Square className="h-3.5 w-3.5" />
                      </button>
                    )}

                    <button
                      onClick={() => handleAction(u.unit, 'restart')}
                      title="Reiniciar servicio"
                      disabled={actionLoading === `${u.unit}-restart`}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </button>

                    <button
                      onClick={() => openJournal(u.unit)}
                      title="Ver journalctl logs"
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Journalctl */}
      {isJournalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-100 text-sm font-mono">journalctl -u {selectedUnit}</h3>
              <button onClick={() => setIsJournalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs">
              <pre className="bg-slate-950 p-4 rounded-xl text-slate-300 whitespace-pre-wrap select-all max-h-[60vh] overflow-y-auto">
                {journalContent}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

