import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { LogRecord, LogQueryResult, LogSourceItem, Server } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { cn, formatDate } from '@/lib/utils';
import {
  Search,
  RefreshCw,
  Download,
  Filter,
  Layers,
  Server as ServerIcon,
  Clock,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  FileText,
  SlidersHorizontal,
} from 'lucide-react';

interface LogExplorerProps {
  initialServerId?: string;
  serverName?: string;
  isEmbedded?: boolean;
}

const PRESET_RANGES = [
  { label: '15 min', minutes: 15 },
  { label: '1 hora', minutes: 60 },
  { label: '6 horas', minutes: 360 },
  { label: '24 horas', minutes: 1440 },
  { label: '7 días', minutes: 10080 },
];

const SEVERITY_LEVELS = [
  { label: 'Todos', value: 'all' },
  { label: 'DEBUG', value: 'debug', color: 'border-slate-700 text-slate-400 bg-slate-900/60' },
  { label: 'INFO', value: 'info', color: 'border-sky-800 text-sky-400 bg-sky-950/40' },
  { label: 'NOTICE', value: 'notice', color: 'border-teal-800 text-teal-400 bg-teal-950/40' },
  { label: 'WARN', value: 'warning', color: 'border-amber-800 text-amber-400 bg-amber-950/40' },
  { label: 'ERROR', value: 'error', color: 'border-rose-800 text-rose-400 bg-rose-950/40' },
  { label: 'CRIT', value: 'critical', color: 'border-red-700 text-red-400 bg-red-950/70 font-semibold' },
];

