import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DockerImage } from '@/types';
import { formatBytes } from '@/lib/utils';
import {
  Layers,
  Search,
  RefreshCw,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Tag,
  Clock,
  HardDrive,
} from 'lucide-react';

interface ImagesTabProps {
  serverId: string;
}

export const ImagesTab: React.FC<ImagesTabProps> = ({ serverId }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_use' | 'unused'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const {
    data: images,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useQuery<DockerImage[]>({
    queryKey: ['docker-images', serverId],
    queryFn: () => api.get<DockerImage[]>(`/servers/${serverId}/docker/images`),
    refetchInterval: 15000,
  });

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredImages = (images || []).filter((img) => {
    const searchLower = search.toLowerCase();
    const matchesSearch =
      img.id.toLowerCase().includes(searchLower) ||
      img.tags.some((t) => t.toLowerCase().includes(searchLower));

    if (!matchesSearch) return false;
    if (statusFilter === 'in_use') return img.in_use;
    if (statusFilter === 'unused') return !img.in_use;
    return true;
  });

  const totalSize = (images || []).reduce((acc, img) => acc + (img.size_bytes || 0), 0);
  const inUseCount = (images || []).filter((img) => img.in_use).length;
  const unusedCount = (images || []).length - inUseCount;

  return (
    <div className="space-y-4">
      {/* Barra de Estadísticas Rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-400">Total Imágenes</div>
              <div className="text-lg font-bold text-slate-100">{images?.length || 0}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-medium text-slate-400">Espacio en Disco</div>
            <div className="text-xs font-semibold text-slate-300 font-mono">{formatBytes(totalSize)}</div>
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
            <div className="text-[11px] font-medium text-slate-400">Sin Usar / Huérfanas</div>
            <div className="text-lg font-bold text-amber-400">{unusedCount}</div>
          </div>
        </div>
      </div>

      {/* Controles de Filtro y Búsqueda */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por repositorio, etiqueta o ID..."
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
              Todas ({images?.length || 0})
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
            title="Refrescar lista de imágenes"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin text-brand-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabla de Imágenes */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-brand-500" />
            Consultando inventario de imágenes a través del agente...
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-400 text-xs">
            <AlertCircle className="h-6 w-6 mx-auto mb-2 text-red-500" />
            Error al consultar imágenes: {(error as any)?.message || 'Fallo de conexión con el agente.'}
          </div>
        ) : filteredImages.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No se encontraron imágenes Docker que coincidan con los filtros.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-medium">
                <tr>
                  <th className="py-2.5 px-4">Repositorio / Etiqueta</th>
                  <th className="py-2.5 px-4">ID de Imagen</th>
                  <th className="py-2.5 px-4">Tamaño</th>
                  <th className="py-2.5 px-4">Fecha Creación</th>
                  <th className="py-2.5 px-4 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredImages.map((img) => {
                  const rawId = img.id.replace('sha256:', '');
                  const shortId = rawId.substring(0, 12);
                  const isCopied = copiedId === img.id;

                  // Parsear fecha
                  let dateFormatted = 'N/A';
                  if (img.created) {
                    try {
                      const d =
                        typeof img.created === 'number'
                          ? new Date(img.created > 1e11 ? img.created : img.created * 1000)
                          : new Date(img.created);
                      dateFormatted = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    } catch {
                      dateFormatted = String(img.created);
                    }
                  }

                  return (
                    <tr key={img.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-4">
                        <div className="flex flex-col gap-1 font-sans">
                          {img.tags && img.tags.length > 0 ? (
                            img.tags.map((tag, idx) => {
                              const [repo, t] = tag.split(':');
                              const isNone = tag === '<none>:<none>';
                              return (
                                <div key={idx} className="flex items-center gap-1.5">
                                  <Tag className={`h-3 w-3 ${isNone ? 'text-slate-500' : 'text-brand-400'}`} />
                                  <span className={`font-semibold ${isNone ? 'text-slate-500 italic' : 'text-slate-200'}`}>
                                    {repo}
                                  </span>
                                  {t && !isNone && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-brand-300 border border-slate-700/60">
                                      {t}
                                    </span>
                                  )}
                                </div>
                              );
                            })
                          ) : (
                            <span className="text-slate-500 italic">&lt;sin etiqueta&gt;</span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <span title={img.id}>{shortId}</span>
                          <button
                            onClick={() => handleCopy(img.id, rawId)}
                            className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300 transition-colors"
                            title="Copiar ID completo"
                          >
                            {isCopied ? (
                              <Check className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="py-2.5 px-4 text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <HardDrive className="h-3.5 w-3.5 text-slate-500" />
                          <span>{formatBytes(img.size_bytes)}</span>
                        </div>
                      </td>

                      <td className="py-2.5 px-4 text-slate-400 text-[11px] font-sans">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-slate-500" />
                          <span>{dateFormatted}</span>
                        </div>
                      </td>

                      <td className="py-2.5 px-4 text-center font-sans">
                        {img.in_use ? (
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

