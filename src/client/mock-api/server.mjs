#!/usr/bin/env node
/**
 * CloudScope demo API + static host.
 *
 * A dependency-free Node server that reproduces the CloudScope REST surface on
 * top of the bundled demo estate (public/demo/inventory.json). It exists so the
 * Angular app can be explored — and screenshotted — without Azure credentials,
 * a .NET SDK or a cloud subscription.
 *
 *   node mock-api/server.mjs                     # API only, http://localhost:5055
 *   node mock-api/server.mjs --static dist/cloudscope/browser
 *                                                # API + built SPA on one port
 *
 * The real backend (src/server) is the source of truth for these calculations;
 * this file mirrors its behaviour closely enough for demos and UI development.
 */

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)));
const INVENTORY_PATH = join(HERE, '..', 'public', 'demo', 'inventory.json');

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const PORT = Number(argValue('--port', process.env.PORT ?? 5055));
const STATIC_DIR = argValue('--static', process.env.STATIC_DIR ?? '');

// ── Demo estate ────────────────────────────────────────────────────────────

const inventory = JSON.parse(await readFile(INVENTORY_PATH, 'utf8'));

const relationshipId = (edge) =>
  createHash('sha256')
    .update(`${edge.sourceResourceId}|${edge.targetResourceId}|${edge.relationshipType}`.toLowerCase())
    .digest('hex')
    .slice(0, 16);

const edges = inventory.relationships.map((edge) => ({ ...edge, id: edge.id ?? relationshipId(edge) }));

const resources = inventory.resources.map((resource) => ({
  ...resource,
  relationships: edges.filter(
    (edge) =>
      edge.sourceResourceId === resource.id || edge.targetResourceId === resource.id
  )
}));

const byId = new Map(resources.map((resource) => [resource.id, resource]));
const byName = new Map(resources.map((resource) => [resource.name.toLowerCase(), resource]));

const TODAY = new Date();
TODAY.setUTCHours(0, 0, 0, 0);

const isoDate = (date) => date.toISOString().slice(0, 10);
const startOfDay = (value) => {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
};
const addDays = (date, days) => new Date(date.getTime() + days * 86_400_000);
const daysBetween = (start, end) =>
  Math.max(1, Math.round((startOfDay(end) - startOfDay(start)) / 86_400_000) + 1);
const round = (value, digits = 2) => Number(value.toFixed(digits));

function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic ±5% daily noise, mirroring CostAnalytics.Noise. */
function noise(id, date) {
  return ((hash(`${id}|${isoDate(date)}`) % 1000) / 1000) * 0.1 - 0.05;
}

function dailyCost(resource, date, reference = TODAY) {
  if (!resource.estimatedMonthlyCost) return 0;

  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  const base = resource.estimatedMonthlyCost / daysInMonth;

  const daysFromReference = (startOfDay(date) - addDays(reference, -90)) / 86_400_000;
  const trend = 0.9 + 0.2 * Math.min(Math.max(daysFromReference / 90, 0), 1);
  let multiplier = trend * (1 + noise(resource.id, date));

  // Scripted spikes so anomaly detection has a story to tell.
  const offset = Math.round((startOfDay(date) - reference) / 86_400_000);
  if (resource.name === 'cosmos-prod-orders' && offset >= -2) multiplier *= 1.55;
  if (resource.name === 's3-prod-backups' && offset >= -5 && offset < -2) multiplier *= 1.9;

  return round(base * multiplier, 4);
}

function periodCost(resource, start, end) {
  let total = 0;
  for (let day = startOfDay(start); day <= startOfDay(end); day = addDays(day, 1)) {
    total += dailyCost(resource, day);
  }
  return total;
}

// Maps expose iterators rather than arrays; Node 20 does not have iterator.reduce.
const sum = (values) => {
  let total = 0;
  for (const value of values) total += value;
  return total;
};

function categoriesOf(entries) {
  const totals = new Map();
  for (const [key, amount] of entries) {
    const category = key || 'unknown';
    totals.set(category, (totals.get(category) ?? 0) + amount);
  }
  const grandTotal = sum(totals.values());
  return [...totals.entries()]
    .map(([category, amount]) => ({
      category,
      amount: round(amount),
      percentage: grandTotal === 0 ? 0 : round((amount / grandTotal) * 100, 1)
    }))
    .sort((a, b) => b.amount - a.amount);
}

function buildSummary(start, end) {
  const period = new Map(resources.map((resource) => [resource.id, periodCost(resource, start, end)]));
  const totalCost = sum(period.values());
  const azureCost = sum(resources.filter((r) => r.provider === 'Azure').map((r) => period.get(r.id)));
  const awsCost = sum(resources.filter((r) => r.provider === 'AWS').map((r) => period.get(r.id)));

  const previousStart = addDays(start, -daysBetween(start, end));
  const previousEnd = addDays(start, -1);
  const previousTotal = sum(resources.map((r) => periodCost(r, previousStart, previousEnd)));

  return {
    totalCost: round(totalCost),
    azureCost: round(azureCost),
    awsCost: round(awsCost),
    currency: 'USD',
    periodStart: startOfDay(start).toISOString(),
    periodEnd: startOfDay(end).toISOString(),
    byResourceType: categoriesOf(resources.map((r) => [r.resourceType, period.get(r.id)])),
    byRegion: categoriesOf(resources.map((r) => [r.region, period.get(r.id)])),
    byResourceGroup: categoriesOf(resources.map((r) => [r.resourceGroup, period.get(r.id)])),
    monthOverMonthChange:
      previousTotal <= 0 ? 0 : round(((totalCost - previousTotal) / previousTotal) * 100, 1)
  };
}

function buildTrends(start, end) {
  const points = [];
  for (let day = startOfDay(start); day <= startOfDay(end); day = addDays(day, 1)) {
    let azureCost = 0;
    let awsCost = 0;
    for (const resource of resources) {
      const cost = dailyCost(resource, day);
      if (resource.provider === 'Azure') azureCost += cost;
      else awsCost += cost;
    }
    points.push({
      date: day.toISOString(),
      azureCost: round(azureCost),
      awsCost: round(awsCost),
      totalCost: round(azureCost + awsCost)
    });
  }
  return points;
}

/** Ordinary least squares over the last 30 daily totals, projected forward. */
function buildForecast(daysAhead = 30) {
  const history = buildTrends(addDays(TODAY, -29), TODAY).map((point) => point.totalCost);
  const n = history.length;
  const meanX = (n - 1) / 2;
  const meanY = sum(history) / n;
  let numerator = 0;
  let denominator = 0;
  history.forEach((value, index) => {
    numerator += (index - meanX) * (value - meanY);
    denominator += (index - meanX) ** 2;
  });
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanY - slope * meanX;

  const residuals = history.map((value, index) => value - (intercept + slope * index));
  const stdDev = Math.sqrt(sum(residuals.map((r) => r * r)) / Math.max(1, n - 2));

  return Array.from({ length: Math.min(Math.max(daysAhead, 1), 90) }, (_, index) => {
    const predicted = intercept + slope * (n + index);
    const spread = 1.96 * stdDev;
    return {
      forecastDate: addDays(TODAY, index + 1).toISOString(),
      predictedCost: round(Math.max(0, predicted)),
      lowerBound: round(Math.max(0, predicted - spread)),
      upperBound: round(predicted + spread),
      confidenceLevel: 0.9
    };
  });
}

function buildAnomalies() {
  const anomalies = [];

  for (const resource of resources) {
    if (!resource.estimatedMonthlyCost) continue;

    const history = Array.from({ length: 30 }, (_, index) =>
      dailyCost(resource, addDays(TODAY, -29 + index))
    );
    const mean = sum(history) / history.length;
    if (mean <= 0) continue;

    const variance = sum(history.map((value) => (value - mean) ** 2)) / history.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) continue;

    const actual = history[history.length - 1];
    const zScore = (actual - mean) / stdDev;
    if (Math.abs(zScore) < 2.5) continue;
    if (Math.abs(actual - mean) / mean < 0.15) continue;

    anomalies.push({
      id: `anomaly-${resource.id}`,
      resourceId: resource.id,
      resourceName: resource.name,
      expectedCost: round(mean),
      actualCost: round(actual),
      deviationPercentage: round(((actual - mean) / mean) * 100, 1),
      detectedAt: TODAY.toISOString(),
      description: `${resource.name} spent ${round(actual, 2)} USD today against a 27-day average of ${round(
        mean,
        2
      )} USD (z-score ${round(zScore, 1)}).`
    });
  }

  return anomalies.sort((a, b) => b.deviationPercentage - a.deviationPercentage);
}

