import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChatTurn, QueryService } from '../../core/services/query.service';
import { MetaService } from '../../core/services/meta.service';
import { ToastService } from '../../core/services/toast.service';
import { AIQueryResult } from '../../core/models';

interface TranscriptEntry {
  id: number;
  question: string;
  result: AIQueryResult;
}

interface Example {
  icon: string;
  category: string;
  question: string;
}

const DEFAULT_EXAMPLES: Example[] = [
  { icon: 'payments', category: 'Cost', question: 'What are my top 5 most expensive resources?' },
  { icon: 'trending_up', category: 'Cost', question: 'Which resource costs are anomalous?' },
  {
    icon: 'verified_user',
    category: 'Compliance',
    question: 'Show my critical compliance violations'
  },
  { icon: 'hub', category: 'Reliability', question: 'What is the blast radius of vm-app-01?' },
  { icon: 'speed', category: 'Optimisation', question: 'Which VMs are under-utilised?' },
  {
    icon: 'build_circle',
    category: 'Governance',
    question: 'Which resources are not managed by IaC?'
  }
];

@Component({
  selector: 'app-query',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatChipsModule
  ],
  template: `
    <div class="page query-page">
      <div class="page-head">
        <div>
          <h1>Ask CloudScope</h1>
          <p class="subtitle">
            @if (previewAiEnabled()) {
              AI answers use fictional demo data and may be wrong. Your question and up to three
              previous exchanges are sent to Azure OpenAI. Do not enter secrets or sensitive data.
            } @else if (meta.demoMode()) {
              Explore fictional demo data with a limited, rule-based query engine. Ask complete
              questions; the local engine does not remember conversation context.
            } @else {
              Natural-language questions over the inventory. Answers cite the resources they used.
            }
          </p>
        </div>
        <div class="actions">
          <span class="chip chip-purple">
            <mat-icon>auto_awesome</mat-icon>
            {{
              lastResult()?.source ??
                (previewAiEnabled()
                  ? 'Azure AI configured'
                  : meta.demoMode()
                    ? 'Local demo engine'
                    : 'AI + local engine')
            }}
          </span>
          @if (transcript().length) {
            <button mat-button type="button" (click)="clearChat()" [disabled]="thinking()">
              Clear chat
            </button>
          }
        </div>
      </div>

      <div class="query-layout">
        <section class="panel chat-panel">
          <div class="chat-scroll" #scroll>
            @if (transcript().length === 0) {
              <div class="hero">
                <div class="hero-orb">
                  <mat-icon>auto_awesome</mat-icon>
                </div>
                <h2>What do you want to know about your estate?</h2>
                <p>
                  CloudScope understands cost, compliance, dependencies and utilisation questions.
                  Try one of the prompts below or ask your own.
                </p>
                @if (meta.demoMode()) {
                  <div class="starter-prompts" aria-label="Getting started questions">
                    @for (prompt of starterPrompts; track prompt) {
                      <button type="button" (click)="useExample(prompt)" [disabled]="thinking()">
                        {{ prompt }}
                      </button>
                    }
                  </div>
                }
              </div>
            }

            @for (entry of transcript(); track entry.id) {
              <div class="turn">
                <div class="bubble user">
                  <div class="bubble-label">You</div>
                  <p>{{ entry.question }}</p>
                </div>

                <div class="bubble assistant" [class.failed]="!entry.result.success">
                  <div class="bubble-label">
                    <mat-icon>auto_awesome</mat-icon>
                    CloudScope
                    <span class="bubble-source">{{ entry.result.source }}</span>
                    <span class="bubble-time">{{ entry.result.processingTime }}</span>
                  </div>
                  <div class="answer" [innerHTML]="formatAnswer(entry.result.answer)"></div>

                  @if (entry.result.contextSources?.length) {
                    <p class="context-notice">
                      Context supplied to AI (not verified citations):
                      <a
                        href="https://github.com/Brandonflex/CloudScope/blob/main/README.md"
                        target="_blank"
                        rel="noopener noreferrer"
                        >CloudScope guide</a
                      >
                      ,
                      <a
                        href="https://github.com/Brandonflex/CloudScope/blob/main/SECURITY.md"
                        target="_blank"
                        rel="noopener noreferrer"
                        >security guide</a
                      >
                      and
                      <a href="/demo/inventory.json" target="_blank" rel="noopener noreferrer"
                        >fictional inventory</a
                      >. Verify important answers.
                    </p>
                  }

                  @if (
                    entry.result.suggestedQuestions?.length ||
                    safeRelatedPage(entry.result.relatedPage)
                  ) {
                    <div class="next-steps" aria-label="Suggested next steps">
                      @if (safeRelatedPage(entry.result.relatedPage); as page) {
                        <a class="next-link" [routerLink]="page.path">{{ page.label }} →</a>
                      }
                      @for (suggestion of entry.result.suggestedQuestions ?? []; track suggestion) {
                        <button
                          type="button"
                          (click)="useExample(suggestion)"
                          [disabled]="thinking()"
                        >
                          {{ suggestion }}
                        </button>
                      }
                    </div>
                  }

                  @if (entry.result.generatedQuery) {
                    <details class="generated-query">
                      <summary>Query details</summary>
                      <pre>{{ entry.result.generatedQuery }}</pre>
                    </details>
                  }

                  @if (entry.result.error) {
                    <p class="error-text">{{ entry.result.error }}</p>
                  }
                </div>
              </div>
            }

            @if (thinking()) {
              <div class="bubble assistant thinking">
                <div class="bubble-label">
                  <mat-icon>auto_awesome</mat-icon>
                  CloudScope is analysing…
                </div>
                <div class="typing"><span></span><span></span><span></span></div>
              </div>
            }
          </div>

          <div class="composer">
            <mat-form-field appearance="outline" class="composer-field">
              <mat-label>Ask a question</mat-label>
              <input
                matInput
                type="text"
                maxlength="1000"
                [(ngModel)]="question"
                (keydown.enter)="ask()"
                [disabled]="thinking()"
                placeholder="e.g. what are my most expensive resources?"
              />
              <button
                mat-icon-button
                matSuffix
                type="button"
                class="send-button"
                [disabled]="thinking() || !question.trim()"
                (click)="ask()"
              >
                <mat-icon>send</mat-icon>
              </button>
            </mat-form-field>
          </div>
        </section>

        <aside class="suggestions">
          <div class="panel suggestion-card">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">Try asking</h2>
                <p class="panel-sub">Curated prompts</p>
              </div>
            </div>
            <div class="panel-body">
              @for (example of examples(); track example.question) {
                <button
                  type="button"
                  class="suggestion"
                  (click)="useExample(example.question)"
                  [disabled]="thinking()"
                >
                  <mat-icon>{{ example.icon }}</mat-icon>
                  <div>
                    <span>{{ example.question }}</span>
                    <em>{{ example.category }}</em>
                  </div>
                  <mat-icon class="chevron">chevron_right</mat-icon>
                </button>
              }
            </div>
          </div>

          <div class="panel capability-card">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">Capabilities</h2>
                <p class="panel-sub">What the engine can answer</p>
              </div>
            </div>
            <div class="panel-body">
              <ul class="capabilities">
                @if (meta.demoMode()) {
                  <li><mat-icon>help_outline</mat-icon> Platform concepts and getting started</li>
                }
                <li><mat-icon>payments</mat-icon> Cost hotspots, forecasts and anomalies</li>
                <li><mat-icon>verified_user</mat-icon> Compliance failures by framework</li>
                <li><mat-icon>hub</mat-icon> Blast radius for a named resource</li>
                <li><mat-icon>speed</mat-icon> Under-utilised VMs and orphaned resources</li>
                <li><mat-icon>build_circle</mat-icon> Resources outside infrastructure-as-code</li>
                <li><mat-icon>cloud</mat-icon> Inventory by provider or type</li>
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </div>
  `,
  styles: [
    `
      .query-page {
        display: flex;
        flex-direction: column;
      }

      .query-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 330px;
        gap: 16px;
        align-items: start;
      }

      .chat-panel {
        display: flex;
        flex-direction: column;
        height: calc(100vh - 190px);
        min-height: 520px;
      }

      .chat-scroll {
        flex: 1;
        overflow-y: auto;
        padding: 22px 24px;
      }

      .hero {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 40px 20px 24px;
      }
      .hero-orb {
        width: 62px;
        height: 62px;
        border-radius: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, rgba(88, 166, 255, 0.25), rgba(188, 140, 255, 0.25));
        border: 1px solid rgba(88, 166, 255, 0.3);
        color: #bc8cff;
        margin-bottom: 16px;
      }
      .hero-orb mat-icon {
        font-size: 30px;
        width: 30px;
        height: 30px;
      }
      .hero h2 {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 650;
      }
      .hero p {
        margin: 8px 0 0;
        max-width: 460px;
        font-size: 0.85rem;
        color: var(--text-muted);
        line-height: 1.55;
      }

      .starter-prompts,
      .next-steps {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
      }
      .starter-prompts {
        justify-content: center;
      }
      .starter-prompts button,
      .next-steps button,
      .next-link {
        border: 1px solid rgba(88, 166, 255, 0.3);
        border-radius: 8px;
        padding: 7px 10px;
        color: #9bcaff;
        background: rgba(88, 166, 255, 0.08);
        font: inherit;
        font-size: 0.76rem;
        text-decoration: none;
        cursor: pointer;
        text-align: left;
      }
      .starter-prompts button:hover,
      .next-steps button:hover,
      .next-link:hover {
        background: rgba(88, 166, 255, 0.18);
      }
      button:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }

      .turn {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 20px;
      }

      .bubble {
        border-radius: 14px;
        padding: 14px 16px;
        max-width: 100%;
      }
      .bubble.user {
        align-self: flex-end;
        background: rgba(88, 166, 255, 0.12);
        border: 1px solid rgba(88, 166, 255, 0.22);
        max-width: 78%;
      }
      .bubble.assistant {
        background: rgba(240, 246, 252, 0.035);
        border: 1px solid var(--border);
      }
      .bubble.assistant.failed {
        border-color: rgba(248, 81, 73, 0.4);
      }

      .bubble-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--text-dim);
        margin-bottom: 6px;
      }
      .bubble-label mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        color: #bc8cff;
      }
      .bubble-source {
        color: #79c0ff;
        text-transform: none;
        letter-spacing: 0;
      }
      .bubble-time {
        margin-left: auto;
        letter-spacing: 0;
        text-transform: none;
      }

      .bubble p {
        margin: 0;
        font-size: 0.87rem;
        line-height: 1.6;
      }

      .answer {
        font-size: 0.87rem;
        line-height: 1.62;
        color: #d7e0ea;
      }
      .answer ::ng-deep strong {
        color: #f0f6fc;
      }

      .context-notice {
        margin-top: 10px !important;
        color: var(--text-muted);
        font-size: 0.75rem !important;
      }
      .context-notice a {
        color: #9bcaff;
      }

      .generated-query {
        margin-top: 10px;
        font-size: 0.75rem;
        color: var(--text-muted);
      }
      .generated-query summary {
        cursor: pointer;
        user-select: none;
      }
      .generated-query pre {
        margin: 8px 0 0;
        padding: 10px 12px;
        border-radius: 8px;
        background: #080c12;
        border: 1px solid var(--border);
        font-size: 0.72rem;
        overflow-x: auto;
        color: #79c0ff;
      }

      .error-text {
        color: var(--red);
        font-size: 0.8rem;
        margin-top: 8px;
      }

      .typing {
        display: flex;
        gap: 4px;
        padding: 4px 0;
      }
      .typing span {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #bc8cff;
        animation: blink 1.2s infinite;
      }
      .typing span:nth-child(2) {
        animation-delay: 0.18s;
      }
      .typing span:nth-child(3) {
        animation-delay: 0.36s;
      }

      @keyframes blink {
        0%,
        80%,
        100% {
          opacity: 0.25;
          transform: translateY(0);
        }
        40% {
          opacity: 1;
          transform: translateY(-2px);
        }
      }

      .composer {
        border-top: 1px solid var(--border);
        padding: 14px 20px 4px;
      }

      .composer-field {
        width: 100%;
      }
      .send-button {
        color: #58a6ff;
      }

      .suggestions {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .suggestion-card .panel-body {
        padding-top: 8px;
      }

      .suggestion {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        text-align: left;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 10px;
        padding: 9px 10px;
        color: var(--text);
        cursor: pointer;
        transition:
          background 0.12s ease,
          border-color 0.12s ease;
      }
      .suggestion:hover {
        background: rgba(88, 166, 255, 0.07);
        border-color: rgba(88, 166, 255, 0.2);
      }
      .suggestion mat-icon {
        color: var(--text-dim);
        font-size: 17px;
        width: 17px;
        height: 17px;
        flex-shrink: 0;
      }
      .suggestion:hover mat-icon {
        color: var(--accent);
      }
      .suggestion div {
        flex: 1;
        min-width: 0;
      }
      .suggestion span {
        display: block;
        font-size: 0.79rem;
        line-height: 1.4;
      }
      .suggestion em {
        display: block;
        font-style: normal;
        font-size: 0.68rem;
        color: var(--text-dim);
        margin-top: 2px;
      }
      .suggestion .chevron {
        opacity: 0;
        transition: opacity 0.12s ease;
        flex-shrink: 0;
      }
      .suggestion:hover .chevron {
        opacity: 1;
      }

      .capabilities {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .capabilities li {
        display: flex;
        align-items: center;
        gap: 9px;
        font-size: 0.79rem;
        color: var(--text-muted);
      }
      .capabilities mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: var(--text-dim);
      }

      @media (max-width: 1150px) {
        .query-layout {
          grid-template-columns: minmax(0, 1fr);
        }
        .chat-panel {
          height: auto;
          min-height: 480px;
        }
      }
    `
  ]
})
export class QueryComponent implements OnInit {
  private readonly queryService = inject(QueryService);
  readonly meta = inject(MetaService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly starterPrompts = [
    'What can CloudScope do?',
    'How do I get started?',
    'Is this real data?'
  ];
  readonly transcript = signal<TranscriptEntry[]>([]);
  readonly thinking = signal(false);
  readonly examples = signal<Example[]>(DEFAULT_EXAMPLES);
  readonly lastResult = signal<AIQueryResult | null>(null);

  readonly composer = viewChild<ElementRef<HTMLInputElement>>('scroll');

  question = '';
  private counter = 0;

  ngOnInit(): void {
    this.queryService
      .getSuggestions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (suggestions) => {
          if (suggestions.length === 0) return;
          this.examples.set(
            suggestions.slice(0, 8).map((question, index) => ({
              icon: DEFAULT_EXAMPLES[index % DEFAULT_EXAMPLES.length].icon,
              category: 'Suggested',
              question
            }))
          );
        },
        error: () => this.examples.set(DEFAULT_EXAMPLES)
      });
  }

  previewAiEnabled(): boolean {
    return this.meta.demoMode() && this.meta.status()?.aiMode === 'AzureOpenAIDemo';
  }

  safeRelatedPage(page: AIQueryResult['relatedPage']): { label: string; path: string } | null {
    const allowed = ['/dashboard', '/resources', '/graph', '/costs', '/compliance', '/query'];
    return page && typeof page.label === 'string' && allowed.includes(page.path) ? page : null;
  }

  clearChat(): void {
    if (this.thinking()) return;
    this.transcript.set([]);
    this.lastResult.set(null);
    this.question = '';
  }

  useExample(question: string): void {
    this.question = question;
    this.ask();
  }

  ask(): void {
    const question = this.question.trim();
    if (!question || this.thinking()) return;

    const history: ChatTurn[] | undefined = this.previewAiEnabled()
      ? this.transcript()
          .slice(-3)
          .flatMap((entry): ChatTurn[] => [
            { role: 'user', content: entry.question.slice(0, 1200) },
            { role: 'assistant', content: entry.result.answer.slice(0, 1200) }
          ])
      : undefined;
    this.question = '';
    this.thinking.set(true);

    this.queryService
      .ask(question, history)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.thinking.set(false);
          this.lastResult.set(result);
          this.transcript.update((entries) => [
            ...entries,
            { id: ++this.counter, question, result }
          ]);
          this.scrollToBottom();
        },
        error: () => {
          this.thinking.set(false);
          if (!this.question.trim()) this.question = question;
          this.toast.error('The query engine did not respond. Your question is ready to retry.');
        }
      });
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const element = document.querySelector('.chat-scroll');
      element?.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    });
  }

  formatAnswer(answer: string): string {
    return answer
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br />');
  }
}
