/**
 * Domain model shared with the .NET API.
 *
 * Enums are serialized as strings by the API (JsonStringEnumConverter), so
 * TypeScript string unions are used instead of numeric enums.
 */

export type CloudProvider = 'Azure' | 'AWS';

export type ResourceStatus =
  | 'Unknown'
  | 'Healthy'
  | 'Warning'
  | 'Critical'
  | 'Stopped'
  | 'Provisioning'
  | 'Deprovisioning';

export type ResourceType =
  | 'VirtualMachine'
  | 'AppService'
  | 'Function'
  | 'ContainerInstance'
  | 'KubernetesCluster'
  | 'VirtualNetwork'
  | 'Subnet'
  | 'NetworkInterface'
  | 'PublicIpAddress'
  | 'LoadBalancer'
  | 'ApplicationGateway'
  | 'DnsZone'
  | 'Firewall'
  | 'NetworkSecurityGroup'
  | 'SecurityGroup'
  | 'VpnGateway'
  | 'StorageAccount'
  | 'BlobContainer'
  | 'FileShare'
  | 'Disk'
  | 'SqlDatabase'
  | 'CosmosDbAccount'
  | 'RedisCache'
  | 'MySql'
  | 'PostgreSql'
  | 'DynamoDbTable'
  | 'ManagedIdentity'
  | 'KeyVault'
  | 'RoleAssignment'
  | 'ServiceBus'
  | 'EventHub'
  | 'Queue'
  | 'LogAnalytics'
  | 'ApplicationInsights'
  | 'ResourceGroup'
  | 'Subscription'
  | 'Other';

export type RelationshipType =
  | 'Contains'
  | 'DependsOn'
  | 'ConnectsTo'
  | 'ManagedBy'
  | 'PeeredWith'
  | 'LoadBalances'
  | 'Monitors'
  | 'SecuredBy'
  | 'StoredIn'
  | 'DeployedOn'
  | 'RoutesTo'
  | 'Other';

export type ComplianceFramework = 'CIS' | 'SOC2' | 'HIPAA' | 'GDPR' | 'NIST' | 'PCI_DSS' | 'ISO27001';

export type ComplianceStatus = 'Compliant' | 'NonCompliant' | 'NotApplicable' | 'Unknown';

export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export interface ResourceRelationship {
  id: string;
  sourceResourceId: string;
  targetResourceId: string;
  relationshipType: RelationshipType;
  description?: string;
  properties: Record<string, string>;
}

