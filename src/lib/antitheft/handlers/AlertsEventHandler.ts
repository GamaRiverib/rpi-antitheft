import { EventEmitter } from 'events';
import { AntiTheftSystemAPI } from '../AntiTheftSystemAPI';
import { AntiTheftSystemEventData, AntiTheftSystemEvents } from '../AntiTheftSystemEvents';
import { Sensor } from '../Sensor';

export interface SensorAlert {
    sensor: Sensor;
    at: Date;
}

export interface MaxAlertsEventData {
    alerts: Array<SensorAlert>
}

export class AlertsEventHandler {

    private emitter: EventEmitter;

    private maxAlertsCount = 3;

    private windowAlertsLength = 60000; // 1 min = 60, 000 ms
    
    private alerts: Array<SensorAlert> = [];

    constructor(private antiTheftSystem: AntiTheftSystemAPI) {
        this.emitter = new EventEmitter();
        this.antiTheftSystem.on(AntiTheftSystemEvents.SYSTEM_ALERT, this.handle.bind(this));
    }

    private handle(data: AntiTheftSystemEventData): void {
        let alert: SensorAlert = {
            sensor: data.sensor,
            at: new Date()
        };
        this.alerts.push(alert);
        let now = Date.now();
        let alerts: Array<SensorAlert> = [];
        this.alerts.forEach((sa: SensorAlert) => {
            if(now - sa.at.getTime() < this.windowAlertsLength) {
                alerts.push(sa);
            }
        });
        this.alerts = alerts;
        if (this.alerts.length > this.maxAlertsCount) {
            let eventData: MaxAlertsEventData = { alerts: this.alerts };
            this.emitter.emit(AntiTheftSystemEvents.MAX_ALERTS, eventData);
            this.alerts = [];
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

    public getAlerts(): Array<SensorAlert> {
        return this.alerts;
    }

    public onMaxAlertsEvent(listener: (data: MaxAlertsEventData) => void): void {
        this.emitter.on(AntiTheftSystemEvents.MAX_ALERTS, listener);
    }

}