function buildRecommendations() {
  const recommendations = [];

  for (const resource of resources) {
    const cpu = resource.cpuUtilization;

    if (resource.resourceType === 'VirtualMachine' && cpu !== null && cpu !== undefined) {
      if (cpu < 10) {
        recommendations.push({
          id: `rec-${resource.id}-size`,
          resourceId: resource.id,
          resourceName: resource.name,
          resourceType: resource.resourceType,
          provider: resource.provider,
          region: resource.region,
          category: 'Rightsizing',
          title: 'Downsize under-utilised virtual machine',
          description: `Average CPU utilisation is ${Math.round(cpu)}%. Downsize one SKU to cut spend by ~50%.`,
          estimatedMonthlySavings: round(resource.estimatedMonthlyCost * 0.5),
          confidence: 'Medium'
        });
      } else if (cpu < 20) {
        recommendations.push({
          id: `rec-${resource.id}-review`,
          resourceId: resource.id,
          resourceName: resource.name,
          resourceType: resource.resourceType,
          provider: resource.provider,
          region: resource.region,
          category: 'Rightsizing',
          title: 'Review virtual machine size',
          description: `Average CPU utilisation is ${Math.round(cpu)}%. Consider a smaller SKU or autoscaling.`,
          estimatedMonthlySavings: round(resource.estimatedMonthlyCost * 0.3),
          confidence: 'Medium'
        });
      }
    }

    if (resource.resourceType === 'PublicIpAddress') {
      const associated = resource.properties?.associated;
      if (!associated || String(associated).toLowerCase() === 'none') {
        recommendations.push({
          id: `rec-${resource.id}-ip`,
          resourceId: resource.id,
          resourceName: resource.name,
          resourceType: resource.resourceType,
          provider: resource.provider,
          region: resource.region,
          category: 'IdleResource',
          title: 'Delete unattached public IP address',
          description: 'The public IP is not associated with a resource and is billed while idle.',
          estimatedMonthlySavings: round(resource.estimatedMonthlyCost),
          confidence: 'High'
        });
      }
    }

    if (resource.resourceType === 'Disk' && String(resource.properties?.attached).toLowerCase() === 'false') {
      recommendations.push({
        id: `rec-${resource.id}-disk`,
        resourceId: resource.id,
        resourceName: resource.name,
        resourceType: resource.resourceType,
        provider: resource.provider,
        region: resource.region,
        category: 'UnattachedStorage',
        title: 'Delete unattached managed disk',
        description: 'The disk is not attached to a virtual machine and continues to accrue charges.',
        estimatedMonthlySavings: round(resource.estimatedMonthlyCost),
        confidence: 'High'
      });
    }

    if (!resource.isManagedByIaC && resource.estimatedMonthlyCost > 0) {
      recommendations.push({
        id: `rec-${resource.id}-iac`,
        resourceId: resource.id,
        resourceName: resource.name,
        resourceType: resource.resourceType,
        provider: resource.provider,
        region: resource.region,
        category: 'Governance',
        title: 'Bring resource under Infrastructure as Code',
        description: 'The resource was created outside of IaC, so it cannot be reproduced or cleaned up automatically.',
        estimatedMonthlySavings: 0,
        confidence: 'High'
      });
    }
  }

  return recommendations.sort(
    (a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings || a.resourceName.localeCompare(b.resourceName)
  );
}

// ── Graph ──────────────────────────────────────────────────────────────────

const isImpactEdge = (edge) => !['Contains', 'Monitors'].includes(edge.relationshipType);

function dependentsOf(resourceId, maxDepth) {
  const visited = new Set([resourceId]);
  const queue = [{ id: resourceId, depth: 0 }];
  const result = [];

  while (queue.length > 0) {
    const { id, depth } = queue.shift();
    if (depth >= maxDepth) continue;

    for (const edge of edges) {
      if (edge.targetResourceId !== id || !isImpactEdge(edge)) continue;
      const dependentId = edge.sourceResourceId;
      if (visited.has(dependentId)) continue;

      visited.add(dependentId);
      const resource = byId.get(dependentId);
      result.push({
        resourceId: dependentId,
        resourceName: resource?.name ?? dependentId,
        resourceType: resource?.resourceType ?? 'Other',
        provider: resource?.provider ?? 'Azure',
        relationshipType: edge.relationshipType,
        hopCount: depth + 1,
        impactRisk: depth === 0 ? 'High' : 'Medium'
      });
      queue.push({ id: dependentId, depth: depth + 1 });
    }
  }

  return result;
}

function graphNode(resource) {
  return {
    id: resource.id,
    label: resource.name,
    type: resource.resourceType,
    provider: resource.provider,
    region: resource.region,
    status: resource.status,
    monthlyCost: resource.estimatedMonthlyCost,
    metadata: { resourceGroup: resource.resourceGroup, nativeType: resource.nativeResourceType }
  };
}

function graphEdge(edge) {
  return {
    id: edge.id,
    source: edge.sourceResourceId,
    target: edge.targetResourceId,
    relationshipType: edge.relationshipType,
    label: edge.description ?? edge.relationshipType
  };
}

function buildGraph({ provider, resourceType, region } = {}) {
  const nodes = resources
    .filter((resource) => !provider || resource.provider === provider)
    .filter((resource) => !resourceType || resource.resourceType === resourceType)
    .filter((resource) => !region || resource.region.toLowerCase() === region.toLowerCase());

  const ids = new Set(nodes.map((node) => node.id));
  return {
    nodes: nodes.map(graphNode),
    edges: edges
      .filter((edge) => ids.has(edge.sourceResourceId) && ids.has(edge.targetResourceId))
      .map(graphEdge)
  };
}

function buildSubgraph(resourceId, depth) {
  const nodeIds = new Set([resourceId]);
  let frontier = [resourceId];

  for (let hop = 0; hop < depth; hop += 1) {
    const next = [];
    for (const id of frontier) {
      for (const edge of edges) {
        if (edge.sourceResourceId === id && !nodeIds.has(edge.targetResourceId)) {
          nodeIds.add(edge.targetResourceId);
          next.push(edge.targetResourceId);
        }
        if (edge.targetResourceId === id && !nodeIds.has(edge.sourceResourceId)) {
          nodeIds.add(edge.sourceResourceId);
          next.push(edge.sourceResourceId);
        }
      }
    }
    frontier = next;
  }

  const nodes = resources.filter((resource) => nodeIds.has(resource.id));
  return {
    nodes: nodes.map(graphNode),
    edges: edges
      .filter((edge) => nodeIds.has(edge.sourceResourceId) && nodeIds.has(edge.targetResourceId))
      .map(graphEdge)
  };
}

function findPath(sourceId, targetId) {
  const adjacency = new Map();
  for (const edge of edges) {
    adjacency.set(edge.sourceResourceId, [...(adjacency.get(edge.sourceResourceId) ?? []), [edge.targetResourceId, edge]]);
    adjacency.set(edge.targetResourceId, [...(adjacency.get(edge.targetResourceId) ?? []), [edge.sourceResourceId, edge]]);
  }

  const queue = [sourceId];
  const parents = new Map();
  const visited = new Set([sourceId]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === targetId) break;
    for (const [neighbour, edge] of adjacency.get(current) ?? []) {
      if (visited.has(neighbour)) continue;
      visited.add(neighbour);
      parents.set(neighbour, [current, edge]);
      queue.push(neighbour);
    }
  }

  if (!parents.has(targetId)) return [];

  const path = [];
  let node = targetId;
  while (node !== sourceId && parents.has(node)) {
    const [parent, edge] = parents.get(node);
    path.push(edge);
    node = parent;
  }
  return path.reverse();
}

