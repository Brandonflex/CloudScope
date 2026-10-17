export enum CloudProvider {
  Azure = 0,
  AWS = 1
}

export enum ResourceStatus {
  Unknown = 0,
  Healthy = 1,
  Warning = 2,
  Critical = 3,
  Stopped = 4,
  Provisioning = 5,
  Deprovisioning = 6
}

export enum ResourceType {
  VirtualMachine = 'VirtualMachine',
  AppService = 'AppService',
  Function = 'Function',
  ContainerInstance = 'ContainerInstance',
  KubernetesCluster = 'KubernetesCluster',
  VirtualNetwork = 'VirtualNetwork',
  Subnet = 'Subnet',
  NetworkInterface = 'NetworkInterface',
  PublicIpAddress = 'PublicIpAddress',
  LoadBalancer = 'LoadBalancer',
  StorageAccount = 'StorageAccount',
  SqlDatabase = 'SqlDatabase',
  CosmosDbAccount = 'CosmosDbAccount',
  RedisCache = 'RedisCache',
  KeyVault = 'KeyVault',
  ServiceBus = 'ServiceBus',
  ResourceGroup = 'ResourceGroup',
  Other = 'Other'
}

export enum RelationshipType {
  Contains = 'Contains',
  DependsOn = 'DependsOn',
  ConnectsTo = 'ConnectsTo',
  ManagedBy = 'ManagedBy',
  PeeredWith = 'PeeredWith',
  LoadBalances = 'LoadBalances',
  Monitors = 'Monitors',
  SecuredBy = 'SecuredBy',
  StoredIn = 'StoredIn',
  DeployedOn = 'DeployedOn',
  RoutesTo = 'RoutesTo',
  Other = 'Other'
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
  cpuUtilization?: number;
  memoryUtilization?: number;
  discoveredAt: string;
  lastSyncedAt: string;
  isManagedByIaC: boolean;
  complianceStatus: number;
  relationships: ResourceRelationship[];
}

export interface ResourceRelationship {
  id: string;
  sourceResourceId: string;
  targetResourceId: string;
  relationshipType: RelationshipType;
  description?: string;
  properties: Record<string, string>;
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