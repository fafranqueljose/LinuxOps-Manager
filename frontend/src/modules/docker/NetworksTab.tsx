import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DockerNetwork } from '@/types';
import {
  Network as NetworkIcon,
  Search,
  RefreshCw,
  Copy,
  Check,
  Globe,
  Lock,
  Box,
  Layers,
  AlertCircle,
  Share2,
} from 'lucide-react';

interface NetworksTabProps {
  serverId: string;
}

export const NetworksTab: React.FC<NetworksTabProps> = ({ serverId }) => {
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const {
    data: networks,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useQuery<DockerNetwork[]>({
    queryKey: ['docker-networks', serverId],
    queryFn: () => api.get<DockerNetwork[]>(`/servers/${serverId}/docker/networks`),
    refetchInterval: 15000,
  });

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredNetworks = (networks || []).filter((net) => {
    const s = search.toLowerCase();
    return (
      net.name.toLowerCase().includes(s) ||
      net.id.toLowerCase().includes(s) ||
      (net.driver || '').toLowerCase().includes(s)
    );
  });

  const totalContainersConnected = (networks || []).reduce(
    (acc, net) => acc + Object.keys(net.containers || {}).length,
    0
  );

  return (
    <div className="space-y-4">
      {/* Resumen de Redes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-brand-500/10 text-brand-400 rounded-lg">
              <Share2 className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-400">Total de Redes</div>
              <div className="text-lg font-bold text-slate-100">{networks?.length || 0}</div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-2.5">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <Box className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-400">Contenedores Conectados</div>
            <div className="text-lg font-bold text-emerald-400">{totalContainersConnected}</div>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-2.5">
          <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-400">Drivers Activos</div>
            <div className="text-sm font-semibold text-indigo-300">
              {Array.from(new Set((networks || []).map((n) => n.driver))).filter(Boolean).join(', ') || '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Controles de Filtro */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por nombre, driver o ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors"
          />
        </div>

        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-lg transition-colors self-end"
          title="Refrescar redes"
        >
          <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin text-brand-400' : ''}`} />
        </button>
      </div>

      {/* Tabla de Redes */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-brand-500" />
            Consultando inventario de redes a través del agente...
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-400 text-xs">
            <AlertCircle className="h-6 w-6 mx-auto mb-2 text-red-500" />
            Error al consultar redes: {(error as any)?.message || 'Fallo de conexión con el agente.'}
          </div>
        ) : filteredNetworks.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No se encontraron redes Docker que coincidan con la búsqueda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-medium">
                <tr>
                  <th className="py-2.5 px-4">Nombre de Red</th>
                  <th className="py-2.5 px-4">ID</th>
                  <th className="py-2.5 px-4">Driver</th>
                  <th className="py-2.5 px-4">Ámbito</th>
                  <th className="py-2.5 px-4 text-center">Aislamiento</th>
                  <th className="py-2.5 px-4">Contenedores Conectados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredNetworks.map((net) => {
                  const shortId = net.id.substring(0, 12);
                  const isCopied = copiedId === net.id;
                  const connectedMap = net.containers || {};
                  const connectedCount = Object.keys(connectedMap).length;

                  return (
                    <tr key={net.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2 font-sans font-semibold text-slate-200">
                          <NetworkIcon className="h-4 w-4 text-brand-400" />
                          <span>{net.name}</span>
                          {net.name === 'bridge' || net.name === 'host' || net.name === 'none' ? (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700/50">
                              sistema
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <span>{shortId}</span>
                          <button
                            onClick={() => handleCopy(net.id, net.id)}
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

                      <td className="py-2.5 px-4 font-sans text-slate-300">
                        <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800/80 text-brand-300 border border-slate-700/50">
                          {net.driver || '—'}
                        </span>
                      </td>

                      <td className="py-2.5 px-4 font-sans text-slate-400 capitalize">
                        {net.scope || 'local'}
                      </td>

                      <td className="py-2.5 px-4 text-center font-sans">
                        {net.internal ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            <Lock className="h-3 w-3" />
                            Interna
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Globe className="h-3 w-3" />
                            Externa
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-4 font-sans">
                        {connectedCount === 0 ? (
                          <span className="text-slate-500 italic text-[11px]">0 contenedores</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 max-w-md">
                            {Object.entries(connectedMap).map(([cId, details]: [string, any]) => {
                              const cName = details.Name || cId.substring(0, 10);
                              const ipv4 = details.IPv4Address
                                ? details.IPv4Address.split('/')[0]
                                : null;

                              return (
                                <span
                                  key={cId}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-200 border border-slate-700/80 font-mono"
                                  title={`ID: ${cId}${ipv4 ? ` | IP: ${ipv4}` : ''}`}
                                >
                                  <Box className="h-3 w-3 text-brand-400" />
                                  <span>{cName}</span>
                                  {ipv4 && (
                                    <span className="text-[10px] text-slate-400">({ipv4})</span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
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

