import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SystemdUnit } from '@/types';
import {
  Play,
  Square,
  RotateCw,
  FileText,
  X,
  AlertTriangle,
  Search,
  Filter,
  Layers,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';

interface ServicesTabProps {
  serverId: string;
}

export const ServicesTab: React.FC<ServicesTabProps> = ({ serverId }) => {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  // Estados de modales y acciones
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [journalContent, setJournalContent] = useState<string>('');
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Filtros y agrupación
  const defaultState = searchParams.get('state') || 'all';
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeStateFilter, setActiveStateFilter] = useState<string>(defaultState);
  const [subStateFilter, setSubStateFilter] = useState<string>('all');
  const [groupBy, setGroupBy] = useState<'none' | 'active_state' | 'sub_state'>('none');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const { data: units = [], isLoading, isRefetching, error, refetch } = useQuery<SystemdUnit[]>({
    queryKey: ['systemd-units', serverId],
    queryFn: () => api.get<SystemdUnit[]>(`/servers/${serverId}/systemd/units`),
    refetchInterval: 15000,
  });

  const actionMutation = useMutation({
    mutationFn: ({ unit, action }: { unit: string; action: string }) =>
      api.post(`/servers/${serverId}/systemd/units/action`, { unit, action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemd-units', serverId] });
      queryClient.invalidateQueries({ queryKey: ['server-detail', serverId] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
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
    setJournalContent('Cargando registros journalctl...');
    try {
      const res = await api.get<{ logs: string }>(
        `/servers/${serverId}/systemd/units/${unit}/journal?lines=200`
      );
      setJournalContent(res.logs || 'Sin registros recientes disponibles.');
    } catch (e: any) {
      setJournalContent(`Error al consultar journalctl: ${e.message}`);
    }
  };

  // 1. Identificación rápida de servicios fallidos
  const failedUnits = useMemo(() => {
    return units.filter(
      (u) => u.active_state === 'failed' || u.sub_state === 'failed'
    );
  }, [units]);

  // Contadores por estado
  const activeCount = useMemo(() => units.filter((u) => u.active_state === 'active').length, [units]);
  const inactiveCount = useMemo(() => units.filter((u) => u.active_state === 'inactive').length, [units]);
  const failedCount = failedUnits.length;

  // Lista única de sub-estados para el dropdown
  const availableSubStates = useMemo(() => {
    const set = new Set<string>();
    units.forEach((u) => {
      if (u.sub_state) set.add(u.sub_state);
    });
    return Array.from(set).sort();
  }, [units]);

  // Filtrado de servicios
  const filteredUnits = useMemo(() => {
    return units.filter((u) => {
      // Filtro de texto (nombre o descripción)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = u.unit.toLowerCase().includes(q);
        const matchDesc = (u.description || '').toLowerCase().includes(q);
        if (!matchName && !matchDesc) return false;
      }

      // Filtro por active_state
      if (activeStateFilter !== 'all') {
        if (activeStateFilter === 'failed') {
          if (u.active_state !== 'failed' && u.sub_state !== 'failed') return false;
        } else if (u.active_state !== activeStateFilter) {
          return false;
        }
      }

      // Filtro por sub_state
      if (subStateFilter !== 'all' && u.sub_state !== subStateFilter) {
        return false;
      }

      return true;
    });
  }, [units, searchQuery, activeStateFilter, subStateFilter]);

  // Ordenación: Fallidos primero para visibilidad inmediata
  const sortedUnits = useMemo(() => {
    return [...filteredUnits].sort((a, b) => {
      const aFailed = a.active_state === 'failed' || a.sub_state === 'failed';
      const bFailed = b.active_state === 'failed' || b.sub_state === 'failed';
      if (aFailed && !bFailed) return -1;
      if (!aFailed && bFailed) return 1;
      return a.unit.localeCompare(b.unit);
    });
  }, [filteredUnits]);

  // Agrupación opcional
  const groupedUnits = useMemo(() => {
    if (groupBy === 'none') return null;

    const groups: Record<string, SystemdUnit[]> = {};
    sortedUnits.forEach((u) => {
      const key = groupBy === 'active_state' ? u.active_state : u.sub_state;
      const groupName = key || 'Sin estado';
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(u);
    });

    // Asegurar que 'failed' quede de primero en la lista de grupos si existe
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'failed') return -1;
      if (b === 'failed') return 1;
      if (a === 'active') return -1;
      if (b === 'active') return 1;
      return a.localeCompare(b);
    });

    return sortedKeys.map((key) => ({
      key,
      units: groups[key],
    }));
  }, [sortedUnits, groupBy]);

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
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>No se pudo comunicar con systemd en este host: {(error as any).message}</span>
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
    <div className="space-y-5">
      {/* =========================================================================
          MECANISMO RÁPIDO DE IDENTIFICACIÓN: BANNER DE SERVICIO(S) CAÍDO(S)
          ========================================================================= */}
      {failedUnits.length > 0 && (
        <div className="p-4 bg-rose-500/10 border-2 border-rose-500/30 rounded-2xl space-y-3 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <ShieldAlert className="h-5 w-5 shrink-0 animate-pulse text-rose-400" />
              <span>
                ¡Atención! Se {failedUnits.length === 1 ? 'ha detectado 1 servicio caído' : `han detectado ${failedUnits.length} servicios caídos`} en este servidor:
              </span>
            </div>

            <button
              onClick={() => {
                setActiveStateFilter('failed');
                setSubStateFilter('all');
                setSearchQuery('');
              }}
              className="text-xs text-rose-300 hover:text-white underline font-semibold self-start sm:self-auto"
            >
              Filtrar tabla solo por caídos ({failedUnits.length})
            </button>
          </div>

          {/* Lista de servicios caídos con acciones rápidas de 1 clic */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {failedUnits.map((fu) => (
              <div
                key={fu.unit}
                className="bg-slate-950/90 border border-rose-500/30 rounded-xl p-3 flex flex-col justify-between gap-2 shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-rose-300 text-xs truncate" title={fu.unit}>
                      {fu.unit}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                      FAILED
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5" title={fu.description}>
                    {fu.description || 'Sin descripción'}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 pt-1 border-t border-slate-800/80">
                  <button
                    onClick={() => openJournal(fu.unit)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[10px] font-semibold transition-colors"
                    title="Ver registros de error en journalctl"
                  >
                    <FileText className="h-3 w-3 text-brand-400" />
                    <span>Ver Logs</span>
                  </button>
                  <button
                    onClick={() => handleAction(fu.unit, 'restart')}
                    disabled={actionLoading === `${fu.unit}-restart`}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-semibold transition-colors disabled:opacity-50"
                    title="Reiniciar servicio fallido"
                  >
                    <RotateCw className={`h-3 w-3 ${actionLoading === `${fu.unit}-restart` ? 'animate-spin' : ''}`} />
                    <span>Reiniciar</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          BARRA DE CONTROL: BÚSQUEDA, FILTRO POR ESTADO / SUB-ESTADO Y AGRUPACIÓN
          ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Buscador */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por unidad (.service) o descripción..."
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

          {/* Opciones de Agrupación */}
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
                onClick={() => setGroupBy('active_state')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                  groupBy === 'active_state' ? 'bg-slate-800 text-brand-400 shadow-sm font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Estado Activo
              </button>
              <button
                onClick={() => setGroupBy('sub_state')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                  groupBy === 'sub_state' ? 'bg-slate-800 text-brand-400 shadow-sm font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sub-estado
              </button>
            </div>

            <button
              onClick={() => refetch()}
              disabled={isRefetching}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors"
              title="Refrescar lista de servicios"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin text-brand-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filtros de Estado y Sub-Estado */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs">
          {/* Píldoras de Estado Activo */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500 text-[11px] font-semibold mr-1">Estado:</span>
            <button
              onClick={() => setActiveStateFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                activeStateFilter === 'all'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800/80'
              }`}
            >
              Todos ({units.length})
            </button>

            <button
              onClick={() => setActiveStateFilter('failed')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                activeStateFilter === 'failed'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold shadow-sm'
                  : 'bg-slate-950 text-slate-400 hover:text-rose-400 border border-slate-800/80'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${failedCount > 0 ? 'bg-rose-500 animate-ping' : 'bg-slate-500'}`} />
              <span>Fallidos</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/30">
                {failedCount}
              </span>
            </button>

            <button
              onClick={() => setActiveStateFilter('active')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                activeStateFilter === 'active'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold shadow-sm'
                  : 'bg-slate-950 text-slate-400 hover:text-emerald-400 border border-slate-800/80'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Activos</span>
              <span className="text-slate-500 text-[10px]">({activeCount})</span>
            </button>

            <button
              onClick={() => setActiveStateFilter('inactive')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                activeStateFilter === 'inactive'
                  ? 'bg-slate-700 text-slate-200 border border-slate-600 font-bold shadow-sm'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800/80'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
              <span>Inactivos</span>
              <span className="text-slate-500 text-[10px]">({inactiveCount})</span>
            </button>
          </div>

          {/* Dropdown de Sub-Estado */}
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-[11px] font-semibold">Sub-estado:</span>
            <select
              value={subStateFilter}
              onChange={(e) => setSubStateFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-slate-200 focus:outline-none focus:border-brand-500 text-xs font-mono"
            >
              <option value="all">Todos los sub-estados</option>
              {availableSubStates.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>

            {(searchQuery || activeStateFilter !== 'all' || subStateFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setActiveStateFilter('all');
                  setSubStateFilter('all');
                }}
                className="text-[11px] text-brand-400 hover:text-brand-300 font-semibold underline ml-1"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Resumen de conteo */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>
          Mostrando <strong className="text-slate-200">{sortedUnits.length}</strong> de {units.length} servicios
        </span>
        {groupBy !== 'none' && (
          <span className="text-brand-400 font-mono text-[11px]">
            Agrupado por: {groupBy === 'active_state' ? 'Estado Activo' : 'Sub-estado'}
          </span>
        )}
      </div>

      {/* =========================================================================
          TABLA DE SERVICIOS (AGRUPADA O PLANA)
          ========================================================================= */}
      {sortedUnits.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-2">
          <Layers className="h-8 w-8 text-slate-600 mx-auto" />
          <p className="font-semibold text-slate-300">No se encontraron servicios coincidentes</p>
          <p className="text-xs text-slate-500">
            Intente ajustar los filtros de estado o el término de búsqueda.
          </p>
        </div>
      ) : groupBy === 'none' ? (
        /* Vista Plana */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <UnitTable
            units={sortedUnits}
            actionLoading={actionLoading}
            handleAction={handleAction}
            openJournal={openJournal}
          />
        </div>
      ) : (
        /* Vista Agrupada por Acordeones */
        <div className="space-y-4">
          {groupedUnits?.map((group) => {
            const isCollapsed = Boolean(collapsedGroups[group.key]);
            const isFailedGroup = group.key === 'failed';

            return (
              <div
                key={group.key}
                className={`bg-slate-900 border rounded-2xl overflow-hidden transition-all ${
                  isFailedGroup ? 'border-rose-500/40 shadow-sm shadow-rose-500/5' : 'border-slate-800'
                }`}
              >
                {/* Cabecera del Grupo */}
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={`w-full flex items-center justify-between p-3.5 text-left transition-colors ${
                    isFailedGroup ? 'bg-rose-500/10 hover:bg-rose-500/15' : 'bg-slate-950/70 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                    <span
                      className={`font-mono text-xs font-bold uppercase tracking-wide ${
                        isFailedGroup
                          ? 'text-rose-400'
                          : group.key === 'active'
                          ? 'text-emerald-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {group.key}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                      {group.units.length} servicio{group.units.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <span className="text-[11px] text-slate-400 font-mono">
                    {isCollapsed ? 'Click para expandir' : 'Click para colapsar'}
                  </span>
                </button>

                {/* Contenido del Grupo */}
                {!isCollapsed && (
                  <div className="border-t border-slate-800">
                    <UnitTable
                      units={group.units}
                      actionLoading={actionLoading}
                      handleAction={handleAction}
                      openJournal={openJournal}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          MODAL JOURNALCTL LOGS
          ========================================================================= */}
      {isJournalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-brand-400" />
                <h3 className="font-bold text-slate-100 text-sm font-mono">
                  journalctl -u {selectedUnit} -n 200 --no-pager
                </h3>
              </div>
              <button
                onClick={() => setIsJournalOpen(false)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs bg-slate-950 rounded-b-2xl">
              <pre className="p-3 bg-slate-950 rounded-xl text-slate-300 whitespace-pre-wrap select-all max-h-[60vh] overflow-y-auto leading-relaxed">
                {journalContent}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// Subcomponente Tabla de Unidades systemd
// =========================================================================
interface UnitTableProps {
  units: SystemdUnit[];
  actionLoading: string | null;
  handleAction: (unit: string, action: string) => void;
  openJournal: (unit: string) => void;
}

const UnitTable: React.FC<UnitTableProps> = ({
  units,
  actionLoading,
  handleAction,
  openJournal,
}) => {
  return (
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
        {units.map((u) => {
          const isFailed = u.active_state === 'failed' || u.sub_state === 'failed';

          return (
            <tr
              key={u.unit}
              className={`transition-colors ${
                isFailed ? 'bg-rose-500/5 hover:bg-rose-500/10' : 'hover:bg-slate-800/30'
              }`}
            >
              <td className="py-3.5 px-4 font-mono font-bold text-slate-200">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      isFailed
                        ? 'bg-rose-500 shadow-sm shadow-rose-500'
                        : u.active_state === 'active'
                        ? 'bg-emerald-400'
                        : 'bg-slate-500'
                    }`}
                  />
                  <span className={isFailed ? 'text-rose-300 font-extrabold' : ''}>{u.unit}</span>
                </div>
              </td>

              <td className="py-3.5 px-4">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                    isFailed
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/30 font-bold'
                      : u.active_state === 'active'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {u.active_state}
                </span>
              </td>

              <td className="py-3.5 px-4 font-mono text-slate-400">
                <span className={isFailed ? 'text-rose-400 font-bold' : ''}>{u.sub_state}</span>
              </td>

              <td className="py-3.5 px-4 text-slate-300 truncate max-w-sm" title={u.description}>
                {u.description || '—'}
              </td>

              <td className="py-3.5 px-4 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  {u.active_state !== 'active' ? (
                    <button
                      onClick={() => handleAction(u.unit, 'start')}
                      title="Iniciar servicio"
                      disabled={actionLoading === `${u.unit}-start`}
                      className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors border border-emerald-500/20"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAction(u.unit, 'stop')}
                      title="Detener servicio"
                      disabled={actionLoading === `${u.unit}-stop`}
                      className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/20"
                    >
                      <Square className="h-3.5 w-3.5" />
                    </button>
                  )}

                  <button
                    onClick={() => handleAction(u.unit, 'restart')}
                    title="Reiniciar servicio"
                    disabled={actionLoading === `${u.unit}-restart`}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700"
                  >
                    <RotateCw
                      className={`h-3.5 w-3.5 ${
                        actionLoading === `${u.unit}-restart` ? 'animate-spin text-brand-400' : ''
                      }`}
                    />
                  </button>

                  <button
                    onClick={() => openJournal(u.unit)}
                    title="Ver journalctl logs"
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700"
                  >
                    <FileText className="h-3.5 w-3.5" />
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
