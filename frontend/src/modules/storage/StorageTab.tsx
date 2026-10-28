import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StorageOverview, UserMount, SystemFilesystem, DirectoryTreeNode } from '@/types';
import { formatBytes } from '@/lib/utils';
import {
  HardDrive,
  Folder,
  FolderTree,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Key,
  Shield,
  AlertCircle,
  CheckCircle2,
  Network,
  Database,
  Server,
  Info,
  Maximize2,
  Minimize2,
  Layers,
  FileCode,
} from 'lucide-react';

interface StorageTabProps {
  serverId: string;
}

export const StorageTab: React.FC<StorageTabProps> = ({ serverId }) => {
  const {
    data: storage,
    isLoading,
    isRefetching,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery<StorageOverview>({
    queryKey: ['server-storage', serverId],
    queryFn: () => api.get<StorageOverview>(`/servers/${serverId}/storage`),
    refetchInterval: 30000,
  });

  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({ '/': true });

  const toggleNode = (path: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  const expandAll = (node: DirectoryTreeNode) => {
    const newExpanded: Record<string, boolean> = { ...expandedNodes };
    const traverse = (n: DirectoryTreeNode) => {
      newExpanded[n.path] = true;
      n.children.forEach(traverse);
    };
    traverse(node);
    setExpandedNodes(newExpanded);
  };

  const collapseAll = () => {
    setExpandedNodes({ '/': true });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-28 bg-slate-800/40 border border-slate-800 rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="h-44 bg-slate-800/40 border border-slate-800 rounded-2xl" />
          <div className="h-44 bg-slate-800/40 border border-slate-800 rounded-2xl" />
          <div className="h-44 bg-slate-800/40 border border-slate-800 rounded-2xl" />
        </div>
        <div className="h-96 bg-slate-800/40 border border-slate-800 rounded-2xl" />
      </div>
    );
  }

  if (error || !storage) {
    return (
      <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
        <AlertCircle className="h-10 w-10 text-red-400 mx-auto" />
        <div>
          <h4 className="text-base font-semibold text-slate-100">
            No se pudo cargar el inventario de almacenamiento
          </h4>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            {error instanceof Error ? error.message : 'Error al comunicarse con el agente del servidor remoto.'}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Reintentar</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Barra de cabecera con acciones y estado de sincronización */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand-500/10 border border-brand-500/20 text-brand-400 rounded-xl">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>Almacenamiento y Sistemas de Archivos</span>
            </h3>
            <p className="text-xs text-slate-400">
              Supervisión de unidades en <code className="text-slate-300">/etc/fstab</code>, sistemas de archivos del SO y árbol jerárquico.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {dataUpdatedAt > 0 && (
            <span className="text-[11px] text-slate-500 font-mono">
              Actualizado: {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors border border-slate-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin text-brand-400' : ''}`} />
            <span>{isRefetching ? 'Actualizando...' : 'Actualizar'}</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          SECCIÓN 1: Unidades configuradas por usuarios (/etc/fstab)
          ========================================================================= */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Network className="h-4 w-4 text-brand-400" />
              <span>Unidades Agregadas por Usuarios</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-500/10 text-brand-400 border border-brand-500/20">
                {storage.user_mounts.length}
              </span>
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Puntos de montaje configurados en <code className="text-slate-300">/etc/fstab</code> (NFS, CIFS/SMB y discos adicionales).
            </p>
          </div>
        </div>

        {storage.user_mounts.length === 0 ? (
          <div className="p-8 text-center bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl text-slate-400 text-xs space-y-1">
            <Database className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <p className="font-semibold text-slate-300">No hay unidades de usuario configuradas</p>
            <p className="text-slate-500 max-w-md mx-auto">
              No se detectaron recursos compartidos de red (NFS/CIFS) ni particiones de usuario adicionales en el archivo <code className="text-slate-400">/etc/fstab</code>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {storage.user_mounts.map((mount, idx) => (
              <UserMountCard key={`${mount.target}-${idx}`} mount={mount} />
            ))}
          </div>
        )}
      </section>

      {/* =========================================================================
          SECCIÓN 2: Estructura de almacenamiento del sistema
          ========================================================================= */}
      <section className="space-y-6">
        <div className="border-b border-slate-800 pb-3">
          <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Layers className="h-4 w-4 text-emerald-400" />
            <span>Estructura de Almacenamiento del Sistema</span>
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Sistemas de archivos reales del sistema operativo y árbol de directorios con detección de particiones independientes.
          </p>
        </div>

        {/* 2.1 Tarjetas de sistemas de archivos reales */}
        <div className="space-y-3">
          <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <HardDrive className="h-3.5 w-3.5 text-slate-400" />
            <span>Sistemas de Archivos Reales del SO</span>
          </h5>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {storage.system_filesystems.map((fs) => (
              <SystemFilesystemCard key={fs.mount_point} fs={fs} />
            ))}
          </div>
        </div>

        {/* 2.2 Árbol de directorios del sistema */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <FolderTree className="h-3.5 w-3.5 text-slate-400" />
              <span>Árbol Jerárquico de Directorios</span>
            </h5>

            <div className="flex items-center gap-2">
              <button
                onClick={() => expandAll(storage.directory_tree)}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-medium border border-slate-700 transition-colors"
                title="Expandir todos los directorios"
              >
                <Maximize2 className="h-3 w-3" />
                <span>Expandir todo</span>
              </button>
              <button
                onClick={collapseAll}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-medium border border-slate-700 transition-colors"
                title="Colapsar directorios"
              >
                <Minimize2 className="h-3 w-3" />
                <span>Colapsar</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 overflow-x-auto text-xs">
            <div className="flex items-center gap-2 mb-4 p-2.5 bg-slate-800/50 border border-slate-700/60 rounded-xl text-slate-400 text-[11px]">
              <Info className="h-4 w-4 text-brand-400 shrink-0" />
              <span>
                Los directorios estándar marcados como <strong className="text-slate-300">Directorio (en /)</strong> residen en el mismo disco que la raíz y no duplican capacidades. Solo los <strong className="text-slate-300">Puntos de montaje</strong> con un sistema de archivos independiente muestran su propia cuota de espacio asignado.
              </span>
            </div>

            <div className="space-y-1 font-mono">
              <DirectoryTreeNodeView
                node={storage.directory_tree}
                expandedNodes={expandedNodes}
                onToggle={toggleNode}
                depth={0}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

// =========================================================================
// Subcomponente: Tarjeta de Unidad Configurada por Usuario
// =========================================================================
interface UserMountCardProps {
  mount: UserMount;
}

const UserMountCard: React.FC<UserMountCardProps> = ({ mount }) => {
  const [showDetails, setShowDetails] = useState(false);

  // Colores y badges según clasificación
  const getTypeBadge = () => {
    switch (mount.type) {
      case 'nfs':
        return {
          bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
          icon: <Network className="h-3 w-3" />,
          label: 'NFS',
        };
      case 'cifs':
        return {
          bg: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
          icon: <Server className="h-3 w-3" />,
          label: 'CIFS/SMB',
        };
      case 'disk':
        return {
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          icon: <HardDrive className="h-3 w-3" />,
          label: 'Disco adicional',
        };
      default:
        return {
          bg: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
          icon: <Database className="h-3 w-3" />,
          label: 'Pendiente de clasificación',
        };
    }
  };

  const getStatusBadge = () => {
    switch (mount.status) {
      case 'mounted':
        return {
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          dot: 'bg-emerald-400',
          label: 'Montada',
        };
      case 'unmounted':
        return {
          bg: 'bg-slate-700/50 text-slate-400 border-slate-600',
          dot: 'bg-slate-500',
          label: 'No montada',
        };
      case 'not_available':
        return {
          bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          dot: 'bg-amber-400',
          label: 'No disponible',
        };
      default:
        return {
          bg: 'bg-red-500/10 text-red-400 border-red-500/20',
          dot: 'bg-red-400',
          label: 'Error',
        };
    }
  };

  const typeBadge = getTypeBadge();
  const statusBadge = getStatusBadge();
  const cap = mount.capacity;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition-colors space-y-4">
      {/* Cabecera de la tarjeta */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${typeBadge.bg}`}
            >
              {typeBadge.icon}
              <span>{typeBadge.label}</span>
            </span>
            <span className="text-slate-500 text-[10px] font-mono uppercase bg-slate-800/80 px-1.5 py-0.5 rounded">
              {mount.fstype || 'auto'}
            </span>
          </div>

          <div
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadge.bg}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dot}`} />
            <span>{statusBadge.label}</span>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-bold text-slate-100 font-mono truncate" title={mount.target}>
            {mount.target}
          </h4>
          <p className="text-[11px] text-slate-400 font-mono truncate" title={mount.source}>
            Origen: {mount.source}
          </p>
        </div>
      </div>

      {/* Métricas de Uso y Capacidad (Solo si está montada) */}
      <div>
        {mount.status === 'mounted' && cap ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Uso de espacio:</span>
              <span className="font-bold text-slate-200">{cap.usage_percent}%</span>
            </div>

            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  cap.usage_percent > 90
                    ? 'bg-red-500'
                    : cap.usage_percent > 75
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(cap.usage_percent, 100)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
              <span>Usado: {formatBytes(cap.used_bytes)}</span>
              <span>Libre: {formatBytes(cap.available_bytes)}</span>
              <span>Total: {formatBytes(cap.total_bytes)}</span>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-slate-800/30 border border-slate-800 rounded-xl text-center">
            <span className="text-slate-500 text-[11px]">
              {mount.status === 'unmounted'
                ? 'Unidad configurada pero no montada en el sistema.'
                : mount.error_message || 'No disponible para lectura de espacio I/O.'}
            </span>
          </div>
        )}
      </div>

      {/* Opciones y detalles de seguridad */}
      <div className="pt-2 border-t border-slate-800/80">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center justify-between w-full text-[11px] text-slate-400 hover:text-slate-200 transition-colors py-1"
        >
          <span className="flex items-center gap-1.5 font-medium">
            <Shield className="h-3 w-3 text-slate-500" />
            <span>Detalles de configuración</span>
          </span>
          {showDetails ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>

        {showDetails && (
          <div className="mt-2 space-y-2 text-[11px] bg-slate-950/60 p-3 rounded-xl border border-slate-800 font-mono">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Modo de acceso:</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  mount.is_read_only
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {mount.is_read_only ? 'Solo Lectura (ro)' : 'Lectura/Escritura (rw)'}
              </span>
            </div>

            {mount.credentials_file && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-slate-400">
                  <Key className="h-3 w-3 text-amber-400" />
                  <span>Archivo de credenciales:</span>
                </div>
                <div
                  className="p-1.5 bg-slate-900 rounded border border-slate-800 text-slate-300 text-[10px] break-all select-all"
                  title="Ruta configurada (el contenido confidencial nunca es extraído)"
                >
                  {mount.credentials_file}
                </div>
                <p className="text-[10px] text-slate-500 font-sans italic">
                  * Contenido protegido por política local del agente.
                </p>
              </div>
            )}

            {mount.permissions && (
              <div className="space-y-1">
                <span className="text-slate-500">Permisos configurados:</span>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(mount.permissions).map(([k, v]) => (
                    <span
                      key={k}
                      className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-300"
                    >
                      {k}={v}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {mount.options && (
              <div className="space-y-1">
                <span className="text-slate-500">Opciones fstab (sanitizadas):</span>
                <div className="p-1.5 bg-slate-900 rounded border border-slate-800 text-slate-400 text-[10px] break-all">
                  {mount.options}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// =========================================================================
// Subcomponente: Tarjeta de Sistema de Archivos del SO (Sección 2.1)
// =========================================================================
interface SystemFilesystemCardProps {
  fs: SystemFilesystem;
}

const SystemFilesystemCard: React.FC<SystemFilesystemCardProps> = ({ fs }) => {
  const isRoot = fs.is_root || fs.mount_point === '/';

  return (
    <div
      className={`rounded-2xl p-5 flex flex-col justify-between transition-colors border ${
        isRoot
          ? 'bg-slate-900 border-amber-500/40 shadow-sm shadow-amber-500/5'
          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
      }`}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`p-2 rounded-xl ${
                isRoot
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              <HardDrive className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <span>{fs.name}</span>
                {isRoot && (
                  <span className="px-1.5 py-0.2 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-semibold rounded">
                    Raíz
                  </span>
                )}
              </h4>
              <p className="text-[11px] text-slate-400 font-mono">
                {fs.device} • <span className="uppercase">{fs.fstype}</span>
              </p>
            </div>
          </div>

          <div className="text-right">
            <span
              className={`text-base font-extrabold ${
                fs.usage_percent > 90
                  ? 'text-red-400'
                  : fs.usage_percent > 75
                  ? 'text-amber-400'
                  : isRoot
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {fs.usage_percent}%
            </span>
          </div>
        </div>

        {/* Barra de progreso */}
        <div className="space-y-1.5">
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                fs.usage_percent > 90
                  ? 'bg-red-500'
                  : fs.usage_percent > 75
                  ? 'bg-amber-500'
                  : isRoot
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(fs.usage_percent, 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>
              Libre: <strong className="text-slate-200">{formatBytes(fs.available_bytes)}</strong> de{' '}
              {formatBytes(fs.total_bytes)}
            </span>
            <span>Usado: {formatBytes(fs.used_bytes)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// Subcomponente: Nodo del Árbol de Directorios (Sección 2.2)
// =========================================================================
interface DirectoryTreeNodeViewProps {
  node: DirectoryTreeNode;
  expandedNodes: Record<string, boolean>;
  onToggle: (path: string) => void;
  depth: number;
}

const DirectoryTreeNodeView: React.FC<DirectoryTreeNodeViewProps> = ({
  node,
  expandedNodes,
  onToggle,
  depth,
}) => {
  const isExpanded = !!expandedNodes[node.path];
  const hasChildren = node.children && node.children.length > 0;

  // Icono según tipo de nodo
  const getNodeIcon = () => {
    if (node.path === '/') {
      return <Server className="h-3.5 w-3.5 text-amber-400" />;
    }
    if (node.is_mount_point) {
      return <HardDrive className="h-3.5 w-3.5 text-emerald-400" />;
    }
    if (node.device_type === 'virtual_fs') {
      return <Layers className="h-3.5 w-3.5 text-slate-500" />;
    }
    return <Folder className="h-3.5 w-3.5 text-slate-400" />;
  };

  return (
    <div className="select-none">
      <div
        className={`flex items-center justify-between py-1 px-2 rounded-lg hover:bg-slate-800/60 transition-colors group ${
          node.is_mount_point ? 'bg-slate-800/30' : ''
        }`}
        style={{ paddingLeft: `${Math.max(depth * 1.5, 0.5)}rem` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasChildren ? (
            <button
              onClick={() => onToggle(node.path)}
              className="p-0.5 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4.5" />
          )}

          <div className="flex items-center gap-1.5 truncate">
            {getNodeIcon()}
            <span
              className={`font-mono text-xs ${
                node.path === '/'
                  ? 'font-bold text-amber-300'
                  : node.is_mount_point
                  ? 'font-bold text-emerald-300'
                  : 'text-slate-300'
              }`}
            >
              {node.name}
            </span>
            <span className="text-slate-500 text-[10px] truncate">({node.path})</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-4">
          {/* Badge de tipo de directorio vs montaje */}
          {node.path === '/' ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Disco Raíz (/)
            </span>
          ) : node.is_mount_point ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <HardDrive className="h-2.5 w-2.5" />
              <span>Punto de montaje</span>
            </span>
          ) : node.device_type === 'virtual_fs' ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-500">
              Pseudo-FS
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-normal text-slate-500 bg-slate-800/40">
              Directorio (en /)
            </span>
          )}

          {/* Si es punto de montaje con capacidad asignada propia */}
          {node.capacity && (
            <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-slate-400">
              <span className="text-slate-300 font-semibold">
                {node.capacity.usage_percent}%
              </span>
              <span className="text-slate-500">
                ({formatBytes(node.capacity.used_bytes)} / {formatBytes(node.capacity.total_bytes)})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Renderizado de hijos si está expandido */}
      {isExpanded && hasChildren && (
        <div className="border-l border-slate-800/80 ml-3 pl-1">
          {node.children.map((child) => (
            <DirectoryTreeNodeView
              key={child.path}
              node={child}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

