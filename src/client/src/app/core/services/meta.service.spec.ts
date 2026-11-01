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
    expect(meta.statusResolved()).toBeFalse();
    meta.loadStatus();
    http.expectOne('/api/meta').flush({ message: 'not found' });
    expect(meta.statusResolved()).toBeTrue();
    expect(meta.status()).toBeNull();

    meta.loadStatus();
    http.expectOne('/api/meta').flush(null, { status: 404, statusText: 'Not Found' });
    expect(meta.status()).toBeNull();
    expect(meta.demoMode()).toBeFalse();
    http.verify();
  });
  it('offers live sign-in on a 401 and clears it after a valid status', () => {
    const meta = TestBed.inject(MetaService);
    const http = TestBed.inject(HttpTestingController);
    meta.loadStatus();
    http.expectOne('/api/meta').flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(meta.liveLoginRequired()).toBeTrue();
    meta.loadStatus();
    http.expectOne('/api/meta').flush({
      demoMode: false,
      liveInventoryOnly: true,
      configuredProviders: ['Azure'],
      resourceCount: 0,
      relationshipCount: 0
    });
    expect(meta.liveLoginRequired()).toBeFalse();
    expect(meta.status()?.liveInventoryOnly).toBeTrue();
    http.verify();
  });
});
