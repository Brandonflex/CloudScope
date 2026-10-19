import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ComplianceFramework,
  CompliancePolicy,
  CompliancePosture,
  ComplianceReport,
  ComplianceResult
} from '../models';

export interface ScanResult {
  message: string;
  framework: string;
  totalEvaluated: number;
  compliant: number;
  nonCompliant: number;
  results: ComplianceResult[];
}

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

  runScan(framework?: ComplianceFramework): Observable<ScanResult> {
    let params = new HttpParams();
    if (framework) params = params.set('framework', framework);

    return this.http.post<ScanResult>(`${this.baseUrl}/scan`, {}, { params });
  }

  getPolicies(framework?: ComplianceFramework): Observable<CompliancePolicy[]> {
    let params = new HttpParams();
    if (framework) params = params.set('framework', framework);

    return this.http.get<CompliancePolicy[]>(`${this.baseUrl}/policies`, { params });
  }
}
