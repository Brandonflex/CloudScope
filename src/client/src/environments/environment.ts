/**
 * Development environment.
 *
 * `apiUrl` is empty because the Angular dev server proxies /api and /hubs to the
 * .NET API (see proxy.conf.json). Override the proxy target with API_URL.
 */
export const environment = {
  production: false,
  apiUrl: '',
  signalRHubUrl: '/hubs/notifications',
  demoMode: false
};
