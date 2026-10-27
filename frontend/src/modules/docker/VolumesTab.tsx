import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DockerVolume } from '@/types';
import {
  Database,
  Search,
  RefreshCw,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Box,
  FolderOpen,
} from 'lucide-react';

interface VolumesTabProps {
  serverId: string;
}

export const VolumesTab: React.FC<VolumesTabProps> = ({ serverId }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_use' | 'unused'>('all');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const {
    data: volumes,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useQuery<DockerVolume[]>({
    queryKey: ['docker-volumes', serverId],
    queryFn: () => api.get<DockerVolume[]>(`/servers/${serverId}/docker/volumes`),
    refetchInterval: 15000,
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const filteredVolumes = (volumes || []).filter((v) => {
    const s = search.toLowerCase();
    const matchesSearch =
      v.name.toLowerCase().includes(s) ||
      (v.driver || '').toLowerCase().includes(s) ||
      (v.mountpoint || '').toLowerCase().includes(s);

    if (!matchesSearch) return false;
    if (statusFilter === 'in_use') return v.in_use;
    if (statusFilter === 'unused') return !v.in_use;
    return true;
  });

  const inUseCount = (volumes || []).filter((v) => v.in_use).length;
  const unusedCount = (volumes || []).length - inUseCount;

  return (
    <div className="space-y-4">
      {/* Resumen de Volúmenes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
              <Database className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-400">Total Volúmenes</div>
              <div className="text-lg font-bold text-slate-100">{volumes?.length || 0}</div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-2.5">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-400">En Uso por Contenedores</div>
            <div className="text-lg font-bold text-emerald-400">{inUseCount}</div>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-2.5">
          <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
            <AlertCircle className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-400">Sin Contenedor Asignado</div>
            <div className="text-lg font-bold text-amber-400">{unusedCount}</div>
          </div>
        </div>
      </div>

      {/* Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por nombre, driver o ruta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900/80 p-0.5 text-xs font-medium">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === 'all'
                  ? 'bg-slate-800 text-slate-100 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todos ({volumes?.length || 0})
            </button>
            <button
              onClick={() => setStatusFilter('in_use')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === 'in_use'
                  ? 'bg-slate-800 text-emerald-400 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              En uso ({inUseCount})
            </button>
            <button
              onClick={() => setStatusFilter('unused')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === 'unused'
                  ? 'bg-slate-800 text-amber-400 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sin usar ({unusedCount})
            </button>
          </div>

          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-lg transition-colors"
            title="Refrescar volúmenes"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin text-brand-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabla de Volúmenes */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-brand-500" />
            Consultando inventario de volúmenes a través del agente...
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-400 text-xs">
            <AlertCircle className="h-6 w-6 mx-auto mb-2 text-red-500" />
            Error al consultar volúmenes: {(error as any)?.message || 'Fallo de conexión con el agente.'}
          </div>
        ) : filteredVolumes.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No se encontraron volúmenes Docker que coincidan con la búsqueda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-medium">
                <tr>
                  <th className="py-2.5 px-4">Nombre del Volumen</th>
                  <th className="py-2.5 px-4">Driver</th>
                  <th className="py-2.5 px-4">Punto de Montaje (Host)</th>
                  <th className="py-2.5 px-4 text-center">Estado</th>
                  <th className="py-2.5 px-4">Contenedores Asignados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredVolumes.map((vol) => {
                  const isCopiedName = copiedText === vol.name;
                  const isCopiedPath = copiedText === vol.mountpoint;
                  const isAnonymous = vol.name.length >= 64 && /^[0-9a-fA-F]+$/.test(vol.name);

                  return (
                    <tr key={vol.name} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2 font-sans font-semibold text-slate-200">
                          <HardDrive className="h-4 w-4 text-indigo-400 shrink-0" />
                          <span
                            className="font-mono text-xs truncate max-w-xs"
                            title={vol.name}
                          >
                            {isAnonymous ? `${vol.name.substring(0, 16)}...` : vol.name}
                          </span>
                          {isAnonymous && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-500 border border-slate-700/50">
                              anónimo
                            </span>
                          )}
                          <button
                            onClick={() => handleCopy(vol.name)}
                            className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300 transition-colors"
                            title="Copiar nombre completo"
                          >
                            {isCopiedName ? (
                              <Check className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="py-2.5 px-4 font-sans text-slate-300">
                        <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800/80 text-indigo-300 border border-slate-700/50">
                          {vol.driver || 'local'}
                        </span>
                      </td>

                      <td className="py-2.5 px-4 text-slate-400">
                        <div className="flex items-center gap-1.5 max-w-sm truncate" title={vol.mountpoint}>
                          <FolderOpen className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                          <span className="truncate">{vol.mountpoint || '—'}</span>
                          {vol.mountpoint && (
                            <button
                              onClick={() => handleCopy(vol.mountpoint)}
                              className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300 transition-colors shrink-0"
                              title="Copiar ruta"
                            >
                              {isCopiedPath ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-4 text-center font-sans">
                        {vol.in_use ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            En uso
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                            Sin usar
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-4 font-sans">
                        {vol.containers && vol.containers.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {vol.containers.map((cName) => (
                              <span
                                key={cName}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-200 border border-slate-700/80 font-mono"
                              >
                                <Box className="h-3 w-3 text-brand-400" />
                                <span>{cName}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic text-[11px]">Ninguno</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

