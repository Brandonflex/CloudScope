import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PlatformStatus } from './core/models';
import { MetaService } from './core/services/meta.service';
import { AppComponent } from './app.component';
import { LiveInventoryComponent } from './features/live/live-inventory.component';
import { NavShellComponent } from './layout/nav-shell.component';

@Component({ selector: 'app-nav-shell', template: 'demo or standard shell' })
class MockNavShellComponent {}
@Component({ selector: 'app-live-inventory', template: 'protected live inventory' })
class MockLiveInventoryComponent {}

describe('AppComponent connection gate', () => {
  const status = signal<PlatformStatus | null>(null);
  const statusResolved = signal(false);
  const liveLoginRequired = signal(false);
  const loadStatus = jasmine.createSpy('loadStatus');
  const sample: PlatformStatus = {
    version: '1',
    demoMode: false,
    storageProvider: 'InMemory',
    aiMode: 'Local',
    configuredProviders: ['Azure'],
    resourceCount: 0,
    relationshipCount: 0,
    serverTimeUtc: '2026-01-01'
  };

  beforeEach(async () => {
    status.set(null);
    statusResolved.set(false);
    liveLoginRequired.set(false);
    loadStatus.calls.reset();
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        {
          provide: MetaService,
          useValue: { status, statusResolved, liveLoginRequired, loadStatus }
        }
      ]
    })
      .overrideComponent(AppComponent, {
        remove: { imports: [NavShellComponent, LiveInventoryComponent] },
        add: { imports: [MockNavShellComponent, MockLiveInventoryComponent] }
      })
      .compileComponents();
  });

  it('does not render a demo shell when the backend is unavailable', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Connecting to CloudScope');
    expect(fixture.nativeElement.textContent).not.toContain('demo or standard shell');
    statusResolved.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Connection unavailable');
    expect(fixture.nativeElement.textContent).not.toContain('demo or standard shell');
    fixture.nativeElement.querySelector('button').click();
    expect(loadStatus).toHaveBeenCalledTimes(2);
  });

  it('shows sign-in for 401, the live UI for live status, and the normal UI for demo status', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    liveLoginRequired.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('protected live inventory');
    liveLoginRequired.set(false);
    status.set({ ...sample, liveInventoryOnly: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('protected live inventory');
    status.set({ ...sample, demoMode: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('demo or standard shell');
  });
});
