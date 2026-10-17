import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AIQueryResult {
  question: string;
  answer: string;
  generatedQuery?: string;
  data?: unknown;
  success: boolean;
  error?: string;
  processingTime: string;
}

@Injectable({ providedIn: 'root' })
export class QueryService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/query`;

  ask(question: string): Observable<AIQueryResult> {
    return this.http.post<AIQueryResult>(`${this.baseUrl}/ask`, { question });
  }

  getSuggestions(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/suggestions`);
  }
}