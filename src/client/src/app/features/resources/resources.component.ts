import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ResourceService } from '../../core/services/resource.service';
import { CloudResource, PagedResult, CloudProvider, ResourceType } from '../../core/models';

@Component({
  selector: 'app-resources',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatTableModule, MatButtonModule,
    MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatChipsModule, MatPaginatorModule, MatTooltipModule
  ],
  template: `
    <div class="resources-page">
      <div class="page-header">
        <h1>Resource Inventory</h1>
        <p class="page-subtitle">All discovered resources across clouds</p>
      </div>

      <div class="toolbar">
        <mat-form-field appearance="outline" class="search-field">
          <mat-label>Search resources</mat-label>
          <input matInput [(ngModel)]="searchTerm" (keyup.enter)="search()" placeholder="Name, type, region...">
          <button matSuffix mat-icon-button (click)="search()">
            <mat-icon>search</mat-icon>
          </button>
        </mat-form-field>

        <mat-select [(value)]="filterProvider" placeholder="Provider" class="filter-select">
          <mat-option [value]="null">All</mat-option>
          <mat-option [value]="0">Azure</mat-option>
          <mat-option [value]="1">AWS</mat-option>
        </mat-select>

        <button mat-raised-button color="primary" (click)="triggerDiscovery()">
          <mat-icon>sync</mat-icon> Discover
        </button>
      </div>

      <mat-card class="table-card">
        <table mat-table [dataSource]="resources()" class="resources-table">
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Status</th>
            <td mat-cell *matCellDef="let r">
              <span class="status-dot" [class]="'status-' + r.status"></span>
            </td>
          </ng-container>

          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Name</th>
            <td mat-cell *matCellDef="let r">
              <span class="resource-name">{{ r.name }}</span>
              <span class="resource-type">{{ r.resourceType }}</span>
            </td>
          </ng-container>

          <ng-container matColumnDef="provider">
            <th mat-header-cell *matHeaderCellDef>Provider</th>
            <td mat-cell *matCellDef="let r">
              <span class="provider-badge" [class]="'provider-' + r.provider">
                {{ r.provider === 0 ? 'Azure' : 'AWS' }}
              </span>
            </td>
          </ng-container>

          <ng-container matColumnDef="region">
            <th mat-header-cell *matHeaderCellDef>Region</th>
            <td mat-cell *matCellDef="let r">{{ r.region }}</td>
          </ng-container>

          <ng-container matColumnDef="cost">
            <th mat-header-cell *matHeaderCellDef>Monthly Cost</th>
            <td mat-cell *matCellDef="let r">
              {{ r.estimatedMonthlyCost | currency:'USD':'symbol':'1.2-2' }}
            </td>
          </ng-container>

          <ng-container matColumnDef="iac">
            <th mat-header-cell *matHeaderCellDef>IaC</th>
            <td mat-cell *matCellDef="let r">
              @if (r.isManagedByIaC) {
                <mat-icon class="iac-yes" matTooltip="Managed by IaC">check_circle</mat-icon>
              } @else {
                <mat-icon class="iac-no" matTooltip="Not managed by IaC">warning</mat-icon>
              }
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"
              class="resource-row" (click)="selectResource(row)"></tr>
        </table>

        <mat-paginator
          [length]="totalCount()"
          [pageSize]="pageSize"
          [pageSizeOptions]="[25, 50, 100]"
          (page)="onPage($event)" />
      </mat-card>
    </div>
  `,
  styles: [`
    .resources-page { max-width: 1400px; }
    .page-header { margin-bottom: 24px; }
    .page-header h1 { margin: 0; font-size: 1.8rem; }
    .page-subtitle { margin: 4px 0 0; opacity: 0.5; font-size: 0.9rem; }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .search-field { flex: 1; min-width: 300px; }
    .filter-select { width: 160px; }
    .table-card { background: #161b22; border-radius: 8px; overflow: hidden; }
    .resources-table { width: 100%; }
    .resource-name { display: block; font-weight: 500; }
    .resource-type { display: block; font-size: 0.75rem; opacity: 0.5; }
    .status-dot {
      display: inline-block;
      width: 10px; height: 10px;
      border-radius: 50%;
    }
    .status-1 { background: #66bb6a; } /* Healthy */
    .status-2 { background: #ffa726; } /* Warning */
    .status-3 { background: #ef5350; } /* Critical */
    .status-0 { background: #757575; } /* Unknown */
    .provider-badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .provider-0 { background: rgba(0,120,212,0.2); color: #4fc3f7; } /* Azure */
    .provider-1 { background: rgba(255,153,0,0.2); color: #ffb74d; } /* AWS */
    .iac-yes { color: #66bb6a; font-size: 18px; width: 18px; height: 18px; }
    .iac-no { color: #ffa726; font-size: 18px; width: 18px; height: 18px; }
    .resource-row { cursor: pointer; transition: background 0.15s; }
    .resource-row:hover { background: rgba(255,255,255,0.04); }
  `]
})
export class ResourcesComponent implements OnInit {
  private readonly resourceService = inject(ResourceService);

  displayedColumns = ['status', 'name', 'provider', 'region', 'cost', 'iac'];
  resources = signal<CloudResource[]>([]);
  totalCount = signal(0);
  searchTerm = '';
  filterProvider: number | null = null;
  pageSize = 50;
  currentPage = 1;

  ngOnInit(): void {
    this.loadResources();
  }

  loadResources(): void {
    // TODO: Wire up to actual API
    // this.resourceService.getAll(this.currentPage, this.pageSize, this.filterProvider)
    //   .subscribe(result => {
    //     this.resources.set(result.items);
    //     this.totalCount.set(result.totalCount);
    //   });
  }

  search(): void {
    this.currentPage = 1;
    this.loadResources();
  }

  onPage(event: PageEvent): void {
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.loadResources();
  }

  triggerDiscovery(): void {
    this.resourceService.triggerDiscovery().subscribe(() => {
      this.loadResources();
    });
  }

  selectResource(resource: CloudResource): void {
    // TODO: Open resource detail panel or navigate to graph view
    console.log('Selected resource:', resource.name);
  }
}