function blastRadius(resourceId, maxDepth) {
  const resource = byId.get(resourceId);
  if (!resource) return null;

  const dependents = dependentsOf(resourceId, maxDepth);
  const direct = dependents.filter((node) => node.hopCount === 1);
  const transitive = dependents.filter((node) => node.hopCount > 1);
  const affected = [resource, ...dependents.map((node) => byId.get(node.resourceId)).filter(Boolean)];

  const count = dependents.length;
  const riskLevel = count > 50 ? 'Critical' : count > 20 ? 'High' : count > 5 ? 'Medium' : 'Low';

  const affectedByType = {};
  const affectedByRegion = {};
  for (const item of dependents) {
    const target = byId.get(item.resourceId);
    if (!target) continue;
    affectedByType[target.resourceType] = (affectedByType[target.resourceType] ?? 0) + 1;
    const region = target.region || 'unknown';
    affectedByRegion[region] = (affectedByRegion[region] ?? 0) + 1;
  }

  return {
    resourceId,
    resourceName: resource.name,
    riskLevel,
    affectedResourceCount: count,
    directDependents: direct,
    transitiveDependents: transitive,
    affectedByType,
    affectedByRegion,
    affectedMonthlyCost: round(sum(affected.map((item) => item.estimatedMonthlyCost))),
    summary:
      count === 0
        ? `${resource.name} has no downstream dependents; a failure would be isolated.`
        : `If ${resource.name} fails, ${count} resource${count === 1 ? '' : 's'} across ${
            Object.keys(affectedByRegion).length
          } region${Object.keys(affectedByRegion).length === 1 ? '' : 's'} would be impacted, costing ${round(
            sum(affected.map((item) => item.estimatedMonthlyCost)),
            2
          )} USD per month.`
  };
}

// ── Compliance ─────────────────────────────────────────────────────────────

const bool = (resource, key) => {
  const value = resource.properties?.[key];
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value;
  const text = String(value).toLowerCase();
  if (['true', 'yes', '1', 'enabled'].includes(text)) return true;
  if (['false', 'no', '0', 'disabled', 'none'].includes(text)) return false;
  return null;
};
const text = (resource, key) => {
  const value = resource.properties?.[key];
  return value === undefined || value === null ? null : String(value);
};
const number = (resource, key) => {
  const value = resource.properties?.[key];
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};
const listContains = (resource, key, needle) => {
  const value = resource.properties?.[key];
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.map(String).includes(needle);
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .includes(needle);
};

const pass = (details = null) => ({ status: 'Compliant', details });
const fail = (details) => ({ status: 'NonCompliant', details });
const na = () => ({ status: 'NotApplicable', details: null });

