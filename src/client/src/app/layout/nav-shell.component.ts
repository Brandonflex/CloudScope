import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-nav-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule
  ],
  template: `
    <mat-sidenav-container class="app-container">
      <mat-sidenav #sidenav [mode]="'side'" [opened]="true" class="app-sidenav">
        <div class="sidenav-header">
          <h2>☁️ CloudScope</h2>
          <span class="subtitle">Infrastructure Intelligence</span>
        </div>

        <mat-nav-list>
          <a mat-list-item routerLink="/dashboard" routerLinkActive="active-link">
            <mat-icon matListItemIcon>dashboard</mat-icon>
            <span matListItemTitle>Dashboard</span>
          </a>
          <a mat-list-item routerLink="/graph" routerLinkActive="active-link">
            <mat-icon matListItemIcon>hub</mat-icon>
            <span matListItemTitle>Graph View</span>
          </a>
          <a mat-list-item routerLink="/resources" routerLinkActive="active-link">
            <mat-icon matListItemIcon>inventory_2</mat-icon>
            <span matListItemTitle>Resources</span>
          </a>
          <a mat-list-item routerLink="/costs" routerLinkActive="active-link">
            <mat-icon matListItemIcon>payments</mat-icon>
            <span matListItemTitle>Cost Intelligence</span>
          </a>
          <a mat-list-item routerLink="/compliance" routerLinkActive="active-link">
            <mat-icon matListItemIcon>verified_user</mat-icon>
            <span matListItemTitle>Compliance</span>
          </a>
          <a mat-list-item routerLink="/query" routerLinkActive="active-link">
            <mat-icon matListItemIcon>smart_toy</mat-icon>
            <span matListItemTitle>AI Query</span>
          </a>
        </mat-nav-list>

        <div class="sidenav-footer">
          <span>v0.1.0</span>
        </div>
      </mat-sidenav>

      <mat-sidenav-content class="app-content">
        <router-outlet />
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [`
    .app-container {
      height: 100vh;
    }
    .app-sidenav {
      width: 260px;
      background: #1a1a2e;
      color: #eee;
      display: flex;
      flex-direction: column;
    }
    .sidenav-header {
      padding: 24px 16px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .sidenav-header h2 {
      margin: 0;
      font-size: 1.4rem;
      font-weight: 600;
    }
    .subtitle {
      font-size: 0.75rem;
      opacity: 0.6;
    }
    mat-nav-list {
      flex: 1;
      padding-top: 8px;
    }
    a[mat-list-item] {
      color: #ccc;
      border-radius: 8px;
      margin: 2px 8px;
    }
    .active-link {
      background: rgba(0, 120, 212, 0.2) !important;
      color: #4fc3f7 !important;
    }
    .sidenav-footer {
      padding: 16px;
      text-align: center;
      font-size: 0.7rem;
      opacity: 0.4;
    }
    .app-content {
      background: #0d1117;
      color: #e6edf3;
      padding: 24px;
    }
  `]
})
export class NavShellComponent {}