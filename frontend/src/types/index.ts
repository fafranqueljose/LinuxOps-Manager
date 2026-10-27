export interface User {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  is_active: boolean;
  is_superuser: boolean;
  mfa_enabled: boolean;
  roles: string[];
  permissions: string[];
}

export interface Agent {
  id: string;
  agent_version: string;
  cert_serial?: string;
  cert_fingerprint_sha256?: string;
  is_revoked: boolean;
  revoked_at?: string;
  revoked_reason?: string;
  last_seen_at?: string;
  created_at: string;
}

export interface Server {
  id: string;
  name: string;
  hostname?: string;
  ip_address?: string;
  group_id?: string;
  group_name?: string;
  status: 'online' | 'offline' | 'degraded' | 'pending_enrollment' | 'revoked';
  os_name?: string;
  os_version?: string;
  kernel?: string;
  architecture?: string;
  python_version?: string;
  uptime_seconds: number;
  cpu_count: number;
  cpu_percent: number;
  total_ram_bytes: number;
  free_ram_bytes: number;
  ram_percent: number;
  total_disk_bytes: number;
  free_disk_bytes: number;
  disk_percent: number;
  load_1: number;
  load_5: number;
  load_15: number;
  container_count: number;
  failed_services_count: number;
  tags: Record<string, any>;
  last_heartbeat_at?: string;
  created_at: string;
  agent?: Agent;
}

export interface ServerDetail extends Server {
  connectivity_status: string;
  agent_status: string;
}

export interface DashboardSummary {
  total_servers: number;
  online_servers: number;
  offline_servers: number;
  degraded_servers: number;
  total_containers: number;
  running_containers: number;
  stopped_containers: number;
  failed_services_total: number;
  avg_cpu_percent: number;
  avg_ram_percent: number;
  calculation_method: string;
  recent_alerts_count: number;
}

export interface ContainerPort {
  ip?: string;
  private_port: number;
  public_port?: number;
  type: string;
}

export interface Container {
  id: string;
  names: string[];
  image: string;
  image_id: string;
  state: string;
  status: string;
  created: number;
  ports: ContainerPort[];
  compose_project?: string;
  compose_service?: string;
}

export interface DockerImage {
  id: string;
  tags: string[];
  size_bytes: number;
  created: number;
  in_use: boolean;
  containers_count?: number;
}

export interface DockerNetwork {
  id: string;
  name: string;
  driver: string;
  scope: string;
  internal: boolean;
  containers: Record<string, any>;
}

export interface DockerVolume {
  name: string;
  driver: string;
  mountpoint: string;
  in_use: boolean;
  containers: string[];
}

export interface SystemdUnit {
  unit: string;
  load_state: string;
  active_state: string;
  sub_state: string;
  description: string;
}

export interface AuditLog {
  id: string;
  correlation_id: string;
  username?: string;
  operation: string;
  resource_type: string;
  resource_id?: string;
  status: string;
  client_ip?: string;
  duration_ms: number;
  details: Record<string, any>;
  prev_hash: string;
  entry_hash: string;
  created_at: string;
}

export interface Alert {
  id: string;
  server_id?: string;
  server_name?: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  is_resolved: boolean;
  resolved_at?: string;
  created_at: string;
}

export interface TerminalSessionOut {
  id: string;
  server_id: string;
  user_id: string;
  pty_user: string;
  status: string;
  client_ip?: string;
  started_at: string;
  closed_at?: string;
  duration_seconds: number;
}


