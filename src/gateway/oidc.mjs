import * as client from 'openid-client';

/** Tenant-bound Microsoft Entra OIDC, with cryptographic ID-token checks. */
export async function createMicrosoftOidc(config, customFetch) {
  const options = { execute: [client.enableNonRepudiationChecks] };
  // Only the test harness supplies a custom transport; deployments do not.
  if (customFetch) options[client.customFetch] = customFetch;
  const oidcConfig = await client.discovery(
    new URL(`https://login.microsoftonline.com/${config.tenant}/v2.0`),
    config.clientId, config.clientSecret, undefined, options
  );
  return {
    async begin(redirectUri) {
      const verifier = client.randomPKCECodeVerifier();
      const state = client.randomState();
      const nonce = client.randomNonce();
      const url = client.buildAuthorizationUrl(oidcConfig, {
        redirect_uri: redirectUri, scope: 'openid profile', state, nonce,
        code_challenge: await client.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256'
      });
      return { url: url.href, verifier, state, nonce };
    },
    async finish(callback, transaction) {
      const tokens = await client.authorizationCodeGrant(oidcConfig, callback, {
        pkceCodeVerifier: transaction.verifier, expectedState: transaction.state,
        expectedNonce: transaction.nonce, idTokenExpected: true
      });
      return tokens.claims();
    }
  };
}
