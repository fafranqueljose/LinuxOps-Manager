import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SystemSetting } from '@/types';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/context/AuthContext';
import { ChangePasswordModal } from '@/components/ChangePasswordModal';
import {
  Globe,
  Radio,
  Server,
  Shield,
  Lock,
  KeyRound,
  Check,
  Copy,
  AlertCircle,
  Save,
  Clock,
  Terminal,
  Activity,
  CheckCircle2,
  ExternalLink,
  Info,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    server_dns: '',
    server_port: '443',
    server_protocol: 'https',
    agent_insecure_tls: false,
    agent_heartbeat_timeout_seconds: 45,
    agent_degraded_threshold_seconds: 90,
    agent_enrollment_expire_minutes: 30,
    session_expire_minutes: 480,
    terminal_idle_timeout_seconds: 600,
    rate_limit_per_minute: 120,
  });

  const { data: settingsList, isLoading } = useQuery<SystemSetting[]>({
    queryKey: ['system-settings'],
    queryFn: () => api.get<SystemSetting[]>('/settings'),
  });

  // Cargar valores iniciales desde la API
  useEffect(() => {
    if (settingsList && settingsList.length > 0) {
      const map: Record<string, any> = {};
      settingsList.forEach((s) => {
        map[s.key] = s.value;
      });

      setFormData((prev) => ({
        ...prev,
        server_dns: map.server_dns !== undefined ? String(map.server_dns) : prev.server_dns,
        server_port: map.server_port !== undefined ? String(map.server_port) : prev.server_port,
        server_protocol: map.server_protocol || prev.server_protocol,
        agent_insecure_tls: Boolean(map.agent_insecure_tls),
        agent_heartbeat_timeout_seconds: Number(map.agent_heartbeat_timeout_seconds) || prev.agent_heartbeat_timeout_seconds,
        agent_degraded_threshold_seconds: Number(map.agent_degraded_threshold_seconds) || prev.agent_degraded_threshold_seconds,
        agent_enrollment_expire_minutes: Number(map.agent_enrollment_expire_minutes) || prev.agent_enrollment_expire_minutes,
        session_expire_minutes: Number(map.session_expire_minutes) || prev.session_expire_minutes,
        terminal_idle_timeout_seconds: Number(map.terminal_idle_timeout_seconds) || prev.terminal_idle_timeout_seconds,
        rate_limit_per_minute: Number(map.rate_limit_per_minute) || prev.rate_limit_per_minute,
      }));
    }
  }, [settingsList]);

  // Mutación para guardar parámetros
  const saveMutation = useMutation({
    mutationFn: (updatedSettings: Record<string, any>) =>
      api.put('/settings/batch', { settings: updatedSettings }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      setSaveSuccess(true);
      setSaveError(null);
      setTimeout(() => setSaveSuccess(false), 4000);
    },
    onError: (err: any) => {
      setSaveError(err?.message || 'Error al guardar la configuración en la base de datos.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);

    // Preparar carga con tipos apropiados
    const payload = {
      server_dns: formData.server_dns.trim(),
      server_port: formData.server_port ? parseInt(String(formData.server_port), 10) : 443,
      server_protocol: formData.server_protocol,
      agent_insecure_tls: Boolean(formData.agent_insecure_tls),
      agent_heartbeat_timeout_seconds: Number(formData.agent_heartbeat_timeout_seconds),
      agent_degraded_threshold_seconds: Number(formData.agent_degraded_threshold_seconds),
      agent_enrollment_expire_minutes: Number(formData.agent_enrollment_expire_minutes),
      session_expire_minutes: Number(formData.session_expire_minutes),
      terminal_idle_timeout_seconds: Number(formData.terminal_idle_timeout_seconds),
      rate_limit_per_minute: Number(formData.rate_limit_per_minute),
    };

    saveMutation.mutate(payload);
  };

  // Cálculo en tiempo real de la URL base efectiva para el comando del agente
  const protocol = formData.server_protocol || 'https';
  const dnsClean = formData.server_dns.trim();
  const port = formData.server_port;
  const isDefaultPort =
    (protocol === 'https' && String(port) === '443') ||
    (protocol === 'http' && String(port) === '80') ||
    !port;

  const effectiveBaseUrl = dnsClean
    ? `${protocol}://${dnsClean}${!isDefaultPort ? `:${port}` : ''}`
    : window.location.origin;

  const insecureCurl = formData.agent_insecure_tls ? ' -k' : '';
  const insecureArg = formData.agent_insecure_tls ? ' --insecure' : '';
  const previewInstallCmd = `curl -sSL${insecureCurl} ${effectiveBaseUrl}/install-agent.sh | sudo bash -s -- --server-url ${effectiveBaseUrl} --token <TOKEN_DE_INCORPORACIÓN> --server-id <ID_SERVIDOR>${insecureArg}`;
  const previewDownloadUrl = `${effectiveBaseUrl}/install-agent.sh`;

  const copyToClipboard = (text: string, type: 'link' | 'cmd') => {
    navigator.clipboard.writeText(text);
    if (type === 'link') {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Configuración Global"
        subtitle="Parámetros de conectividad del servidor central, ciclo de vida de agentes y políticas del sistema"
      />

      <div className="p-8 space-y-6 max-w-5xl">
        {/* Notificaciones de éxito o error */}
        {saveSuccess && (
          <div className="flex items-center gap-2 p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl text-xs font-semibold animate-in fade-in">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Configuración guardada exitosamente en PostgreSQL. Los nuevos tokens y comandos de agentes usarán estos parámetros.</span>
          </div>
        )}

        {saveError && (
          <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-2xl text-xs font-semibold">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* =========================================================================
              SECCIÓN 1: Conectividad Externa del Servidor Central (DNS & Puerto)
              ========================================================================= */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-brand-500/10 border border-brand-500/20 text-brand-400 rounded-xl">
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">
                    Conectividad del Servidor Central y Generación de Enlaces de Agente
                  </h3>
                  <p className="text-xs text-slate-400">
                    Define el dominio DNS y puerto público utilizados para generar los comandos <code className="text-slate-300">curl</code> de instalación y WebSocket mTLS de los agentes remotos.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
              {/* Nombre DNS o IP */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Server className="h-3.5 w-3.5 text-brand-400" />
                  <span>Nombre DNS o IP Pública del Servidor Central</span>
                </label>
                <input
                  type="text"
                  placeholder="ej: lnxops.crcltd.com.do o 192.168.1.50"
                  value={formData.server_dns}
                  onChange={(e) => setFormData({ ...formData, server_dns: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-500 font-mono text-xs"
                />
                <p className="text-[11px] text-slate-500">
                  Si se deja vacío, se utilizará automáticamente el encabezado host o la URL detectada del navegador.
                </p>
              </div>

              {/* Puerto Externo */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Radio className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Puerto Externo</span>
                </label>
                <input
                  type="number"
                  placeholder="443"
                  value={formData.server_port}
                  onChange={(e) => setFormData({ ...formData, server_port: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-500 font-mono text-xs"
                />
                <p className="text-[11px] text-slate-500">
                  Puerto público de tu proxy inverso (ej: 443 para HTTPS estándar, 8443 o 80).
                </p>
              </div>

              {/* Protocolo */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-200">Protocolo de Red</label>
                <select
                  value={formData.server_protocol}
                  onChange={(e) => setFormData({ ...formData, server_protocol: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-brand-500 text-xs font-semibold"
                >
                  <option value="https">HTTPS (Seguro - Recomendado)</option>
                  <option value="http">HTTP (Inseguro - Solo desarrollo local)</option>
                </select>
              </div>

              {/* TLS Inseguro para instalador */}
              <div className="space-y-1.5 md:col-span-2 flex items-center gap-3 pt-4">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.agent_insecure_tls}
                    onChange={(e) => setFormData({ ...formData, agent_insecure_tls: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
                <div>
                  <span className="font-bold text-slate-200 block text-xs">
                    Omitir verificación estricta de TLS en instalador (--insecure / -k)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Activar si utilizas un certificado TLS autofirmado en tu proxy o nginx externo para evitar fallos de verificación SSL.
                  </span>
                </div>
              </div>
            </div>

            {/* Vista previa en tiempo real del enlace y comando generado */}
            <div className="p-4 bg-slate-950/80 border border-slate-800/90 rounded-xl space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-brand-400 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" />
                  <span>Vista previa en vivo del comando de instalación resultante:</span>
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  URL Base: <strong className="text-slate-300">{effectiveBaseUrl}</strong>
                </span>
              </div>

              <div className="relative group">
                <pre className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap break-all select-all">
                  {previewInstallCmd}
                </pre>
                <button
                  type="button"
                  onClick={() => copyToClipboard(previewInstallCmd, 'cmd')}
                  className="absolute right-2 top-2 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
                  title="Copiar comando"
                >
                  {copiedCmd ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span>
                  Descarga directa del script: <code className="text-slate-300 font-mono">{previewDownloadUrl}</code>
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(previewDownloadUrl, 'link')}
                  className="text-brand-400 hover:text-brand-300 font-medium inline-flex items-center gap-1"
                >
                  {copiedLink ? <span>¡Copiado!</span> : <span>Copiar enlace de descarga</span>}
                </button>
              </div>
            </div>
          </div>

          {/* =========================================================================
              SECCIÓN 2: Ciclo de Vida y Monitoreo de Agentes Remotos
              ========================================================================= */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-sm">Monitoreo de Heartbeat y Registro de Agentes</h3>
                <p className="text-xs text-slate-400">Umbrales de tiempo y tolerancia para estados online/degradado/offline</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-200">Timeout de Heartbeat (Offline)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="10"
                    max="600"
                    value={formData.agent_heartbeat_timeout_seconds}
                    onChange={(e) =>
                      setFormData({ ...formData, agent_heartbeat_timeout_seconds: Number(e.target.value) })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 font-mono text-xs"
                  />
                  <span className="absolute right-3 top-2.5 text-slate-500 font-mono text-[11px]">segundos</span>
                </div>
                <p className="text-[11px] text-slate-500">Tiempo máximo sin heartbeat antes de marcar como offline.</p>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-200">Umbral de Estado Degradado</label>
                <div className="relative">
                  <input
                    type="number"
                    min="10"
                    max="600"
                    value={formData.agent_degraded_threshold_seconds}
                    onChange={(e) =>
                      setFormData({ ...formData, agent_degraded_threshold_seconds: Number(e.target.value) })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 font-mono text-xs"
                  />
                  <span className="absolute right-3 top-2.5 text-slate-500 font-mono text-[11px]">segundos</span>
                </div>
                <p className="text-[11px] text-slate-500">Tiempo transcurrido antes de marcar el servidor como degradado.</p>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-200">Caducidad de Tokens de Instalación</label>
                <div className="relative">
                  <input
                    type="number"
                    min="5"
                    max="1440"
                    value={formData.agent_enrollment_expire_minutes}
                    onChange={(e) =>
                      setFormData({ ...formData, agent_enrollment_expire_minutes: Number(e.target.value) })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 font-mono text-xs"
                  />
                  <span className="absolute right-3 top-2.5 text-slate-500 font-mono text-[11px]">minutos</span>
                </div>
                <p className="text-[11px] text-slate-500">Vigencia máxima del token temporal para incorporar nuevos agentes.</p>
              </div>
            </div>
          </div>

          {/* =========================================================================
              SECCIÓN 3: Seguridad Operativa, Sesiones y Terminal
              ========================================================================= */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-sm">Políticas de Seguridad y Terminal Web</h3>
                <p className="text-xs text-slate-400">Protección contra abusos y control de sesiones interactivas</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-200">Duración de Sesiones Web</label>
                <div className="relative">
                  <input
                    type="number"
                    min="30"
                    max="10080"
                    value={formData.session_expire_minutes}
                    onChange={(e) =>
                      setFormData({ ...formData, session_expire_minutes: Number(e.target.value) })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 font-mono text-xs"
                  />
                  <span className="absolute right-3 top-2.5 text-slate-500 font-mono text-[11px]">minutos</span>
                </div>
                <p className="text-[11px] text-slate-500">480 min = 8 horas de sesión activa.</p>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-200">Inactividad de Terminal PTY</label>
                <div className="relative">
                  <input
                    type="number"
                    min="60"
                    max="7200"
                    value={formData.terminal_idle_timeout_seconds}
                    onChange={(e) =>
                      setFormData({ ...formData, terminal_idle_timeout_seconds: Number(e.target.value) })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 font-mono text-xs"
                  />
                  <span className="absolute right-3 top-2.5 text-slate-500 font-mono text-[11px]">segundos</span>
                </div>
                <p className="text-[11px] text-slate-500">600 seg = 10 minutos de inactividad antes de cerrar la PTY.</p>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-200">Límite de Peticiones (Rate Limit)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="30"
                    max="1000"
                    value={formData.rate_limit_per_minute}
                    onChange={(e) =>
                      setFormData({ ...formData, rate_limit_per_minute: Number(e.target.value) })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 font-mono text-xs"
                  />
                  <span className="absolute right-3 top-2.5 text-slate-500 font-mono text-[11px]">req/min</span>
                </div>
                <p className="text-[11px] text-slate-500">Prevención de ataques de denegación de servicio por IP.</p>
              </div>
            </div>
          </div>

          {/* Botón de Guardado */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-brand-600/20 transition-all disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{saveMutation.isPending ? 'Guardando cambios...' : 'Guardar Configuración'}</span>
            </button>
          </div>
        </form>

        {/* =========================================================================
            SECCIÓN 4: Seguridad de la Cuenta del Usuario
            ========================================================================= */}
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
              <span className="text-slate-500">Actualiza periódicamente tu contraseña con hash seguro Argon2id</span>
            </div>
            <button
              type="button"
              onClick={() => setIsPasswordModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold transition-colors"
            >
              <KeyRound className="h-4 w-4" />
              <span>Cambiar mi Contraseña</span>
            </button>
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
