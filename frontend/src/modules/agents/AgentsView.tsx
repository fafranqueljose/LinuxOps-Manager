import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Agent } from '@/types';
import { Header } from '@/components/layout/Header';
import { formatDate } from '@/lib/utils';
import { KeyRound, ShieldX, CheckCircle, AlertTriangle, ShieldCheck } from 'lucide-react';

export const AgentsView: React.FC = () => {
  const queryClient = useQueryClient();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: () => api.get<Agent[]>('/agents'),
  });

  const revokeMutation = useMutation({
    mutationFn: (agentId: string) => api.post(`/agents/${agentId}/revoke`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setRevokingId(null);
    },
  });

  const handleRevoke = (id: string) => {
    if (confirm('¿Está seguro de que desea revocar este agente? Perderá la conectividad mTLS de inmediato.')) {
      setRevokingId(id);
      revokeMutation.mutate(id);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Agentes Registrados y mTLS"
        subtitle="Gestión de identidades criptográficas, certificados de cliente y revocación"
      />

      <div className="p-8 space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="p-12 text-center text-slate-400">
              <div className="h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <span className="text-xs">Cargando agentes...</span>
            </div>
          ) : !agents || agents.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <KeyRound className="h-8 w-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-300">No hay agentes incorporados</p>
              <p className="text-xs text-slate-500 mt-1">Los agentes se registrarán tras ejecutar el script de instalación.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">ID del Agente</th>
                  <th className="py-3 px-4">Versión</th>
                  <th className="py-3 px-4">Serial Certificado</th>
                  <th className="py-3 px-4">Huella SHA-256</th>
                  <th className="py-3 px-4">Estado mTLS</th>
                  <th className="py-3 px-4">Último Contacto</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {agents.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-200">{a.id.slice(0, 13)}...</td>
                    <td className="py-3.5 px-4 font-mono text-slate-300">{a.agent_version}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">{a.cert_serial || '—'}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px] truncate max-w-xs">
                      {a.cert_fingerprint_sha256 || '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      {a.is_revoked ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1 w-max">
                          <ShieldX className="h-3 w-3" /> Revocado
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 w-max">
                          <ShieldCheck className="h-3 w-3" /> Certificado Válido
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">{formatDate(a.last_seen_at)}</td>
                    <td className="py-3.5 px-4 text-right">
                      {!a.is_revoked && (
                        <button
                          onClick={() => handleRevoke(a.id)}
                          disabled={revokingId === a.id}
                          className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          {revokingId === a.id ? 'Revocando...' : 'Revocar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