export const LogExplorer: React.FC<LogExplorerProps> = ({
  initialServerId,
  serverName,
  isEmbedded = false,
}) => {
  const { hasPermission } = useAuth();
  const [selectedServerId, setSelectedServerId] = useState<string>(initialServerId || 'all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedService, setSelectedService] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [timeRangeMinutes, setTimeRangeMinutes] = useState<number>(60);
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [isCustomTime, setIsCustomTime] = useState<boolean>(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'txt'>('csv');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // 1. Cargar servidores disponibles si no estamos en vista embebida
  const { data: servers = [] } = useQuery<Server[]>({
    queryKey: ['servers'],
    queryFn: () => api.get<Server[]>('/servers'),
    enabled: !isEmbedded,
  });

  // 2. Cargar fuentes disponibles (contenedores y servicios)
  const currentTargetServerId = initialServerId || (selectedServerId !== 'all' ? selectedServerId : undefined);
  const { data: sourcesData = [] } = useQuery<LogSourceItem[]>({
    queryKey: ['log-sources', currentTargetServerId],
    queryFn: () => {
      const q = currentTargetServerId ? `?server_id=${currentTargetServerId}` : '';
      return api.get<LogSourceItem[]>(`/logs/sources${q}`);
    },
  });

  // Opciones combinadas de servicios y contenedores
  const availableServices = useMemo(() => {
    const list = new Set<string>();
    sourcesData.forEach((s) => {
      if (selectedSource === 'all' || selectedSource === 'docker') {
        s.containers.forEach((c) => list.add(c));
      }
      if (selectedSource === 'all' || selectedSource === 'systemd') {
        s.services.forEach((srv) => list.add(srv));
      }
    });
    return Array.from(list).sort();
  }, [sourcesData, selectedSource]);

  // 3. Calcular parámetros de tiempo
  const timeParams = useMemo(() => {
    if (isCustomTime && customStart) {
      return {
        start_time: new Date(customStart).toISOString(),
        end_time: customEnd ? new Date(customEnd).toISOString() : new Date().toISOString(),
      };
    }
    const end = new Date();
    const start = new Date(end.getTime() - timeRangeMinutes * 60 * 1000);
    return {
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    };
  }, [isCustomTime, customStart, customEnd, timeRangeMinutes]);

  // 4. Query principal de Logs hacia el backend
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (initialServerId) {
      params.append('server_id', initialServerId);
    } else if (selectedServerId !== 'all') {
      params.append('server_id', selectedServerId);
    }

    if (selectedSource !== 'all') params.append('source', selectedSource);
    if (selectedService !== 'all') params.append('service', selectedService);
    if (selectedLevel !== 'all') params.append('level', selectedLevel);
    if (searchTerm.trim()) params.append('search', searchTerm.trim());

    params.append('start_time', timeParams.start_time);
    params.append('end_time', timeParams.end_time);
    params.append('limit', '300');
    params.append('direction', 'BACKWARD');

    return params.toString();
  }, [initialServerId, selectedServerId, selectedSource, selectedService, selectedLevel, searchTerm, timeParams]);

  const {
    data: queryResult,
    isLoading,
    isFetching,
    refetch,
    error,
  } = useQuery<LogQueryResult>({
    queryKey: ['logs-query', queryParams],
    queryFn: () => api.get<LogQueryResult>(`/logs/query?${queryParams}`),
    refetchInterval: autoRefreshInterval > 0 ? autoRefreshInterval * 1000 : false,
  });

  const logs = queryResult?.records || [];

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const exportParams = new URLSearchParams(queryParams);
      exportParams.set('format', exportFormat);
      exportParams.set('limit', '2000');

      const response = await fetch(`/api/v1/logs/export?${exportParams.toString()}`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Error al exportar logs.');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `linuxops_logs_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch (err: any) {
      alert(err.message || 'Error durante la exportación de logs.');
    } finally {
      setIsExporting(false);
    }
  };

  const getLevelBadgeClass = (level: string) => {
    const lvl = level?.toLowerCase() || '';
    if (lvl.includes('crit') || lvl.includes('fatal') || lvl.includes('emerg')) {
      return 'bg-red-950/80 text-red-400 border border-red-800/80 font-bold';
    }
    if (lvl.includes('err')) {
      return 'bg-rose-950/60 text-rose-400 border border-rose-800/60 font-semibold';
    }
    if (lvl.includes('warn')) {
      return 'bg-amber-950/50 text-amber-400 border border-amber-800/50';
    }
    if (lvl.includes('notice')) {
      return 'bg-teal-950/50 text-teal-400 border border-teal-800/50';
    }
    if (lvl.includes('debug')) {
      return 'bg-slate-900 text-slate-400 border border-slate-800';
    }
    return 'bg-sky-950/50 text-sky-400 border border-sky-800/50';
  };

  return (
    <div className="space-y-4">
      {/* Barra de Filtros Principal */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Servidor (Solo en vista global) */}
          {!isEmbedded && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Servidor</label>
              <div className="relative">
                <select
                  value={selectedServerId}
                  onChange={(e) => {
                    setSelectedServerId(e.target.value);
                    setSelectedService('all');
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500 appearance-none pr-8"
                >
                  <option value="all">Todos los Servidores</option>
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.ip_address || 'Sin IP'})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-500 absolute right-2.5 top-3 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Origen de Log */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Origen</label>
            <div className="relative">
              <select
                value={selectedSource}
                onChange={(e) => {
                  setSelectedSource(e.target.value);
                  setSelectedService('all');
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500 appearance-none pr-8"
              >
                <option value="all">Todos los Orígenes</option>
                <option value="docker">Docker Contenedores</option>
                <option value="systemd">systemd Servicios</option>
                <option value="syslog">syslog General</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-500 absolute right-2.5 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Servicio / Contenedor Específico */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Servicio / Contenedor</label>
            <div className="relative">
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500 appearance-none pr-8"
              >
                <option value="all">Todos los Servicios</option>
                {availableServices.map((svc) => (
                  <option key={svc} value={svc}>
                    {svc}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-500 absolute right-2.5 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Rango de Tiempo Preset */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Ventana Temporal</label>
            <div className="flex gap-1.5 bg-slate-950 p-1 border border-slate-800 rounded-lg">
              {PRESET_RANGES.map((preset) => (
                <button
                  key={preset.minutes}
                  onClick={() => {
                    setTimeRangeMinutes(preset.minutes);
                    setIsCustomTime(false);
                  }}
                  className={cn(
                    'flex-1 text-xs py-1 rounded transition-colors text-center font-medium',
                    !isCustomTime && timeRangeMinutes === preset.minutes
                      ? 'bg-brand-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  )}
                >
                  {preset.label}
                </button>
              ))}
              <button
                onClick={() => setIsCustomTime(!isCustomTime)}
                className={cn(
                  'px-2 py-1 text-xs rounded transition-colors',
                  isCustomTime
                    ? 'bg-brand-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                )}
                title="Rango personalizado"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Inputs de rango de fecha personalizado */}
        {isCustomTime && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/80">
            <span className="text-xs text-slate-400 font-medium">Desde:</span>
            <input
              type="datetime-local"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200"
            />
            <span className="text-xs text-slate-400 font-medium">Hasta:</span>
            <input
              type="datetime-local"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200"
            />
          </div>
        )}

        {/* Barra de Búsqueda y Botonera Secundaria */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Campo de Búsqueda de Texto */}
          <div className="relative flex-1 min-w-[280px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar en el mensaje o traza (ej: exception, 500, timeout, error)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Botones de acción: Refrescar, Auto-refresh, Exportar */}
          <div className="flex items-center gap-2">
            {/* Auto Refresh */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Auto:</span>
              <select
                value={autoRefreshInterval}
                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                className="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer"
              >
                <option value={0}>Off</option>
                <option value={5}>5s</option>
                <option value={10}>10s</option>
                <option value={30}>30s</option>
                <option value={60}>60s</option>
              </select>
            </div>

            {/* Botón Refrescar Manual */}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-1.5 bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-lg transition-colors disabled:opacity-50"
              title="Refrescar logs ahora"
            >
              <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin text-brand-400')} />
            </button>

            {/* Botón Exportar */}
            {hasPermission('logs:export') && (
              <button
                onClick={() => setShowExportModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors border border-slate-700"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar</span>
              </button>
            )}
          </div>
        </div>

        {/* Filtro por Nivel de Severidad (Pills) */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/80">
          <span className="text-xs text-slate-400 font-medium mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-slate-500" /> Severidad:
          </span>
          {SEVERITY_LEVELS.map((lvl) => {
            const isSelected = selectedLevel === lvl.value;
            return (
              <button
                key={lvl.value}
                onClick={() => setSelectedLevel(lvl.value)}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-full border transition-all font-mono',
                  isSelected
                    ? lvl.color || 'bg-brand-600 text-white border-brand-500 font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                )}
              >
                {lvl.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Barra de Estado y Metadatos de la Consulta */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <div className="flex items-center gap-3">
          <span>
            Mostrando <strong className="text-slate-200 font-mono">{logs.length}</strong> registros
          </span>
          {queryResult?.query_duration_ms !== undefined && (
            <span className="text-slate-500 font-mono">({queryResult.query_duration_ms.toFixed(0)} ms)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px]">
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                queryResult?.loki_status === 'ok' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              )}
            />
            {queryResult?.loki_status === 'ok' ? 'Loki Operativo' : 'Loki Sincronizando'}
          </span>
        </div>
      </div>

      {/* Visualizador de Registros de Logs */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-inner">
        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-brand-500" />
            <p className="text-sm">Consultando registros en Grafana Loki...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-400 space-y-2">
            <AlertTriangle className="w-8 h-8 mx-auto text-rose-500" />
            <p className="font-semibold text-sm">Error al consultar registros de logs</p>
            <p className="text-xs text-slate-400 font-mono">{(error as any)?.message || 'Fallo de conexión con el motor de logs'}</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-slate-500 space-y-3">
            <FileText className="w-10 h-10 mx-auto text-slate-600 opacity-60" />
            <p className="text-sm font-medium text-slate-300">No se encontraron registros de logs</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Intente ampliar el rango de tiempo, cambiar los filtros o verificar que los agentes remotos estén activos.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80 font-mono text-xs">
            {logs.map((log) => {
              const isExpanded = expandedRowId === log.id;
              const isCopied = copiedId === log.id;

              return (
                <div
                  key={log.id}
                  className={cn(
                    'transition-colors',
                    isExpanded ? 'bg-slate-900/80' : 'hover:bg-slate-900/40'
                  )}
                >
                  {/* Fila principal compacta */}
                  <div
                    onClick={() => setExpandedRowId(isExpanded ? null : log.id)}
                    className="flex items-start gap-2.5 px-3 py-2 cursor-pointer select-text"
                  >
                    <button
                      type="button"
                      className="mt-0.5 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-brand-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Timestamp */}
                    <span className="text-slate-400 whitespace-nowrap min-w-[145px] font-mono text-[11px]">
                      {new Date(log.timestamp).toLocaleString('es-ES', {
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>

                    {/* Servidor (si es vista global) */}
                    {!isEmbedded && (
                      <span
                        className="text-slate-300 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap max-w-[120px] truncate"
                        title={log.server_name || log.server_id}
                      >
                        {log.server_name || log.server_id.slice(0, 8)}
                      </span>
                    )}

                    {/* Origen + Servicio */}
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap',
                        log.source === 'docker'
                          ? 'bg-blue-950/60 text-blue-400 border border-blue-900/50'
                          : 'bg-purple-950/60 text-purple-400 border border-purple-900/50'
                      )}
                    >
                      {log.service}
                    </span>

                    {/* Nivel de Severidad */}
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider whitespace-nowrap',
                        getLevelBadgeClass(log.level)
                      )}
                    >
                      {log.level}
                    </span>

                    {/* Mensaje de Log */}
                    <span className="text-slate-200 flex-1 break-all line-clamp-1 font-normal font-sans">
                      {log.message}
                    </span>

                    {/* Botón rápido copiar */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyMessage(log.id, log.message);
                      }}
                      className="text-slate-500 hover:text-slate-300 p-0.5 rounded"
                      title="Copiar mensaje"
                    >
                      {isCopied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Panel expandible con detalles completos y metadatos */}
                  {isExpanded && (
                    <div className="px-9 pb-3 pt-1 space-y-2 text-xs bg-slate-950/80 border-t border-slate-800/40">
                      <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 font-mono text-slate-100 whitespace-pre-wrap break-all select-all">
                        {log.message}
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400 pt-1 font-sans">
                        <div>
                          <span className="text-slate-500 font-medium">Timestamp ISO:</span>{' '}
                          <span className="font-mono text-slate-300">{log.timestamp}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Stream:</span>{' '}
                          <span className="font-mono text-slate-300">{log.stream || 'stdout'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Servidor ID:</span>{' '}
                          <span className="font-mono text-slate-300">{log.server_id}</span>
                        </div>
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div className="w-full mt-1">
                            <span className="text-slate-500 font-medium block mb-1">Metadatos estructurados:</span>
                            <pre className="bg-slate-900/90 p-2 rounded text-[10px] text-slate-300 overflow-x-auto border border-slate-800 font-mono">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Exportación de Logs */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <Download className="w-5 h-5 text-brand-400" />
              Exportar Registros de Logs
            </h3>
            <p className="text-xs text-slate-400">
              Seleccione el formato para descargar el lote de registros con los filtros activos actualmente.
              La descarga quedará registrada en la pista criptográfica de auditoría.
            </p>

            <div className="space-y-2 pt-2">
              <label className="text-xs font-medium text-slate-300 block">Formato de Archivo</label>
              <div className="grid grid-cols-3 gap-2">
                {(['csv', 'json', 'txt'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setExportFormat(fmt)}
                    className={cn(
                      'py-2 px-3 rounded-lg border text-xs font-semibold uppercase transition-all',
                      exportFormat === fmt
                        ? 'bg-brand-600 border-brand-500 text-white shadow'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                    )}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div>Filtro servidor: <span className="text-slate-200 font-mono">{selectedServerId}</span></div>
              <div>Filtro origen: <span className="text-slate-200 font-mono">{selectedSource}</span></div>
              <div>Filtro servicio: <span className="text-slate-200 font-mono">{selectedService}</span></div>
              <div>Límite máximo: <span className="text-slate-200 font-mono">2000 registros</span></div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Generando...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

