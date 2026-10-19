import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    title: 'Dashboard — CloudScope'
  },
  {
    path: 'graph',
    loadComponent: () =>
      import('./features/graph/graph.component').then(m => m.GraphComponent),
    title: 'Infrastructure Graph — CloudScope'
  },
  {
    path: 'resources',
    loadComponent: () =>
      import('./features/resources/resources.component').then(m => m.ResourcesComponent),
    title: 'Resources — CloudScope'
  },
  {
    path: 'costs',
    loadComponent: () =>
      import('./features/costs/costs.component').then(m => m.CostsComponent),
    title: 'Cost Intelligence — CloudScope'
  },
  {
    path: 'compliance',
    loadComponent: () =>
      import('./features/compliance/compliance.component').then(m => m.ComplianceComponent),
    title: 'Compliance — CloudScope'
  },
  {
    path: 'query',
    loadComponent: () =>
      import('./features/query/query.component').then(m => m.QueryComponent),
    title: 'AI Query — CloudScope'
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];