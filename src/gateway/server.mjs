import { createGateway, readConfig } from './gateway.mjs';
import { createMicrosoftOidc } from './oidc.mjs';

const config = readConfig(process.env);
const port = Number(process.env.PORT || 10000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port.');
const oidc = await createMicrosoftOidc(config);
const server = createGateway(config, oidc).listen(port, '0.0.0.0', () => {
  console.log('CloudScope gateway is listening.');
});
server.headersTimeout = 10000;
server.requestTimeout = 30000;
