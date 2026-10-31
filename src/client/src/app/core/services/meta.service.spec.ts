import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MetaService } from './meta.service';

describe('MetaService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
  });

  it('does not mistake unrelated JSON or a failed request for an available backend', () => {
    const meta = TestBed.inject(MetaService);
    const http = TestBed.inject(HttpTestingController);
    meta.loadStatus();
    http.expectOne('/api/meta').flush({ message: 'not found' });
    expect(meta.status()).toBeNull();

    meta.loadStatus();
    http.expectOne('/api/meta').flush(null, { status: 404, statusText: 'Not Found' });
    expect(meta.status()).toBeNull();
    expect(meta.demoMode()).toBeFalse();
    http.verify();
  });
});
