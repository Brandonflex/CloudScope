import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatMenuModule } from '@angular/material/menu';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import cytoscape, { Core, ElementDefinition } from 'cytoscape';
import { GraphService } from '../../core/services/graph.service';
import { ResourceService } from '../../core/services/resource.service';
import { ToastService } from '../../core/services/toast.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import {
  BlastRadiusResult,
  CloudProvider,
  GraphData,
  GraphNode,
  RESOURCE_TYPE_LABELS,
  ResourceType,
  STATUS_COLORS
} from '../../core/models';
import { currency, resourceIcon, typeLabel } from '../../core/utils/format';

const LAYOUTS = ['cose', 'concentric', 'breadthfirst', 'circle', 'grid'] as const;
type LayoutName = (typeof LAYOUTS)[number];

@Component({
  selector: 'app-graph',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatMenuModule,
    EmptyStateComponent,
    LoadingSpinnerComponent
  ],
  template: `
    <div class="page graph-page">
      <div class="page-head">
        <div>
          <h1>Infrastructure graph</h1>
          <p class="subtitle">
            {{ nodeCount() }} nodes · {{ edgeCount() }} dependency edges · click a node to inspect blast radius
          </p>
        </div>
        <div class="actions">
          <button mat-stroked-button type="button" [matMenuTriggerFor]="layoutMenu">
            <mat-icon>account_tree</mat-icon> {{ layout() }}
          </button>
          <mat-menu #layoutMenu="matMenu">
            @for (option of layouts; track option) {
              <button mat-menu-item type="button" (click)="setLayout(option)">
                <mat-icon>{{ option === layout() ? 'check' : 'radio_button_unchecked' }}</mat-icon>
                {{ option }}
              </button>
            }
          </mat-menu>
          <button mat-stroked-button type="button" (click)="fit()">
            <mat-icon>zoom_out_map</mat-icon> Fit
          </button>
          <button mat-flat-button color="primary" type="button" [disabled]="loading()" (click)="load()">
            <mat-icon>refresh</mat-icon> Reload
          </button>
        </div>
      </div>

      <div class="graph-toolbar panel">
        <mat-form-field appearance="outline" class="search-field">
          <mat-label>Find a resource</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input
            matInput
            type="text"
            [ngModel]="searchTerm()"
            (ngModelChange)="searchTerm.set($event); onSearch($event)"
            placeholder="node name or type" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Provider</mat-label>
          <mat-select [ngModel]="provider()" (ngModelChange)="provider.set($event); load()">
            <mat-option [value]="null">Both</mat-option>
            <mat-option value="Azure">Azure</mat-option>
            <mat-option value="AWS">AWS</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Type</mat-label>
          <mat-select [ngModel]="resourceType()" (ngModelChange)="resourceType.set($event); load()">
            <mat-option [value]="null">All types</mat-option>
            @for (type of resourceTypes(); track type) {
              <mat-option [value]="type">{{ labelFor(type) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-slide-toggle
          [ngModel]="showLabels()"
          (ngModelChange)="showLabels.set($event); applyLabelVisibility($event)">
          Labels
        </mat-slide-toggle>

        <div class="spacer"></div>

        <div class="legend">
          <span class="legend-item"><i style="background:#58a6ff"></i>Azure</span>
          <span class="legend-item"><i style="background:#ffa657"></i>AWS</span>
          <span class="legend-item"><i style="background:#3fb950"></i>Healthy</span>
          <span class="legend-item"><i style="background:#d29922"></i>Warning</span>
          <span class="legend-item"><i style="background:#f85149"></i>Critical</span>
        </div>
      </div>

      @if (loading()) {
        <div class="panel loading-panel">
          <mat-progress-bar mode="indeterminate" />
          <app-loading-spinner message="Loading graph topology…" />
        </div>
      } @else if (error()) {
        <app-empty-state
          icon="cloud_off"
          title="Graph unavailable"
          message="The API could not return graph data. Check that the backend is running on port 5001."
          actionLabel="Retry"
          (action)="load()" />
      } @else if (nodeCount() === 0) {
        <app-empty-state
          icon="hub"
          title="No nodes to display"
          message="Run discovery or seed the demo inventory to populate the graph."
          actionLabel="Reload"
          (action)="load()" />
      } @else {
        <div class="graph-shell panel">
          <div class="canvas-wrap">
            <div #canvas class="cy-canvas"></div>

            @if (selectedNode(); as node) {
              <aside class="inspector">
                <div class="inspector-head">
                  <div class="inspector-icon" [style.color]="statusColor(node.status)">
                    <mat-icon>{{ iconFor(node.type) }}</mat-icon>
                  </div>
                  <div>
                    <h3>{{ node.label }}</h3>
                    <p>{{ typeLabel(node.type) }} · {{ node.region }}</p>
                  </div>
                  <button mat-icon-button type="button" (click)="clearSelection()">
                    <mat-icon>close</mat-icon>
                  </button>
                </div>

                <div class="inspector-stats">
                  <div>
                    <span>Status</span>
                    <strong [style.color]="statusColor(node.status)">{{ node.status }}</strong>
                  </div>
                  <div>
                    <span>Monthly</span>
                    <strong>{{ currency(node.monthlyCost) }}</strong>
                  </div>
                  <div>
                    <span>Provider</span>
                    <strong>{{ node.provider }}</strong>
                  </div>
                </div>

                @if (blastLoading()) {
                  <mat-progress-bar mode="indeterminate" />
                } @else {
                  @if (blast(); as result) {
                  <div class="blast-card" [class]="'risk-' + result.riskLevel.toLowerCase()">
                    <div class="blast-title">
                      <span>{{ result.riskLevel }} risk</span>
                      <strong>{{ result.affectedResourceCount }} impacted</strong>
                    </div>
                    <p>{{ result.summary }}</p>
                    <div class="blast-meta">
                      <span>Affected spend</span>
                      <strong>{{ currency(result.affectedMonthlyCost) }}</strong>
                    </div>
                  </div>

                  @if (result.directDependents.length > 0) {
                    <div class="inspector-list">
                      <span class="inspector-list-title">Direct dependents</span>
                      @for (dependent of result.directDependents; track dependent.resourceId) {
                        <button type="button" class="dependent" (click)="focusNode(dependent.resourceId)">
                          <mat-icon>arrow_forward</mat-icon>
                          <span>{{ dependent.resourceName }}</span>
                          <em [class]="'risk-' + dependent.impactRisk.toLowerCase()">{{ dependent.impactRisk }}</em>
                        </button>
                      }
                    </div>
                  }
                  }
                }

                <div class="inspector-actions">
                  <button mat-stroked-button type="button" [disabled]="!blast()" (click)="highlightBlastRadius()">
                    <mat-icon>highlight_alt</mat-icon> Highlight blast radius
                  </button>
                  <button mat-button type="button" (click)="focusNode(node.id)">
                    <mat-icon>my_location</mat-icon> Center
                  </button>
                </div>
              </aside>
            }
          </div>
        </div>

        <div class="graph-footer">
          <span><strong>{{ nodeCount() }}</strong> nodes</span>
          <span><strong>{{ edgeCount() }}</strong> edges</span>
          <span>Layout: <strong>{{ layout() }}</strong></span>
          <span class="dim">Drag to pan · scroll to zoom · double-click a node to focus</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .graph-page { display: flex; flex-direction: column; }

    .graph-toolbar {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 18px 4px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .graph-toolbar mat-form-field { width: 180px; }
    .graph-toolbar .search-field { width: 260px; }

    .legend { display: flex; gap: 12px; flex-wrap: wrap; padding-bottom: 6px; }
    .legend-item { display: inline-flex; align-items: center; gap: 5px; font-size: 0.72rem; color: var(--text-muted); }
    .legend-item i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }

    .graph-shell { padding: 0; overflow: hidden; }
    .canvas-wrap { position: relative; display: flex; min-height: 620px; }
    .cy-canvas { flex: 1; min-height: 620px; background: radial-gradient(900px 500px at 30% 0%, rgba(88, 166, 255, 0.05), transparent 65%); }

    .loading-panel { padding-bottom: 8px; }

    .inspector {
      width: 330px;
      border-left: 1px solid var(--border);
      background: rgba(10, 16, 23, 0.92);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      max-height: 720px;
      overflow-y: auto;
    }

    .inspector-head { display: flex; gap: 10px; align-items: flex-start; }
    .inspector-icon {
      width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
      background: rgba(240, 246, 252, 0.06); display: flex; align-items: center; justify-content: center;
    }
    .inspector-icon mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .inspector-head > div:nth-child(2) { flex: 1; min-width: 0; }
    .inspector-head h3 { margin: 0; font-size: 0.95rem; font-weight: 650; word-break: break-word; }
    .inspector-head p { margin: 3px 0 0; font-size: 0.74rem; color: var(--text-muted); }

    .inspector-stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .inspector-stats div {
      background: rgba(240, 246, 252, 0.04);
      border-radius: 9px;
      padding: 8px 10px;
    }
    .inspector-stats span { display: block; font-size: 0.63rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); }
    .inspector-stats strong { display: block; margin-top: 3px; font-size: 0.82rem; }

    .blast-card {
      border: 1px solid var(--border);
      border-left: 3px solid currentColor;
      border-radius: 10px;
      padding: 12px 14px;
      background: rgba(240, 246, 252, 0.03);
    }
    .blast-title { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .blast-title span { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
    .blast-title strong { color: var(--text); font-size: 0.85rem; }
    .blast-card p { margin: 8px 0; font-size: 0.76rem; color: var(--text-muted); line-height: 1.5; }
    .blast-meta { display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-dim); border-top: 1px solid var(--border); padding-top: 8px; }
    .blast-meta strong { color: var(--text); }

    .inspector-list { display: flex; flex-direction: column; gap: 2px; }
    .inspector-list-title { font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); margin-bottom: 4px; }
    .dependent {
      display: flex;
      align-items: center;
      gap: 7px;
      background: transparent;
      border: none;
      border-radius: 7px;
      padding: 6px 8px;
      color: var(--text-muted);
      font-size: 0.78rem;
      text-align: left;
      cursor: pointer;
    }
    .dependent:hover { background: rgba(88, 166, 255, 0.08); color: var(--text); }
    .dependent mat-icon { font-size: 15px; width: 15px; height: 15px; }
    .dependent span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dependent em { font-style: normal; font-size: 0.68rem; font-weight: 600; }

    .inspector-actions { display: flex; gap: 8px; margin-top: auto; flex-wrap: wrap; }

    .graph-footer {
      display: flex;
      gap: 20px;
      padding: 12px 4px 0;
      font-size: 0.75rem;
      color: var(--text-muted);
      flex-wrap: wrap;
    }
    .graph-footer strong { color: var(--text); }

    @media (max-width: 1000px) {
      .canvas-wrap { flex-direction: column; min-height: 480px; }
      .cy-canvas { min-height: 420px; }
      .inspector { width: 100%; max-height: none; border-left: none; border-top: 1px solid var(--border); }
    }
  `]
})
export class GraphComponent implements OnInit {
  private readonly graphService = inject(GraphService);
  private readonly resourceService = inject(ResourceService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly canvas = viewChild<ElementRef<HTMLDivElement>>('canvas');
  readonly layouts = LAYOUTS;

  readonly graph = signal<GraphData | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly nodeCount = signal(0);
  readonly edgeCount = signal(0);
  readonly layout = signal<LayoutName>('cose');
  readonly showLabels = signal(true);
  readonly searchTerm = signal('');
  readonly provider = signal<CloudProvider | null>(null);
  readonly resourceType = signal<ResourceType | null>(null);
  readonly selectedNode = signal<GraphNode | null>(null);
  readonly blast = signal<BlastRadiusResult | null>(null);
  readonly blastLoading = signal(false);

  readonly resourceTypes = computed(() => {
    const nodes = this.graph()?.nodes ?? [];
    return [...new Set(nodes.map((node) => node.type))].sort() as ResourceType[];
  });

  private cy?: Core;
  private selectedId: string | null = null;
  private labelVisible = true;

  constructor() {
    effect(() => {
      const layout = this.layout();
      if (this.cy) this.runLayout(layout);
    });

    effect(() => {
      const visible = this.showLabels();
      this.labelVisible = visible;
      if (this.cy) this.applyLabelVisibility(visible);
    });
  }

  ngOnInit(): void {
    this.load();

    fromEvent(window, 'resize')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cy?.resize());
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);

