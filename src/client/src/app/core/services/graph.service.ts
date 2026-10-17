import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GraphData, CloudProvider, ResourceType } from '../models';

@Injectable({ providedIn: 'root' })
export class GraphService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/graph`;

  getFullGraph(
    provider?: CloudProvider,
    resourceType?: ResourceType,
    region?: string
  ): Observable<GraphData> {
    let params = new HttpParams();
    if (provider !== undefined) params = params.set('provider', provider.toString());
    if (resourceType) params = params.set('resourceType', resourceType);
    if (region) params = params.set('region', region);

    return this.http.get<GraphData>(this.baseUrl, { params });
  }

  getSubgraph(resourceId: string, depth = 2): Observable<GraphData> {
    return this.http.get<GraphData>(`${this.baseUrl}/subgraph/${resourceId}`, {
      params: { depth: depth.toString() }
    });
  }

  findPath(sourceId: string, targetId: string) {
    return this.http.get(`${this.baseUrl}/paths`, {
      params: { sourceId, targetId }
    });
  }
}