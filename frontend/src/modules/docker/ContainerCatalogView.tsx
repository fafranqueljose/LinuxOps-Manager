import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  ContainerCatalogItem,
  ContainerCatalogSummary,
  Server as ServerType,
  DocumentationStatus,
} from '@/types';
import { Header } from '@/components/layout/Header';
import { ContainerDocModal } from './ContainerDocModal';
import {
  Box,
  Search,
  Filter,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  HelpCircle,
  Server,
  Layers,
  FolderGit2,
  Tag,
  Grid,
  List,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Database,
  Globe,
  Cpu,
  Shield,
  Clock,
} from 'lucide-react';

interface ContainerCatalogViewProps {
  initialServerId?: string;
  isEmbedded?: boolean;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  database: Database,
  'web-application': Globe,
  'backend-api': Cpu,
  'cache-queue': Layers,
  'security-proxy': Shield,
  'ci-cd': FolderGit2,
  'monitoring-logging': Clock,
  'system-tool': Box,
  other: Box,
};

export const ContainerCatalogView: React.FC<ContainerCatalogViewProps> = ({
  initialServerId,
  isEmbedded = false,
}) => {
  // Filtros
  const [selectedServer, setSelectedServer] = useState<string>(initialServerId || 'all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Modal de documentación
  const [activeModalTarget, setActiveModalTarget] = useState<{
    serverId: string;
    containerId: string;
  } | null>(null);

  // Consulta de servidores disponibles
  const { data: servers = [] } = useQuery<ServerType[]>({
    queryKey: ['servers'],
    queryFn: () => api.get<ServerType[]>('/servers'),
    staleTime: 30000,
  });

  // Consulta del catálogo
  const {
    data: items = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<ContainerCatalogItem[]>({
    queryKey: [
      'container-catalog',
      selectedServer,
      selectedCategory,
      selectedEnvironment,
      selectedStatus,
      searchQuery,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedServer && selectedServer !== 'all') params.append('server_id', selectedServer);
      if (selectedCategory && selectedCategory !== 'all') params.append('category', selectedCategory);
      if (selectedEnvironment && selectedEnvironment !== 'all') params.append('environment', selectedEnvironment);
      if (selectedStatus && selectedStatus !== 'all') params.append('documentation_status', selectedStatus);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      return api.get<ContainerCatalogItem[]>(`/docker/documentation?${params.toString()}`);
    },
    refetchInterval: 15000,
  });

  // Consulta de métricas resumen
  const { data: summary } = useQuery<ContainerCatalogSummary>({
    queryKey: ['container-catalog-summary', selectedServer],
    queryFn: () => {
      const qs = selectedServer && selectedServer !== 'all' ? `?server_id=${selectedServer}` : '';
      return api.get<ContainerCatalogSummary>(`/docker/documentation/summary${qs}`);
    },
    refetchInterval: 15000,
  });

  // Extraer aplicaciones únicas para filtro rápido
  const availableApplications = useMemo(() => {
    const apps = new Set<string>();
    items.forEach((item) => {
      if (item.application_name) apps.add(item.application_name);
    });
    return Array.from(apps).sort();
  }, [items]);

  const getStatusBadge = (status: DocumentationStatus) => {
    switch (status) {
      case 'documented':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3" />
            <span>Documentado</span>
          </span>
        );
      case 'suggested':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
            <Sparkles className="h-3 w-3" />
            <span>Sugerido</span>
          </span>
        );
      case 'review_pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="h-3 w-3" />
            <span>Revisión Pendiente</span>
          </span>
        );
      case 'undocumented':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <HelpCircle className="h-3 w-3" />
            <span>Sin Documentar</span>
          </span>
        );
    }
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'manual':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-500/15 text-purple-400 border border-purple-500/20">Manual</span>;
      case 'docker_labels':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/15 text-blue-400 border border-blue-500/20">Compose Labels</span>;
      case 'auto':
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 text-amber-400 border border-amber-500/20">Inferencia</span>;
    }
  };

  const getEnvBadge = (env: string) => {
    switch (env?.toLowerCase()) {
      case 'production':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 uppercase">PROD</span>;
      case 'staging':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase">STAGING</span>;
      case 'testing':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 uppercase">QA/TEST</span>;
      case 'development':
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700 uppercase">DEV</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col space-y-6">
      {!isEmbedded && <Header title="Catálogo y Documentación de Contenedores" />}

      {/* Tarjetas Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Catálogo</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{summary?.total_containers || items.length}</p>
          </div>
          <div className="p-3 bg-brand-500/10 rounded-xl text-brand-400 border border-brand-500/20">
            <Box className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Documentados</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{summary?.documented_count || 0}</p>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-sky-400 uppercase tracking-wider">Sugeridos</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{summary?.suggested_count || 0}</p>
          </div>
          <div className="p-3 bg-sky-500/10 rounded-xl text-sky-400 border border-sky-500/20">
            <Sparkles className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Sin Documentar / Rev.</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">
              {(summary?.undocumented_count || 0) + (summary?.review_pending_count || 0)}
            </p>
          </div>
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400 border border-amber-500/20">
            <AlertTriangle className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Buscador de texto */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar contenedor por nombre, imagen, servicio, descripción o aplicación..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Toggle de vista y refrescar */}
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-slate-400">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-slate-800 text-slate-100 font-bold' : 'hover:text-slate-200'}`}
                title="Vista de Tabla"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-slate-800 text-slate-100 font-bold' : 'hover:text-slate-200'}`}
                title="Vista de Cuadrícula"
              >
                <Grid className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={() => refetch()}
              disabled={isRefetching}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700"
              title="Actualizar catálogo"
            >
              <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Dropdowns de Filtros */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-800/60">
          {!initialServerId && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Servidor:</label>
              <select
                value={selectedServer}
                onChange={(e) => setSelectedServer(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              >
                <option value="all">Todos los servidores ({servers.length})</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Categoría:</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
            >
              <option value="all">Todas las categorías</option>
              <option value="database">Bases de Datos</option>
              <option value="web-application">Aplicaciones Web</option>
              <option value="backend-api">APIs Backend</option>
              <option value="cache-queue">Caché y Colas</option>
              <option value="security-proxy">Proxy y Seguridad</option>
              <option value="ci-cd">CI/CD y DevOps</option>
              <option value="monitoring-logging">Observabilidad y Logs</option>
              <option value="system-tool">Herramientas de Sistema</option>
              <option value="other">Otros / General</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Ambiente:</label>
            <select
              value={selectedEnvironment}
              onChange={(e) => setSelectedEnvironment(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
            >
              <option value="all">Todos los ambientes</option>
              <option value="production">Producción</option>
              <option value="staging">Staging</option>
              <option value="testing">Testing / QA</option>
              <option value="development">Desarrollo</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Estado de Doc.:</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
            >
              <option value="all">Todos los estados</option>
              <option value="documented">Documentados</option>
              <option value="suggested">Descripción sugerida</option>
              <option value="review_pending">Revisión pendiente</option>
              <option value="undocumented">Sin documentar</option>
            </select>
          </div>
        </div>
      </div>

      {/* Contenido Principal: Tabla o Grid */}
      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs text-slate-400">Cargando catálogo de contenedores...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center flex flex-col items-center justify-center">
          <Box className="h-12 w-12 text-slate-600 mb-3" />
          <h4 className="text-base font-semibold text-slate-200">No se encontraron contenedores</h4>
          <p className="text-xs text-slate-400 max-w-md mt-1">
            No hay contenedores que coincidan con los filtros seleccionados o los servidores remotos no tienen agentes activos en este momento.
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-semibold uppercase text-[10px] border-b border-slate-800 tracking-wider">
                <tr>
                  <th className="py-3 px-4">Contenedor / Servicio</th>
                  <th className="py-3 px-4">Servidor</th>
                  <th className="py-3 px-4">Aplicación</th>
                  <th className="py-3 px-4">Categoría</th>
                  <th className="py-3 px-4">Ambiente</th>
                  <th className="py-3 px-4">Estado Doc.</th>
                  <th className="py-3 px-4">Descripción</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-sans">
                {items.map((item) => {
                  const CategoryIcon = CATEGORY_ICONS[item.category] || Box;
                  return (
                    <tr
                      key={`${item.server_id}-${item.container_id || item.container_name}`}
                      className="hover:bg-slate-850/60 transition-colors group cursor-pointer"
                      onClick={() => setActiveModalTarget({ serverId: item.server_id, containerId: item.container_id })}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-slate-800 text-brand-400 group-hover:bg-brand-500/15 group-hover:text-brand-300 transition-colors">
                            <Box className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-100 flex items-center gap-1.5">
                              <span>{item.container_name}</span>
                              {item.compose_service && (
                                <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-1 rounded">
                                  {item.compose_service}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] font-mono text-slate-400 truncate max-w-[200px] block" title={item.image}>
                              {item.image}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-medium text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <Server className="h-3.5 w-3.5 text-slate-400" />
                          <span>{item.server_name}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-200">
                          {item.application_name || 'General'}
                        </span>
                        {item.owner && (
                          <span className="text-[10px] text-slate-400 block truncate" title={item.owner}>
                            {item.owner}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <CategoryIcon className="h-3.5 w-3.5 text-slate-400" />
                          <span className="capitalize">{item.category}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">{getEnvBadge(item.environment)}</td>

                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          {getStatusBadge(item.documentation_status)}
                          <div>{getSourceBadge(item.documentation_source)}</div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 max-w-xs">
                        <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                          {item.description || item.purpose || 'Pendiente de documentar'}
                        </p>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveModalTarget({ serverId: item.server_id, containerId: item.container_id });
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-brand-600 text-slate-300 hover:text-white transition-colors text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <span>Ficha</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VISTA DE CUADRÍCULA (GRID) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const CategoryIcon = CATEGORY_ICONS[item.category] || Box;
            return (
              <div
                key={`${item.server_id}-${item.container_id || item.container_name}`}
                onClick={() => setActiveModalTarget({ serverId: item.server_id, containerId: item.container_id })}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition-all hover:shadow-lg cursor-pointer group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-slate-800 text-brand-400 group-hover:bg-brand-500/15 group-hover:text-brand-300 transition-colors">
                        <CategoryIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-100 text-sm leading-tight">{item.container_name}</h4>
                        <span className="text-[11px] text-slate-400 font-mono block truncate max-w-[180px]">
                          {item.image}
                        </span>
                      </div>
                    </div>
                    {getEnvBadge(item.environment)}
                  </div>

                  <div className="flex items-center gap-2 my-2 text-[11px]">
                    {getStatusBadge(item.documentation_status)}
                    {getSourceBadge(item.documentation_source)}
                  </div>

                  <p className="text-xs text-slate-300 line-clamp-3 my-3 leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                    {item.description || item.purpose || 'Sin descripción formal. Haz clic para documentar.'}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Server className="h-3 w-3" />
                    <span>{item.server_name}</span>
                  </div>
                  <span className="font-semibold text-slate-300">{item.application_name || 'General'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal interactivo de Ficha de Documentación */}
      {activeModalTarget && (
        <ContainerDocModal
          serverId={activeModalTarget.serverId}
          containerId={activeModalTarget.containerId}
          isOpen={true}
          onClose={() => setActiveModalTarget(null)}
          onSaved={() => refetch()}
        />
      )}
    </div>
  );
};
