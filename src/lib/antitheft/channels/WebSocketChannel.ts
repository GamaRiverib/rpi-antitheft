import { EventEmitter } from 'events';

import { AntiTheftSystemAPI } from '../AntiTheftSystemAPI';
import { Sensor, SensorLocation } from '../Sensor';

import { AntiTheftSystemEvents, AntiTheftSystemEventData } from '../AntiTheftSystemEvents';

import { Conversions } from '../utils/Conversions';

import { Server } from 'http';

import * as io from 'socket.io';
import { AntiTheftSystemResponse } from '../AntiTheftSystemResponse';
import { AntiTheftSystemConfig } from '../AntiTheftSystemConfig';

export class WebSocketChannleEvents {
    public static readonly WEBSOCKET_CLIENT_CONNECTED = 'WEBSOCKET_CLIENT_CONNECTED';
    public static readonly WEBSOCKET_CLIENT_DISCONNECTED = 'WEBSOCKET_CLIENT_DISCONNECTED';
    public static readonly NOT_AUTHORIZED_WEBSOCKET_CLIENT = 'NOT_AUTHORIZED_WEBSOCKET_CLIENT';
    public static readonly AUTHORIZED_WEBSOCKET_CLIENT = 'AUTHORIZED_WEBSOCKET_CLIENT';
    public static readonly WEBSOCKET_CLIENT_STATE = 'WEBSOCKET_CLIENT_STATE';
    public static readonly WEBSOCKET_CLIENT_COMMAND = 'WEBSOCKET_CLIENT_COMMAND';
}

export interface StateEventData {
    sensor: {
        location: {
            mac: string;
            pin: number;
        }
        value: number;
    }
}

export interface WebSocketChannelEventData<T> {
    webSocketClientId: string;
    clientId: string;
    data: T;
}

export const ProtocolMesssages = {
    Time: 'Time',
    Events: 'Events',
    Sensors: 'Sensors',
    is: 'is',
    Who: 'Who',
    state: 'state',
    command: 'command'
};

export class WebSocketChannel {
    
    private static INSTANCE: WebSocketChannel = null;

    private emitter: EventEmitter;

    private socket: io.Server;

    private eventsId: { [event: string]: string } = {};

    private sensors: Sensor[] = [];

    private constructor(private ats: AntiTheftSystemAPI, private server: Server) {

        this.configureEventsId();
        this.configureSensors();

        this.emitter = new EventEmitter();

        this.socket = io.listen(this.server);
    
        this.socket.on('connection', this.onConnectionEventHandler.bind(this));

        this.ats.on(AntiTheftSystemEvents.SYSTEM_ALERT, (data: AntiTheftSystemEventData) =>
            this.onSystemEventHandler.call(this, AntiTheftSystemEvents.SYSTEM_ALERT, data));

        this.ats.on(AntiTheftSystemEvents.SYSTEM_ALARMED, (data: AntiTheftSystemEventData) =>
            this.onSystemEventHandler.call(this, AntiTheftSystemEvents.SYSTEM_ALARMED, data));
            
        this.ats.on(AntiTheftSystemEvents.SYSTEM_ARMED, (data: AntiTheftSystemEventData) =>
            this.onSystemEventHandler.call(this, AntiTheftSystemEvents.SYSTEM_ARMED, data));
        
        this.ats.on(AntiTheftSystemEvents.SYSTEM_DISARMED, (data: AntiTheftSystemEventData) =>
            this.onSystemEventHandler.call(this, AntiTheftSystemEvents.SYSTEM_DISARMED, data));
        
        this.ats.on(AntiTheftSystemEvents.SYSTEM_STATE_CHANGED, (data: AntiTheftSystemEventData) =>
            this.onSystemEventHandler.call(this, AntiTheftSystemEvents.SYSTEM_STATE_CHANGED, data));

        this.ats.on(AntiTheftSystemEvents.BYPASS_CHANGE, (data: AntiTheftSystemEventData) =>
            this.onSystemEventHandler.call(this, AntiTheftSystemEvents.BYPASS_CHANGE, data));

        this.ats.on(AntiTheftSystemEvents.MAX_ALERTS, (data: AntiTheftSystemEventData) =>
            this.onSystemEventHandler.call(this, AntiTheftSystemEvents.MAX_ALERTS, data));

        this.ats.on(AntiTheftSystemEvents.MAX_UNAUTHORIZED_INTENTS, (data: AntiTheftSystemEventData) =>
            this.onSystemEventHandler.call(this, AntiTheftSystemEvents.MAX_UNAUTHORIZED_INTENTS, data));
    }

    public static start(ats: AntiTheftSystemAPI, server: Server): WebSocketChannel {
        if (WebSocketChannel.INSTANCE == null) {
            WebSocketChannel.INSTANCE = new WebSocketChannel(ats, server);
        }
        return WebSocketChannel.INSTANCE;
    }

    public static stop(): void {
        if(WebSocketChannel.INSTANCE) {
            WebSocketChannel.INSTANCE.socket.close(() => {
                WebSocketChannel.INSTANCE = null;
            });
        }
    }

