import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Shield, Bell, KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ChangePasswordModal } from '@/components/ChangePasswordModal';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, actions }) => {
  const { user } = useAuth();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  return (
    <>
      <header className="h-16 bg-slate-900 border-b border-slate-800 px-8 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-4">
          {actions}
          <div className="h-6 w-px bg-slate-800" />
          <Link
            to="/alerts"
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg relative transition-colors"
            title="Ver alertas del sistema"
          >
            <Bell className="h-4 w-4" />
          </Link>

          <button
            onClick={() => setIsPasswordModalOpen(true)}
            className="flex items-center gap-2 pl-2 p-1.5 hover:bg-slate-800/80 rounded-xl transition-colors text-left"
            title="Haga clic para cambiar su contraseña de acceso"
          >
            <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-brand-400">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-200 hover:text-brand-400 transition-colors">
                  {user?.username}
                </span>
                {user?.is_superuser && (
                  <span className="flex items-center gap-0.5 text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.2 rounded-full font-mono">
                    <Shield className="h-2.5 w-2.5" /> Root
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <KeyRound className="h-2.5 w-2.5" /> Cambiar password
              </span>
            </div>
          </button>
        </div>
      </header>

      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </>
  );
};
