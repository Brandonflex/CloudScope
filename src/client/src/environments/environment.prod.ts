/**
 * Production environment. The SPA and API are served from the same origin
 * (Static Web Apps + App Service behind the same host or reverse proxy).
 */
export const environment = {
  production: true,
  apiUrl: '',
  signalRHubUrl: '/hubs/notifications',
  demoMode: false
};