const policies = [
  {
    id: 'CIS-AZ-2.1',
    name: 'Ensure storage accounts are not publicly accessible',
    description: 'Storage accounts must disable anonymous blob access unless explicitly approved.',
    framework: 'CIS',
    category: 'Storage',
    severity: 'High',
    applicableResourceTypes: ['StorageAccount'],
    ruleExpression: "resources | where type == 'StorageAccount' | where properties.allowBlobPublicAccess == true",
    remediation: 'Set allowBlobPublicAccess to false or enable the public access block.',
    evaluate: (r) => {
      const azure = bool(r, 'allowBlobPublicAccess');
      const aws = bool(r, 'publicAccessBlock');
      if (azure === true) return fail('Anonymous blob access is enabled.');
      if (azure === false) return pass('Anonymous blob access is disabled.');
      if (aws === true) return pass('S3 public access block is enabled.');
      if (aws === false) return fail('S3 public access block is disabled.');
      return na();
    }
  },
  {
    id: 'CIS-AZ-2.2',
    name: 'Ensure storage accounts enforce TLS 1.2',
    description: 'Storage endpoints must reject TLS 1.0/1.1 clients.',
    framework: 'CIS',
    category: 'Storage',
    severity: 'Medium',
    applicableResourceTypes: ['StorageAccount'],
    ruleExpression: "resources | where type == 'StorageAccount' | where properties.minTlsVersion != 'TLS1_2'",
    remediation: 'Set minimumTlsVersion to TLS1_2 on the storage account.',
    evaluate: (r) => {
      const tls = text(r, 'minTlsVersion');
      if (!tls) return na();
      return ['tls1.2', 'tls1.3'].includes(tls.replace(/_/g, '.').toLowerCase())
        ? pass(`Minimum TLS version is ${tls}.`)
        : fail(`Minimum TLS version is ${tls}; TLS 1.2 is required.`);
    }
  },
  {
    id: 'CIS-AZ-3.1',
    name: 'Ensure SQL auditing is enabled',
    description: 'Azure SQL databases must write audit events to a destination.',
    framework: 'CIS',
    category: 'Database',
    severity: 'High',
    applicableResourceTypes: ['SqlDatabase'],
    ruleExpression: "resources | where type == 'SqlDatabase' | where properties.auditingEnabled == false",
    remediation: 'Enable auditing and send logs to Log Analytics or a storage account.',
    evaluate: (r) => {
      const auditing = bool(r, 'auditingEnabled');
      if (auditing === null) return na();
      return auditing ? pass('Auditing is enabled.') : fail('Auditing is disabled.');
    }
  },
  {
    id: 'CIS-AZ-8.1',
    name: 'Ensure Key Vault purge protection is enabled',
    description: 'Key Vaults must protect deleted secrets from permanent destruction.',
    framework: 'CIS',
    category: 'Identity & Access',
    severity: 'High',
    applicableResourceTypes: ['KeyVault'],
    ruleExpression: "resources | where type == 'KeyVault' | where properties.purgeProtection != true",
    remediation: 'Enable purge protection on the vault.',
    evaluate: (r) => {
      const purge = bool(r, 'purgeProtection');
      const rotation = bool(r, 'rotationEnabled');
      if (purge === true || rotation === true) {
        return pass(purge === true ? 'Purge protection is enabled.' : 'Automatic key rotation is enabled.');
      }
      if (purge === false) return fail('Purge protection is disabled.');
      return na();
    }
  },
  {
    id: 'CIS-AWS-2.1.1',
    name: 'Ensure S3 buckets have default encryption',
    description: 'All S3 buckets must encrypt objects at rest.',
    framework: 'CIS',
    category: 'Storage',
    severity: 'High',
    applicableResourceTypes: ['StorageAccount'],
    ruleExpression: "resources | where type == 'StorageAccount' | where properties.encryption == 'None'",
    remediation: 'Enable default encryption (SSE-S3 or SSE-KMS).',
    evaluate: (r) => {
      const encryption = text(r, 'encryption');
      if (!encryption) return na();
      return encryption.toLowerCase() === 'none' ? fail('Default encryption is disabled.') : pass(`Default encryption is ${encryption}.`);
    }
  },
  {
    id: 'CIS-AWS-2.1.2',
    name: 'Ensure S3 bucket versioning is enabled',
    description: 'Versioning protects objects from accidental deletion.',
    framework: 'CIS',
    category: 'Storage',
    severity: 'Medium',
    applicableResourceTypes: ['StorageAccount'],
    ruleExpression: "resources | where type == 'StorageAccount' | where properties.versioning == false",
    remediation: 'Enable versioning on the bucket.',
    evaluate: (r) => {
      const versioning = bool(r, 'versioning');
      if (versioning === null) return na();
      return versioning ? pass('Versioning is enabled.') : fail('Versioning is disabled.');
    }
  },
  {
    id: 'CIS-AWS-5.2',
    name: 'Ensure no security group allows 22/3389 from the Internet',
    description: 'Administrative ports must never be reachable from 0.0.0.0/0.',
    framework: 'CIS',
    category: 'Network Security',
    severity: 'Critical',
    applicableResourceTypes: ['NetworkSecurityGroup', 'SecurityGroup'],
    ruleExpression: "resources | where type in ('NetworkSecurityGroup','SecurityGroup') | where properties.openPorts has_any ('22','3389')",
    remediation: 'Restrict administrative access to a bastion host or VPN range.',
    evaluate: (r) => {
      const source = text(r, 'source');
      if (!source) return na();
      const isPublic = /internet|0\.0\.0\.0\/0/i.test(source);
      if (!isPublic) return pass(`Ingress is restricted to ${source}.`);
      const exposesAdmin = listContains(r, 'openPorts', '22') || listContains(r, 'openPorts', '3389');
      return exposesAdmin
        ? fail(`Ports ${text(r, 'openPorts')} are open to ${source}.`)
        : pass('Only public web ports are exposed.');
    }
  },
  {
    id: 'CIS-AZ-7.1',
    name: 'Ensure virtual machine disks are encrypted',
    description: 'OS and data disks must be encrypted at rest.',
    framework: 'CIS',
    category: 'Compute',
    severity: 'High',
    applicableResourceTypes: ['VirtualMachine'],
    ruleExpression: "resources | where type == 'VirtualMachine' | where properties.diskEncryption == false",
    remediation: 'Enable Azure Disk Encryption or use platform-managed keys with encryption at host.',
    evaluate: (r) => {
      const azure = bool(r, 'diskEncryption');
      const aws = bool(r, 'ebsEncrypted');
      if (azure === true || aws === true) return pass('Disks are encrypted.');
      if (azure === false) return fail('Disk encryption is disabled.');
      if (aws === false) return fail('EBS encryption is disabled.');
      return na();
    }
  },
  {
    id: 'SOC2-CC6.1',
    name: 'Ensure network segmentation on every subnet',
    description: 'Subnets must be protected by a network security group or be private.',
    framework: 'SOC2',
    category: 'Network Security',
    severity: 'High',
    applicableResourceTypes: ['Subnet'],
    ruleExpression: "resources | where type == 'Subnet' | where isempty(properties.nsg)",
    remediation: 'Attach an NSG to the subnet and restrict public ingress.',
    evaluate: (r) => {
      const nsg = text(r, 'nsg');
      const isPublic = bool(r, 'public');
      if (nsg) return pass(`Protected by ${nsg}.`);
      if (isPublic === false) return pass('Subnet is private.');
      if (isPublic === true) return fail('Public subnet has no network security group.');
      return na();
    }
  },
  {
    id: 'SOC2-CC6.6',
    name: 'Ensure web apps enforce HTTPS',
    description: 'App Services and Functions must redirect HTTP traffic to HTTPS.',
    framework: 'SOC2',
    category: 'Network Security',
    severity: 'High',
    applicableResourceTypes: ['AppService', 'Function'],
    ruleExpression: "resources | where type in ('AppService','Function') | where properties.httpsOnly == false",
    remediation: 'Set httpsOnly to true on the site.',
    evaluate: (r) => {
      const httpsOnly = bool(r, 'httpsOnly');
      if (httpsOnly === null) return na();
      return httpsOnly ? pass('HTTPS-only is enforced.') : fail('HTTP traffic is allowed.');
    }
  },
  {
    id: 'SOC2-CC7.1',
    name: 'Ensure detailed monitoring is enabled',
    description: 'Compute instances must emit 1-minute metrics for incident response.',
    framework: 'SOC2',
    category: 'Monitoring',
    severity: 'Medium',
    applicableResourceTypes: ['VirtualMachine'],
    ruleExpression: "resources | where type == 'VirtualMachine' | where properties.detailedMonitoring == false",
    remediation: 'Enable detailed monitoring (AWS) or the Azure Monitor agent.',
    evaluate: (r) => {
      const detailed = bool(r, 'detailedMonitoring');
      if (detailed === null) return na();
      return detailed ? pass('Detailed monitoring is enabled.') : fail('Detailed monitoring is disabled.');
    }
  },
  {
    id: 'SOC2-CC7.2',
    name: 'Ensure database backups retain at least 7 days',
    description: 'Backups must be retained long enough to recover from incidents.',
    framework: 'SOC2',
    category: 'Resilience',
    severity: 'High',
    applicableResourceTypes: ['SqlDatabase', 'CosmosDbAccount', 'DynamoDbTable'],
    ruleExpression: "resources | where type in ('SqlDatabase','CosmosDbAccount','DynamoDbTable') | where properties.backupRetentionDays < 7",
    remediation: 'Raise the backup retention period to at least 7 days.',
    evaluate: (r) => {
      const retention = number(r, 'backupRetentionDays');
      if (retention === null) return na();
      return retention >= 7 ? pass(`Retention is ${retention} days.`) : fail(`Retention is only ${retention} days.`);
    }
  },
  {
    id: 'HIPAA-164.312(a)(2)(iv)',
    name: 'Ensure data stores encrypt data at rest',
    description: 'All stores that may contain PHI must be encrypted at rest.',
    framework: 'HIPAA',
    category: 'Encryption',
    severity: 'Critical',
    applicableResourceTypes: ['StorageAccount', 'SqlDatabase', 'CosmosDbAccount', 'DynamoDbTable', 'RedisCache'],
    ruleExpression: "resources | where type in ('StorageAccount','SqlDatabase','CosmosDbAccount','DynamoDbTable','RedisCache') | where properties.encryptionAtRest != true",
    remediation: 'Enable encryption at rest with a customer-managed key where required.',
    evaluate: (r) => {
      const explicitSetting = bool(r, 'encryptionAtRest') ?? bool(r, 'storageEncrypted') ?? bool(r, 'atRestEncryption');
      if (explicitSetting === true) return pass('Encryption at rest is enabled.');
      if (explicitSetting === false) return fail('Encryption at rest is disabled.');

      const encryption = text(r, 'encryption');
      if (encryption) {
        return encryption.toLowerCase() === 'none'
          ? fail('Encryption at rest is disabled.')
          : pass(`Encryption at rest is ${encryption}.`);
      }

      const tde = bool(r, 'tde');
      if (tde !== null) return tde ? pass('Transparent data encryption is enabled.') : fail('Transparent data encryption is disabled.');
      return na();
    }
  },
  {
    id: 'HIPAA-164.312(e)(1)',
    name: 'Ensure transmission security',
    description: 'Data stores and web endpoints must require encrypted transport.',
    framework: 'HIPAA',
    category: 'Encryption',
    severity: 'High',
    applicableResourceTypes: ['StorageAccount', 'RedisCache', 'SqlDatabase'],
    ruleExpression: "resources | where properties.nonSslPort == true or properties.transitEncryption == false",
    remediation: 'Disable non-TLS ports and enforce a minimum of TLS 1.2.',
    evaluate: (r) => {
      const nonSsl = bool(r, 'nonSslPort');
      const transit = bool(r, 'transitEncryption');
      const httpsOnly = bool(r, 'httpsOnly');
      const tls = text(r, 'minTlsVersion');

      if (nonSsl === true) return fail('The non-TLS Redis port is enabled.');
      if (transit === false) return fail('In-transit encryption is disabled.');
      if (httpsOnly === false) return fail('HTTPS is not enforced.');
      if (tls && ['tls1.0', 'tls1.1'].includes(tls.replace(/_/g, '.').toLowerCase())) {
        return fail(`Minimum TLS version is ${tls}.`);
      }
      if (nonSsl === false || transit === true || httpsOnly === true || tls) {
        return pass('Encrypted transport is enforced.');
      }
      return na();
    }
  },
  {
    id: 'GDPR-32',
    name: 'Ensure data stores disable public network access',
    description: 'Personal data stores must not be reachable from the public internet.',
    framework: 'GDPR',
    category: 'Network Security',
    severity: 'High',
    applicableResourceTypes: ['CosmosDbAccount', 'SqlDatabase', 'KeyVault'],
    ruleExpression: "resources | where properties.publicNetworkAccess == 'Enabled'",
    remediation: 'Use private endpoints and set publicNetworkAccess to Disabled.',
    evaluate: (r) => {
      const publicAccess = text(r, 'publicNetworkAccess');
      if (!publicAccess) return na();
      return publicAccess.toLowerCase() === 'enabled'
        ? fail('Public network access is enabled.')
        : pass('Public network access is disabled.');
    }
  },
  {
    id: 'GDPR-5.1',
    name: 'Ensure resources carry data inventory tags',
    description: 'Every resource must have an owner and environment tag for records of processing.',
    framework: 'GDPR',
    category: 'Governance',
    severity: 'Medium',
    applicableResourceTypes: [],
    ruleExpression: 'resources | where isempty(tags.owner) or isempty(tags.environment)',
    remediation: 'Add owner and environment tags to the resource.',
    evaluate: (r) => {
      const missing = [];
      if (!r.tags || !Object.keys(r.tags).some((key) => key.toLowerCase() === 'owner')) missing.push('owner');
      if (!r.tags || !Object.keys(r.tags).some((key) => key.toLowerCase() === 'environment')) missing.push('environment');
      return missing.length === 0 ? pass('Owner and environment tags are present.') : fail(`Missing tags: ${missing.join(', ')}.`);
    }
  }
];

