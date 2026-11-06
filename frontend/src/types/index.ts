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
  created: number | string;
  ports: ContainerPort[];
  compose_project?: string;
  compose_service?: string;
  labels?: Record<string, string>;
  documentation_status?: string;
}

export interface DockerImage {
  id: string;
  tags: string[];
  size_bytes: number;
  created: number | string;
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

export interface StorageCapacity {
  total_bytes: number;
  used_bytes: number;
  available_bytes: number;
  free_bytes: number;
  usage_percent: number;
}

export interface UserMount {
  name: string;
  target: string;
  source: string;
  fstype: string;
  type: 'nfs' | 'cifs' | 'disk' | 'other' | string;
  type_label: string;
  status: 'mounted' | 'unmounted' | 'not_available' | 'error' | string;
  is_read_only: boolean;
  access_mode: 'rw' | 'ro' | string;
  credentials_file?: string | null;
  permissions?: Record<string, string> | null;
  options?: string;
  capacity?: StorageCapacity | null;
  error_message?: string | null;
}

export interface SystemFilesystem {
  name: string;
  mount_point: string;
  device: string;
  fstype: string;
  total_bytes: number;
  used_bytes: number;
  available_bytes: number;
  free_bytes: number;
  usage_percent: number;
  is_root: boolean;
}

export interface DirectoryTreeNode {
  name: string;
  path: string;
  is_mount_point: boolean;
  device_type: 'root_filesystem' | 'filesystem' | 'directory' | 'virtual_fs' | string;
  capacity?: StorageCapacity | null;
  children: DirectoryTreeNode[];
}

export interface StorageOverview {
  user_mounts: UserMount[];
  system_filesystems: SystemFilesystem[];
  directory_tree: DirectoryTreeNode;
}

export interface SystemSetting {
  key: string;
  value: any;
  description?: string;
  is_read_only: boolean;
  updated_at: string;
}

export interface AgentConnectionPreview {
  base_url: string;
  dns: string;
  port?: number | null;
  protocol: string;
  insecure: boolean;
  sample_install_command: string;
  download_url: string;
}

// ==========================================
// Módulo de Logs Centralizados (Loki)
// ==========================================
export interface LogRecord {
  id: string;
  timestamp: string;
  server_id: string;
  server_name?: string;
  source: 'docker' | 'systemd' | 'syslog' | string;
  service: string;
  level: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | string;
  stream?: string;
  message: string;
  metadata?: Record<string, any> | null;
}

export interface LogQueryResult {
  total: number;
  records: LogRecord[];
  query_duration_ms: number;
  loki_status: string;
}

export interface LogSourceItem {
  server_id: string;
  server_name: string;
  sources: string[];
  containers: string[];
  services: string[];
}

export interface LogHealthStatus {
  status: string;
  loki_ready: boolean;
  loki_url: string;
  tenant_id: string;
  details?: string;
}

export interface LogFilterParams {
  server_id?: string;
  source?: string;
  service?: string;
  level?: string;
  search?: string;
  start_time?: string;
  end_time?: string;
  limit?: number;
  direction?: 'BACKWARD' | 'FORWARD';
}

// ==========================================
// Módulo de Catálogo y Documentación de Contenedores
// ==========================================
export type DocumentationStatus = 'undocumented' | 'suggested' | 'documented' | 'review_pending';
export type DocumentationSource = 'manual' | 'docker_labels' | 'auto';

export interface ContainerDocumentation {
  id?: string;
  server_id: string;
  server_name?: string;
  identity_key: string;
  container_id?: string;
  container_name: string;
  compose_project?: string;
  compose_service?: string;
  image_name?: string;
  description?: string;
  purpose?: string;
  application_name?: string;
  category: string;
  owner?: string;
  environment: 'development' | 'testing' | 'staging' | 'production' | string;
  documentation_source: DocumentationSource;
  documentation_status: DocumentationStatus;
  generated_description?: string;
  generated_purpose?: string;
  generated_category?: string;
  labels_snapshot?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
  updated_by?: string;

  // Datos técnicos en vivo
  state?: string;
  status_text?: string;
  created_epoch?: number;
  ports?: any[];
  networks?: string[];
  mounts?: any[];
}

export interface ContainerCatalogItem {
  id?: string;
  server_id: string;
  server_name: string;
  container_id: string;
  container_name: string;
  image: string;
  state: string;
  status: string;
  compose_project?: string;
  compose_service?: string;
  application_name?: string;
  category: string;
  owner?: string;
  environment: string;
  documentation_status: DocumentationStatus;
  documentation_source: DocumentationSource;
  description?: string;
  purpose?: string;
  has_labels: boolean;
  updated_at?: string;
}

export interface ContainerCatalogSummary {
  total_containers: number;
  documented_count: number;
  suggested_count: number;
  undocumented_count: number;
  review_pending_count: number;
  categories: Record<string, number>;
  environments: Record<string, number>;
  applications: Record<string, number>;
}

export interface ContainerDocumentationUpdate {
  description?: string;
  purpose?: string;
  application_name?: string;
  category?: string;
  owner?: string;
  environment?: string;
  documentation_status?: DocumentationStatus;
}

export interface ContainerDocumentationGenerateResult {
  generated_description: string;
  generated_purpose: string;
  generated_category: string;
  source_rule: string;
  labels_detected: Record<string, string>;
}
