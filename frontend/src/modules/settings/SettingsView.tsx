import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Settings, Shield, Lock, BellRing, KeyRound } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ChangePasswordModal } from '@/components/ChangePasswordModal';

export const SettingsView: React.FC = () => {
  const { user } = useAuth();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  const { data: settings } = useQuery<any[]>({
    queryKey: ['system-settings'],
    queryFn: () => api.get<any[]>('/settings'),
  });

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Configuración Global" subtitle="Parámetros operativos y políticas de seguridad" />

      <div className="p-8 space-y-6 max-w-4xl">
        {/* Seguridad de la Cuenta del Usuario */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <Lock className="h-5 w-5 text-brand-400" />
            <div>
              <h3 className="font-bold text-slate-100 text-sm">Seguridad de tu Cuenta</h3>
              <p className="text-xs text-slate-400">Credenciales del usuario autenticado ({user?.username})</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs">
            <div>
              <span className="font-bold text-slate-200 block">Contraseña de Acceso</span>
              <span className="text-slate-500">Actualiza periódicamente tu contraseña con hash Argon2id</span>
            </div>
            <button
              onClick={() => setIsPasswordModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold transition-colors"
            >
              <KeyRound className="h-4 w-4" />
              <span>Cambiar mi Contraseña</span>
            </button>
          </div>
        </div>

        {/* Políticas Globales */}
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

      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </div>
  );
};
