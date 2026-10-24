import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AuditLog } from '@/types';
import { Header } from '@/components/layout/Header';
import { formatDate } from '@/lib/utils';
import { ShieldCheck, ShieldAlert, CheckCircle, RefreshCw } from 'lucide-react';

export const AuditView: React.FC = () => {
  const [integrityReport, setIntegrityReport] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);

  const { data: logs, isLoading, refetch } = useQuery<AuditLog[]>({
    queryKey: ['audit-logs'],
    queryFn: () => api.get<AuditLog[]>('/audit?limit=100'),
  });

  const handleVerifyIntegrity = async () => {
    setVerifying(true);
    try {
      const res = await api.get<any>('/audit/verify-integrity');
      setIntegrityReport(res);
    } catch (e: any) {
      alert(`Error al verificar integridad: ${e.message}`);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Registro de Auditoría"
        subtitle="Bitácora append-only con encadenamiento criptográfico SHA-256"
        actions={
          <button
            onClick={handleVerifyIntegrity}
            disabled={verifying}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-lg transition-colors border border-slate-700"
          >
            {verifying ? (
              <RefreshCw className="h-4 w-4 animate-spin text-brand-400" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
            )}
            <span>Verificar Integridad Criptográfica</span>
          </button>
        }
      />

      <div className="p-8 space-y-6">
        {/* Reporte de Integridad */}
        {integrityReport && (
          <div
            className={`p-4 rounded-2xl border text-xs flex items-center justify-between ${
              integrityReport.is_valid
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}
          >
            <div className="flex items-center gap-3">
              {integrityReport.is_valid ? (
                <CheckCircle className="h-5 w-5 shrink-0" />
              ) : (
                <ShieldAlert className="h-5 w-5 shrink-0" />
              )}
              <div>
                <p className="font-bold text-sm">
                  {integrityReport.is_valid
                    ? 'Cadena de Auditoría 100% Íntegra'
                    : '¡ALERTA DE MANIPULACIÓN DETECTADA!'}
                </p>
                <p className="text-[11px] opacity-90 font-mono">
                  Se verificaron {integrityReport.total_records_checked} registros criptográficos mediante SHA-256. Corruptos: {integrityReport.corrupted_records_count}.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIntegrityReport(null)}
              className="text-slate-400 hover:text-slate-200 text-xs font-mono"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Tabla de Auditoría */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="p-12 text-center text-slate-400">
              <div className="h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <span className="text-xs">Cargando registros...</span>
            </div>
          ) : !logs || logs.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">Sin eventos registrados aún.</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Fecha (UTC)</th>
                  <th className="py-3 px-4">Usuario</th>
                  <th className="py-3 px-4">Operación</th>
                  <th className="py-3 px-4">Recurso</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">IP Origen</th>
                  <th className="py-3 px-4">Firma SHA-256</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-200">{log.username || 'Sistema'}</td>
                    <td className="py-3 px-4 text-brand-400 font-semibold">{log.operation}</td>
                    <td className="py-3 px-4 text-slate-300">
                      {log.resource_type} {log.resource_id ? `(${log.resource_id.slice(0, 10)})` : ''}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          log.status === 'success'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-[11px]">{log.client_ip || '—'}</td>
                    <td className="py-3 px-4 text-[10px] text-slate-500 truncate max-w-[140px]" title={log.entry_hash}>
                      {log.entry_hash.slice(0, 16)}...
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

