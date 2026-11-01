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
    serverTimeUtc: '2026-01-01'
  });
  const loginRequired = signal(false);
  beforeEach(async () => {
    loginRequired.set(false);
    status.set({ ...status(), discoveryStatus: 'Succeeded', demoMode: false });
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
    http.expectOne('/api/resources?pageNumber=1&pageSize=100').flush({ items: [], totalCount: 0 });
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
    expect(fixture.nativeElement.textContent).toContain('Discovery has not succeeded');
    expect(fixture.nativeElement.textContent).not.toContain('No resources found');
    TestBed.inject(HttpTestingController).expectNone('/api/resources?pageNumber=1&pageSize=100');
  });

  it('offers sign-in without requesting inventory when unauthenticated', () => {
    loginRequired.set(true);
    const fixture = TestBed.createComponent(LiveInventoryComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/auth/login');
    TestBed.inject(HttpTestingController).expectNone('/api/resources?pageNumber=1&pageSize=100');
  });
});
