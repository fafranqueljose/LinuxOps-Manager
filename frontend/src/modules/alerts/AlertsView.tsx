import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Alert } from '@/types';
import { Header } from '@/components/layout/Header';
import { formatDate } from '@/lib/utils';
import { Bell, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';

export const AlertsView: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: alerts, isLoading } = useQuery<Alert[]>({
    queryKey: ['alerts'],
    queryFn: () => api.get<Alert[]>('/alerts?limit=50'),
    refetchInterval: 10000,
  });

  const resolveMutation = useMutation({
    mutationFn: (alertId: string) => api.post(`/alerts/${alertId}/resolve`, { resolved: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'critical':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">CRÍTICA</span>;
      case 'warning':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">ADVERTENCIA</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">INFO</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Alertas Operativas" subtitle="Incidentes y eventos críticos del sistema" />

      <div className="p-8 space-y-4">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <span className="text-xs">Cargando alertas...</span>
          </div>
        ) : !alerts || alerts.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
            <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-200">No hay alertas activas</p>
            <p className="text-xs text-slate-500 mt-1">Todos los sistemas operan dentro de los umbrales normales.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((a) => (
              <div
                key={a.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-start justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {getSeverityBadge(a.severity)}
                    <span className="font-bold text-sm text-slate-100">{a.title}</span>
                    {a.server_name && (
                      <span className="text-xs text-brand-400 font-mono">({a.server_name})</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{a.message}</p>
                  <p className="text-[10px] text-slate-500 font-mono">{formatDate(a.created_at)}</p>
                </div>

                {!a.is_resolved && (
                  <button
                    onClick={() => resolveMutation.mutate(a.id)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors"
                  >
                    Resolver
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

