import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { Shield, Bell } from 'lucide-react';
import { Link } from 'react-router-dom';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, actions }) => {
  const { user } = useAuth();

  return (
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
          title="Ver alertas"
        >
          <Bell className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-2 pl-2">
          <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-brand-400">
            {user?.username?.[0]?.toUpperCase()}
          </div>
          {user?.is_superuser && (
            <span className="flex items-center gap-1 text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-mono">
              <Shield className="h-3 w-3" /> Root
            </span>
          )}
        </div>
      </div>
    </header>
  );
};

