import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ResourceService } from './resource.service';
import { GraphService } from './graph.service';

describe('resource ID API integration', () => {
  let http: HttpTestingController;
  const id =
    'azure:/subscriptions/123/resourceGroups/a/providers/Microsoft.Compute/virtualMachines/vm 1';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('passes resource IDs as query parameters, not URL path segments', () => {
    const service = TestBed.inject(ResourceService);
    service.getById(id).subscribe();
    const detail = http.expectOne((req) => req.url === '/api/resources/by-id');
    expect(detail.request.params.get('id')).toBe(id);
    detail.flush({});
    service.getRelationships(id).subscribe();
    const relationships = http.expectOne((req) => req.url === '/api/resources/relationships');
    expect(relationships.request.params.get('id')).toBe(id);
    relationships.flush([]);
    service.getBlastRadius(id, 4).subscribe();
    const blast = http.expectOne((req) => req.url === '/api/resources/blast-radius');
    expect(blast.request.params.get('id')).toBe(id);
    expect(blast.request.params.get('maxDepth')).toBe('4');
    blast.flush({});
  });

  it('passes graph IDs as query parameters', () => {
    TestBed.inject(GraphService).getSubgraph(id, 3).subscribe();
    const request = http.expectOne((req) => req.url === '/api/graph/subgraph');
    expect(request.request.params.get('resourceId')).toBe(id);
    expect(request.request.params.get('depth')).toBe('3');
    request.flush({ nodes: [], edges: [] });
  });
});
