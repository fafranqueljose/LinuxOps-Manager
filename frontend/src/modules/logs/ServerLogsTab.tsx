import React from 'react';
import { LogExplorer } from '@/modules/logs/LogExplorer';

interface ServerLogsTabProps {
  serverId: string;
  serverName?: string;
}

export const ServerLogsTab: React.FC<ServerLogsTabProps> = ({
  serverId,
  serverName,
}) => {
  return (
    <div className="space-y-4">
      <LogExplorer
        initialServerId={serverId}
        serverName={serverName}
        isEmbedded={true}
      />
    </div>
  );
};

