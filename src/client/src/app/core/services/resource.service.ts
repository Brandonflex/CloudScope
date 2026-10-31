import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  BlastRadiusResult,
  CloudProvider,
  CloudResource,
  DiscoveryResult,
  PagedResult,
  ResourceRelationship,
  ResourceType
} from '../models';

export interface ResourceQuery {
  pageNumber?: number;
  pageSize?: number;
  provider?: CloudProvider | null;
  resourceType?: ResourceType | null;
  region?: string | null;
  resourceGroup?: string | null;
  search?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ResourceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/resources`;

  getAll(query: ResourceQuery = {}): Observable<PagedResult<CloudResource>> {
    let params = new HttpParams()
      .set('pageNumber', String(query.pageNumber ?? 1))
      .set('pageSize', String(query.pageSize ?? 50));

    if (query.provider) params = params.set('provider', query.provider);
    if (query.resourceType) params = params.set('resourceType', query.resourceType);
    if (query.region) params = params.set('region', query.region);
    if (query.resourceGroup) params = params.set('resourceGroup', query.resourceGroup);
    if (query.search) params = params.set('search', query.search);

    return this.http.get<PagedResult<CloudResource>>(this.baseUrl, { params });
  }

  getById(id: string): Observable<CloudResource> {
    return this.http.get<CloudResource>(`${this.baseUrl}/by-id`, { params: { id } });
  }

  getRelationships(id: string): Observable<ResourceRelationship[]> {
    return this.http.get<ResourceRelationship[]>(`${this.baseUrl}/relationships`, {
      params: { id }
    });
  }

  getBlastRadius(id: string, maxDepth = 5): Observable<BlastRadiusResult> {
    return this.http.get<BlastRadiusResult>(`${this.baseUrl}/blast-radius`, {
      params: { id, maxDepth: String(maxDepth) }
    });
  }

  triggerDiscovery(): Observable<DiscoveryResult> {
    return this.http.post<DiscoveryResult>(`${this.baseUrl}/discover`, {});
  }
}
