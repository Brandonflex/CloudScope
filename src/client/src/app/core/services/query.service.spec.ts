import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryService } from './query.service';

describe('QueryService', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] })
  );

  it('sends history only when explicitly supplied', () => {
    const query = TestBed.inject(QueryService);
    const http = TestBed.inject(HttpTestingController);
    query.ask('hello').subscribe();
    const local = http.expectOne('/api/query/ask');
    expect(local.request.body).toEqual({ question: 'hello' });
    local.flush({});
    const history = [{ role: 'user' as const, content: 'hello' }];
    query.ask('more', history).subscribe();
    const ai = http.expectOne('/api/query/ask');
    expect(ai.request.body).toEqual({ question: 'more', history });
    ai.flush({});
    http.verify();
  });
});
