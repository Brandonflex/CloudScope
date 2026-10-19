import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CompliancePosture, ComplianceReport, ComplianceFramework } from '../models';

@Injectable({ providedIn: 'root' })
export class ComplianceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/compliance`;

  getPosture(): Observable<CompliancePosture> {
    return this.http.get<CompliancePosture>(`${this.baseUrl}/status`);
  }

  getReport(framework: ComplianceFramework): Observable<ComplianceReport> {
    return this.http.get<ComplianceReport>(`${this.baseUrl}/reports/${framework}`);
  }

  runScan(framework?: ComplianceFramework) {
    let params = new HttpParams();
    if (framework !== undefined) params = params.set('framework', framework.toString());

    return this.http.post(`${this.baseUrl}/scan`, {}, { params });
  }

  getPolicies(framework?: ComplianceFramework) {
    let params = new HttpParams();
    if (framework !== undefined) params = params.set('framework', framework.toString());

    return this.http.get(`${this.baseUrl}/policies`, { params });
  }
}