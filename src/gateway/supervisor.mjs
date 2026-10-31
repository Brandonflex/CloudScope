import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readConfig } from './gateway.mjs';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Force the API onto loopback and prevent demo seeding, external AI, persistent
// storage and an accidentally anonymous backend. Explicit deployment opt-in is
// required while the gateway is undergoing integration and security review.
export function backendEnvironment(env) {
  if (env.CLOUDSCOPE_ENABLE_EXPERIMENTAL_GATEWAY !== 'true') {
    throw new Error('Experimental live gateway has not been explicitly enabled.');
  }
  const config = readConfig(env);
  const tenant = env.Azure__TenantId || '';
  const clientId = env.Azure__ClientId || '';
  const subscription = env.Azure__SubscriptionId || '';
  if (![tenant, clientId, subscription].every((value) => GUID.test(value)) || !env.Azure__ClientSecret ||
      tenant.toLowerCase() !== config.tenant) {
    throw new Error('A tenant-matched, read-only Azure service identity and subscription are required.');
  }
  const isolated = { ...env };
  delete isolated.CLOUDSCOPE_OIDC_CLIENT_SECRET;
  delete isolated.CLOUDSCOPE_SESSION_SECRET;
  return {
    ...isolated,
    ASPNETCORE_ENVIRONMENT: 'Production',
    ASPNETCORE_URLS: 'http://127.0.0.1:8081',
    Platform__StorageProvider: 'InMemory',
    Platform__SeedDemoData: 'false',
    GatewayAuthentication__Enabled: 'true',
    GatewayAuthentication__SharedSecret: config.gatewaySecret,
    AzureOpenAI__Endpoint: '', AzureOpenAI__ApiKey: '',
    CosmosDb__Endpoint: '', CosmosDb__Key: '',
    AWS__AccessKeyId: '', AWS__SecretAccessKey: '',
    ConnectionStrings__Redis: '', ApplicationInsights__ConnectionString: '',
    SignalR__ConnectionString: '', Swagger__Enabled: 'false'
  };
}

export function gatewayEnvironment(env) {
  const isolated = { ...env };
  for (const key of ['Azure__TenantId', 'Azure__ClientId', 'Azure__ClientSecret',
    'Azure__SubscriptionId', 'AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET',
    'AZURE_FEDERATED_TOKEN_FILE', 'AZURE_CLIENT_CERTIFICATE_PATH']) delete isolated[key];
  return isolated;
}

function main() {
  const env = backendEnvironment(process.env);
  const api = spawn('dotnet', ['/app/api/CloudScope.Api.dll'], { env, stdio: 'inherit' });
  const gateway = spawn(process.execPath, ['/app/gateway/server.mjs'], { env: gatewayEnvironment(process.env), stdio: 'inherit' });
  let stopping = false;
  const stop = (exitCode) => {
    if (stopping) return;
    stopping = true;
    api.kill('SIGTERM');
    gateway.kill('SIGTERM');
    process.exitCode = exitCode;
  };
  for (const child of [api, gateway]) {
    child.on('error', () => stop(1));
    child.on('exit', () => stop(1));
  }
  process.on('SIGTERM', () => stop(0));
  process.on('SIGINT', () => stop(0));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
