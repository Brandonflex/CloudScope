import { CloudProvider, ResourceStatus, ResourceType, RelationshipType } from './resource.model';

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
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

export interface BlastRadiusNode {
  resourceId: string;
  resourceName: string;
  resourceType: ResourceType;
  provider: CloudProvider;
  relationshipType: RelationshipType;
  hopCount: number;
  impactRisk: RiskLevel;
}

export enum RiskLevel {
  Low = 0,
  Medium = 1,
  High = 2,
  Critical = 3
}