export interface CloudResource {
  id: string;
  provider: CloudProvider;
  nativeId: string;
  name: string;
  resourceType: ResourceType;
  nativeResourceType: string;
  resourceGroup: string;
  region: string;
  status: ResourceStatus;
  tags: Record<string, string>;
  properties: Record<string, unknown>;
  estimatedMonthlyCost: number;
  cpuUtilization?: number | null;
  memoryUtilization?: number | null;
  discoveredAt: string;
  lastSyncedAt: string;
  isManagedByIaC: boolean;
  complianceStatus: ComplianceStatus;
  relationships: ResourceRelationship[];
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  provider: CloudProvider;
  region: string;
  status: ResourceStatus;
  monthlyCost: number;
  metadata: Record<string, string>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationshipType: string;
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface BlastRadiusNode {
  resourceId: string;
  resourceName: string;
  resourceType: ResourceType;
  provider: CloudProvider;
  relationshipType: RelationshipType;
  hopCount: number;
  impactRisk: RiskLevel;
}

export interface BlastRadiusResult {
  resourceId: string;
  resourceName: string;
  riskLevel: RiskLevel;
  affectedResourceCount: number;
  directDependents: BlastRadiusNode[];
  transitiveDependents: BlastRadiusNode[];
  affectedByType: Record<string, number>;
  affectedByRegion: Record<string, number>;
  affectedMonthlyCost: number;
  summary: string;
}

export interface CostByCategory {
  category: string;
  amount: number;
  percentage: number;
}

export interface CostSummary {
  totalCost: number;
  azureCost: number;
  awsCost: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  byResourceType: CostByCategory[];
  byRegion: CostByCategory[];
  byResourceGroup: CostByCategory[];
  monthOverMonthChange: number;
}

export interface CostTrend {
  date: string;
  azureCost: number;
  awsCost: number;
  totalCost: number;
}

export interface CostForecast {
  forecastDate: string;
  predictedCost: number;
  lowerBound: number;
  upperBound: number;
  confidenceLevel: number;
}

export interface CostAnomaly {
  id: string;
  resourceId: string;
  resourceName: string;
  expectedCost: number;
  actualCost: number;
  deviationPercentage: number;
  detectedAt: string;
  description: string;
}

export interface ResourceCost {
  resourceId: string;
  resourceName: string;
  provider: CloudProvider;
  resourceGroup: string;
  amount: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
}

export interface CostRecommendation {
  id: string;
  resourceId: string;
  resourceName: string;
  resourceType: ResourceType;
  provider: CloudProvider;
  region: string;
  category: string;
  title: string;
  description: string;
  estimatedMonthlySavings: number;
  confidence: string;
}

export interface CompliancePolicy {
  id: string;
  name: string;
  description: string;
  framework: ComplianceFramework;
  category: string;
  severity: string;
  applicableResourceTypes: ResourceType[];
  ruleExpression: string;
  remediation: string;
  enabled: boolean;
}

export interface ComplianceResult {
  id: string;
  policyId: string;
  policyName: string;
  resourceId: string;
  resourceName: string;
  framework: ComplianceFramework;
  status: ComplianceStatus;
  details?: string;
  evaluatedAt: string;
}

export interface ComplianceViolation {
  policyName: string;
  resourceName: string;
  resourceId: string;
  severity: string;
  details: string;
  remediation: string;
}

export interface ComplianceReport {
  id: string;
  framework: ComplianceFramework;
  generatedAt: string;
  totalPolicies: number;
  compliantCount: number;
  nonCompliantCount: number;
  notApplicableCount: number;
  compliancePercentage: number;
  results: ComplianceResult[];
  topViolations: ComplianceViolation[];
}

export interface CompliancePosture {
  frameworkScores: Record<string, number>;
  totalViolations: number;
  criticalViolations: number;
  highViolations: number;
  lastScanAt: string;
}

export interface AIQueryResult {
  question: string;
  answer: string;
  generatedQuery?: string | null;
  data?: unknown;
  success: boolean;
  error?: string | null;
  processingTime: string;
  source: string;
}

export interface DiscoveryProviderResult {
  provider: CloudProvider;
  configured: boolean;
  resources: number;
  error?: string | null;
}

export interface DiscoveryResult {
  message: string;
  demoMode: boolean;
  resourcesDiscovered: number;
  relationshipsDiscovered: number;
  durationSeconds: number;
  providers: DiscoveryProviderResult[];
}

export interface PlatformStatus {
  version: string;
  demoMode: boolean;
  storageProvider: string;
  aiMode: string;
  configuredProviders: string[];
  resourceCount: number;
  relationshipCount: number;
  lastDiscoveryAt?: string | null;
  serverTimeUtc: string;
}

export const RESOURCE_TYPES: ResourceType[] = [
  'VirtualMachine',
  'AppService',
  'Function',
  'KubernetesCluster',
  'ContainerInstance',
  'VirtualNetwork',
  'Subnet',
  'NetworkInterface',
  'PublicIpAddress',
  'LoadBalancer',
  'ApplicationGateway',
  'NetworkSecurityGroup',
  'SecurityGroup',
  'Firewall',
  'VpnGateway',
  'DnsZone',
  'StorageAccount',
  'Disk',
  'SqlDatabase',
  'CosmosDbAccount',
  'DynamoDbTable',
  'RedisCache',
  'KeyVault',
  'ManagedIdentity',
  'ServiceBus',
  'EventHub',
  'Queue',
  'LogAnalytics',
  'ApplicationInsights',
  'Other'
];

export const COMPLIANCE_FRAMEWORKS: ComplianceFramework[] = ['CIS', 'SOC2', 'HIPAA', 'GDPR'];

/** Human-friendly labels for resource types. */
export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  VirtualMachine: 'Virtual machine',
  AppService: 'App Service',
  Function: 'Function',
  ContainerInstance: 'Container instance',
  KubernetesCluster: 'Kubernetes cluster',
  VirtualNetwork: 'Virtual network',
  Subnet: 'Subnet',
  NetworkInterface: 'Network interface',
  PublicIpAddress: 'Public IP',
  LoadBalancer: 'Load balancer',
  ApplicationGateway: 'Application gateway',
  DnsZone: 'DNS zone',
  Firewall: 'Firewall',
  NetworkSecurityGroup: 'Network security group',
  SecurityGroup: 'Security group',
  VpnGateway: 'VPN gateway',
  StorageAccount: 'Storage account',
  BlobContainer: 'Blob container',
  FileShare: 'File share',
  Disk: 'Disk',
  SqlDatabase: 'SQL database',
  CosmosDbAccount: 'Cosmos DB account',
  RedisCache: 'Redis cache',
  MySql: 'MySQL',
  PostgreSql: 'PostgreSQL',
  DynamoDbTable: 'DynamoDB table',
  ManagedIdentity: 'Managed identity',
  KeyVault: 'Key Vault',
  RoleAssignment: 'Role assignment',
  ServiceBus: 'Service Bus',
  EventHub: 'Event Hubs',
  Queue: 'Queue',
  LogAnalytics: 'Log Analytics',
  ApplicationInsights: 'Application Insights',
  ResourceGroup: 'Resource group',
  Subscription: 'Subscription',
  Other: 'Other'
};

export const STATUS_COLORS: Record<ResourceStatus, string> = {
  Unknown: '#8b949e',
  Healthy: '#3fb950',
  Warning: '#d29922',
  Critical: '#f85149',
  Stopped: '#6e7681',
  Provisioning: '#58a6ff',
  Deprovisioning: '#a371f7'
};

export const PROVIDER_COLORS: Record<CloudProvider, string> = {
  Azure: '#58a6ff',
  AWS: '#ffa657'
};

export const RISK_COLORS: Record<RiskLevel, string> = {
  Low: '#3fb950',
  Medium: '#d29922',
  High: '#f0883e',
  Critical: '#f85149'
};
