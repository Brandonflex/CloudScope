import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CloudProvider, GraphData, ResourceRelationship, ResourceType } from '../models';

export interface GraphQuery {
  provider?: CloudProvider | null;
  resourceType?: ResourceType | null;
  region?: string | null;
}

@Injectable({ providedIn: 'root' })
export class GraphService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/graph`;

  getFullGraph(query: GraphQuery = {}): Observable<GraphData> {
    let params = new HttpParams();
    if (query.provider) params = params.set('provider', query.provider);
    if (query.resourceType) params = params.set('resourceType', query.resourceType);
    if (query.region) params = params.set('region', query.region);

    return this.http.get<GraphData>(this.baseUrl, { params });
  }

  getSubgraph(resourceId: string, depth = 2): Observable<GraphData> {
    return this.http.get<GraphData>(
      `${this.baseUrl}/subgraph/${encodeURIComponent(resourceId)}`,
      { params: { depth: String(depth) } }
    );
  }

  findPath(sourceId: string, targetId: string): Observable<ResourceRelationship[]> {
    return this.http.get<ResourceRelationship[]>(`${this.baseUrl}/paths`, {
      params: { sourceId, targetId }
    });
  }
}
