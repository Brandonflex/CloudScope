import { Injectable, signal } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../environments/environment';

export type RealtimeEventType =
  | 'resourceDiscovered'
  | 'complianceViolation'
  | 'costAnomaly'
  | 'scanProgress'
  | 'discoveryProgress'
  | 'discoveryCompleted';

export interface RealtimeEvent {
  type: RealtimeEventType;
  data: unknown;
  timestamp: Date;
}

/**
 * SignalR client. Connection failures are non-fatal: the UI keeps working with
 * HTTP data and simply shows "offline" for realtime updates.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private hubConnection: signalR.HubConnection | null = null;
  private readonly events$ = new Subject<RealtimeEvent>();

  readonly connected = signal(false);
  readonly lastEvent = signal<RealtimeEvent | null>(null);

  get events(): Observable<RealtimeEvent> {
    return this.events$.asObservable();
  }

  startConnection(): void {
    if (this.hubConnection) return;

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(environment.signalRHubUrl)
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    this.hubConnection.onreconnected(() => this.connected.set(true));
    this.hubConnection.onreconnecting(() => this.connected.set(false));
    this.hubConnection.onclose(() => this.connected.set(false));

    const handlers: RealtimeEventType[] = [
      'resourceDiscovered',
      'complianceViolation',
      'costAnomaly',
      'scanProgress',
      'discoveryProgress',
      'discoveryCompleted'
    ];

    for (const handler of handlers) {
      this.hubConnection.on(handler, (data: unknown) => this.publish(handler, data));
    }

    void this.hubConnection
      .start()
      .then(() => this.connected.set(true))
      .catch(() => this.connected.set(false));
  }

  stopConnection(): void {
    void this.hubConnection?.stop();
    this.hubConnection = null;
    this.connected.set(false);
  }

  private publish(type: RealtimeEventType, data: unknown): void {
    const event: RealtimeEvent = { type, data, timestamp: new Date() };
    this.lastEvent.set(event);
    this.events$.next(event);
  }
}
