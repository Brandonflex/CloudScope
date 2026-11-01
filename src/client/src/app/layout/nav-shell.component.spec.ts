import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER } from 'rxjs';
import { PlatformStatus } from '../core/models';
import { MetaService } from '../core/services/meta.service';
import { NotificationService } from '../core/services/notification.service';
import { ResourceService } from '../core/services/resource.service';
import { ToastService } from '../core/services/toast.service';
import { NavShellComponent, runtimeLabel } from './nav-shell.component';

describe('NavShellComponent realtime availability', () => {
  const metadata = signal<PlatformStatus | null>(null);
  const startConnection = jasmine.createSpy('startConnection');
  const stopConnection = jasmine.createSpy('stopConnection');
  const status: PlatformStatus = {
    version: '1.0',
    demoMode: false,
    storageProvider: 'InMemory',
    aiMode: 'Local',
    configuredProviders: [],
    resourceCount: 0,
    relationshipCount: 0,
    serverTimeUtc: '2026-01-01T00:00:00Z'
  };

  beforeEach(async () => {
    metadata.set(null);
    startConnection.calls.reset();
    stopConnection.calls.reset();
    await TestBed.configureTestingModule({
      imports: [NavShellComponent],
      providers: [
        provideRouter([]),
        { provide: MetaService, useValue: { status: metadata, loadStatus: jasmine.createSpy() } },
        {
          provide: NotificationService,
          useValue: { startConnection, stopConnection, events: NEVER, connected: signal(false) }
        },
        { provide: ResourceService, useValue: {} },
        { provide: ToastService, useValue: {} }
      ]
    })
      .overrideComponent(NavShellComponent, { set: { template: '', imports: [] } })
      .compileComponents();
  });

  it('never labels a configured provider as connected before successful discovery', () => {
    const live = { ...status, configuredProviders: ['Azure'] };
    expect(runtimeLabel(null)).toBe('Status unavailable');
    expect(runtimeLabel(live)).toBe('Connection unverified');
    expect(runtimeLabel({ ...live, discoveryStatus: 'NotStarted' })).toBe('Connection unverified');
    expect(runtimeLabel({ ...live, discoveryStatus: 'InProgress' })).toBe('Discovering resources');
    expect(runtimeLabel({ ...live, discoveryStatus: 'Failed' })).toBe('Discovery needs attention');
    expect(runtimeLabel({ ...live, discoveryStatus: 'PartialFailure' })).toBe(
      'Discovery needs attention'
    );
    expect(runtimeLabel({ ...live, discoveryStatus: 'Succeeded' })).toBe('Connected estate');
    expect(runtimeLabel({ ...live, demoMode: true })).toBe('Demo estate');
  });

  it('connects only when a backend supports realtime, and resumes after recovery', () => {
    const fixture = TestBed.createComponent(NavShellComponent);
    fixture.detectChanges();
    expect(startConnection).not.toHaveBeenCalled();

    metadata.set({ ...status, demoMode: true, realtimeAvailable: false });
    fixture.detectChanges();
    expect(startConnection).not.toHaveBeenCalled();

    metadata.set({ ...status, realtimeAvailable: true });
    fixture.detectChanges();
    expect(startConnection).toHaveBeenCalledTimes(1);

    metadata.set(null);
    fixture.detectChanges();
    expect(stopConnection).toHaveBeenCalled();

    // Older .NET API versions do not advertise the new capability but do have a hub.
    metadata.set(status);
    fixture.detectChanges();
    expect(startConnection).toHaveBeenCalledTimes(2);
    fixture.destroy();
  });
});
