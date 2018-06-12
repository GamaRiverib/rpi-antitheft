import { AntiTheftSystemAPI } from "./AntiTheftSystemAPI";
import { AntiTheftSystem, AntiTheftSystemEventData } from "./AntiTheftSystem";
import { Sensor } from "./Sensor";
import { Utils } from './Utils';
import { Server } from "http";

import * as io from 'socket.io';

export class WebSocketChannel {
    
    private static INSTANCE: WebSocketChannel = null;

    private socket: io.Server;

    private eventsId: { [event: string]: string } = {};

    private constructor(private ats: AntiTheftSystemAPI, private server: Server) {

        this.configureEventsId();

        this.socket = io.listen(this.server);
    
        this.socket.on('connection', (ws) => {
            console.log('Websocket client connected: ', ws.id);
            ws.send(this.eventsId);
        });

        this.ats.on(AntiTheftSystem.EVENTS.SYSTEM_ALERT, (data: AntiTheftSystemEventData) => {
            let event = this.eventsId[AntiTheftSystem.EVENTS.SYSTEM_ALERT];
            if(event) {
                let payload: string = this.getPayload(data);
                this.socket.emit(event, payload);
            }
        });
        this.ats.on(AntiTheftSystem.EVENTS.SYSTEM_ALARMED, (data: AntiTheftSystemEventData) => {
            let event = this.eventsId[AntiTheftSystem.EVENTS.SYSTEM_ALARMED];
            if(event) {
                let payload: string = this.getPayload(data);
                this.socket.emit(event, payload);
            }
        });
        this.ats.on(AntiTheftSystem.EVENTS.SYSTEM_ARMED, (data: AntiTheftSystemEventData) => {
            let event = this.eventsId[AntiTheftSystem.EVENTS.SYSTEM_ARMED];
            if(event) {
                let payload: string = this.getPayload(data);
                this.socket.emit(event, payload);
            }
        });
        this.ats.on(AntiTheftSystem.EVENTS.SYSTEM_DISARMED, (data: AntiTheftSystemEventData) => {
            let event = this.eventsId[AntiTheftSystem.EVENTS.SYSTEM_DISARMED];
            if(event) {
                let payload: string = this.getPayload(data);
                this.socket.emit(event, payload);
            }
        });
        this.ats.on(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, (data: AntiTheftSystemEventData) => {
            let event = this.eventsId[AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED];
            if(event) {
                let payload: string = this.getPayload(data);
                this.socket.emit(event, payload);
            }
        });
    }

    public static start(ats: AntiTheftSystemAPI, server: Server): void {
        if (WebSocketChannel.INSTANCE == null) {
            WebSocketChannel.INSTANCE = new WebSocketChannel(ats, server);
        }
    }

    public static stop(): void {
        WebSocketChannel.INSTANCE.socket.close(() => {
            WebSocketChannel.INSTANCE = null;
        });
    }

    private configureEventsId(): void {
        let index = -1;
        for(let event in AntiTheftSystem.EVENTS) {
            this.eventsId[event] = (++index).toString();
        }
    }

    private getPayload(data: AntiTheftSystemEventData): string {
        let payload = '';
        let s = data.system;
        if(s) {
            payload = `${s.state}${s.mode || 0}`;
            if (s.leftTime > 0) {
                let leftTimeout = Math.round((s.leftTime - s.uptime) / 1000);
                payload += Utils.leftpad(leftTimeout.toString(32).toUpperCase(), 2, '0');
            } else {
                payload += '00';
            }
            if(s.activedSensors.length > 0) {
                payload += Utils.leftpad(s.activedSensors.length.toString(32).toUpperCase(), 2, '0');
            } else {
                payload += '00';
            }
            s.activedSensors.forEach((sensor: Sensor, i: number) => {
                payload += Utils.leftpad(sensor.location.pin.toString(32).toUpperCase(), 2, '0');
            });
        }
        return payload;
    }

}