    private onConnectionEventHandler(ws: io.Socket) {
        this.emitter.emit(WebSocketChannleEvents.WEBSOCKET_CLIENT_CONNECTED, { webSocketClientId: ws.id });
        ws.emit(ProtocolMesssages.Time, Math.round(Date.now() / 1000.0));
        ws.on(ProtocolMesssages.is, (data: any) => this.onIsEventHandler.call(this, ws, data));
        setTimeout(() => ws.emit(ProtocolMesssages.Who, ''), 1000);
        ws.on('disconnect', () => {
            this.emitter.emit(WebSocketChannleEvents.WEBSOCKET_CLIENT_DISCONNECTED, { webSocketClientId: ws.id, clientId: 'Unknown' });
            // TODO: test code
            ws.emit(ProtocolMesssages.Time, Math.round(Date.now() / 1000.0));
            setTimeout(() => ws.emit(ProtocolMesssages.Who, ''), 2000);
        });
    }

    private onIsEventHandler(ws: io.Socket, data: any): void {
        let mac: string = data.mac ? data.mac : '';
        let clientId: string = data.clientId ? data.clientId.toString() : '';
        let token: string = data.code ? data.code.toString() : '';
        let result: AntiTheftSystemResponse<void> = this.ats.validateClient(clientId, token);

        if(!result.success) {
            this.emitter.emit(WebSocketChannleEvents.NOT_AUTHORIZED_WEBSOCKET_CLIENT, { webSocketClientId: ws.id });
            ws.disconnect(true);
            return;
        }

        let authEventData: WebSocketChannelEventData<any> = { webSocketClientId: ws.id, clientId: clientId, data: { mac: mac } };
        this.emitter.emit(WebSocketChannleEvents.AUTHORIZED_WEBSOCKET_CLIENT, authEventData);
        this.socket.emit(this.eventsId[AntiTheftSystemEvents.CLIENT_ONLINE], { clientId: clientId, mac: mac });

        // TODO: if display app send Events and Sensors
        ws.emit(ProtocolMesssages.Events, this.eventsId);
        ws.emit(ProtocolMesssages.Sensors, this.sensors);
        // let updateTimeInterval: NodeJS.Timer = setInterval(() => ws.emit('Time', Math.round(Date.now() / 1000.0)), 60000 * 30) // 30 minutes
        
        // if sensor client
        ws.on(ProtocolMesssages.state, (data) => {
            if(data.sensors && Array.isArray(data.sensors)) {
                data.sensors.forEach((s: any) => {
                    if(s.pin >= 0 && s.value >= 0) {
                        let eventData: WebSocketChannelEventData<StateEventData> = {
                            webSocketClientId: ws.id,
                            clientId: clientId,
                            data: { sensor: { location: { mac: mac, pin: s.pin }, value: s.value } }
                        };
                        this.emitter.emit(WebSocketChannleEvents.WEBSOCKET_CLIENT_STATE, eventData);
                    }
                });
            }
        });

        ws.on(ProtocolMesssages.command, (data) => {
            // TODO: send command to ats
            console.log('command => ', data);
            let eventData: WebSocketChannelEventData<any> = {
                webSocketClientId: ws.id,
                clientId: clientId,
                data: data
            };
            this.emitter.emit(WebSocketChannleEvents.WEBSOCKET_CLIENT_COMMAND, eventData);
        });

        ws.on('disconnect', () => {
            // clearInterval(updateTimeInterval);
            let eventData: WebSocketChannelEventData<any> = {
                webSocketClientId: ws.id,
                clientId: clientId,
                data: data
            };
            this.emitter.emit(WebSocketChannleEvents.WEBSOCKET_CLIENT_DISCONNECTED, eventData);
            this.socket.emit(this.eventsId[AntiTheftSystemEvents.CLIENT_OFFLINE], { clientId: clientId, mac: mac });
            // TODO: emit event and implement handler
        });
    }

    private onSystemEventHandler(eventId: string, data: AntiTheftSystemEventData): void {
        let event = this.eventsId[eventId];
        if(event) {
            let payload: string = this.getPayload(data);
            this.socket.emit(event, payload);
        }
    }

    private configureEventsId(): void {
        let index = -1;
        AntiTheftSystemEvents.eventsList().forEach((event: string, i: number) => {
            this.eventsId[event] = (++index).toString();
        });
    }

    private configureSensors(): void {
        let res: AntiTheftSystemResponse<AntiTheftSystemConfig> = this.ats.getConfig();
        if(res.data) {
            this.sensors = res.data.sensors;
            if (res.data.sensors.length > 0) {
                res.data.sensors.forEach((s: Sensor) => {
                    this.sensors.push(s);
                });
            }
        }
    }

    private getPayload(data: AntiTheftSystemEventData): string {
        let payload = '';
        let s = data.system;
        if(s) {
            payload = `${s.state}${s.mode || 0}`;
            if (s.leftTime > 0) {
                let leftTimeout = Math.round((s.leftTime - s.uptime) / 1000);
                payload += Conversions.leftpad(leftTimeout.toString(32).toUpperCase(), 2, '0');
            } else {
                payload += '00';
            }
            if(s.activedSensors.length > 0) {
                payload += Conversions.leftpad(s.activedSensors.length.toString(32).toUpperCase(), 2, '0');
            } else {
                payload += '00';
            }
            s.activedSensors.forEach((sensor: Sensor, i: number) => {
                this.sensors.forEach((s: Sensor, i: number) => {
                    if(SensorLocation.equals(s.location, sensor.location)) {
                        payload += Conversions.leftpad(i.toString(32).toUpperCase(), 2, '0');
                        return;
                    }
                });
            });
        }
        return payload;
    }

    public on(event: string, listener: (... args: any[]) => void): void {
        this.emitter.addListener(event, listener);
    }

}