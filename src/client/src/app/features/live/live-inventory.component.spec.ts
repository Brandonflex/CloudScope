import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MetaService } from '../../core/services/meta.service';
import { PlatformStatus } from '../../core/models';
import { LiveInventoryComponent } from './live-inventory.component';

describe('LiveInventoryComponent', () => {
  const status = signal<PlatformStatus>({
    version: '1',
    demoMode: false,
    realtimeAvailable: false,
    liveInventoryOnly: true,
    storageProvider: 'InMemory',
    aiMode: 'Local',
    configuredProviders: ['Azure'],
    resourceCount: 0,
    relationshipCount: 0,
    discoveryStatus: 'Succeeded',
    lastDiscoveryAt: '2026-01-01T00:00:00Z',
    serverTimeUtc: '2026-01-01T00:00:00Z'
  });
  const loginRequired = signal(false);
  beforeEach(async () => {
    loginRequired.set(false);
    status.set({
      ...status(),
      discoveryStatus: 'Succeeded',
      demoMode: false,
      lastDiscoveryAt: '2026-01-01T00:00:00Z',
      serverTimeUtc: '2026-01-01T00:00:00Z'
    });
    await TestBed.configureTestingModule({
      imports: [LiveInventoryComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MetaService,
          useValue: {
            status,
            liveLoginRequired: loginRequired,
            getStatus: () => of(status()),
            loadStatus: jasmine.createSpy('loadStatus')
          }
        }
      ]
    }).compileComponents();
  });

  it('renders a verified empty result without any demo or billing data', () => {
    const fixture = TestBed.createComponent(LiveInventoryComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/resources?pageNumber=1&pageSize=100').flush({
      items: [],
      totalCount: 0,
      pageNumber: 1,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No resources found');
    expect(fixture.nativeElement.textContent).toContain(
      'Live billing, compliance and AI analysis are not enabled'
    );
    http.expectNone('/api/costs/summary');
    http.verify();
  });

  it('does not call an unsuccessful discovery an empty subscription', () => {
    status.set({ ...status(), discoveryStatus: 'Failed' });
    const fixture = TestBed.createComponent(LiveInventoryComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('The latest Azure discovery failed');
    expect(fixture.nativeElement.textContent).not.toContain('No resources found');
    TestBed.inject(HttpTestingController).expectNone('/api/resources?pageNumber=1&pageSize=100');
  });

  it('warns when the successful inventory may be stale', () => {
    status.set({ ...status(), serverTimeUtc: '2026-01-01T00:31:00Z' });
    const fixture = TestBed.createComponent(LiveInventoryComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/resources?pageNumber=1&pageSize=100').flush({
      items: [],
      totalCount: 0,
      pageNumber: 1,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('This view may be stale');
    expect(fixture.nativeElement.textContent).toContain('visible to the configured identity');
    http.verify();
  });

  it('does not show inventory if a success timestamp is missing or in the future', () => {
    status.set({ ...status(), lastDiscoveryAt: '2026-01-02T00:00:00Z' });
    const fixture = TestBed.createComponent(LiveInventoryComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('timestamp could not be verified');
    TestBed.inject(HttpTestingController).expectNone('/api/resources?pageNumber=1&pageSize=100');
  });

  it('offers sign-in without requesting inventory when unauthenticated', () => {
    loginRequired.set(true);
    const fixture = TestBed.createComponent(LiveInventoryComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/auth/login');
    TestBed.inject(HttpTestingController).expectNone('/api/resources?pageNumber=1&pageSize=100');
  });

  it('paginates real inventory and uses the last successful discovery timestamp', () => {
    status.set({ ...status(), lastDiscoveryAt: '2026-01-01T00:00:00Z' });
    const fixture = TestBed.createComponent(LiveInventoryComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/resources?pageNumber=1&pageSize=100').flush({
      items: [
        {
          id: 'one',
          name: 'one',
          provider: 'Azure',
          resourceType: 'Other',
          region: 'global',
          status: 'Unknown'
        }
      ],
      totalCount: 2,
      pageNumber: 1,
      totalPages: 2,
      hasPreviousPage: false,
      hasNextPage: true
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Last successful discovery');
    expect(fixture.nativeElement.textContent).toContain('Page 1 of 2');
    const buttons = fixture.nativeElement.querySelectorAll('.pagination button');
    expect(buttons[0].disabled).toBeTrue();
    buttons[1].click();
    http.expectOne('/api/resources?pageNumber=2&pageSize=100').flush({
      items: [
        {
          id: 'two',
          name: 'two',
          provider: 'Azure',
          resourceType: 'Other',
          region: 'global',
          status: 'Unknown'
        }
      ],
      totalCount: 2,
      pageNumber: 2,
      totalPages: 2,
      hasPreviousPage: true,
      hasNextPage: false
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Page 2 of 2');
    expect(fixture.nativeElement.textContent).toContain('two');
    http.verify();
  });

  it('does not display non-Azure inventory in the Azure-only live view', () => {
    const fixture = TestBed.createComponent(LiveInventoryComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/resources?pageNumber=1&pageSize=100').flush({
      items: [{ id: 'demo', provider: 'AWS' }],
      totalCount: 1,
      pageNumber: 1,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('inventory response could not be verified');
    expect(fixture.nativeElement.textContent).not.toContain('demo');
    http.verify();
  });
});
