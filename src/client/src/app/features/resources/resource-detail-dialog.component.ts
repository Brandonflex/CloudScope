import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DatePipe } from '@angular/common';
import { ResourceService } from '../../core/services/resource.service';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import {
  BlastRadiusResult,
  CloudResource,
  ResourceRelationship,
  STATUS_COLORS
} from '../../core/models';
import { currency, humanize, resourceIcon, typeLabel } from '../../core/utils/format';

@Component({
  selector: 'app-resource-detail-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatIconModule,
    MatButtonModule,
    MatTabsModule,
    MatProgressBarModule,
    MatTooltipModule,
    DatePipe,
    LoadingSpinnerComponent
  ],
  template: `
    <div class="detail-head">
      <div class="detail-icon" [style.color]="statusColor()">
        <mat-icon>{{ iconFor() }}</mat-icon>
      </div>
      <div class="detail-title">
        <h2>{{ resource.name }}</h2>
        <p>
          <span class="chip" [class]="resource.provider === 'Azure' ? 'chip-azure' : 'chip-aws'">
            {{ resource.provider }}
          </span>
          <span class="chip chip-neutral">{{ labelFor() }}</span>
          <span class="chip chip-neutral">{{ resource.region }}</span>
        </p>
      </div>
      <button mat-icon-button type="button" matTooltip="Close" (click)="close()">
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <mat-dialog-content>
      <div class="summary-grid">
        <div class="summary-tile">
          <span class="tile-label">Status</span>
          <span class="tile-value" [style.color]="statusColor()">{{ resource.status }}</span>
        </div>
        <div class="summary-tile">
          <span class="tile-label">Monthly cost</span>
          <span class="tile-value">{{ currency(resource.estimatedMonthlyCost) }}</span>
        </div>
        <div class="summary-tile">
          <span class="tile-label">Compliance</span>
          <span class="tile-value">{{ resource.complianceStatus }}</span>
        </div>
        <div class="summary-tile">
          <span class="tile-label">IaC managed</span>
          <span class="tile-value">{{ resource.isManagedByIaC ? 'Yes' : 'No' }}</span>
        </div>
      </div>

      <mat-tab-group animationDuration="150ms" class="detail-tabs">
        <mat-tab label="Overview">
          <div class="tab-body">
            <dl class="kv-grid">
              <div>
                <dt>Native ID</dt>
                <dd class="cell-mono">{{ resource.nativeId }}</dd>
              </div>
              <div>
                <dt>Resource group</dt>
                <dd>{{ resource.resourceGroup }}</dd>
              </div>
              <div>
                <dt>Native type</dt>
                <dd class="cell-mono">{{ resource.nativeResourceType }}</dd>
              </div>
              <div>
                <dt>Discovered</dt>
                <dd>{{ resource.discoveredAt | date: 'medium' }}</dd>
              </div>
              <div>
                <dt>Last synced</dt>
                <dd>{{ resource.lastSyncedAt | date: 'medium' }}</dd>
              </div>
              <div>
                <dt>CPU utilization</dt>
                <dd>
                  @if (resource.cpuUtilization !== null && resource.cpuUtilization !== undefined) {
                    {{ resource.cpuUtilization }}%
                  } @else {
                    —
                  }
                </dd>
              </div>
            </dl>

            @if (tags().length > 0) {
              <h4 class="section-sub">Tags</h4>
              <div class="tag-list">
                @for (tag of tags(); track tag.key) {
                  <span class="tag"
                    ><span class="tag-key">{{ tag.key }}</span
                    >{{ tag.value }}</span
                  >
                }
              </div>
            }

            @if (propertyRows().length > 0) {
              <h4 class="section-sub">Properties</h4>
              <dl class="kv-grid">
                @for (row of propertyRows(); track row.key) {
                  <div>
                    <dt>{{ row.label }}</dt>
                    <dd>{{ row.value }}</dd>
                  </div>
                }
              </dl>
            }
          </div>
        </mat-tab>

        <mat-tab [label]="'Relationships (' + relationships().length + ')'">
          <div class="tab-body">
            @if (loadingRelationships()) {
              <app-loading-spinner message="Resolving graph edges…" />
            } @else if (relationships().length === 0) {
              <p class="muted">No relationships recorded for this resource.</p>
            } @else {
              <div class="relation-list">
                @for (relationship of relationships(); track relationship.id) {
                  <div class="relation">
                    <mat-icon class="relation-icon">subdirectory_arrow_right</mat-icon>
                    <div>
                      <div class="relation-type">
                        {{ relationshipLabel(relationship.relationshipType) }}
                      </div>
                      <div class="relation-desc">
                        {{ relationship.description || relationship.targetResourceId }}
                      </div>
                    </div>
                    <span class="chip chip-neutral">{{
                      shortId(relationship.targetResourceId)
                    }}</span>
                  </div>
                }
              </div>
            }
          </div>
        </mat-tab>

        <mat-tab label="Blast radius">
          <div class="tab-body">
            @if (loadingBlast()) {
              <app-loading-spinner message="Traversing dependency graph…" />
            } @else if (blast()) {
              <div class="blast-head" [class]="'risk-' + blast()!.riskLevel.toLowerCase()">
                <div>
                  <span class="blast-label">{{ blast()!.riskLevel }} risk</span>
                  <h3>{{ blast()!.affectedResourceCount }} resources affected</h3>
                  <p>{{ blast()!.summary }}</p>
                </div>
                <div class="blast-cost">
                  <span>Affected spend</span>
                  <strong>{{ currency(blast()!.affectedMonthlyCost) }}</strong>
                </div>
              </div>

              @if (blast()!.directDependents.length > 0) {
                <h4 class="section-sub">Direct dependents</h4>
                <div class="relation-list">
                  @for (node of blast()!.directDependents; track node.resourceId) {
                    <div class="relation">
                      <mat-icon class="relation-icon">arrow_forward</mat-icon>
                      <div>
                        <div class="relation-type">{{ node.resourceName }}</div>
                        <div class="relation-desc">
                          {{ typeLabel(node.resourceType) }} · {{ node.provider }}
                        </div>
                      </div>
                      <span class="chip" [class]="'risk-' + node.impactRisk.toLowerCase()">{{
                        node.impactRisk
                      }}</span>
                    </div>
                  }
                </div>
              }

              @if (blast()!.transitiveDependents.length > 0) {
                <h4 class="section-sub">Transitive impact</h4>
                <div class="relation-list compact">
                  @for (node of blast()!.transitiveDependents; track node.resourceId) {
                    <div class="relation">
                      <mat-icon class="relation-icon">north_east</mat-icon>
                      <div>
                        <div class="relation-type">{{ node.resourceName }}</div>
                        <div class="relation-desc">
                          {{ node.hopCount }} hop(s) · {{ typeLabel(node.resourceType) }}
                        </div>
                      </div>
                      <span class="chip" [class]="'risk-' + node.impactRisk.toLowerCase()">{{
                        node.impactRisk
                      }}</span>
                    </div>
                  }
                </div>
              }
            } @else {
              <p class="muted">Blast radius could not be calculated.</p>
            }
          </div>
        </mat-tab>
      </mat-tab-group>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-stroked-button type="button" (click)="close()">Close</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .detail-head {
        display: flex;
        align-items: flex-start;
        gap: 14px;
        padding: 20px 24px 12px;
      }
      .detail-icon {
        width: 42px;
        height: 42px;
        border-radius: 12px;
        background: rgba(240, 246, 252, 0.06);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .detail-icon mat-icon {
        font-size: 22px;
        width: 22px;
        height: 22px;
      }
      .detail-title {
        flex: 1;
        min-width: 0;
      }
      .detail-title h2 {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 650;
        word-break: break-word;
      }
      .detail-title p {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin: 8px 0 0;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 18px;
      }
      .summary-tile {
        background: rgba(240, 246, 252, 0.04);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px 12px;
      }
      .tile-label {
        display: block;
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: var(--text-dim);
      }
      .tile-value {
        display: block;
        margin-top: 4px;
        font-size: 0.95rem;
        font-weight: 600;
      }

      .detail-tabs {
        margin: 0 -24px;
      }
      .tab-body {
        padding: 18px 24px 6px;
      }

      .kv-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px 20px;
        margin: 0;
      }
      .kv-grid div {
        min-width: 0;
      }
      .kv-grid dt {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-dim);
      }
      .kv-grid dd {
        margin: 3px 0 0;
        font-size: 0.85rem;
        word-break: break-word;
      }

      .section-sub {
        margin: 22px 0 10px;
        font-size: 0.74rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--text-dim);
      }

      .tag-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .tag {
        display: inline-flex;
        gap: 6px;
        font-size: 0.75rem;
        padding: 3px 9px;
        border-radius: 7px;
        background: rgba(88, 166, 255, 0.08);
        color: var(--text-muted);
      }
      .tag-key {
        color: #79c0ff;
      }

      .relation-list {
        display: flex;
        flex-direction: column;
      }
      .relation {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 0;
        border-bottom: 1px solid rgba(240, 246, 252, 0.05);
      }
      .relation:last-child {
        border-bottom: none;
      }
      .relation-icon {
        color: var(--text-dim);
        font-size: 18px;
      }
      .relation-type {
        font-size: 0.85rem;
        font-weight: 550;
      }
      .relation-desc {
        font-size: 0.75rem;
        color: var(--text-muted);
      }
      .relation > div {
        flex: 1;
        min-width: 0;
      }

      .blast-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        padding: 16px 18px;
        border-radius: 12px;
        background: rgba(240, 246, 252, 0.04);
        border: 1px solid var(--border);
        border-left: 3px solid currentColor;
      }
      .blast-head h3 {
        margin: 4px 0;
        font-size: 1rem;
        color: var(--text);
      }
      .blast-head p {
        margin: 0;
        font-size: 0.8rem;
        color: var(--text-muted);
        max-width: 420px;
      }
      .blast-label {
        font-size: 0.7rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
      }
      .blast-cost {
        text-align: right;
        flex-shrink: 0;
      }
      .blast-cost span {
        display: block;
        font-size: 0.68rem;
        text-transform: uppercase;
        color: var(--text-dim);
      }
      .blast-cost strong {
        font-size: 1.05rem;
        color: var(--text);
      }

      mat-dialog-actions {
        padding: 8px 20px 16px;
      }

      @media (max-width: 620px) {
        .summary-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .kv-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `
  ]
})
export class ResourceDetailDialogComponent implements OnInit {
  readonly resource = inject<CloudResource>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ResourceDetailDialogComponent>);
  private readonly resourceService = inject(ResourceService);

  readonly relationships = signal<ResourceRelationship[]>([]);
  readonly blast = signal<BlastRadiusResult | null>(null);
  readonly loadingRelationships = signal(true);
  readonly loadingBlast = signal(true);

  readonly tags = computed(() =>
    Object.entries(this.resource.tags ?? {}).map(([key, value]) => ({ key, value: String(value) }))
  );

  readonly propertyRows = computed(() =>
    Object.entries(this.resource.properties ?? {})
      .filter(([key]) => !key.startsWith('__') && typeof key === 'string')
      .slice(0, 14)
      .map(([key, value]) => ({
        key,
        label: humanize(key),
        value:
          value === null || value === undefined
            ? '—'
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value)
      }))
  );

  ngOnInit(): void {
    this.resourceService.getRelationships(this.resource.id).subscribe({
      next: (relationships) => {
        this.relationships.set(relationships);
        this.loadingRelationships.set(false);
      },
      error: () => this.loadingRelationships.set(false)
    });

    this.resourceService.getBlastRadius(this.resource.id).subscribe({
      next: (result) => {
        this.blast.set(result);
        this.loadingBlast.set(false);
      },
      error: () => this.loadingBlast.set(false)
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  iconFor(): string {
    return resourceIcon(this.resource.resourceType);
  }

  labelFor(): string {
    return typeLabel(this.resource.resourceType);
  }

  statusColor(): string {
    return STATUS_COLORS[this.resource.status as keyof typeof STATUS_COLORS] ?? '#8b949e';
  }

  relationshipLabel(value: string): string {
    return humanize(value);
  }

  shortId(id: string): string {
    return id.length > 26 ? `…${id.slice(-24)}` : id;
  }

  protected readonly currency = currency;
  protected readonly typeLabel = typeLabel;
}
