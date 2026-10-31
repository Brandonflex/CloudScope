// Small, manually maintained, source-linked summaries; no live web crawling.
// Keep these conservative and aligned with the linked documentation. They are
// supplied as context, not verified citations for a model's individual claims.
const documents = [
  {
    id: 'overview', title: 'CloudScope overview',
    url: 'https://github.com/Brandonflex/CloudScope/blob/main/README.md#overview',
    terms: ['cloudscope', 'platform', 'purpose', 'overview', 'features', 'responsibilities'],
    summary: 'CloudScope explores cloud resources, relationships, costs and compliance across Azure and AWS. The Vercel preview uses a fictional estate; deploying and securing a real backend is a separate operator responsibility.'
  },
  {
    id: 'security', title: 'CloudScope gateway safeguards',
    url: 'https://github.com/Brandonflex/CloudScope/blob/main/SECURITY.md#gateway-and-deployment-safeguards',
    terms: ['security', 'secure', 'gateway', 'authentication', 'authorization', 'identity', 'permissions', 'real', 'credentials', 'account', 'connect'],
    summary: 'Production requires an operator-provided identity-aware gateway, backend network isolation and a private gateway secret. The secret authenticates the gateway, not individual users. Do not attach real cloud credentials until these safeguards are in place.'
  },
  {
    id: 'discovery', title: 'CloudScope discovery',
    url: 'https://github.com/Brandonflex/CloudScope/blob/main/README.md#features',
    terms: ['discover', 'discovery', 'inventory', 'provider', 'resources', 'resource', 'scan'],
    summary: 'CloudScope discovery can collect resource metadata from Azure Resource Graph and AWS Config when a secured real backend and appropriate provider permissions exist. The preview does not scan real accounts.'
  },
  {
    id: 'graph', title: 'CloudScope blast radius',
    url: 'https://github.com/Brandonflex/CloudScope/blob/main/docs/architecture.md#blast-radius',
    terms: ['blast', 'radius', 'graph', 'dependencies', 'dependency', 'relationships', 'impact', 'failure'],
    summary: 'Blast-radius analysis follows relevant reverse dependency links to estimate potential impact. It is a guide to investigation, not a guarantee of what will happen.'
  },
  {
    id: 'cost', title: 'CloudScope cost intelligence',
    url: 'https://github.com/Brandonflex/CloudScope/blob/main/docs/architecture.md#cost-analytics',
    terms: ['cost', 'costs', 'spend', 'spending', 'forecast', 'forecasting', 'anomaly', 'anomalies', 'savings', 'expensive', 'budget'],
    summary: 'Cost intelligence provides spend summaries, trends, forecasts, anomalies and potential savings. Forecasts and recommendations are estimates that need human review; preview amounts are fictional.'
  },
  {
    id: 'compliance', title: 'CloudScope compliance',
    url: 'https://github.com/Brandonflex/CloudScope/blob/main/docs/architecture.md#compliance-engine',
    terms: ['compliance', 'policy', 'policies', 'violation', 'violations', 'cis', 'soc', 'hipaa', 'gdpr', 'audit'],
    summary: 'Compliance compares resource attributes against policy checks and shows findings. A finding is not proof of a breach and a score is not proof of overall regulatory compliance.'
  },
  {
    id: 'azure-graph', title: 'Microsoft: Azure Resource Graph overview',
    url: 'https://learn.microsoft.com/en-us/azure/governance/resource-graph/overview',
    terms: ['azure', 'resource', 'graph', 'subscription', 'discover'],
    summary: 'Azure Resource Graph is a service for querying Azure resource information across accessible subscriptions. CloudScope needs an authenticated, properly authorized backend to use it.'
  },
  {
    id: 'aws-config', title: 'AWS: What is AWS Config?',
    url: 'https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html',
    terms: ['aws', 'config', 'discovery', 'resources', 'account'],
    summary: 'AWS Config records and evaluates resource configuration. Availability, setup and charges depend on the AWS account and service configuration; do not assume it is free.'
  }
];

export function retrieveKnowledge(question, history = []) {
  const earlier = history.filter((turn) => turn.role === 'user').slice(-2).map((turn) => turn.content).join(' ');
  const words = new Set(`${question} ${earlier}`.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  return documents
    .map((doc) => ({ doc, score: doc.terms.filter((term) => words.has(term)).length }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id))
    .slice(0, 3)
    .map(({ doc }) => ({ id: doc.id, title: doc.title, url: doc.url, summary: doc.summary }));
}
