import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Server } from '@/types';
import { Header } from '@/components/layout/Header';
import { formatDate } from '@/lib/utils';
import {
  Server as ServerIcon,
  Search,
  Plus,
  Copy,
  Check,
  ChevronRight,
  ShieldAlert,
  AlertCircle,
  X,
} from 'lucide-react';

export const ServersView: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [serverName, setServerName] = useState('');
  const [hostname, setHostname] = useState('');
  const [enrollmentData, setEnrollmentData] = useState<{ install_command: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: servers, isLoading } = useQuery<Server[]>({
    queryKey: ['servers', search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      return api.get<Server[]>(`/servers?${params.toString()}`);
    },
    refetchInterval: 10000,
  });

  const createServerMutation = useMutation({
    mutationFn: (data: { name: string; hostname?: string }) => api.post<any>('/servers', data),
    onSuccess: (data: any) => {
      setEnrollmentData({
        install_command: data.install_command,
        token: data.enrollment_token,
      });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createServerMutation.mutate({ name: serverName, hostname: hostname || undefined });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Online</span>;
      case 'degraded':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">Degradado</span>;
      case 'pending_enrollment':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">Pendiente</span>;
      case 'revoked':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">Revocado</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">Offline</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Inventario de Servidores"
        subtitle="Monitoreo, estado mTLS y administración remota"
        actions={
          <button
            onClick={() => {
              setEnrollmentData(null);
              setServerName('');
              setHostname('');
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Incorporar Servidor</span>
          </button>
        }
      />

      <div className="p-8 space-y-6">
        {/* Filtros y Búsqueda */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="relative w-full sm:w-80">
            <Search className="h-4 w-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, hostname o IP..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
            >
              <option value="">Todos los Estados</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="degraded">Degradado</option>
              <option value="pending_enrollment">Pendiente</option>
              <option value="revoked">Revocado</option>
            </select>
          </div>
        </div>

        {/* Tabla de Servidores */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="p-12 text-center text-slate-400">
              <div className="h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <span className="text-xs">Cargando servidores...</span>
            </div>
          ) : !servers || servers.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <ServerIcon className="h-8 w-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-300">No se encontraron servidores</p>
              <p className="text-xs text-slate-500 mt-1">Ajuste los filtros o incorpore un nuevo servidor.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Servidor</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Sistema Operativo</th>
                  <th className="py-3 px-4">CPU</th>
                  <th className="py-3 px-4">RAM</th>
                  <th className="py-3 px-4">Docker</th>
                  <th className="py-3 px-4">Último Latido</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {servers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-slate-200">
                      <Link to={`/servers/${s.id}`} className="hover:text-brand-400 transition-colors flex flex-col">
                        <span className="font-bold text-slate-100">{s.name}</span>
                        <span className="text-[11px] font-mono text-slate-400">{s.ip_address || s.hostname || 'Sin IP asignada'}</span>
                      </Link>
                    </td>
                    <td className="py-3.5 px-4">{getStatusBadge(s.status)}</td>
                    <td className="py-3.5 px-4 text-slate-300">
                      {s.os_name ? `${s.os_name} (${s.architecture || 'x86_64'})` : <span className="text-slate-600">Pendiente de reporte</span>}
                    </td>
                    <td className="py-3.5 px-4 font-mono">
                      {s.status === 'online' ? (
                        <span className="text-slate-200">{s.cpu_percent}%</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono">
                      {s.status === 'online' ? (
                        <span className="text-slate-200">{s.ram_percent}%</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {s.container_count > 0 ? (
                        <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 rounded-md font-mono text-[11px]">
                          {s.container_count} cont.
                        </span>
                      ) : (
                        <span className="text-slate-600 text-[11px]">0</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                      {formatDate(s.last_heartbeat_at)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        to={`/servers/${s.id}`}
                        className="inline-flex items-center gap-1 text-slate-400 hover:text-brand-400 text-xs font-semibold transition-colors"
                      >
                        <span>Administrar</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal de Incorporación Segura */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 bg-brand-600/20 border border-brand-500/30 rounded-xl flex items-center justify-center text-brand-400">
                <ServerIcon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-base">Incorporar Nuevo Servidor Linux</h3>
                <p className="text-xs text-slate-400">Generación de credencial mTLS y comando de registro</p>
              </div>
            </div>

            {!enrollmentData ? (
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre Identificativo *</label>
                  <input
                    type="text"
                    required
                    value={serverName}
                    onChange={(e) => setServerName(e.target.value)}
                    placeholder="ej. srv-prod-db01"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Hostname o IP Fija (Opcional)</label>
                  <input
                    type="text"
                    value={hostname}
                    onChange={(e) => setHostname(e.target.value)}
                    placeholder="ej. 192.168.1.50"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-start gap-2.5 text-xs text-slate-400">
                  <ShieldAlert className="h-4 w-4 text-brand-400 shrink-0 mt-0.5" />
                  <span>
                    El token generado tendrá una validez de 30 minutos y será de uso único.
                  </span>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={createServerMutation.isPending}
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50"
                  >
                    {createServerMutation.isPending ? 'Generando...' : 'Generar Credencial'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 animate-fadeIn">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400">
                  ¡Servidor registrado en el inventario! Ejecute el siguiente comando con permisos de superusuario en el servidor remoto para completar el mTLS:
                </div>

                <div className="relative">
                  <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-slate-200 overflow-x-auto whitespace-pre-wrap select-all">
                    {enrollmentData.install_command}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(enrollmentData.install_command)}
                    className="absolute top-2.5 right-2.5 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs flex items-center gap-1 transition-colors"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold"
                  >
                    Listo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

