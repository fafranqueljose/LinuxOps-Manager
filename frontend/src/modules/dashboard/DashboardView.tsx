import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { DashboardSummary, Server, Alert } from '@/types';
import { Header } from '@/components/layout/Header';
import { formatDate } from '@/lib/utils';
import {
  Server as ServerIcon,
  Activity,
  Box,
  AlertTriangle,
  Cpu,
  Layers,
  ArrowUpRight,
  PlusCircle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Search,
  Check,
  AlertCircle,
  Eye,
  RefreshCw,
  HardDrive,
  ShieldAlert,
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const queryClient = useQueryClient();

  // Estado de despliegue para cada tarjeta
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({
    servers: false,
    containers: false,
    services: false,
    alerts: false,
    resources: false,
  });

  // Filtro interno para la vista rápida de servidores
  const [serverStatusFilter, setServerStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [serverSearch, setServerSearch] = useState('');

  const toggleCard = (key: string) => {
    setExpandedCards((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const expandAllCards = () => {
    setExpandedCards({
      servers: true,
      containers: true,
      services: true,
      alerts: true,
      resources: true,
    });
  };

  const collapseAllCards = () => {
    setExpandedCards({
      servers: false,
      containers: false,
      services: false,
      alerts: false,
      resources: false,
    });
  };

  // 1. Resumen global
  const { data: summary, isLoading: isLoadingSummary } = useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get<DashboardSummary>('/dashboard/summary'),
    refetchInterval: 10000,
  });

  // 2. Servidores para vista rápida
  const { data: servers = [], isLoading: isLoadingServers } = useQuery<Server[]>({
    queryKey: ['servers'],
    queryFn: () => api.get<Server[]>('/servers'),
    refetchInterval: 10000,
  });

  // 3. Alertas activas no resueltas para vista rápida
  const { data: alerts = [], isLoading: isLoadingAlerts } = useQuery<Alert[]>({
    queryKey: ['alerts', { resolved: false }],
    queryFn: () => api.get<Alert[]>('/alerts?resolved=false&limit=10'),
    refetchInterval: 10000,
  });

  // Mutación para resolver alertas en 1 clic
  const resolveAlertMutation = useMutation({
    mutationFn: (alertId: string) => api.post(`/alerts/${alertId}/resolve`, { resolved: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });

  // Servidores filtrados para vista rápida
  const filteredServers = servers.filter((s) => {
    if (serverStatusFilter === 'online' && s.status !== 'online') return false;
    if (serverStatusFilter === 'offline' && s.status === 'online') return false;
    if (serverSearch) {
      const q = serverSearch.toLowerCase();
      const matchName = (s.name || '').toLowerCase().includes(q);
      const matchHost = (s.hostname || '').toLowerCase().includes(q);
      const matchIp = (s.ip_address || '').toLowerCase().includes(q);
      return matchName || matchHost || matchIp;
    }
    return true;
  });

  // Servidores con servicios fallidos
  const serversWithFailedServices = servers.filter((s) => s.failed_services_count > 0);

  // Servidores ordenados por contenedores
  const serversWithContainers = servers.filter((s) => s.container_count > 0);

  const areAllExpanded = Object.values(expandedCards).every(Boolean);

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Dashboard General"
        subtitle="Métricas globales e infraestructura en tiempo real"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={areAllExpanded ? collapseAllCards : expandAllCards}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-3 py-2 rounded-xl transition-colors border border-slate-700"
              title="Expandir o colapsar todas las vistas rápidas"
            >
              <Eye className="h-3.5 w-3.5 text-brand-400" />
              <span>{areAllExpanded ? 'Colapsar vistas rápidas' : 'Desplegar todas'}</span>
            </button>

            <Link
              to="/servers"
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-3 py-2 rounded-xl shadow-lg shadow-brand-600/20 transition-all"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Incorporar Servidor</span>
            </Link>
          </div>
        }
      />

      <div className="p-8 space-y-8">
        {isLoadingSummary ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !summary || summary.total_servers === 0 ? (
          /* Estado Vacío Real */
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto my-12">
            <div className="h-16 w-16 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400">
              <ServerIcon className="h-8 w-8" />
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
            {/* Grid de Tarjetas Principales con Despliegue de Vista Rápida */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
              {/* =========================================================================
                  TARJETA 1: SERVIDORES
                  ========================================================================= */}
              <div
                className={`bg-slate-900 border rounded-2xl p-5 transition-all duration-200 flex flex-col justify-between ${
                  expandedCards.servers ? 'border-brand-500/50 shadow-lg shadow-brand-500/5' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Servidores</span>
                    <div className="h-9 w-9 bg-brand-500/10 rounded-xl flex items-center justify-center text-brand-400">
                      <ServerIcon className="h-4 w-4" />
                    </div>
                  </div>

                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-3xl font-extrabold text-slate-100">{summary.total_servers}</span>
                    <span className="text-xs text-slate-500">registrados</span>
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

                {/* Botón de Despliegue Vista Rápida */}
                <div className="pt-3 mt-3 border-t border-slate-800/60">
                  <button
                    onClick={() => toggleCard('servers')}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-[11px] font-semibold text-slate-300 hover:text-white transition-colors border border-slate-700/50"
                  >
                    <span className="flex items-center gap-1.5">
                      <Eye className="h-3 w-3 text-brand-400" />
                      <span>{expandedCards.servers ? 'Ocultar vista rápida' : 'Vista rápida de servidores'}</span>
                    </span>
                    {expandedCards.servers ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>

                  {/* Panel Desplegado */}
                  {expandedCards.servers && (
                    <div className="mt-3 pt-3 border-t border-slate-800 space-y-2 text-xs animate-in fade-in">
                      {/* Filtro rápido */}
                      <div className="flex items-center justify-between gap-1 text-[11px] pb-1">
                        <div className="flex bg-slate-950 p-0.5 rounded-md border border-slate-800">
                          <button
                            onClick={() => setServerStatusFilter('all')}
                            className={`px-1.5 py-0.5 rounded ${serverStatusFilter === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400'}`}
                          >
                            Todos ({servers.length})
                          </button>
                          <button
                            onClick={() => setServerStatusFilter('online')}
                            className={`px-1.5 py-0.5 rounded ${serverStatusFilter === 'online' ? 'bg-emerald-500/20 text-emerald-400 font-bold' : 'text-slate-400'}`}
                          >
                            Online
                          </button>
                          <button
                            onClick={() => setServerStatusFilter('offline')}
                            className={`px-1.5 py-0.5 rounded ${serverStatusFilter === 'offline' ? 'bg-red-500/20 text-red-400 font-bold' : 'text-slate-400'}`}
                          >
                            Offline
                          </button>
                        </div>

                        <Link to="/servers" className="text-brand-400 hover:text-brand-300 text-[10px] font-semibold flex items-center gap-0.5">
                          <span>Ver inventario</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                      </div>

                      {/* Lista de servidores */}
                      <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
                        {filteredServers.length === 0 ? (
                          <p className="text-slate-500 text-center py-3 italic">Sin servidores coincidentes</p>
                        ) : (
                          filteredServers.map((s) => (
                            <Link
                              key={s.id}
                              to={`/servers/${s.id}`}
                              className="flex items-center justify-between p-2 rounded-lg bg-slate-950 hover:bg-slate-800/80 border border-slate-800/60 transition-colors group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`h-2 w-2 rounded-full shrink-0 ${
                                    s.status === 'online'
                                      ? 'bg-emerald-400 shadow-sm shadow-emerald-400'
                                      : s.status === 'degraded'
                                      ? 'bg-amber-400'
                                      : 'bg-red-400'
                                  }`}
                                />
                                <div className="truncate">
                                  <span className="font-bold text-slate-200 group-hover:text-brand-400 block truncate">
                                    {s.name}
                                  </span>
                                  <span className="text-[10px] text-slate-500 block truncate">
                                    {s.ip_address || s.hostname || 'Sin IP'}
                                  </span>
                                </div>
                              </div>

                              <div className="text-right shrink-0 flex items-center gap-2">
                                <span className="text-[10px] text-slate-400">
                                  CPU {s.cpu_percent}%
                                </span>
                                <ArrowUpRight className="h-3 w-3 text-slate-600 group-hover:text-brand-400 transition-colors" />
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* =========================================================================
                  TARJETA 2: CONTENEDORES DOCKER
                  ========================================================================= */}
              <div
                className={`bg-slate-900 border rounded-2xl p-5 transition-all duration-200 flex flex-col justify-between ${
                  expandedCards.containers ? 'border-sky-500/50 shadow-lg shadow-sky-500/5' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
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

                {/* Botón de Despliegue Vista Rápida */}
                <div className="pt-3 mt-3 border-t border-slate-800/60">
                  <button
                    onClick={() => toggleCard('containers')}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-[11px] font-semibold text-slate-300 hover:text-white transition-colors border border-slate-700/50"
                  >
                    <span className="flex items-center gap-1.5">
                      <Box className="h-3 w-3 text-sky-400" />
                      <span>{expandedCards.containers ? 'Ocultar vista rápida' : 'Vista rápida por servidor'}</span>
                    </span>
                    {expandedCards.containers ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>

                  {/* Panel Desplegado */}
                  {expandedCards.containers && (
                    <div className="mt-3 pt-3 border-t border-slate-800 space-y-2 text-xs animate-in fade-in">
                      <div className="flex items-center justify-between text-[11px] pb-1 text-slate-400">
                        <span>Desglose por Servidor:</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {summary.total_containers > 0
                            ? `${Math.round((summary.running_containers / summary.total_containers) * 100)}% operativos`
                            : '0%'}
                        </span>
                      </div>

                      <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
                        {serversWithContainers.length === 0 ? (
                          <p className="text-slate-500 text-center py-3 italic">No hay contenedores registrados</p>
                        ) : (
                          serversWithContainers.map((s) => (
                            <Link
                              key={s.id}
                              to={`/servers/${s.id}?tab=docker`}
                              className="flex items-center justify-between p-2 rounded-lg bg-slate-950 hover:bg-slate-800/80 border border-slate-800/60 transition-colors group"
                            >
                              <div className="truncate">
                                <span className="font-bold text-slate-200 group-hover:text-sky-400 block truncate">
                                  {s.name}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {s.container_count} contenedor{s.container_count !== 1 ? 'es' : ''}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 text-right shrink-0">
                                <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px] font-bold">
                                  Ver Docker
                                </span>
                                <ArrowUpRight className="h-3 w-3 text-slate-600 group-hover:text-sky-400" />
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* =========================================================================
                  TARJETA 3: SERVICIOS FALLIDOS
                  ========================================================================= */}
              <div
                className={`bg-slate-900 border rounded-2xl p-5 transition-all duration-200 flex flex-col justify-between ${
                  expandedCards.services ? 'border-amber-500/50 shadow-lg shadow-amber-500/5' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
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

                {/* Botón de Despliegue Vista Rápida */}
                <div className="pt-3 mt-3 border-t border-slate-800/60">
                  <button
                    onClick={() => toggleCard('services')}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-[11px] font-semibold text-slate-300 hover:text-white transition-colors border border-slate-700/50"
                  >
                    <span className="flex items-center gap-1.5">
                      <Layers className="h-3 w-3 text-amber-400" />
                      <span>{expandedCards.services ? 'Ocultar vista rápida' : 'Vista rápida de salud'}</span>
                    </span>
                    {expandedCards.services ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>

                  {/* Panel Desplegado */}
                  {expandedCards.services && (
                    <div className="mt-3 pt-3 border-t border-slate-800 space-y-2 text-xs animate-in fade-in">
                      {summary.failed_services_total === 0 ? (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center space-y-1">
                          <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto" />
                          <p className="font-bold text-slate-200 text-xs">Sin servicios fallidos</p>
                          <p className="text-[10px] text-slate-400">
                            Todas las unidades systemd supervisadas se encuentran en estado activo y saludable.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1 font-mono text-[11px]">
                          <p className="text-slate-400 text-[10px] pb-1 font-sans">
                            Servidores con unidades en estado <code className="text-red-400">failed</code>:
                          </p>
                          {serversWithFailedServices.map((s) => (
                            <Link
                              key={s.id}
                              to={`/servers/${s.id}?tab=systemd`}
                              className="flex items-center justify-between p-2 rounded-lg bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 transition-colors group"
                            >
                              <div className="truncate">
                                <span className="font-bold text-slate-200 group-hover:text-red-400 block truncate">
                                  {s.name}
                                </span>
                                <span className="text-[10px] text-red-400 font-semibold">
                                  {s.failed_services_count} servicio{s.failed_services_count !== 1 ? 's' : ''} caído{s.failed_services_count !== 1 ? 's' : ''}
                                </span>
                              </div>

                              <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] font-bold shrink-0">
                                Reparar →
                              </span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* =========================================================================
                  TARJETA 4: ALERTAS ACTIVAS
                  ========================================================================= */}
              <div
                className={`bg-slate-900 border rounded-2xl p-5 transition-all duration-200 flex flex-col justify-between ${
                  expandedCards.alerts ? 'border-rose-500/50 shadow-lg shadow-rose-500/5' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
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
                      <span>Gestionar todas las alertas</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>

                {/* Botón de Despliegue Vista Rápida */}
                <div className="pt-3 mt-3 border-t border-slate-800/60">
                  <button
                    onClick={() => toggleCard('alerts')}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-[11px] font-semibold text-slate-300 hover:text-white transition-colors border border-slate-700/50"
                  >
                    <span className="flex items-center gap-1.5">
                      <ShieldAlert className="h-3 w-3 text-rose-400" />
                      <span>{expandedCards.alerts ? 'Ocultar vista rápida' : 'Vista rápida de alertas'}</span>
                    </span>
                    {expandedCards.alerts ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>

                  {/* Panel Desplegado */}
                  {expandedCards.alerts && (
                    <div className="mt-3 pt-3 border-t border-slate-800 space-y-2 text-xs animate-in fade-in">
                      <div className="flex items-center justify-between text-[11px] pb-1">
                        <span className="text-slate-400">Alertas recientes pendientes:</span>
                        <Link to="/alerts" className="text-rose-400 hover:text-rose-300 font-semibold text-[10px] flex items-center gap-0.5">
                          <span>Ver todas</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                      </div>

                      <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 text-[11px]">
                        {alerts.length === 0 ? (
                          <div className="p-3 bg-slate-950 rounded-xl text-center text-slate-500 italic">
                            No hay alertas activas pendientes
                          </div>
                        ) : (
                          alerts.map((a) => (
                            <div
                              key={a.id}
                              className="p-2 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-1.5">
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                                    a.severity === 'critical'
                                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                      : a.severity === 'warning'
                                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                  }`}
                                >
                                  {a.severity}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {formatDate(a.created_at)}
                                </span>
                              </div>

                              <p className="font-semibold text-slate-200 text-xs leading-snug truncate">
                                {a.title}
                              </p>

                              <div className="flex items-center justify-between pt-1">
                                <span className="text-[10px] text-slate-400 font-mono truncate">
                                  {a.server_name || 'Servidor Central'}
                                </span>
                                <button
                                  onClick={() => resolveAlertMutation.mutate(a.id)}
                                  disabled={resolveAlertMutation.isPending}
                                  className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-semibold transition-colors flex items-center gap-1"
                                >
                                  <Check className="h-2.5 w-2.5" />
                                  <span>Resolver</span>
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* =========================================================================
                SECCIÓN 5: CONSUMO AGREGADO DE LA FLOTA CON VISTA RÁPIDA POR NODO
                ========================================================================= */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-emerald-400" />
                    <span>Consumo Agregado de la Flota</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{summary.calculation_method}</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleCard('resources')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors border border-slate-700"
                  >
                    <span>{expandedCards.resources ? 'Ocultar desglose por servidor' : 'Desglose por servidor'}</span>
                    {expandedCards.resources ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>

                  <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[11px] font-mono text-slate-400">Live Heartbeat</span>
                  </div>
                </div>
              </div>

              {/* Gauges agregados */}
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

              {/* Desglose desplegable de recursos por servidor */}
              {expandedCards.resources && (
                <div className="mt-6 pt-6 border-t border-slate-800 space-y-3 animate-in fade-in">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Consumo Individual por Servidor Online:
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {servers
                      .filter((s) => s.status === 'online')
                      .map((s) => (
                        <Link
                          key={s.id}
                          to={`/servers/${s.id}`}
                          className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl hover:border-slate-700 transition-colors space-y-2 group"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-200 group-hover:text-brand-400 truncate">
                              {s.name}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {s.ip_address || 'Sin IP'}
                            </span>
                          </div>

                          {/* Barras individuales */}
                          <div className="space-y-1.5 text-[11px] font-mono">
                            <div className="flex items-center justify-between text-slate-400">
                              <span>CPU</span>
                              <span className="font-bold text-brand-400">{s.cpu_percent}%</span>
                            </div>
                            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-brand-500 h-full rounded-full"
                                style={{ width: `${Math.min(100, Math.max(0, s.cpu_percent))}%` }}
                              />
                            </div>

                            <div className="flex items-center justify-between text-slate-400 pt-0.5">
                              <span>RAM</span>
                              <span className="font-bold text-indigo-400">{s.ram_percent}%</span>
                            </div>
                            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-indigo-500 h-full rounded-full"
                                style={{ width: `${Math.min(100, Math.max(0, s.ram_percent))}%` }}
                              />
                            </div>
                          </div>
                        </Link>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
