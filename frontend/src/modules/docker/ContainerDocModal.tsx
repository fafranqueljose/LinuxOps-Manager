import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  ContainerDocumentation,
  ContainerDocumentationUpdate,
  ContainerDocumentationGenerateResult,
} from '@/types';
import { useAuth } from '@/context/AuthContext';
import {
  X,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileText,
  Layers,
  Save,
  RotateCw,
  Tag,
  Shield,
  Server,
  Box,
  Network,
  HardDrive,
  User,
  Clock,
  HelpCircle,
} from 'lucide-react';

interface ContainerDocModalProps {
  serverId: string;
  containerId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const CATEGORIES = [
  { value: 'database', label: 'Base de Datos (database)' },
  { value: 'web-application', label: 'Aplicación Web / Frontend (web-application)' },
  { value: 'backend-api', label: 'API Backend / Servicio (backend-api)' },
  { value: 'cache-queue', label: 'Caché / Broker de Mensajes (cache-queue)' },
  { value: 'security-proxy', label: 'Proxy Inverso / Seguridad (security-proxy)' },
  { value: 'ci-cd', label: 'CI/CD / Repositorio (ci-cd)' },
  { value: 'monitoring-logging', label: 'Observabilidad / Logs (monitoring-logging)' },
  { value: 'system-tool', label: 'Herramienta de Sistema (system-tool)' },
  { value: 'other', label: 'Otro / No especificado (other)' },
];

const ENVIRONMENTS = [
  { value: 'production', label: 'Producción (production)' },
  { value: 'staging', label: 'Staging / Pre-producción (staging)' },
  { value: 'testing', label: 'Testing / QA (testing)' },
  { value: 'development', label: 'Desarrollo (development)' },
];

const STATUSES = [
  { value: 'documented', label: 'Documentado', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  { value: 'suggested', label: 'Descripción Sugerida', color: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  { value: 'review_pending', label: 'Pendiente de Revisión', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  { value: 'undocumented', label: 'Sin Documentar', color: 'bg-slate-700/50 text-slate-400 border-slate-600' },
];

export const ContainerDocModal: React.FC<ContainerDocModalProps> = ({
  serverId,
  containerId,
  isOpen,
  onClose,
  onSaved,
}) => {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('docker:manage');

  const [activeTab, setActiveTab] = useState<'doc' | 'suggestion' | 'technical'>('doc');
  const [formData, setFormData] = useState<ContainerDocumentationUpdate>({
    description: '',
    purpose: '',
    application_name: '',
    category: 'other',
    owner: '',
    environment: 'production',
    documentation_status: 'documented',
  });
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Consulta de la ficha de documentación
  const {
    data: doc,
    isLoading,
    refetch,
  } = useQuery<ContainerDocumentation>({
    queryKey: ['container-doc', serverId, containerId],
    queryFn: () => api.get<ContainerDocumentation>(`/servers/${serverId}/docker/containers/${containerId}/documentation`),
    enabled: isOpen && !!serverId && !!containerId,
  });

  // Cargar datos en el formulario cuando doc esté listo
  useEffect(() => {
    if (doc) {
      setFormData({
        description: doc.description || doc.generated_description || '',
        purpose: doc.purpose || doc.generated_purpose || '',
        application_name: doc.application_name || 'General',
        category: doc.category || 'other',
        owner: doc.owner || '',
        environment: doc.environment || 'production',
        documentation_status: doc.documentation_status || 'documented',
      });
    }
  }, [doc]);

  // Mutación para guardar edición manual
  const saveMutation = useMutation({
    mutationFn: (data: ContainerDocumentationUpdate) =>
      api.put(`/servers/${serverId}/docker/containers/${containerId}/documentation`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['container-doc', serverId, containerId] });
      queryClient.invalidateQueries({ queryKey: ['container-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['container-catalog-summary'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      if (onSaved) onSaved();
    },
    onError: (err: any) => {
      alert(`Error al guardar documentación: ${err?.message || 'Error desconocido'}`);
    },
  });

  // Mutación para regenerar sugerencia con reglas
  const generateMutation = useMutation({
    mutationFn: () =>
      api.post<ContainerDocumentationGenerateResult>(
        `/servers/${serverId}/docker/containers/${containerId}/documentation/generate`,
        {}
      ),
    onSuccess: (data) => {
      refetch();
      setActiveTab('suggestion');
    },
    onError: (err: any) => {
      alert(`Error al generar propuesta: ${err?.message || 'Error desconocido'}`);
    },
  });

  // Mutación para confirmar la sugerencia como oficial
  const confirmMutation = useMutation({
    mutationFn: () =>
      api.post(`/servers/${serverId}/docker/containers/${containerId}/documentation/confirm`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['container-doc', serverId, containerId] });
      queryClient.invalidateQueries({ queryKey: ['container-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['container-catalog-summary'] });
      refetch();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      if (onSaved) onSaved();
    },
    onError: (err: any) => {
      alert(`Error al confirmar documentación: ${err?.message || 'Error desconocido'}`);
    },
  });

  if (!isOpen) return null;

  const handleApplySuggestion = () => {
    if (doc) {
      setFormData((prev) => ({
        ...prev,
        description: doc.generated_description || prev.description,
        purpose: doc.generated_purpose || prev.purpose,
        category: doc.generated_category || prev.category,
        documentation_status: 'documented',
      }));
      setActiveTab('doc');
    }
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'manual':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-purple-500/15 text-purple-400 border border-purple-500/30">Manual</span>;
      case 'docker_labels':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-blue-500/15 text-blue-400 border border-blue-500/30">Docker Labels</span>;
      case 'auto':
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30">Automática</span>;
    }
  };

  const currentStatusObj = STATUSES.find((s) => s.value === (doc?.documentation_status || 'undocumented'));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Modal */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-brand-500/15 text-brand-400 border border-brand-500/30">
              <Box className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-100 text-base">{doc?.container_name || containerId.slice(0, 12)}</h3>
                {doc && (
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${currentStatusObj?.color || ''}`}>
                    {currentStatusObj?.label || doc.documentation_status}
                  </span>
                )}
                {doc && getSourceBadge(doc.documentation_source)}
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                <span>Servidor: <strong className="text-slate-300 font-sans">{doc?.server_name || serverId}</strong></span>
                <span>•</span>
                <span>Imagen: <strong className="text-slate-300">{doc?.image_name || 'unknown'}</strong></span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="flex border-b border-slate-800 px-6 gap-2 text-xs font-semibold bg-slate-950/20">
          <button
            onClick={() => setActiveTab('doc')}
            className={`py-3 px-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'doc'
                ? 'border-brand-500 text-brand-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>Ficha de Documentación</span>
          </button>

          <button
            onClick={() => setActiveTab('suggestion')}
            className={`py-3 px-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'suggestion'
                ? 'border-brand-500 text-brand-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>Sugerencia Automática (Reglas/IA)</span>
          </button>

          <button
            onClick={() => setActiveTab('technical')}
            className={`py-3 px-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'technical'
                ? 'border-brand-500 text-brand-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Detalles Técnicos y Docker Labels</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-400">Cargando ficha de documentación del contenedor...</p>
            </div>
          ) : (
            <>
              {/* TAB 1: FICHA ADMINISTRATIVA */}
              {activeTab === 'doc' && (
                <div className="space-y-4">
                  {saveSuccess && (
                    <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 animate-fadeIn">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Documentación guardada correctamente con persistencia en PostgreSQL.</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Aplicación o Sistema Mayor
                      </label>
                      <input
                        type="text"
                        disabled={!canManage}
                        value={formData.application_name || ''}
                        onChange={(e) => setFormData({ ...formData, application_name: e.target.value })}
                        placeholder="Ej: ERP Financiero, LinuxOps, Harbor..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Categoría Funcional
                      </label>
                      <select
                        disabled={!canManage}
                        value={formData.category || 'other'}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat.value} value={cat.value}>
                            {cat.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Área o Responsable
                      </label>
                      <input
                        type="text"
                        disabled={!canManage}
                        value={formData.owner || ''}
                        onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                        placeholder="Ej: Infraestructura, DevOps, Equipo Backend..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Ambiente
                      </label>
                      <select
                        disabled={!canManage}
                        value={formData.environment || 'production'}
                        onChange={(e) => setFormData({ ...formData, environment: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                      >
                        {ENVIRONMENTS.map((env) => (
                          <option key={env.value} value={env.value}>
                            {env.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Propósito o Función Específica
                    </label>
                    <textarea
                      rows={2}
                      disabled={!canManage}
                      value={formData.purpose || ''}
                      onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                      placeholder="Describe el rol técnico del servicio dentro de la arquitectura..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-brand-500 resize-none font-sans"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-300">
                        Descripción Detallada y Comprensible
                      </label>
                      {doc?.generated_description && (
                        <button
                          type="button"
                          onClick={handleApplySuggestion}
                          className="text-[11px] text-brand-400 hover:text-brand-300 flex items-center gap-1 font-medium"
                        >
                          <Sparkles className="h-3 w-3" />
                          <span>Copiar sugerencia automática</span>
                        </button>
                      )}
                    </div>
                    <textarea
                      rows={4}
                      disabled={!canManage}
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Redacta una explicación clara del servicio para que cualquier administrador o auditor entienda su propósito..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-brand-500 resize-none font-sans"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Estado del Ciclo de Documentación
                      </label>
                      <select
                        disabled={!canManage}
                        value={formData.documentation_status || 'documented'}
                        onChange={(e) => setFormData({ ...formData, documentation_status: e.target.value as any })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                      >
                        {STATUSES.map((st) => (
                          <option key={st.value} value={st.value}>
                            {st.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center text-xs text-slate-400 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                      <Clock className="h-4 w-4 text-slate-500 mr-2 shrink-0" />
                      <div>
                        <span className="font-medium text-slate-300">Última actualización: </span>
                        <span>{doc?.updated_at ? new Date(doc.updated_at).toLocaleString() : 'Reciente'}</span>
                        {doc?.updated_by && <span className="text-slate-400 font-mono"> ({doc.updated_by})</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: SUGERENCIA AUTOMÁTICA */}
              {activeTab === 'suggestion' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-gradient-to-r from-brand-950/40 via-slate-900 to-indigo-950/30 border border-brand-500/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-brand-400" />
                        <h4 className="font-semibold text-sm text-slate-100">Sugerencia Basada en Reglas y Plantillas</h4>
                      </div>
                      <button
                        onClick={() => generateMutation.mutate()}
                        disabled={generateMutation.isPending || !canManage}
                        className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 border border-slate-700 transition-colors"
                      >
                        <RotateCw className={`h-3 w-3 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
                        <span>Volver a generar</span>
                      </button>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      El motor analiza la imagen <code className="text-brand-300 bg-slate-950 px-1 py-0.5 rounded">{doc?.image_name}</code>, 
                      servicio compose <code className="text-brand-300 bg-slate-950 px-1 py-0.5 rounded">{doc?.compose_service || 'N/A'}</code> y 
                      las etiquetas Docker disponibles para inferir un propósito consistente sin inspeccionar secretos.
                    </p>

                    <div className="bg-slate-950/80 p-3.5 rounded-lg border border-slate-800 space-y-3">
                      <div>
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                          Descripción Sugerida:
                        </span>
                        <p className="text-xs text-slate-200 leading-relaxed font-sans">
                          {doc?.generated_description || 'Sin sugerencia calculada.'}
                        </p>
                      </div>

                      <div>
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                          Propósito Detectado:
                        </span>
                        <p className="text-xs text-slate-300 font-sans">
                          {doc?.generated_purpose || 'Servicio de soporte a la aplicación.'}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 text-xs pt-1 border-t border-slate-800/80 text-slate-400">
                        <div>
                          <span>Categoría inferida: </span>
                          <strong className="text-slate-200 font-mono">{doc?.generated_category || 'other'}</strong>
                        </div>
                        <div>
                          <span>Origen: </span>
                          <span className="text-slate-200">Motor de Reglas + Docker Compose</span>
                        </div>
                      </div>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-3 pt-2">
                        <button
                          onClick={() => confirmMutation.mutate()}
                          disabled={confirmMutation.isPending}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-colors"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Confirmar como Oficial</span>
                        </button>

                        <button
                          onClick={handleApplySuggestion}
                          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-colors"
                        >
                          <FileText className="h-4 w-4" />
                          <span>Copiar al editor para afinar</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: DETALLES TÉCNICOS Y LABELS */}
              {activeTab === 'technical' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
                      <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                        <span className="text-slate-400">Container ID:</span>
                        <span className="font-mono text-slate-200">{containerId.slice(0, 16)}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                        <span className="text-slate-400">Clave Duradera:</span>
                        <span className="font-mono text-brand-400 truncate max-w-[200px]" title={doc?.identity_key}>
                          {doc?.identity_key}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                        <span className="text-slate-400">Proyecto Compose:</span>
                        <span className="font-medium text-slate-200">{doc?.compose_project || 'Standalone'}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                        <span className="text-slate-400">Servicio Compose:</span>
                        <span className="font-medium text-slate-200">{doc?.compose_service || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Estado Docker:</span>
                        <span className="font-medium text-emerald-400">{doc?.state || 'catalogado'}</span>
                      </div>
                    </div>

                    <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
                      <div className="flex items-center gap-1.5 text-slate-300 font-semibold mb-1">
                        <Network className="h-4 w-4 text-blue-400" />
                        <span>Redes ({doc?.networks?.length || 0})</span>
                      </div>
                      <p className="text-slate-400 font-mono text-[11px]">
                        {doc?.networks?.join(', ') || 'bridge'}
                      </p>

                      <div className="flex items-center gap-1.5 text-slate-300 font-semibold mt-3 mb-1">
                        <HardDrive className="h-4 w-4 text-amber-400" />
                        <span>Volúmenes y Montajes ({doc?.mounts?.length || 0})</span>
                      </div>
                      <div className="max-h-24 overflow-y-auto space-y-1">
                        {doc?.mounts && doc.mounts.length > 0 ? (
                          doc.mounts.map((m: any, idx: number) => (
                            <div key={idx} className="text-[11px] font-mono text-slate-400 truncate" title={`${m.Source} -> ${m.Destination}`}>
                              {m.Destination}
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-500 text-[11px]">Sin montajes adicionales</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Etiquetas LinuxOps personalizadas */}
                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Tag className="h-4 w-4 text-brand-400" />
                      <h4 className="text-xs font-semibold text-slate-200">Etiquetas Detectadas en Docker (Labels)</h4>
                    </div>

                    {doc?.labels_snapshot && Object.keys(doc.labels_snapshot).length > 0 ? (
                      <div className="max-h-48 overflow-y-auto border border-slate-800/80 rounded-lg divide-y divide-slate-800/60 font-mono text-[11px]">
                        {Object.entries(doc.labels_snapshot).map(([k, v]) => {
                          const isLinuxOps = k.startsWith('linuxops.');
                          return (
                            <div key={k} className={`p-2 flex items-start justify-between gap-4 ${isLinuxOps ? 'bg-brand-950/20' : ''}`}>
                              <span className={isLinuxOps ? 'text-brand-400 font-bold' : 'text-slate-400'}>{k}</span>
                              <span className="text-slate-200 text-right truncate max-w-[320px]">{String(v)}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 py-3 text-center">
                        No se detectaron etiquetas personalizadas en este contenedor.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Modal */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {doc?.identity_key && (
              <span>Clave persistente: <code className="text-slate-300 font-mono">{doc.identity_key}</code></span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cerrar
            </button>
            {canManage && activeTab === 'doc' && (
              <button
                onClick={() => saveMutation.mutate(formData)}
                disabled={saveMutation.isPending}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white flex items-center gap-1.5 shadow-lg shadow-brand-600/20 transition-colors"
              >
                <Save className="h-4 w-4" />
                <span>{saveMutation.isPending ? 'Guardando...' : 'Guardar Documentación'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
