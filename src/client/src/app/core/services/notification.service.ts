import { Injectable, inject } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../environments/environment';

export interface NotificationEvent {
  type: string;
  data: unknown;
  timestamp: Date;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private hubConnection: signalR.HubConnection | null = null;
  private readonly notifications$ = new Subject<NotificationEvent>();

  get notifications(): Observable<NotificationEvent> {
    return this.notifications$.asObservable();
  }

  startConnection(): void {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(environment.signalRHubUrl)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Information)
      .build();

    this.hubConnection
      .start()
      .then(() => console.log('SignalR connected'))
      .catch(err => console.error('SignalR connection error:', err));

    this.hubConnection.on('resourceDiscovered', (data) => {
      this.notifications$.next({ type: 'resourceDiscovered', data, timestamp: new Date() });
    });

    this.hubConnection.on('complianceViolation', (data) => {
      this.notifications$.next({ type: 'complianceViolation', data, timestamp: new Date() });
    });

    this.hubConnection.on('costAnomaly', (data) => {
      this.notifications$.next({ type: 'costAnomaly', data, timestamp: new Date() });
    });

    this.hubConnection.on('scanProgress', (data) => {
      this.notifications$.next({ type: 'scanProgress', data, timestamp: new Date() });
    });
  }

  stopConnection(): void {
    this.hubConnection?.stop();
  }
}