import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  Layers,
  Terminal,
  ShieldCheck,
  Users,
  Bell,
  Settings,
  LogOut,
  KeyRound,
  FileText,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

export const Sidebar: React.FC = () => {
  const { user, logout, hasPermission } = useAuth();

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, show: true },
    { label: 'Servidores', path: '/servers', icon: Server, show: hasPermission('servers:read') },
    { label: 'Agentes mTLS', path: '/agents', icon: KeyRound, show: hasPermission('agents:read') },
    { label: 'Auditoría', path: '/audit', icon: ShieldCheck, show: hasPermission('audit:read') },
    { label: 'Alertas', path: '/alerts', icon: Bell, show: true },
    { label: 'Usuarios y Roles', path: '/users', icon: Users, show: hasPermission('users:read') },
    { label: 'Configuración', path: '/settings', icon: Settings, show: user?.is_superuser },
  ];

  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col h-screen select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800 gap-3">
        <div className="h-9 w-9 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-brand-500/20">
          LX
        </div>
        <div>
          <h1 className="font-bold text-slate-100 text-sm tracking-wide">LinuxOps</h1>
          <p className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">Manager Enterprise</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems
          .filter((item) => item.show)
          .map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-brand-600/15 text-brand-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
      </nav>

      {/* User Info & Logout Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between">
          <div className="truncate">
            <p className="text-xs font-semibold text-slate-200 truncate">{user?.username}</p>
            <p className="text-[11px] text-slate-500 truncate">{user?.roles?.[0] || 'Usuario'}</p>
          </div>
          <button
            onClick={() => logout()}
            title="Cerrar sesión"
            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};

