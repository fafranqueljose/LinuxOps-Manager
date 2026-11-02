import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Container } from '@/types';
import {
  Play,
  Square,
  RotateCw,
  FileText,
  Info,
  X,
  AlertTriangle,
  Layers,
  Box,
  Search,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  XCircle,
  FolderGit2,
} from 'lucide-react';

interface ContainersTabProps {
  serverId: string;
}

export const ContainersTab: React.FC<ContainersTabProps> = ({ serverId }) => {
  const queryClient = useQueryClient();

  // Estados de modales
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<'logs' | 'inspect' | null>(null);
  const [logsContent, setLogsContent] = useState<string>('');
  const [inspectData, setInspectData] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Estados de filtros y agrupación
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [groupBy, setGroupBy] = useState<'none' | 'compose_project' | 'state'>('none');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const { data: containers = [], isLoading, isRefetching, error, refetch } = useQuery<Container[]>({
    queryKey: ['docker-containers', serverId],
    queryFn: () => api.get<Container[]>(`/servers/${serverId}/docker/containers`),
    refetchInterval: 10000,
  });

  const containerActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      api.post(`/servers/${serverId}/docker/containers/${id}/action`, { action, timeout_seconds: 10 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docker-containers', serverId] });
      queryClient.invalidateQueries({ queryKey: ['server-detail', serverId] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
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
      const res = await api.get<{ logs: string }>(
        `/servers/${serverId}/docker/containers/${id}/logs?tail=300`
      );
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

  // Contenedores caídos / detenidos
  const stoppedContainers = useMemo(
    () => containers.filter((c) => c.state !== 'running'),
    [containers]
  );
  const runningCount = containers.length - stoppedContainers.length;

  // Filtrado
  const filteredContainers = useMemo(() => {
    return containers.filter((c) => {
      // Filtro de texto
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (c.names?.[0] || c.id).toLowerCase().includes(q);
        const matchImage = (c.image || '').toLowerCase().includes(q);
        const matchProject = (c.compose_project || '').toLowerCase().includes(q);
        const matchService = (c.compose_service || '').toLowerCase().includes(q);
        if (!matchName && !matchImage && !matchProject && !matchService) return false;
      }

      // Filtro de estado
      if (stateFilter === 'running' && c.state !== 'running') return false;
      if (stateFilter === 'stopped' && c.state === 'running') return false;

      return true;
    });
  }, [containers, searchQuery, stateFilter]);

  // Agrupación opcional
  const groupedContainers = useMemo(() => {
    if (groupBy === 'none') return null;

    const groups: Record<string, Container[]> = {};

    filteredContainers.forEach((c) => {
      let key = '';
      if (groupBy === 'compose_project') {
        key = c.compose_project ? `Proyecto: ${c.compose_project}` : 'Sin Proyecto Compose (Standalone)';
      } else {
        key = `Estado: ${c.state || 'Desconocido'}`;
      }

      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });

    return Object.entries(groups).map(([key, items]) => ({
      key,
      items,
      runningCount: items.filter((c) => c.state === 'running').length,
      stoppedCount: items.filter((c) => c.state !== 'running').length,
    }));
  }, [filteredContainers, groupBy]);

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
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>No se pudo comunicar con Docker Engine en este host: {(error as any).message}</span>
        </div>
        <button
          onClick={() => refetch()}
          className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded-lg font-semibold transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* =========================================================================
          BARRA DE CONTROL: BÚSQUEDA, ESTADO Y AGRUPACIÓN POR PROYECTO COMPOSE
          ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Buscador */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar contenedor, imagen o proyecto compose..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 text-xs font-mono"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Selector de Agrupación (Proyecto Compose / Estado / Sin Agrupar) */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-semibold whitespace-nowrap flex items-center gap-1">
              <Layers className="h-3.5 w-3.5 text-brand-400" />
              <span>Agrupar por:</span>
            </span>
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setGroupBy('none')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                  groupBy === 'none' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sin agrupar
              </button>
              <button
                onClick={() => setGroupBy('compose_project')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1 ${
                  groupBy === 'compose_project'
                    ? 'bg-slate-800 text-brand-400 shadow-sm font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FolderGit2 className="h-3 w-3" />
                <span>Proyecto Compose</span>
              </button>
              <button
                onClick={() => setGroupBy('state')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                  groupBy === 'state' ? 'bg-slate-800 text-brand-400 shadow-sm font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Estado
              </button>
            </div>

            <button
              onClick={() => refetch()}
              disabled={isRefetching}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors"
              title="Refrescar lista de contenedores"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin text-brand-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Píldoras de Filtro por Estado */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500 text-[11px] font-semibold mr-1">Filtrar:</span>
            <button
              onClick={() => setStateFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                stateFilter === 'all'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800/80'
              }`}
            >
              Todos ({containers.length})
            </button>

            <button
              onClick={() => setStateFilter('running')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                stateFilter === 'running'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold shadow-sm'
                  : 'bg-slate-950 text-slate-400 hover:text-emerald-400 border border-slate-800/80'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Activos</span>
              <span className="text-slate-500 text-[10px]">({runningCount})</span>
            </button>

            <button
              onClick={() => setStateFilter('stopped')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                stateFilter === 'stopped'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold shadow-sm'
                  : 'bg-slate-950 text-slate-400 hover:text-rose-400 border border-slate-800/80'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
              <span>Detenidos</span>
              <span className="text-slate-500 text-[10px]">({stoppedContainers.length})</span>
            </button>
          </div>

          {(searchQuery || stateFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStateFilter('all');
              }}
              className="text-[11px] text-brand-400 hover:text-brand-300 font-semibold underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          TABLA DE CONTENEDORES (PLANA O AGRUPADA)
          ========================================================================= */}
      {filteredContainers.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-2">
          <Box className="h-8 w-8 text-slate-600 mx-auto" />
          <p className="font-semibold text-slate-300">No se encontraron contenedores coincidentes</p>
          <p className="text-xs text-slate-500">Intente modificar la búsqueda o el filtro de estado.</p>
        </div>
      ) : groupBy === 'none' ? (
        /* Vista Plana */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <ContainerTable
            containers={filteredContainers}
            actionLoading={actionLoading}
            handleAction={handleAction}
            openLogs={openLogs}
            openInspect={openInspect}
          />
        </div>
      ) : (
        /* Vista Agrupada (por Proyecto Compose o por Estado) */
        <div className="space-y-4">
          {groupedContainers?.map((group) => {
            const isCollapsed = Boolean(collapsedGroups[group.key]);

            return (
              <div
                key={group.key}
                className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden transition-all"
              >
                {/* Cabecera del Grupo Compose / Estado */}
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center justify-between p-3.5 bg-slate-950/70 hover:bg-slate-800/50 text-left transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                    {groupBy === 'compose_project' && <FolderGit2 className="h-4 w-4 text-brand-400" />}
                    <span className="font-bold text-xs text-slate-200">{group.key}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                      {group.items.length} servicio{group.items.length !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-2 text-[10px] font-mono text-slate-400 ml-2">
                      <span className="text-emerald-400">{group.runningCount} activos</span>
                      {group.stoppedCount > 0 && <span className="text-rose-400">{group.stoppedCount} detenidos</span>}
                    </span>
                  </div>

                  <span className="text-[11px] text-slate-400 font-mono">
                    {isCollapsed ? 'Click para expandir' : 'Click para colapsar'}
                  </span>
                </button>

                {/* Contenido del Grupo */}
                {!isCollapsed && (
                  <div className="border-t border-slate-800">
                    <ContainerTable
                      containers={group.items}
                      actionLoading={actionLoading}
                      handleAction={handleAction}
                      openLogs={openLogs}
                      openInspect={openInspect}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          MODALES DE LOGS E INSPECT
          ========================================================================= */}
      {modalMode === 'logs' && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-100 text-sm font-mono">
                docker logs {selectedContainer?.slice(0, 12)}
              </h3>
              <button
                onClick={() => setModalMode(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs bg-slate-950 rounded-b-2xl">
              <pre className="p-3 bg-slate-950 rounded-xl text-slate-300 whitespace-pre-wrap select-all max-h-[60vh] overflow-y-auto leading-relaxed">
                {logsContent}
              </pre>
            </div>
          </div>
        </div>
      )}

      {modalMode === 'inspect' && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-100 text-sm font-mono">
                docker inspect {selectedContainer?.slice(0, 12)}
              </h3>
              <button
                onClick={() => setModalMode(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs bg-slate-950 rounded-b-2xl">
              <pre className="p-3 bg-slate-950 rounded-xl text-slate-300 whitespace-pre-wrap select-all max-h-[60vh] overflow-y-auto leading-relaxed">
                {JSON.stringify(inspectData, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// Subcomponente Tabla de Contenedores
// =========================================================================
interface ContainerTableProps {
  containers: Container[];
  actionLoading: string | null;
  handleAction: (id: string, action: string) => void;
  openLogs: (id: string) => void;
  openInspect: (id: string) => void;
}

const ContainerTable: React.FC<ContainerTableProps> = ({
  containers,
  actionLoading,
  handleAction,
  openLogs,
  openInspect,
}) => {
  return (
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
        {containers.map((c) => {
          const isRunning = c.state === 'running';

          return (
            <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
              <td className="py-3.5 px-4">
                <div className="font-bold text-slate-100 flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      isRunning ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-slate-500'
                    }`}
                  />
                  <span>{c.names?.[0] || c.id.slice(0, 12)}</span>
                </div>
                <div className="text-[10px] font-mono text-slate-500 ml-3.5">{c.id.slice(0, 12)}</div>
              </td>

              <td className="py-3.5 px-4">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                    isRunning
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20 font-bold'
                  }`}
                >
                  {c.state}
                </span>
              </td>

              <td className="py-3.5 px-4 font-mono text-slate-300 truncate max-w-xs" title={c.image}>
                {c.image}
              </td>

              <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                {c.ports.length > 0
                  ? c.ports
                      .map((p) =>
                        p.public_port ? `${p.public_port}:${p.private_port}` : `${p.private_port}`
                      )
                      .join(', ')
                  : '—'}
              </td>

              <td className="py-3.5 px-4">
                {c.compose_project ? (
                  <span className="px-2 py-0.5 rounded-md bg-brand-500/10 text-brand-400 border border-brand-500/20 text-[10px] font-mono font-semibold">
                    {c.compose_project}
                  </span>
                ) : (
                  <span className="text-slate-500 text-[11px]">—</span>
                )}
              </td>

              <td className="py-3.5 px-4 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  {!isRunning ? (
                    <button
                      onClick={() => handleAction(c.id, 'start')}
                      title="Iniciar contenedor"
                      disabled={actionLoading === `${c.id}-start`}
                      className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors border border-emerald-500/20"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAction(c.id, 'stop')}
                      title="Detener contenedor"
                      disabled={actionLoading === `${c.id}-stop`}
                      className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/20"
                    >
                      <Square className="h-3.5 w-3.5" />
                    </button>
                  )}

                  <button
                    onClick={() => handleAction(c.id, 'restart')}
                    title="Reiniciar contenedor"
                    disabled={actionLoading === `${c.id}-restart`}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700"
                  >
                    <RotateCw
                      className={`h-3.5 w-3.5 ${
                        actionLoading === `${c.id}-restart` ? 'animate-spin text-brand-400' : ''
                      }`}
                    />
                  </button>

                  <button
                    onClick={() => openLogs(c.id)}
                    title="Ver registros"
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700"
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </button>

                  <button
                    onClick={() => openInspect(c.id)}
                    title="Inspeccionar JSON"
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
