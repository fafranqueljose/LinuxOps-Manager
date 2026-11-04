import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { LogExplorer } from '@/modules/logs/LogExplorer';
import { LogHealthStatus } from '@/types';
import { cn } from '@/lib/utils';
import { Activity, ShieldCheck, Database, Layers } from 'lucide-react';

export const LogsView: React.FC = () => {
  const { data: health } = useQuery<LogHealthStatus>({
    queryKey: ['logs-health'],
    queryFn: () => api.get<LogHealthStatus>('/logs/health'),
    refetchInterval: 30000,
  });

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Logs Centralizados"
        subtitle="Observabilidad, búsqueda en tiempo real y almacenamiento centralizado con Grafana Loki"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300">
              <Database className="w-3.5 h-3.5 text-brand-400" />
              <span>Motor:</span>
              <span className="font-semibold text-slate-100">Loki v3.0</span>
              <span
                className={cn(
                  'w-2 h-2 rounded-full ml-1',
                  health?.loki_ready ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                )}
                title={health?.details || 'Estado del motor Loki'}
              />
            </div>
          </div>
        }
      />

      <div className="flex-1 p-6 overflow-y-auto">
        <LogExplorer />
      </div>
    </div>
  );
};

