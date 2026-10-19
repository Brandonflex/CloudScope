import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Small pub/sub used by the app shell to tell feature pages that the inventory
 * changed (e.g. after a discovery run) so they can reload their data.
 */
@Injectable({ providedIn: 'root' })
export class RefreshService {
  readonly version = signal(0);

  private readonly subject = new Subject<void>();
  readonly refreshed$ = this.subject.asObservable();

  bump(): void {
    this.version.update((value) => value + 1);
    this.subject.next();
  }
}
