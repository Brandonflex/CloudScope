import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AIQueryResult } from '../models';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable({ providedIn: 'root' })
export class QueryService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/query`;

  ask(question: string, history?: ChatTurn[]): Observable<AIQueryResult> {
    return this.http.post<AIQueryResult>(
      `${this.baseUrl}/ask`,
      history ? { question, history } : { question }
    );
  }

  getSuggestions(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/suggestions`);
  }
}
