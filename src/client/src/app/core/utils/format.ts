import {
  CloudProvider,
  ResourceStatus,
  ResourceType,
  RESOURCE_TYPE_LABELS,
  RiskLevel
} from '../models';

export function currency(value: number | null | undefined, maximumFractionDigits = 2): string {
  const amount = value ?? 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits
  }).format(amount);
}

export function compactCurrency(value: number | null | undefined): string {
  const amount = value ?? 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(amount);
}

export function percent(value: number | null | undefined, digits = 0): string {
  return `${(value ?? 0).toFixed(digits)}%`;
}

export function shortDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function dateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return 'never';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'never';

  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

export function typeLabel(type: ResourceType | string): string {
  if (type in RESOURCE_TYPE_LABELS) {
    return RESOURCE_TYPE_LABELS[type as ResourceType];
  }
  return String(type).replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function providerLabel(provider: CloudProvider | string): string {
  return provider === 'AWS' ? 'AWS' : 'Azure';
}

export function resourceIcon(type: ResourceType | string): string {
  const icons: Record<string, string> = {
    VirtualMachine: 'dns',
    AppService: 'web',
    Function: 'bolt',
    KubernetesCluster: 'hub',
    ContainerInstance: 'deployed_code',
    VirtualNetwork: 'lan',
    Subnet: 'account_tree',
    NetworkInterface: 'settings_ethernet',
    PublicIpAddress: 'public',
    LoadBalancer: 'balance',
    ApplicationGateway: 'router',
    NetworkSecurityGroup: 'shield',
    SecurityGroup: 'gpp_good',
    Disk: 'album',
    StorageAccount: 'folder',
    SqlDatabase: 'storage',
    CosmosDbAccount: 'hub',
    DynamoDbTable: 'table_chart',
    RedisCache: 'memory',
    KeyVault: 'vpn_key',
    ManagedIdentity: 'badge',
    ServiceBus: 'sync_alt',
    EventHub: 'stream',
    Queue: 'inbox',
    LogAnalytics: 'query_stats',
    ApplicationInsights: 'monitoring',
    DnsZone: 'language',
    VpnGateway: 'vpn_lock'
  };

  return icons[type] ?? 'widgets';
}

export function statusLabel(status: ResourceStatus | string): string {
  return status === 'Unknown' ? 'Unknown' : String(status);
}

export function riskClass(risk: RiskLevel | string): string {
  return `risk-${String(risk).toLowerCase()}`;
}

export function severityClass(severity: string | null | undefined): string {
  const value = (severity ?? 'medium').toLowerCase();
  if (value === 'critical') return 'severity-critical';
  if (value === 'high') return 'severity-high';
  if (value === 'medium') return 'severity-medium';
  return 'severity-low';
}

export function humanize(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase());
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function cellValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(cellValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
