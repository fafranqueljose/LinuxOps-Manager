import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Settings, Shield, Lock, BellRing } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { data: settings } = useQuery<any[]>({
    queryKey: ['system-settings'],
    queryFn: () => api.get<any[]>('/settings'),
  });

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Configuración Global" subtitle="Parámetros operativos y políticas de seguridad" />

      <div className="p-8 space-y-6 max-w-4xl">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <Shield className="h-5 w-5 text-brand-400" />
            <div>
              <h3 className="font-bold text-slate-100 text-sm">Políticas del Sistema</h3>
              <p className="text-xs text-slate-400">Parámetros globales persistidos en PostgreSQL</p>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl">
              <div>
                <span className="font-bold text-slate-200 block">Umbral de Heartbeat de Agentes</span>
                <span className="text-slate-500">Tiempo de espera antes de marcar como offline</span>
              </div>
              <span className="font-mono text-brand-400 font-bold">45 segundos</span>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl">
              <div>
                <span className="font-bold text-slate-200 block">Duración de Sesiones Web</span>
                <span className="text-slate-500">Caducidad de la Cookie HttpOnly de sesión</span>
              </div>
              <span className="font-mono text-brand-400 font-bold">8 horas</span>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl">
              <div>
                <span className="font-bold text-slate-200 block">Protección de Fuerza Bruta</span>
                <span className="text-slate-500">Bloqueo tras 5 intentos fallidos sucesivos</span>
              </div>
              <span className="font-mono text-emerald-400 font-bold">Activado (15 min)</span>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl">
              <div>
                <span className="font-bold text-slate-200 block">Autenticación mTLS de Agentes</span>
                <span className="text-slate-500">Verificación estricta de certificados X.509 de cliente</span>
              </div>
              <span className="font-mono text-emerald-400 font-bold">Obligatorio</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

