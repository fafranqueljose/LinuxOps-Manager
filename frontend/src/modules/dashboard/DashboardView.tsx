import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { DashboardSummary } from '@/types';
import { Header } from '@/components/layout/Header';
import {
  Server,
  Activity,
  Box,
  AlertTriangle,
  Cpu,
  Layers,
  ArrowUpRight,
  PlusCircle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { data: summary, isLoading } = useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get<DashboardSummary>('/dashboard/summary'),
    refetchInterval: 10000,
  });

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Dashboard General"
        subtitle="Métricas globales e infraestructura en tiempo real"
        actions={
          <Link
            to="/servers"
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Incorporar Servidor</span>
          </Link>
        }
      />

      <div className="p-8 space-y-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !summary || summary.total_servers === 0 ? (
          /* Estado Vacío Real (Prompt: Si no existen servidores registrados, presenta un estado vacío y opción para registrar el primero) */
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto my-12">
            <div className="h-16 w-16 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400">
              <Server className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-200 mb-2">No hay servidores registrados</h3>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              Comience incorporando su primer servidor Linux. El sistema generará un token de un solo uso con el comando de instalación para el agente.
            </p>
            <Link
              to="/servers"
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-brand-600/20 transition-all"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Registrar Primer Servidor</span>
            </Link>
          </div>
        ) : (
          <>
            {/* Grid de Métricas Principales */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Servidores */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Servidores</span>
                  <div className="h-9 w-9 bg-brand-500/10 rounded-xl flex items-center justify-center text-brand-400">
                    <Server className="h-4 w-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-3xl font-extrabold text-slate-100">{summary.total_servers}</span>
                  <span className="text-xs text-slate-500">totales</span>
                </div>
                <div className="flex items-center gap-3 text-xs border-t border-slate-800/80 pt-3">
                  <span className="flex items-center gap-1 text-emerald-400 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {summary.online_servers} Online
                  </span>
                  <span className="flex items-center gap-1 text-red-400 font-medium">
                    <XCircle className="h-3.5 w-3.5" /> {summary.offline_servers} Offline
                  </span>
                </div>
              </div>

              {/* Contenedores Docker */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Contenedores Docker</span>
                  <div className="h-9 w-9 bg-sky-500/10 rounded-xl flex items-center justify-center text-sky-400">
                    <Box className="h-4 w-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-3xl font-extrabold text-slate-100">{summary.total_containers}</span>
                  <span className="text-xs text-slate-500">detectados</span>
                </div>
                <div className="flex items-center gap-3 text-xs border-t border-slate-800/80 pt-3">
                  <span className="flex items-center gap-1 text-emerald-400 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {summary.running_containers} Activos
                  </span>
                  <span className="flex items-center gap-1 text-slate-400 font-medium">
                    {summary.stopped_containers} Detenidos
                  </span>
                </div>
              </div>

              {/* Servicios Fallidos */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Servicios Fallidos</span>
                  <div className="h-9 w-9 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-400">
                    <Layers className="h-4 w-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-3xl font-extrabold text-slate-100">{summary.failed_services_total}</span>
                  <span className="text-xs text-slate-500">systemd units</span>
                </div>
                <div className="text-xs border-t border-slate-800/80 pt-3">
                  {summary.failed_services_total > 0 ? (
                    <span className="text-amber-400 font-medium">Requiere revisión administrativa</span>
                  ) : (
                    <span className="text-emerald-400 font-medium">Todos los servicios operan normalmente</span>
                  )}
                </div>
              </div>

              {/* Alertas Activas */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Alertas Activas</span>
                  <div className="h-9 w-9 bg-rose-500/10 rounded-xl flex items-center justify-center text-rose-400">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-3xl font-extrabold text-slate-100">{summary.recent_alerts_count}</span>
                  <span className="text-xs text-slate-500">sin resolver</span>
                </div>
                <div className="text-xs border-t border-slate-800/80 pt-3">
                  <Link to="/alerts" className="text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1">
                    <span>Gestionar alertas</span>
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>

            {/* Carga Promedio y Recursos Agregados */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-base font-bold text-slate-100">Consumo Agregado de la Flota</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{summary.calculation_method}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-mono text-slate-400">Live Heartbeat</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* CPU Gauge */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <Cpu className="h-3.5 w-3.5 text-brand-400" /> CPU Promedio
                    </span>
                    <span className="font-mono font-bold text-brand-400">{summary.avg_cpu_percent}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden p-0.5">
                    <div
                      className="bg-brand-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, summary.avg_cpu_percent))}%` }}
                    />
                  </div>
                </div>

                {/* RAM Gauge */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-indigo-400" /> Memoria RAM Promedio
                    </span>
                    <span className="font-mono font-bold text-indigo-400">{summary.avg_ram_percent}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden p-0.5">
                    <div
                      className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, summary.avg_ram_percent))}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