policies.forEach((policy) => {
  policy.enabled = true;
});

const severityRank = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function scan(framework) {
  const scope = framework ? policies.filter((policy) => policy.framework === framework) : policies;
  const results = [];

  for (const policy of scope) {
    for (const resource of resources) {
      if (policy.applicableResourceTypes.length > 0 && !policy.applicableResourceTypes.includes(resource.resourceType)) {
        continue;
      }
      const outcome = policy.evaluate(resource);
      results.push({
        id: `${policy.id}:${resource.id}`,
        policyId: policy.id,
        policyName: policy.name,
        resourceId: resource.id,
        resourceName: resource.name,
        framework: policy.framework,
        status: outcome.status,
        details: outcome.details,
        evaluatedAt: new Date().toISOString()
      });
    }
  }

  return results;
}

function reportFor(framework) {
  const results = scan(framework);
  const compliant = results.filter((result) => result.status === 'Compliant').length;
  const nonCompliant = results.filter((result) => result.status === 'NonCompliant').length;
  const notApplicable = results.filter((result) => result.status === 'NotApplicable').length;

  const violations = results
    .filter((result) => result.status === 'NonCompliant')
    .map((result) => {
      const policy = policies.find((item) => item.id === result.policyId);
      return {
        policyName: result.policyName,
        resourceName: result.resourceName,
        resourceId: result.resourceId,
        severity: policy?.severity ?? 'Medium',
        details: result.details ?? '',
        remediation: policy?.remediation ?? ''
      };
    })
    .sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));

  return {
    id: `report-${framework}-${isoDate(TODAY)}`,
    framework,
    generatedAt: new Date().toISOString(),
    totalPolicies: policies.filter((policy) => policy.framework === framework).length,
    compliantCount: compliant,
    nonCompliantCount: nonCompliant,
    notApplicableCount: notApplicable,
    compliancePercentage: compliant + nonCompliant === 0 ? 0 : round((compliant / (compliant + nonCompliant)) * 100, 1),
    results,
    topViolations: violations.slice(0, 25)
  };
}

function posture() {
  const frameworks = ['CIS', 'SOC2', 'HIPAA', 'GDPR'];
  const scores = {};
  let total = 0;
  let critical = 0;
  let high = 0;

  for (const framework of frameworks) {
    const report = reportFor(framework);
    scores[framework] = report.compliancePercentage;
    total += report.nonCompliantCount;

    for (const violation of report.topViolations) {
      if (violation.severity === 'Critical') critical += 1;
      if (violation.severity === 'High') high += 1;
    }
  }

  return {
    frameworkScores: scores,
    totalViolations: total,
    criticalViolations: critical,
    highViolations: high,
    lastScanAt: new Date().toISOString()
  };
}

// ── Natural language query ─────────────────────────────────────────────────

const resourceTypeWords = [
  ['virtual machine', 'VirtualMachine'],
  ['virtual machines', 'VirtualMachine'],
  ['vms', 'VirtualMachine'],
  ['vm', 'VirtualMachine'],
  ['kubernetes', 'KubernetesCluster'],
  ['aks', 'KubernetesCluster'],
  ['eks', 'KubernetesCluster'],
  ['sql', 'SqlDatabase'],
  ['cosmos', 'CosmosDbAccount'],
  ['dynamodb', 'DynamoDbTable'],
  ['dynamo', 'DynamoDbTable'],
  ['redis', 'RedisCache'],
  ['storage', 'StorageAccount'],
  ['bucket', 'StorageAccount'],
  ['s3', 'StorageAccount'],
  ['function', 'Function'],
  ['lambda', 'Function'],
  ['load balancer', 'LoadBalancer'],
  ['public ip', 'PublicIpAddress'],
  ['key vault', 'KeyVault'],
  ['subnet', 'Subnet'],
  ['disk', 'Disk'],
  ['security group', 'NetworkSecurityGroup'],
  ['nsg', 'NetworkSecurityGroup']
];

const normalizeText = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function findResource(question) {
  const normalized = normalizeText(question);
  let best = null;

  for (const resource of resources) {
    const name = normalizeText(resource.name);
    if (name.length > 3 && normalized.includes(name)) {
      if (!best || resource.name.length > best.name.length) best = resource;
    }
  }

  return best;
}

const money = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);

const project = (resource) => ({
  id: resource.id,
  name: resource.name,
  type: resource.resourceType,
  provider: resource.provider,
  region: resource.region,
  resourceGroup: resource.resourceGroup,
  status: resource.status,
  monthlyCost: resource.estimatedMonthlyCost,
  cpuUtilization: resource.cpuUtilization
});

