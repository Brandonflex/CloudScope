import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  viewChild
} from '@angular/core';
import { Chart, ChartData, ChartOptions, ChartType, registerables } from 'chart.js';

Chart.register(...registerables);

/**
 * Thin, signal-based wrapper around Chart.js. Re-creates the chart whenever the
 * type, data or options inputs change and destroys it with the component.
 */
@Component({
  selector: 'app-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #canvas></canvas>`,
  styles: [
    `
      :host {
        display: block;
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 180px;
      }
    `
  ]
})
export class ChartComponent implements OnDestroy {
  readonly type = input<ChartType>('line');
  readonly data = input.required<ChartData>();
  readonly options = input<ChartOptions>();
  /** Optional doughnut/pie hole size, e.g. "68%". */
  readonly cutout = input<string | undefined>(undefined);

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;

  constructor() {
    effect(() => {
      const canvas = this.canvas();
      const type = this.type();
      const data = this.data();
      const options = this.options();
      const cutout = this.cutout();

      if (!canvas) return;

      this.chart?.destroy();
      this.chart = new Chart(canvas.nativeElement, {
        type: type as never,
        data: data as never,
        options: this.mergeOptions(type, options, cutout)
      });
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private mergeOptions(type: ChartType, options?: ChartOptions, cutout?: string): ChartOptions {
    const base: ChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: '#8b949e',
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 8,
            boxHeight: 8,
            padding: 16,
            font: { size: 11 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(13, 17, 23, 0.95)',
          borderColor: 'rgba(240, 246, 252, 0.15)',
          borderWidth: 1,
          titleColor: '#e6edf3',
          bodyColor: '#c9d1d9',
          padding: 10,
          displayColors: true,
          cornerRadius: 8
        }
      }
    };

    if (type !== 'doughnut' && type !== 'pie' && type !== 'radar') {
      base.scales = {
        x: {
          grid: { color: 'rgba(240, 246, 252, 0.06)' },
          ticks: { color: '#8b949e', font: { size: 10 }, maxRotation: 0, autoSkipPadding: 16 },
          border: { display: false }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(240, 246, 252, 0.06)' },
          ticks: { color: '#8b949e', font: { size: 10 } },
          border: { display: false }
        }
      };
    }

    return {
      ...base,
      ...options,
      cutout,
      plugins: { ...base.plugins, ...options?.plugins },
      scales: options?.scales ?? base.scales
    } as ChartOptions;
  }
}
