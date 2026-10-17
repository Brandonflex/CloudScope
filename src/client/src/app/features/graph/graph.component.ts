import { Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { GraphService } from '../../core/services/graph.service';
import { GraphData, CloudProvider, ResourceType } from '../../core/models';

@Component({
  selector: 'app-graph',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule, MatSelectModule, MatSliderModule],
  template: `
    <div class="graph-page">
      <div class="page-header">
        <h1>Infrastructure Graph</h1>
        <p class="page-subtitle">Interactive dependency visualization</p>
      </div>

      <div class="graph-controls">
        <mat-select [(value)]="selectedProvider" placeholder="Filter by provider" class="control-select">
          <mat-option [value]="null">All Providers</mat-option>
          <mat-option [value]="0">Azure</mat-option>
          <mat-option [value]="1">AWS</mat-option>
        </mat-select>

        <button mat-raised-button color="primary" (click)="refreshGraph()">
          <mat-icon>refresh</mat-icon> Refresh
        </button>

        <button mat-raised-button (click)="fitToScreen()">
          <mat-icon>fit_screen</mat-icon> Fit
        </button>

        <div class="graph-stats">
          <span>{{ nodeCount() }} nodes</span>
          <span>{{ edgeCount() }} edges</span>
        </div>
      </div>

      <mat-card class="graph-container">
        <div #graphContainer class="graph-canvas"></div>
      </mat-card>

      <div class="graph-info">
        <mat-card class="info-card">
          <mat-card-header>
            <mat-card-title>Selected Resource</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (selectedNode()) {
              <div class="resource-details">
                <p><strong>Name:</strong> {{ selectedNode()?.label }}</p>
                <p><strong>Type:</strong> {{ selectedNode()?.type }}</p>
                <p><strong>Region:</strong> {{ selectedNode()?.region }}</p>
                <p><strong>Monthly Cost:</strong> {{ selectedNode()?.monthlyCost | currency }}</p>
              </div>
            } @else {
              <p class="hint">Click a node on the graph to see resource details</p>
            }
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .graph-page { max-width: 1600px; }
    .page-header { margin-bottom: 24px; }
    .page-header h1 { margin: 0; font-size: 1.8rem; }
    .page-subtitle { margin: 4px 0 0; opacity: 0.5; font-size: 0.9rem; }
    .graph-controls {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .control-select { width: 200px; }
    .graph-stats {
      margin-left: auto;
      display: flex;
      gap: 16px;
      font-size: 0.85rem;
      opacity: 0.6;
    }
    .graph-container {
      background: #0d1117;
      border-radius: 8px;
      padding: 0;
      margin-bottom: 16px;
    }
    .graph-canvas {
      width: 100%;
      height: 600px;
      border-radius: 8px;
    }
    .graph-info { display: grid; grid-template-columns: 1fr; gap: 16px; }
    .info-card { background: #161b22; border-radius: 8px; }
    .resource-details p { margin: 4px 0; }
    .hint { opacity: 0.4; font-style: italic; }
  `]
})
export class GraphComponent implements OnInit {
  @ViewChild('graphContainer') graphContainer!: ElementRef;

  private readonly graphService = inject(GraphService);

  selectedProvider = null;
  nodeCount = signal(0);
  edgeCount = signal(0);
  selectedNode = signal<any>(null);

  ngOnInit(): void {
    // Graph will be initialized when Cytoscape.js is loaded
    // cytoscape is available via npm install but needs runtime initialization
  }

  refreshGraph(): void {
    // TODO: Initialize Cytoscape.js instance and load graph data
    // this.graphService.getFullGraph(this.selectedProvider).subscribe(data => {
    //   this.renderGraph(data);
    // });
    console.log('Graph refresh — Cytoscape.js integration pending');
  }

  fitToScreen(): void {
    // TODO: cy.fit()
  }

  private renderGraph(data: GraphData): void {
    // TODO: Initialize Cytoscape.js with:
    // - dagre layout for hierarchical view
    // - Color-coded nodes by provider (blue=Azure, orange=AWS)
    // - Node size by cost
    // - Edge styling by relationship type
    // - Click handlers for node selection
    // - Context menu for blast radius analysis
  }
}