    this.graphService
      .getFullGraph({ provider: this.provider(), resourceType: this.resourceType() })
      .subscribe({
        next: (data) => {
          this.graph.set(data);
          this.nodeCount.set(data.nodes.length);
          this.edgeCount.set(data.edges.length);
          this.loading.set(false);

          // Wait for the canvas to exist before handing data to Cytoscape.
          setTimeout(() => this.initialize(data));
        },
        error: () => {
          this.loading.set(false);
          this.error.set(true);
          this.toast.error('Failed to load the dependency graph.');
        }
      });
  }

  private initialize(data: GraphData): void {
    const canvas = this.canvas()?.nativeElement;
    if (!canvas) return;

    if (!this.cy) {
      this.cy = cytoscape({
        container: canvas,
        elements: this.toElements(data),
        style: this.styleSheet(),
        layout: { name: 'preset' },
        minZoom: 0.15,
        maxZoom: 2.5,
        wheelSensitivity: 0.22,
        boxSelectionEnabled: false
      });

      this.cy.on('tap', 'node', (event) => this.onNodeTap(event.target.id()));
      this.cy.on('dbltap', 'node', (event) => this.focusNode(event.target.id()));
      this.cy.on('tap', (event) => {
        if (event.target.length === 0) this.clearSelection();
      });
    } else {
      this.cy.elements().remove();
      this.cy.add(this.toElements(data));
    }

    this.applyLabelVisibility(this.labelVisible);
    this.runLayout(this.layout());
  }

  private toElements(data: GraphData): ElementDefinition[] {
    const nodes = data.nodes.map<ElementDefinition>((node) => ({
      group: 'nodes' as const,
      data: {
        id: node.id,
        label: node.label,
        type: node.type,
        provider: node.provider,
        region: node.region,
        status: node.status,
        monthlyCost: node.monthlyCost,
        color: this.nodeColor(node)
      }
    }));

    const edges = data.edges.map<ElementDefinition>((edge) => ({
      group: 'edges' as const,
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label ?? edge.relationshipType
      }
    }));

    return [...nodes, ...edges];
  }

  private nodeColor(node: GraphNode): string {
    if (node.status === 'Critical') return '#f85149';
    if (node.status === 'Warning') return '#d29922';
    if (node.status === 'Stopped') return '#6e7681';
    return node.provider === 'AWS' ? '#ffa657' : '#58a6ff';
  }

  private styleSheet(): cytoscape.StylesheetStyle[] {
    return [
      {
        selector: 'node',
        style: {
          'background-color': 'data(color)',
          label: 'data(label)',
          color: '#c9d1d9',
          'font-size': 8,
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 4,
          'text-outline-color': '#0d1117',
          'text-outline-width': 2,
          'text-max-width': '90px',
          'text-wrap': 'ellipsis',
          width: 22,
          height: 22,
          'border-width': 1.5,
          'border-color': 'rgba(240, 246, 252, 0.25)',
          'overlay-opacity': 0
        }
      },
      {
        selector: 'node:selected',
        style: {
          'border-width': 3,
          'border-color': '#ffffff',
          width: 30,
          height: 30
        }
      },
      {
        selector: 'node.dimmed',
        style: { opacity: 0.15 }
      },
      {
        selector: 'node.no-labels',
        style: { 'text-opacity': 0, label: '' }
      },
      {
        selector: 'node.highlighted',
        style: {
          'border-width': 3,
          'border-color': '#f0883e',
          width: 30,
          height: 30,
          opacity: 1
        }
      },
      {
        selector: 'node.search-hit',
        style: {
          'border-width': 3,
          'border-color': '#bc8cff',
          width: 30,
          height: 30
        }
      },
      {
        selector: 'edge',
        style: {
          width: 1,
          'line-color': 'rgba(139, 148, 158, 0.35)',
          'target-arrow-color': 'rgba(139, 148, 158, 0.5)',
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.7,
          'curve-style': 'bezier',
          opacity: 0.7
        }
      },
      {
        selector: 'edge.highlighted',
        style: {
          width: 2,
          'line-color': '#f0883e',
          'target-arrow-color': '#f0883e',
          opacity: 1
        }
      },
      {
        selector: 'edge.dimmed',
        style: { opacity: 0.08 }
      }
    ];
  }

  private runLayout(name: LayoutName): void {
    if (!this.cy) return;

    const options = {
      name,
      animate: true,
      animationDuration: 450,
      fit: true,
      padding: 40,
      ...(name === 'concentric'
        ? {
            concentric: (node: cytoscape.NodeSingular) =>
              node.degree(false),
            levelWidth: () => 2
          }
        : {}),
      ...(name === 'breadthfirst' ? { directed: true, spacingFactor: 1.3 } : {}),
      ...(name === 'cose'
        ? {
            nodeRepulsion: () => 400000,
            idealEdgeLength: () => 90,
            edgeElasticity: () => 100,
            gravity: 0.25,
            numIter: 1200
          }
        : {})
    };

    this.cy.layout(options as cytoscape.LayoutOptions).run();
  }

  setLayout(name: LayoutName): void {
    this.layout.set(name);
    this.runLayout(name);
  }

  fit(): void {
    this.cy?.fit(undefined, 40);
  }

  private onNodeTap(id: string): void {
    this.selectedId = id;
    const node = this.graph()?.nodes.find((item) => item.id === id) ?? null;
    this.selectedNode.set(node);
    this.blast.set(null);

    if (!node) return;

    this.cy
      ?.elements()
      .removeClass('dimmed highlighted search-hit')
      .addClass('dimmed');

    const element = this.cy?.getElementById(id);
    element?.removeClass('dimmed').addClass('highlighted');
    element?.connectedEdges().removeClass('dimmed').addClass('highlighted');
    element?.connectedEdges().connectedNodes().removeClass('dimmed');

    this.blastLoading.set(true);
    this.resourceService.getBlastRadius(id, 4).subscribe({
      next: (result) => {
        this.blast.set(result);
        this.blastLoading.set(false);
      },
      error: () => this.blastLoading.set(false)
    });
  }

  clearSelection(): void {
    this.selectedId = null;
    this.selectedNode.set(null);
    this.blast.set(null);
    this.cy?.elements().removeClass('dimmed highlighted search-hit');
    this.cy?.$(':selected').unselect();
  }

  focusNode(id: string): void {
    const element = this.cy?.getElementById(id);
    if (!element) return;

    this.cy?.animate({
      center: { eles: element },
      zoom: 1.5,
      duration: 400
    });

    if (this.selectedId !== id) {
      this.onNodeTap(id);
    }
  }

  highlightBlastRadius(): void {
    const result = this.blast();
    const core = this.cy;
    if (!result || !core) return;

    const ids = [
      result.resourceId,
      ...result.directDependents.map((node) => node.resourceId),
      ...result.transitiveDependents.map((node) => node.resourceId)
    ];

    const elements = ids.map((id) => core.getElementById(id)).filter((element) => element.length > 0);
    if (elements.length === 0) return;

    core.elements().addClass('dimmed').removeClass('highlighted');
    for (const element of elements) {
      element.removeClass('dimmed').addClass('highlighted');
      element.connectedEdges().removeClass('dimmed');
    }

    let selection = core.collection();
    for (const element of elements) selection = selection.union(element);
    core.animate({ fit: { eles: selection, padding: 80 }, duration: 400 });
  }

  applyLabelVisibility(visible: boolean): void {
    this.labelVisible = visible;
    if (!this.cy) return;

    this.cy.nodes().toggleClass('no-labels', !visible);
    this.cy.nodes().toggleClass('with-labels', visible);
  }

  onSearch(term: string): void {
    const core = this.cy;
    if (!core) return;

    core.elements().removeClass('search-hit dimmed');

    const value = term.trim().toLowerCase();
    if (!value) return;

    const matches = core.nodes().filter((node) => {
      const label = String(node.data('label') ?? '').toLowerCase();
      const type = String(node.data('type') ?? '').toLowerCase();
      return label.includes(value) || type.includes(value);
    });

    if (matches.length === 0) return;

    matches.addClass('search-hit');
    core.animate({ fit: { eles: matches, padding: 120 }, duration: 400 });
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

  protected readonly currency = currency;
  protected readonly typeLabel = typeLabel;
}
