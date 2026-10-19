import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CostAnomaly,
  CostForecast,
  CostRecommendation,
  CostSummary,
  CostTrend,
  ResourceCost
} from '../models';

@Injectable({ providedIn: 'root' })
export class CostService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/costs`;

  getSummary(startDate?: Date, endDate?: Date): Observable<CostSummary> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate.toISOString());
    if (endDate) params = params.set('endDate', endDate.toISOString());

    return this.http.get<CostSummary>(`${this.baseUrl}/summary`, { params });
  }

  getTrends(startDate?: Date, endDate?: Date): Observable<CostTrend[]> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate.toISOString());
    if (endDate) params = params.set('endDate', endDate.toISOString());

    return this.http.get<CostTrend[]>(`${this.baseUrl}/trends`, { params });
  }

  getForecast(daysAhead = 30): Observable<CostForecast[]> {
    return this.http.get<CostForecast[]>(`${this.baseUrl}/forecast`, {
      params: { daysAhead: String(daysAhead) }
    });
  }

  getAnomalies(): Observable<CostAnomaly[]> {
    return this.http.get<CostAnomaly[]>(`${this.baseUrl}/anomalies`);
  }

  getTopResources(count = 10): Observable<ResourceCost[]> {
    return this.http.get<ResourceCost[]>(`${this.baseUrl}/top-resources`, {
      params: { count: String(count) }
    });
  }

  getRecommendations(): Observable<CostRecommendation[]> {
    return this.http.get<CostRecommendation[]>(`${this.baseUrl}/recommendations`);
  }
}
