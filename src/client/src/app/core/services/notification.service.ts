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
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

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
    const connection = this.hubConnection;
    connection.onclose(() => {
      this.connected.set(false);
      this.scheduleRetry(connection);
    });

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

    this.connect(connection);
  }

  stopConnection(): void {
    const connection = this.hubConnection;
    this.hubConnection = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    void connection?.stop();
    this.connected.set(false);
  }

  private connect(connection: signalR.HubConnection): void {
    void connection
      .start()
      .then(() => {
        if (this.hubConnection === connection) this.connected.set(true);
      })
      .catch(() => {
        if (this.hubConnection === connection) {
          this.connected.set(false);
          this.scheduleRetry(connection);
        }
      });
  }

  private scheduleRetry(connection: signalR.HubConnection): void {
    if (this.hubConnection !== connection || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.hubConnection === connection) this.connect(connection);
    }, 15000);
  }

  private publish(type: RealtimeEventType, data: unknown): void {
    const event: RealtimeEvent = { type, data, timestamp: new Date() };
    this.lastEvent.set(event);
    this.events$.next(event);
  }
}
