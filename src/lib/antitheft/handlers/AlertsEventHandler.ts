import { EventEmitter } from 'events';
import { AntiTheftSystemAPI } from '../AntiTheftSystemAPI';
import { AntiTheftSystemEventData, AntiTheftSystemEvents } from '../AntiTheftSystemEvents';

export interface MaxAlertsEventData {
    alerts: Date[]
}

export class AlertsEventHandler {

    private emitter: EventEmitter;

    private maxAlertsCount = 5;

    private windowAlertsLength = 60000; // 1 min = 60, 000 ms
    
    private alerts: Date[] = [];

    constructor(private antiTheftSystem: AntiTheftSystemAPI) {
        this.emitter = new EventEmitter();
        this.antiTheftSystem.on(AntiTheftSystemEvents.SYSTEM_ALERT, this.handle);
    }

    private handle(data: AntiTheftSystemEventData): void {
        this.alerts.push(new Date());
        let now = Date.now();
        let alerts: Date[] = [];
        this.alerts.forEach((alert: Date, index: number) => {
            if(now - alert.getTime() < this.windowAlertsLength) {
                alerts.push(alert);
            }
        });
        this.alerts = alerts;
        if (this.alerts.length > this.maxAlertsCount) {
            let eventData: MaxAlertsEventData = { alerts: this.alerts };
            this.emitter.emit(AntiTheftSystemEvents.MAX_ALERTS, eventData);
        }
    }

    public setMax(max: number): void {
        if (max > 0) {
            this.maxAlertsCount = max;
        }
    }

    public getMax(): number {
        return this.maxAlertsCount;
    }

    public setWindow(len: number): void {
        if (len >= 1000) {
            this.windowAlertsLength = len;
        }
    }

    public getWindow(): number {
        return this.windowAlertsLength;
    }

    public getAlerts(): Date[] {
        return this.alerts;
    }

    public onMaxAlertsEvent(listener: (data: MaxAlertsEventData) => void): void {
        this.emitter.on(AntiTheftSystemEvents.MAX_ALERTS, listener);
    }

}