function answerQuestion(question) {
  const started = Date.now();
  const q = question.toLowerCase();
  const normalized = normalizeText(question);

  const reply = (partial) => ({
    question,
    answer: partial.answer,
    generatedQuery: partial.generatedQuery ?? null,
    data: partial.data ?? null,
    success: true,
    error: null,
    processingTime: `${Date.now() - started} ms`,
    source: 'Local demo engine'
  });

  // Blast radius
  if (/(blast radius|what breaks|what happens if|affected if|impact if|goes down|fails)/.test(q)) {
    const target = findResource(question);
    if (target) {
      const result = blastRadius(target.id, 5);
      const names = result.directDependents.slice(0, 6).map((node) => node.resourceName);
      return reply({
        answer:
          `**${target.name}** has a ${result.riskLevel.toLowerCase()} blast radius: ` +
          `${result.affectedResourceCount} resource(s) depend on it. ` +
          (names.length ? `Direct impact: ${names.join(', ')}. ` : '') +
          `Affected monthly spend: **${money(result.affectedMonthlyCost)}**.`,
        generatedQuery: `graph | starting at '${target.name}' | traverse reverses DependsOn, ConnectsTo | depth 5`,
        data: result
      });
    }

    return reply({
      answer:
        'Tell me which resource to simulate a failure for, for example “what is the blast radius of vm-app-01?”. ' +
        'I can analyse any of the 54 resources in the inventory.',
      data: resources
        .filter((resource) => ['VirtualMachine', 'KubernetesCluster', 'SqlDatabase', 'CosmosDbAccount', 'Subnet'].includes(resource.resourceType))
        .slice(0, 8)
        .map(project)
    });
  }

  // Compliance
  if (/(compliance|violation|violations|cis|soc ?2|hipaa|gdpr|non-compliant|noncompliant|policy)/.test(q)) {
    const framework = /cis/.test(q) ? 'CIS' : /soc ?2/.test(q) ? 'SOC2' : /hipaa/.test(q) ? 'HIPAA' : /gdpr/.test(q) ? 'GDPR' : null;

    if (framework) {
      const report = reportFor(framework);
      const top = report.topViolations.slice(0, 5);
      return reply({
        answer:
          `**${framework}**: ${report.compliancePercentage}% of applicable checks pass. ` +
          `${report.nonCompliantCount} open violations across ${report.totalPolicies} policies.` +
          (top.length ? `\n\nTop findings:\n${top.map((v) => `• **${v.resourceName}** — ${v.policyName} (${v.severity})`).join('\n')}` : ''),
        generatedQuery: `compliance | where framework == '${framework}' | where status == 'NonCompliant'`,
        data: top
      });
    }

    const overall = posture();
    return reply({
      answer:
        `Across CIS, SOC 2, HIPAA and GDPR there are **${overall.totalViolations}** open findings ` +
        `(${overall.criticalViolations} critical, ${overall.highViolations} high). Framework scores: ` +
        Object.entries(overall.frameworkScores).map(([key, value]) => `${key} ${value}%`).join(', ') + '.',
      generatedQuery: 'compliance | summarize score by framework',
      data: overall
    });
  }

  // Anomalies
  if (/(anomal|spike|unusual|surge)/.test(q)) {
    const anomalies = buildAnomalies();
    return reply({
      answer: anomalies.length
        ? `I found **${anomalies.length}** cost anomal${anomalies.length === 1 ? 'y' : 'ies'}. ` +
          anomalies.slice(0, 3).map((a) => `**${a.resourceName}** is ${a.deviationPercentage}% above its baseline.`).join(' ')
        : 'No cost anomalies in the last 30 days; every resource is within its expected band.',
      generatedQuery: 'costs | where deviation > 2.2 stddev | project resource, deviation',
      data: anomalies
    });
  }

  // Forecast
  if (/(forecast|next month|predict|projection)/.test(q)) {
    const forecast = buildForecast(30);
    const total = sum(forecast.map((point) => point.predictedCost));
    return reply({
      answer: `The 30-day forecast is **${money(total)}** at 90% confidence, based on the last 30 days of spend.`,
      generatedQuery: 'costs | summarize sum(predictedCost) by day | extend horizon = 30d',
      data: forecast
    });
  }

  // Savings / rightsizing
  if (/(save|saving|rightsize|right-size|optimis|optimiz|waste|idle|underutil)/.test(q)) {
    const recommendations = buildRecommendations();
    const total = sum(recommendations.map((item) => item.estimatedMonthlySavings));
    return reply({
      answer: `I found **${recommendations.length}** optimisation opportunities worth **${money(total)}** per month. ` +
        (recommendations.slice(0, 3).map((item) => `${item.title} on **${item.resourceName}** (${money(item.estimatedMonthlySavings)}/mo).`).join(' ')),
      generatedQuery: 'resources | where cpuUtilization < 20 or isempty(properties.associated) | project name, savings',
      data: recommendations.slice(0, 10)
    });
  }

  // Unattached resources
  if (/(unattached|orphan|not attached|dangling)/.test(q)) {
    const orphanIps = resources.filter(
      (resource) =>
        resource.resourceType === 'PublicIpAddress' &&
        (!resource.properties?.associated || String(resource.properties.associated).toLowerCase() === 'none')
    );
    const orphanDisks = resources.filter(
      (resource) => resource.resourceType === 'Disk' && String(resource.properties?.attached).toLowerCase() === 'false'
    );
    const all = [...orphanIps, ...orphanDisks];
    const cost = sum(all.map((resource) => resource.estimatedMonthlyCost));

    return reply({
      answer: all.length
        ? `There are **${all.length}** unattached resources costing **${money(cost)}** per month: ` +
          all.map((resource) => `**${resource.name}** (${resource.resourceType})`).join(', ') + '.'
        : 'No unattached public IPs or disks were found.',
      generatedQuery: "resources | where type in ('PublicIpAddress','Disk') | where properties.associated == 'none'",
      data: all.map(project)
    });
  }

  // IaC governance
  if (/(iac|terraform|bicep|drift|not managed|unmanaged|governance)/.test(q)) {
    const unmanaged = resources.filter((resource) => !resource.isManagedByIaC);
    return reply({
      answer: `**${unmanaged.length}** of ${resources.length} resources were created outside IaC. ` +
        (unmanaged.length
          ? `Examples: ${unmanaged.slice(0, 5).map((resource) => `**${resource.name}**`).join(', ')}.`
          : 'Everything is managed as code.'),
      generatedQuery: 'resources | where isManagedByIaC == false | project name, type, resourceGroup',
      data: unmanaged.map(project)
    });
  }

  // Cost threshold
  const costMatch = q.match(/(?:more than|over|above|greater than|exceeds?)\s*\$?\s*(\d+(?:\.\d+)?)/);
  if (costMatch) {
    const threshold = Number(costMatch[1]);
    const matching = resources.filter((resource) => resource.estimatedMonthlyCost > threshold);
    return reply({
      answer: matching.length
        ? `**${matching.length}** resources cost more than ${money(threshold)} per month, totalling **${money(
            sum(matching.map((resource) => resource.estimatedMonthlyCost))
          )}**. The most expensive are ${matching
            .slice(0, 3)
            .sort((a, b) => b.estimatedMonthlyCost - a.estimatedMonthlyCost)
            .map((resource) => `**${resource.name}** (${money(resource.estimatedMonthlyCost)})`)
            .join(', ')}.`
        : `No resource costs more than ${money(threshold)} per month.`,
      generatedQuery: `resources | where estimatedMonthlyCost > ${threshold} | order by estimatedMonthlyCost desc`,
      data: matching.sort((a, b) => b.estimatedMonthlyCost - a.estimatedMonthlyCost).map(project)
    });
  }

  // Top N expensive
  if (/(most expensive|top .*expensive|expensive|highest cost|costliest|biggest spend)/.test(q)) {
    const count = Number(q.match(/top\s*(\d+)/)?.[1] ?? 5);
    const top = [...resources].sort((a, b) => b.estimatedMonthlyCost - a.estimatedMonthlyCost).slice(0, count);
    return reply({
      answer: `The top ${top.length} resources account for **${money(
        sum(top.map((resource) => resource.estimatedMonthlyCost))
      )}** of monthly spend:\n` +
        top.map((resource, index) => `${index + 1}. **${resource.name}** — ${money(resource.estimatedMonthlyCost)} (${resource.resourceType}, ${resource.region})`).join('\n'),
      generatedQuery: `resources | order by estimatedMonthlyCost desc | take ${count}`,
      data: top.map(project)
    });
  }

  // Spend by group
  if (/(resource group|by group|spend by)/.test(q)) {
    const summary = buildSummary(addDays(TODAY, -29), TODAY);
    return reply({
      answer: 'Spend by resource group:\n' +
        summary.byResourceGroup.slice(0, 8).map((group) => `• **${group.category}** — ${money(group.amount)} (${group.percentage}%)`).join('\n'),
      generatedQuery: 'costs | summarize sum(amount) by resourceGroup',
      data: summary.byResourceGroup
    });
  }

  // CPU utilisation
  const cpuMatch = q.match(/(?:under|below|less than)\s*(\d+)\s*%?\s*(?:cpu|utilisation|utilization)/) ??
    q.match(/(?:cpu|utilisation|utilization)[^\d]{0,30}(?:under|below|less than)\s*(\d+)/);
  if (cpuMatch || /(low cpu|under-?utilis|under-?utiliz|over-?provisioned)/.test(q)) {
    const threshold = cpuMatch ? Number(cpuMatch[1]) : 20;
    const vms = resources.filter(
      (resource) =>
        resource.resourceType === 'VirtualMachine' &&
        resource.cpuUtilization !== null &&
        resource.cpuUtilization !== undefined &&
        resource.cpuUtilization < threshold
    );
    const savings = sum(vms.map((resource) => resource.estimatedMonthlyCost * 0.4));
    return reply({
      answer: vms.length
        ? `**${vms.length}** virtual machines run below ${threshold}% average CPU: ` +
          vms.map((vm) => `**${vm.name}** (${Math.round(vm.cpuUtilization)}%, ${money(vm.estimatedMonthlyCost)}/mo)`).join(', ') +
          `. Rightsizing them would save roughly **${money(savings)}** per month.`
        : `No virtual machines are running below ${threshold}% CPU.`,
      generatedQuery: `resources | where type == 'VirtualMachine' and cpuUtilization < ${threshold}`,
      data: vms.map(project)
    });
  }

  // Provider / type inventory
  const provider = /\baws\b/.test(q) ? 'AWS' : /\bazure\b/.test(q) ? 'Azure' : null;
  const typeEntry = resourceTypeWords.find(([word]) => normalized.includes(word));
  if (provider || typeEntry) {
    let matching = resources;
    if (provider) matching = matching.filter((resource) => resource.provider === provider);
    if (typeEntry) matching = matching.filter((resource) => resource.resourceType === typeEntry[1]);

    const label = [provider, typeEntry ? typeEntry[0] : null].filter(Boolean).join(' ');
    const totalCost = sum(matching.map((resource) => resource.estimatedMonthlyCost));

    return reply({
      answer: `There are **${matching.length}** ${label} resource${matching.length === 1 ? '' : 's'} costing **${money(totalCost)}** per month.` +
        (matching.length ? `\n\n${matching.slice(0, 8).map((resource) => `• **${resource.name}** — ${resource.region}, ${resource.status}, ${money(resource.estimatedMonthlyCost)}/mo`).join('\n')}` : ''),
      generatedQuery: `resources | where ${provider ? `provider == '${provider}'` : 'true'}${typeEntry ? ` and type == '${typeEntry[1]}'` : ''}`,
      data: matching.map(project)
    });
  }

  // Overview
  if (/(how many|overview|summary|inventory|estate|everything|resources)/.test(q)) {
    const byType = {};
    const byProvider = {};
    for (const resource of resources) {
      byType[resource.resourceType] = (byType[resource.resourceType] ?? 0) + 1;
      byProvider[resource.provider] = (byProvider[resource.provider] ?? 0) + 1;
    }

    const monthly = sum(resources.map((resource) => resource.estimatedMonthlyCost));
    const p = posture();

    return reply({
      answer:
        `Your estate contains **${resources.length}** resources (${byProvider.Azure ?? 0} Azure, ${byProvider.AWS ?? 0} AWS) ` +
        `across ${new Set(resources.map((resource) => resource.region)).size} regions and ${new Set(resources.map((resource) => resource.resourceGroup)).size} resource groups, ` +
        `costing **${money(monthly)}** per month. There are ${Object.keys(byType).length} resource types and ${p.totalViolations} open compliance findings.`,
      generatedQuery: 'resources | summarize count() by provider, type',
      data: { byProvider, byType, monthlyCost: round(monthly) }
    });
  }

  // Keyword search fallback
  const tokens = normalized.split(' ').filter((token) => token.length > 2);
  const matching = resources.filter((resource) => {
    const haystack = normalizeText(
      [resource.name, resource.resourceType, resource.region, resource.resourceGroup, ...(Object.values(resource.tags ?? {}))].join(' ')
    );
    return tokens.some((token) => haystack.includes(token));
  });

  return reply({
    answer: matching.length
      ? `I found **${matching.length}** resources matching that question: ${matching.slice(0, 6).map((resource) => `**${resource.name}**`).join(', ')}.`
      : 'I could not map that question onto the inventory. Try asking about cost, compliance, dependencies, utilisation or a resource name.',
    generatedQuery: 'resources | search',
    data: matching.slice(0, 10).map(project)
  });
}

