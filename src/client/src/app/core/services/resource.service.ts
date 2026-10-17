import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CloudResource, PagedResult, ResourceType, CloudProvider } from '../models';

@Injectable({ providedIn: 'root' })
export class ResourceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/resources`;

  getAll(
    pageNumber = 1,
    pageSize = 50,
    provider?: CloudProvider,
    resourceType?: ResourceType,
    region?: string,
    search?: string
  ): Observable<PagedResult<CloudResource>> {
    let params = new HttpParams()
      .set('pageNumber', pageNumber.toString())
      .set('pageSize', pageSize.toString());

    if (provider !== undefined) params = params.set('provider', provider.toString());
    if (resourceType) params = params.set('resourceType', resourceType);
    if (region) params = params.set('region', region);
    if (search) params = params.set('search', search);

    return this.http.get<PagedResult<CloudResource>>(this.baseUrl, { params });
  }

  getById(id: string): Observable<CloudResource> {
    return this.http.get<CloudResource>(`${this.baseUrl}/${id}`);
  }

  getRelationships(id: string) {
    return this.http.get(`${this.baseUrl}/${id}/relationships`);
  }

  getBlastRadius(id: string, maxDepth = 5) {
    return this.http.get(`${this.baseUrl}/blast-radius/${id}`, {
      params: { maxDepth: maxDepth.toString() }
    });
  }

  triggerDiscovery() {
    return this.http.post(`${this.baseUrl}/discover`, {});
  }
}