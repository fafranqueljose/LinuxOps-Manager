import React, { useState } from 'react';
import { Box, Layers, Share2, Database } from 'lucide-react';
import { ContainersTab } from './ContainersTab';
import { ImagesTab } from './ImagesTab';
import { NetworksTab } from './NetworksTab';
import { VolumesTab } from './VolumesTab';

interface DockerViewProps {
  serverId: string;
}

export const DockerView: React.FC<DockerViewProps> = ({ serverId }) => {
  const [subTab, setSubTab] = useState<'containers' | 'images' | 'networks' | 'volumes'>('containers');

  return (
    <div className="space-y-6">
      {/* Selector de Sub-Pestañas Docker (Estilo Portainer moderno) */}
      <div className="flex border-b border-slate-800 gap-2 text-xs font-semibold">
        <button
          onClick={() => setSubTab('containers')}
          className={`pb-2.5 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            subTab === 'containers'
              ? 'border-brand-500 text-brand-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Box className="h-4 w-4" />
          <span>Contenedores</span>
        </button>

        <button
          onClick={() => setSubTab('images')}
          className={`pb-2.5 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            subTab === 'images'
              ? 'border-brand-500 text-brand-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Imágenes</span>
        </button>

        <button
          onClick={() => setSubTab('networks')}
          className={`pb-2.5 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            subTab === 'networks'
              ? 'border-brand-500 text-brand-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Share2 className="h-4 w-4" />
          <span>Redes</span>
        </button>

        <button
          onClick={() => setSubTab('volumes')}
          className={`pb-2.5 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            subTab === 'volumes'
              ? 'border-brand-500 text-brand-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Database className="h-4 w-4" />
          <span>Volúmenes</span>
        </button>
      </div>

      {/* Contenido según la sub-pestaña activa */}
      {subTab === 'containers' && <ContainersTab serverId={serverId} />}
      {subTab === 'images' && <ImagesTab serverId={serverId} />}
      {subTab === 'networks' && <NetworksTab serverId={serverId} />}
      {subTab === 'volumes' && <VolumesTab serverId={serverId} />}
    </div>
  );
};

