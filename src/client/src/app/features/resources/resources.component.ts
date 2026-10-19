import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { ResourceService } from '../../core/services/resource.service';
import { RefreshService } from '../../core/services/refresh.service';
import { ToastService } from '../../core/services/toast.service';
import { ResourceDetailDialogComponent } from './resource-detail-dialog.component';
import {
  CloudProvider,
  CloudResource,
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPES,
  ResourceType,
  STATUS_COLORS
} from '../../core/models';
import { currency, resourceIcon, typeLabel } from '../../core/utils/format';

@Component({
  selector: 'app-resources',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatDialogModule,
    MatSnackBarModule,
    EmptyStateComponent,
    LoadingSpinnerComponent
  ],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Resource inventory</h1>
          <p class="subtitle">
            {{ totalCount() }} resources discovered across Azure and AWS
            @if (search() || provider() || resourceType() || region()) {
              · filtered
            }
          </p>
        </div>
        <div class="actions">
          <button mat-stroked-button type="button" (click)="resetFilters()">
            <mat-icon>filter_alt_off</mat-icon> Reset
          </button>
          <a mat-flat-button color="primary" routerLink="/graph">
            <mat-icon>hub</mat-icon> View in graph
          </a>
        </div>
      </div>

      <div class="panel filters">
        <div class="filters-grid">
          <mat-form-field appearance="outline" class="search-field">
            <mat-label>Search name, type or tag</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input
              matInput
              type="text"
              [ngModel]="search()"
              (ngModelChange)="search.set($event); onSearchChange()"
              placeholder="e.g. prod, vm-app-01, kubernetes"
            />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Provider</mat-label>
            <mat-select [ngModel]="provider()" (ngModelChange)="provider.set($event); reload(1)">
              <mat-option [value]="null">All providers</mat-option>
              <mat-option value="Azure">Azure</mat-option>
              <mat-option value="AWS">AWS</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Type</mat-label>
            <mat-select
              [ngModel]="resourceType()"
              (ngModelChange)="resourceType.set($event); reload(1)"
            >
              <mat-option [value]="null">All types</mat-option>
              @for (type of resourceTypes; track type) {
                <mat-option [value]="type">{{ labelFor(type) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Region</mat-label>
            <mat-select [ngModel]="region()" (ngModelChange)="region.set($event); reload(1)">
              <mat-option [value]="null">All regions</mat-option>
              @for (item of regions(); track item) {
                <mat-option [value]="item">{{ item }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
      </div>

      @if (loading() && resources().length === 0) {
        <app-loading-spinner message="Loading inventory…" />
      } @else if (error()) {
        <app-empty-state
          icon="cloud_off"
          title="Inventory unavailable"
          message="The API did not return any resources. Start the API and try again."
          actionLabel="Retry"
          (action)="reload(pageIndex())"
        />
      } @else if (resources().length === 0) {
        <app-empty-state
          icon="search_off"
          title="No resources match these filters"
          message="Try clearing the search box or selecting a different provider."
          actionLabel="Clear filters"
          (action)="resetFilters()"
        />
      } @else {
        <div class="panel">
          @if (loading()) {
            <mat-progress-bar mode="indeterminate" />
          }
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Type</th>
                  <th>Provider</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th>IaC</th>
                  <th>Compliance</th>
                  <th class="cell-right">Monthly</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (resource of resources(); track resource.id) {
                  <tr class="clickable" (click)="openDetail(resource)">
                    <td>
                      <div class="resource-cell">
                        <div class="resource-icon" [style.color]="statusColor(resource.status)">
                          <mat-icon>{{ iconFor(resource.resourceType) }}</mat-icon>
                        </div>
                        <div>
                          <div class="cell-strong">{{ resource.name }}</div>
                          <div class="cell-sub">
                            {{ resource.resourceGroup }} · {{ resource.nativeResourceType }}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{{ labelFor(resource.resourceType) }}</td>
                    <td>
                      <span
                        class="chip"
                        [class]="resource.provider === 'Azure' ? 'chip-azure' : 'chip-aws'"
                      >
                        {{ resource.provider }}
                      </span>
                    </td>
                    <td class="cell-muted">{{ resource.region }}</td>
                    <td>
                      <span class="status-inline">
                        <span
                          class="status-dot"
                          [style.background]="statusColor(resource.status)"
                        ></span>
                        {{ resource.status }}
                      </span>
                    </td>
                    <td>
                      @if (resource.isManagedByIaC) {
                        <span class="chip chip-good"><mat-icon>verified</mat-icon> Managed</span>
                      } @else {
                        <span class="chip chip-warn"><mat-icon>warning</mat-icon> Manual</span>
                      }
                    </td>
                    <td>
                      <span class="chip" [class]="complianceChip(resource.complianceStatus)">
                        {{ resource.complianceStatus }}
                      </span>
                    </td>
                    <td class="cell-right cell-mono">
                      {{ currency(resource.estimatedMonthlyCost) }}
                    </td>
                    <td class="cell-right">
                      <button
                        mat-icon-button
                        type="button"
                        matTooltip="Details"
                        (click)="openDetail(resource); $event.stopPropagation()"
                      >
                        <mat-icon>chevron_right</mat-icon>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <mat-paginator
            [length]="totalCount()"
            [pageSize]="pageSize()"
            [pageIndex]="pageIndex()"
            [pageSizeOptions]="[25, 50, 100]"
            (page)="onPage($event)"
            showFirstLastButtons
          />
        </div>
      }
    </div>
  `,
  styles: [
    `
      .filters {
        margin-bottom: 16px;
        padding: 14px 18px 4px;
      }
      .filters-grid {
        display: grid;
        grid-template-columns: minmax(240px, 2fr) repeat(3, minmax(150px, 1fr));
        gap: 14px;
        align-items: center;
      }
      .search-field {
        width: 100%;
      }
      .search-field mat-icon[matPrefix] {
        margin-right: 6px;
        color: var(--text-dim);
      }

      .resource-cell {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .resource-icon {
        width: 30px;
        height: 30px;
        border-radius: 9px;
        background: rgba(240, 246, 252, 0.05);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .resource-icon mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .status-inline {
        display: inline-flex;
        align-items: center;
        font-size: 0.82rem;
      }

      @media (max-width: 1100px) {
        .filters-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 640px) {
        .filters-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `
  ]
})
export class ResourcesComponent implements OnInit {
  private readonly resourceService = inject(ResourceService);
  private readonly refresh = inject(RefreshService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  readonly resourceTypes = RESOURCE_TYPES;
  readonly resources = signal<CloudResource[]>([]);
  readonly totalCount = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(25);
  readonly loading = signal(false);
  readonly error = signal(false);

  readonly search = signal('');
  readonly provider = signal<CloudProvider | null>(null);
  readonly resourceType = signal<ResourceType | null>(null);
  readonly region = signal<string | null>(null);
  readonly regions = signal<string[]>([]);

  private readonly searchInput$ = new Subject<string>();

  readonly activeFilterCount = computed(
    () =>
      [this.provider(), this.resourceType(), this.region()].filter((value) => value !== null)
        .length + (this.search() ? 1 : 0)
  );

  constructor() {
    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reload(1));
  }

  ngOnInit(): void {
    this.loadRegions();
    this.reload(1);

    this.refresh.refreshed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.loadRegions();
      this.reload(this.pageIndex() + 1);
    });
  }

  load(): void {
    this.reload(1);
  }

  reload(page: number): void {
    this.loading.set(true);
    this.error.set(false);

    this.resourceService
      .getAll({
        pageNumber: page,
        pageSize: this.pageSize(),
        provider: this.provider(),
        resourceType: this.resourceType(),
        region: this.region(),
        search: this.search() || null
      })
      .subscribe({
        next: (result) => {
          this.resources.set(result.items);
          this.totalCount.set(result.totalCount);
          this.pageIndex.set(Math.max(0, result.pageNumber - 1));
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set(true);
          this.toast.error('Failed to load resources.');
        }
      });
  }

  private loadRegions(): void {
    this.resourceService.getAll({ pageSize: 500 }).subscribe({
      next: (result) => {
        const regions = [...new Set(result.items.map((item) => item.region))]
          .filter(Boolean)
          .sort();
        this.regions.set(regions);
      },
      error: () => this.regions.set([])
    });
  }

  onSearchChange(): void {
    this.searchInput$.next(this.search());
  }

  onPage(event: PageEvent): void {
    this.pageSize.set(event.pageSize);
    this.reload(event.pageIndex + 1);
  }

  resetFilters(): void {
    this.search.set('');
    this.provider.set(null);
    this.resourceType.set(null);
    this.region.set(null);
    this.reload(1);
  }

  openDetail(resource: CloudResource): void {
    this.dialog.open(ResourceDetailDialogComponent, {
      data: resource,
      width: '760px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'resource-dialog'
    });
  }

  iconFor(type: string): string {
    return resourceIcon(type);
  }

  labelFor(type: ResourceType): string {
    return RESOURCE_TYPE_LABELS[type] ?? typeLabel(type);
  }

  statusColor(status: string): string {
    return STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? '#8b949e';
  }

  complianceChip(status: string): string {
    if (status === 'Compliant') return 'chip-good';
    if (status === 'NonCompliant') return 'chip-bad';
    return 'chip-neutral';
  }

  protected readonly currency = currency;
}
