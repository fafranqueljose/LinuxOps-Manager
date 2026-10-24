import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginView } from '@/modules/auth/LoginView';
import { DashboardView } from '@/modules/dashboard/DashboardView';
import { ServersView } from '@/modules/servers/ServersView';
import { ServerDetailView } from '@/modules/servers/ServerDetailView';
import { AgentsView } from '@/modules/agents/AgentsView';
import { AuditView } from '@/modules/audit/AuditView';
import { AlertsView } from '@/modules/alerts/AlertsView';
import { UsersView } from '@/modules/users/UsersView';
import { SettingsView } from '@/modules/settings/SettingsView';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginView />} />

            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardView />} />
              <Route path="/servers" element={<ServersView />} />
              <Route path="/servers/:serverId" element={<ServerDetailView />} />
              <Route path="/agents" element={<AgentsView />} />
              <Route path="/audit" element={<AuditView />} />
              <Route path="/alerts" element={<AlertsView />} />
              <Route path="/users" element={<UsersView />} />
              <Route path="/settings" element={<SettingsView />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