// ── HTTP plumbing ──────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  response.end(body);
}

function notFound(response, message) {
  sendJson(response, 404, { message });
}

// Request bodies are tiny JSON documents; anything larger is rejected so a
// single client cannot exhaust the demo process (50 MB was previously buffered).
const MAX_BODY_BYTES = 64 * 1024;

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function readBody(request, response) {
  const declared = Number(request.headers['content-length'] ?? 0);
  if (declared > MAX_BODY_BYTES) {
    sendJson(response, 413, { message: `Request body exceeds ${MAX_BODY_BYTES} bytes` });
    return null;
  }

  const chunks = [];
  let received = 0;

  for await (const chunk of request) {
    received += chunk.length;
    if (received > MAX_BODY_BYTES) {
      sendJson(response, 413, { message: `Request body exceeds ${MAX_BODY_BYTES} bytes` });
      return null;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    sendJson(response, 400, { message: 'Request body must be valid JSON' });
    return null;
  }
}

const ASSET_PATH = /\/[^/]+\.[a-z0-9]{1,8}$/i;


async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function serveStatic(request, response, pathname) {
  if (!STATIC_DIR) return false;

  // API and hub traffic is never a client-side route.
  if (pathname === '/api' || pathname.startsWith('/api/') || pathname === '/hubs' || pathname.startsWith('/hubs/')) return false;

  const decoded = safeDecode(pathname);
  if (decoded === null) {
    sendJson(response, 400, { message: 'Malformed request path' });
    return true;
  }

  const root = resolve(STATIC_DIR);
  const relative = normalize(decoded).replace(/^([/\\])+/, '');
  let filePath = resolve(join(root, relative));

  if (filePath !== root && !filePath.startsWith(root + sep)) {
    response.writeHead(403);
    response.end('Forbidden');
    return true;
  }

  let target = filePath;
  try {
    if ((await stat(target)).isDirectory()) target = join(target, 'index.html');
  } catch {
    target = null;
  }

  if (!target || !(await isFile(target))) {
    // Only extension-less GETs fall back to the SPA shell; a missing script,
    // image or stylesheet must 404 instead of returning HTML.
    const isNavigation = request.method === 'GET' && !ASSET_PATH.test(pathname);
    if (!isNavigation) return false;

    target = join(root, 'index.html');
    if (!(await isFile(target))) return false;
  }

  try {
    const body = await readFile(target);
    response.writeHead(200, {
      'Content-Type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': target.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600'
    });
    response.end(body);
    return true;
  } catch {
    return false;
  }
}

export async function handleRequest(request, response) {
  let url;
  try {
    url = new URL(request.url || '/', `http://${request.headers.host ?? 'localhost'}`);
  } catch {
    url = new URL('/', 'http://localhost');
  }

  const pathname = url.pathname;
  const query = url.searchParams;

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    });
    response.end();
    return;
  }

  try {
    if (pathname === '/hubs' || pathname.startsWith('/hubs/')) {
      sendJson(response, 501, {
        message: 'SignalR is not available in the demo host. Run the .NET API for live updates.'
      });
      return;
    }

    if (pathname !== '/api' && !pathname.startsWith('/api/')) {
      if (await serveStatic(request, response, pathname)) return;
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('Not found. Start the .NET API for non-demo usage.');
      return;
    }

    const route = pathname.slice('/api/'.length).replace(/\/+$/, '');
    const segments = route.split('/');

    // ── meta ────────────────────────────────────────────────────────────
    if (route === 'meta' && request.method === 'GET') {
      sendJson(response, 200, {
        version: '1.0.0-demo',
        demoMode: true,
        realtimeAvailable: false,
        storageProvider: 'InMemory',
        aiMode: 'Local',
        configuredProviders: ['Azure', 'AWS'],
        resourceCount: resources.length,
        relationshipCount: edges.length,
        lastDiscoveryAt: new Date().toISOString(),
        serverTimeUtc: new Date().toISOString()
      });
      return;
    }

    if (route === 'meta/demo' && request.method === 'POST') {
      sendJson(response, 200, {
        message: 'Demo estate loaded',
        resourcesDiscovered: resources.length,
        relationshipsDiscovered: edges.length,
        completedAt: new Date().toISOString()
      });
      return;
    }

    // ── resources ───────────────────────────────────────────────────────
    if (route === 'resources' && request.method === 'GET') {
      const pageNumber = Math.max(1, Number(query.get('pageNumber') ?? 1));
      const pageSize = Math.min(Math.max(1, Number(query.get('pageSize') ?? 50)), 500);
      const provider = query.get('provider');
      const resourceType = query.get('resourceType');
      const region = query.get('region');
      const resourceGroup = query.get('resourceGroup');
      const search = (query.get('search') ?? '').trim().toLowerCase();

      const filtered = resources
        .filter((resource) => !provider || resource.provider.toLowerCase() === provider.toLowerCase())
        .filter((resource) => !resourceType || resource.resourceType.toLowerCase() === resourceType.toLowerCase())
        .filter((resource) => !region || resource.region.toLowerCase() === region.toLowerCase())
        .filter((resource) => !resourceGroup || resource.resourceGroup.toLowerCase() === resourceGroup.toLowerCase())
        .filter((resource) => {
          if (!search) return true;
          const haystack = [
            resource.name,
            resource.id,
            resource.nativeId,
            resource.resourceType,
            resource.nativeResourceType,
            resource.resourceGroup,
            resource.region,
            ...Object.entries(resource.tags ?? {}).flat()
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(search);
        })
        .sort(
          (a, b) =>
            a.provider.localeCompare(b.provider) ||
            a.resourceType.localeCompare(b.resourceType) ||
            a.name.localeCompare(b.name)
        );

      const totalCount = filtered.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      const page = filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

      sendJson(response, 200, {
        items: page,
        totalCount,
        pageNumber,
        pageSize,
        totalPages,
        hasPreviousPage: pageNumber > 1,
        hasNextPage: pageNumber < totalPages
      });
      return;
    }

    if (route === 'resources/discover' && request.method === 'POST') {
      sendJson(response, 200, {
        message: 'Demo estate reloaded',
        demoMode: true,
        resourcesDiscovered: resources.length,
        relationshipsDiscovered: edges.length,
        durationSeconds: 0.4,
        providers: [
          { provider: 'Azure', configured: true, resources: 34, error: null },
          { provider: 'AWS', configured: true, resources: 20, error: null }
        ]
      });
      return;
    }

    if (route === 'resources/by-id' || route === 'resources/relationships' || route === 'resources/blast-radius') {
      const id = query.get('id');
      if (!id) { sendJson(response, 400, { message: 'id is required' }); return; }
      if (route === 'resources/blast-radius') {
        const result = blastRadius(id, Number(query.get('maxDepth') ?? 5));
        if (!result) notFound(response, 'Resource not found');
        else sendJson(response, 200, result);
      } else {
        const resource = byId.get(id);
        if (!resource) notFound(response, 'Resource not found');
        else sendJson(response, 200, route === 'resources/relationships' ? resource.relationships : resource);
      }
      return;
    }

    if (segments[0] === 'resources' && segments[1] === 'blast-radius' && segments[2]) {
      const result = blastRadius(decodeURIComponent(segments.slice(2).join('/')), Number(query.get('maxDepth') ?? 5));
      if (!result) notFound(response, 'Resource not found');
      else sendJson(response, 200, result);
      return;
    }

    if (segments[0] === 'resources' && segments[2] === 'relationships') {
      const id = decodeURIComponent(segments.slice(1, 2).join('/'));
      const resource = byId.get(id);
      if (!resource) notFound(response, 'Resource not found');
      else sendJson(response, 200, resource.relationships);
      return;
    }

    if (segments[0] === 'resources' && segments[1]) {
      const id = decodeURIComponent(segments.slice(1).join('/'));
      const resource = byId.get(id);
      if (!resource) notFound(response, 'Resource not found');
      else sendJson(response, 200, resource);
      return;
    }

    // ── graph ───────────────────────────────────────────────────────────
    if (route === 'graph' && request.method === 'GET') {
      sendJson(response, 200, buildGraph({
        provider: query.get('provider'),
        resourceType: query.get('resourceType'),
        region: query.get('region')
      }));
      return;
    }

    if (route === 'graph/subgraph') {
      const id = query.get('resourceId');
      if (!id) { sendJson(response, 400, { message: 'resourceId is required' }); return; }
      if (!byId.has(id)) notFound(response, 'Resource not found');
      else sendJson(response, 200, buildSubgraph(id, Number(query.get('depth') ?? 2)));
      return;
    }

    if (segments[0] === 'graph' && segments[1] === 'subgraph' && segments[2]) {
      const id = decodeURIComponent(segments.slice(2).join('/'));
      if (!byId.has(id)) {
        notFound(response, 'Resource not found');
        return;
      }
      sendJson(response, 200, buildSubgraph(id, Number(query.get('depth') ?? 2)));
      return;
    }

    if (route === 'graph/paths') {
      const sourceId = query.get('sourceId');
      const targetId = query.get('targetId');
      if (!sourceId || !targetId) {
        sendJson(response, 400, { message: 'Both sourceId and targetId are required' });
        return;
      }
      sendJson(response, 200, findPath(sourceId, targetId));
      return;
    }

    // ── costs ───────────────────────────────────────────────────────────
    if (segments[0] === 'costs') {
      const start = query.get('startDate') ? new Date(query.get('startDate')) : addDays(TODAY, -29);
      const end = query.get('endDate') ? new Date(query.get('endDate')) : TODAY;

      if (segments[1] === 'summary') {
        sendJson(response, 200, buildSummary(start, end));
        return;
      }

      if (segments[1] === 'trends') {
        sendJson(response, 200, buildTrends(start, end));
        return;
      }

      if (segments[1] === 'forecast') {
        sendJson(response, 200, buildForecast(Number(query.get('daysAhead') ?? 30)));
        return;
      }

      if (segments[1] === 'anomalies') {
        sendJson(response, 200, buildAnomalies());
        return;
      }

      if (segments[1] === 'top-resources') {
        const count = Math.min(Math.max(1, Number(query.get('count') ?? 10)), 100);
        const costs = resources
          .map((resource) => ({
            resourceId: resource.id,
            resourceName: resource.name,
            provider: resource.provider,
            resourceGroup: resource.resourceGroup,
            amount: round(periodCost(resource, start, end)),
            currency: 'USD',
            periodStart: startOfDay(start).toISOString(),
            periodEnd: startOfDay(end).toISOString()
          }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, count);
        sendJson(response, 200, costs);
        return;
      }

      if (segments[1] === 'recommendations') {
        sendJson(response, 200, buildRecommendations());
        return;
      }
    }

    // ── compliance ──────────────────────────────────────────────────────
    if (route === 'compliance/status') {
      sendJson(response, 200, posture());
      return;
    }

    if (route === 'compliance/policies') {
      const framework = query.get('framework');
      sendJson(response, 200, policies.filter((policy) => !framework || policy.framework === framework));
      return;
    }

    if (route === 'compliance/scan' && request.method === 'POST') {
      const framework = query.get('framework') || null;
      const results = scan(framework);
      sendJson(response, 200, {
        message: 'Compliance scan completed',
        framework: framework ?? 'ALL',
        totalEvaluated: results.length,
        compliant: results.filter((result) => result.status === 'Compliant').length,
        nonCompliant: results.filter((result) => result.status === 'NonCompliant').length,
        results
      });
      return;
    }

    if (segments[0] === 'compliance' && segments[1] === 'reports' && segments[2]) {
      sendJson(response, 200, reportFor(segments[2]));
      return;
    }

    // ── query ───────────────────────────────────────────────────────────
    if (route === 'query/suggestions') {
      sendJson(response, 200, [
        'What are my top 5 most expensive resources?',
        'Which VMs are under-utilised?',
        'Show my critical compliance violations',
        'What is the blast radius of vm-app-01?',
        'Which resources are not managed by IaC?',
        'Which resource costs are anomalous?',
        'How much will I spend next month?',
        'Where can I save money?'
      ]);
      return;
    }

    if (route === 'query/ask' && request.method === 'POST') {
      const body = await readBody(request, response);
      if (body === null) return;
      const question = String(body.question ?? '').trim();
      if (!question) {
        sendJson(response, 400, { message: 'Question is required' });
        return;
      }
      if (question.length > 1000) {
        sendJson(response, 400, { message: 'Question must be 1000 characters or fewer' });
        return;
      }
      sendJson(response, 200, answerQuestion(question));
      return;
    }

    notFound(response, `No demo handler for ${request.method} ${pathname}`);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { message: 'An unexpected error occurred.' });
  }
}

// Importing the handler in a serverless function must not open a port.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer(handleRequest);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`CloudScope demo API listening on http://0.0.0.0:${PORT}`);
    console.log(`  estate: ${resources.length} resources / ${edges.length} relationships`);
    if (STATIC_DIR) console.log(`  static: ${resolve(STATIC_DIR)}`);
  });
}
