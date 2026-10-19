import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { QueryService, AIQueryResult } from '../../core/services/query.service';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  success?: boolean;
}

@Component({
  selector: 'app-query',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatChipsModule],
  template: `
    <div class="query-page">
      <div class="page-header">
        <h1>AI Query</h1>
        <p class="page-subtitle">Ask questions about your cloud infrastructure in plain English</p>
      </div>

      <mat-card class="chat-card">
        <div class="chat-messages" #chatMessages>
          <div class="welcome-message">
            <mat-icon>smart_toy</mat-icon>
            <h3>CloudScope AI Assistant</h3>
            <p>Ask me anything about your cloud infrastructure. I can help you find resources,
               analyze costs, check compliance, and understand dependencies.</p>
          </div>

          @for (msg of messages(); track $index) {
            <div class="message" [class]="'message-' + msg.role">
              <div class="message-avatar">
                @if (msg.role === 'user') {
                  <mat-icon>person</mat-icon>
                } @else {
                  <mat-icon>smart_toy</mat-icon>
                }
              </div>
              <div class="message-content">
                <p>{{ msg.content }}</p>
                <span class="message-time">{{ msg.timestamp | date:'shortTime' }}</span>
              </div>
            </div>
          }

          @if (isLoading()) {
            <div class="message message-assistant">
              <div class="message-avatar"><mat-icon>smart_toy</mat-icon></div>
              <div class="message-content typing">
                <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              </div>
            </div>
          }
        </div>

        <div class="chat-input">
          <div class="suggestions">
            @for (suggestion of suggestions(); track $index) {
              <mat-chip-option (click)="askSuggestion(suggestion)">{{ suggestion }}</mat-chip-option>
            }
          </div>
          <div class="input-row">
            <mat-form-field appearance="outline" class="query-input">
              <mat-label>Ask a question...</mat-label>
              <input matInput [(ngModel)]="query" (keyup.enter)="ask()" placeholder="e.g., What VMs are under 10% CPU?">
            </mat-form-field>
            <button mat-fab color="primary" (click)="ask()" [disabled]="!query.trim() || isLoading()">
              <mat-icon>send</mat-icon>
            </button>
          </div>
        </div>
      </mat-card>
    </div>
  `,
  styles: [`
    .query-page { max-width: 900px; margin: 0 auto; }
    .page-header { margin-bottom: 24px; }
    .page-header h1 { margin: 0; font-size: 1.8rem; }
    .page-subtitle { margin: 4px 0 0; opacity: 0.5; font-size: 0.9rem; }
    .chat-card {
      background: #161b22;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      height: calc(100vh - 200px);
    }
    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }
    .welcome-message {
      text-align: center;
      padding: 48px 24px;
      opacity: 0.6;
    }
    .welcome-message mat-icon { font-size: 48px; width: 48px; height: 48px; margin-bottom: 12px; }
    .message {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
      max-width: 80%;
    }
    .message-user { margin-left: auto; flex-direction: row-reverse; }
    .message-avatar {
      width: 32px; height: 32px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .message-user .message-avatar { background: rgba(0,120,212,0.3); }
    .message-assistant .message-avatar { background: rgba(102,187,106,0.3); }
    .message-avatar mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .message-content {
      background: #21262d;
      padding: 12px 16px;
      border-radius: 12px;
    }
    .message-content p { margin: 0; font-size: 0.9rem; line-height: 1.5; }
    .message-time { font-size: 0.65rem; opacity: 0.3; }
    .typing { display: flex; gap: 4px; padding: 16px; }
    .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #4fc3f7;
      animation: bounce 1.4s infinite;
    }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-8px); } }
    .chat-input { padding: 16px 24px; border-top: 1px solid rgba(255,255,255,0.05); }
    .suggestions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .input-row { display: flex; gap: 12px; align-items: center; }
    .query-input { flex: 1; }
  `]
})
export class QueryComponent implements OnInit {
  private readonly queryService = inject(QueryService);

  query = '';
  messages = signal<ChatMessage[]>([]);
  suggestions = signal<string[]>([]);
  isLoading = signal(false);

  ngOnInit(): void {
    this.queryService.getSuggestions().subscribe(s => this.suggestions.set(s));
  }

  ask(): void {
    if (!this.query.trim() || this.isLoading()) return;

    const question = this.query.trim();
    this.query = '';
    this.messages.update(msgs => [...msgs, { role: 'user', content: question, timestamp: new Date() }]);
    this.isLoading.set(true);

    this.queryService.ask(question).subscribe({
      next: (result) => {
        this.messages.update(msgs => [...msgs, {
          role: 'assistant',
          content: result.answer,
          timestamp: new Date(),
          success: result.success
        }]);
        this.isLoading.set(false);
      },
      error: () => {
        this.messages.update(msgs => [...msgs, {
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your question. Please try again.',
          timestamp: new Date(),
          success: false
        }]);
        this.isLoading.set(false);
      }
    });
  }

  askSuggestion(suggestion: string): void {
    this.query = suggestion;
    this.ask();
  }
}