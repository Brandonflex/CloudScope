import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createMicrosoftOidc } from '../oidc.mjs';

const tenant = '11111111-1111-4111-8111-111111111111';
const config = {
  tenant, clientId: '33333333-3333-4333-8333-333333333333', clientSecret: 'test-secret'
};
const issuer = `https://login.microsoftonline.com/${tenant}/v2.0`;
const user = '22222222-2222-4222-8222-222222222222';

async function setup({ wrongSignature = false, wrongNonce = false } = {}) {
  const keys = await generateKeyPair('RS256', { extractable: true });
  const badKeys = await generateKeyPair('RS256', { extractable: true });
  const publicKey = { ...(await exportJWK(keys.publicKey)), kid: 'test-key', use: 'sig', alg: 'RS256' };
  let nonce;
  let expectedVerifier;
  let tokenRequests = 0;
  const fakeFetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const json = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.pathname.endsWith('/.well-known/openid-configuration')) return json({
      issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/keys`, response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'], id_token_signing_alg_values_supported: ['RS256']
    });
    if (url.pathname.endsWith('/keys')) return json({ keys: [publicKey] });
    if (url.pathname.endsWith('/token')) {
      tokenRequests++;
      const params = new URLSearchParams(options.body);
      assert.equal(params.get('code_verifier'), expectedVerifier);
      const signed = await new SignJWT({ nonce: wrongNonce ? 'wrong' : nonce, tid: tenant, oid: user })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer(issuer).setAudience(config.clientId)
        .setSubject('subject').setIssuedAt().setExpirationTime('5m')
        .sign(wrongSignature ? badKeys.privateKey : keys.privateKey);
      return json({ access_token: 'test-token', token_type: 'Bearer', expires_in: 300, id_token: signed });
    }
    throw new Error(`Unexpected mock URL ${url.href}`);
  };
  const oidc = await createMicrosoftOidc(config, fakeFetch);
  const transaction = await oidc.begin('https://cloudscope.example/auth/callback');
  const url = new URL(transaction.url);
  nonce = url.searchParams.get('nonce');
  expectedVerifier = transaction.verifier;
  return { oidc, transaction, tokenRequests: () => tokenRequests };
}

test('real OIDC library validates PKCE, state, nonce and a signed tenant token', async () => {
  const { oidc, transaction, tokenRequests } = await setup();
  const redirect = new URL(`https://cloudscope.example/auth/callback?code=valid&state=${transaction.state}`);
  const claims = await oidc.finish(redirect, transaction);
  assert.equal(claims.tid, tenant);
  assert.equal(claims.oid, user);
  assert.equal(tokenRequests(), 1);
});

test('real OIDC library rejects mismatched state before token exchange', async () => {
  const { oidc, transaction, tokenRequests } = await setup();
  await assert.rejects(oidc.finish(new URL('https://cloudscope.example/auth/callback?code=valid&state=bad'), transaction));
  assert.equal(tokenRequests(), 0);
});

test('real OIDC library rejects wrong nonce and wrong token signature', async () => {
  for (const setting of [{ wrongNonce: true }, { wrongSignature: true }]) {
    const { oidc, transaction } = await setup(setting);
    const redirect = new URL(`https://cloudscope.example/auth/callback?code=valid&state=${transaction.state}`);
    await assert.rejects(oidc.finish(redirect, transaction));
  }
});
