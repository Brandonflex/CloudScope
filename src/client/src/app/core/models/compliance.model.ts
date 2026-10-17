export enum ComplianceFramework {
  CIS = 0,
  SOC2 = 1,
  HIPAA = 2,
  GDPR = 3,
  NIST = 4,
  PCI_DSS = 5,
  ISO27001 = 6
}

export enum ComplianceStatus {
  Compliant = 0,
  NonCompliant = 1,
  NotApplicable = 2,
  Unknown = 3
}

export interface CompliancePosture {
  frameworkScores: Record<string, number>;
  totalViolations: number;
  criticalViolations: number;
  highViolations: number;
  lastScanAt: string;
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