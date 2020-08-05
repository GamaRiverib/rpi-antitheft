import { EventEmitter } from 'events';

import winston = require('winston');

import { AntiTheftSystemAPI } from '../AntiTheftSystemAPI';
import { Sensor } from '../Sensor';
import { SensorLocation } from '../SensorLocation';

import { AntiTheftSystemEvents, AntiTheftSystemEventData, SensorActivedEventData, ClientEventData } from '../AntiTheftSystemEvents';

import { Conversions } from '../../utils/Conversions';

import { Server } from 'http';

import * as io from 'socket.io';
import { AntiTheftSystemResponse } from '../AntiTheftSystemResponse';
import { AntiTheftSystemConfig } from '../AntiTheftSystemConfig';
import { AntiTheftSystemErrors } from '../AntiTheftSystemErrors';
import { getLogger } from '../../utils/Logger';

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

// tslint:disable-next-line: max-classes-per-file
export class WebSocketChannel {

    private static INSTANCE: WebSocketChannel = null;

    private emitter: EventEmitter;

    private socket: io.Server;

    private eventsId: { [event: string]: string } = {};

    private sensors: Sensor[] = [];

    private logger: winston.Logger;

    private onlineClients: { wsId: string, clientId: string, mac: string}[] = [];

    private constructor(private ats: AntiTheftSystemAPI, private server: Server) {

        this.logger = getLogger('WebSocketChannel');

        this.configureEventsId();
        this.configureSensors();

        this.emitter = new EventEmitter();

        this.socket = io.listen(this.server);

        this.socket.on('connection', this.onConnectionEventHandler.bind(this));

        this.setupAtsEvents();

        this.setupOwnEvents();
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

    private setupAtsEvents(): void {
        this.ats.on(AntiTheftSystemEvents.SENSOR_ACTIVED, (data: SensorActivedEventData) => {
            const payload: { value: 0 | 1, sensor: number } = { value: data.value, sensor: -1 };
            this.sensors.forEach((s: Sensor, i: number) => {
                if(SensorLocation.equals(s.location, data.sensor.location)) {
                    payload.sensor = i;
                    return;
                }
            });
            this.socket.emit(this.eventsId[AntiTheftSystemEvents.SENSOR_ACTIVED], payload);
        });

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

        this.ats.on(AntiTheftSystemEvents.MAX_ALERTS, (data: AntiTheftSystemEventData) =>
            this.onSystemEventHandler.call(this, AntiTheftSystemEvents.MAX_ALERTS, data));

        this.ats.on(AntiTheftSystemEvents.MAX_UNAUTHORIZED_INTENTS, (data: AntiTheftSystemEventData) =>
            this.onSystemEventHandler.call(this, AntiTheftSystemEvents.MAX_UNAUTHORIZED_INTENTS, data));

        this.ats.on(AntiTheftSystemEvents.BYPASS_CHANGE, (data: AntiTheftSystemEventData) =>
            this.updateSensors.call(this));

        this.ats.on(AntiTheftSystemEvents.SENSOR_REGISTERED, (data: AntiTheftSystemEventData) =>
            this.updateSensors.call(this));

        this.ats.on(AntiTheftSystemEvents.SENSOR_CHANGED, (data: AntiTheftSystemEventData) =>
            this.updateSensors.call(this));

        this.ats.on(AntiTheftSystemEvents.SENSOR_DELETED, (data: AntiTheftSystemEventData) =>
            this.updateSensors.call(this));

        this.ats.on(AntiTheftSystemEvents.CLIENT_ONLINE, (data: ClientEventData) => {
            if(data.mac) {
                this.updateSensors();
            }
        });

        this.ats.on(AntiTheftSystemEvents.CLIENT_OFFLINE, (data: ClientEventData) =>  {
            if(data.mac) {
                this.updateSensors();
            }
        });

    }

    private setupOwnEvents(): void {
        const logger = this.logger;
        const notAuthorizedClientList: { [clientId: string]: Date } = {};
        this.emitter.on(WebSocketChannleEvents.NOT_AUTHORIZED_WEBSOCKET_CLIENT, (data: WebSocketChannelEventData<any>) => {
            if (!notAuthorizedClientList[data.clientId]) {
                notAuthorizedClientList[data.clientId] = new Date();
                logger.error(`Not Authorized Client`, { data });
            } else if (Date.now() - notAuthorizedClientList[data.clientId].getTime() > 60000 * 5) {
                logger.error(`Not Authorized Client`, { data });
                notAuthorizedClientList[data.clientId] = new Date();
            }
        });
    }

    private onConnectionEventHandler(ws: io.Socket): void {
        this.emitter.emit(WebSocketChannleEvents.WEBSOCKET_CLIENT_CONNECTED, { webSocketClientId: ws.id });
        ws.emit(ProtocolMesssages.Time, Math.round(Date.now() / 1000.0));
        ws.on(ProtocolMesssages.is, (data: any) => this.onIsEventHandler.call(this, ws, data));
        setTimeout(() => ws.emit(ProtocolMesssages.Who, ''), 1000);
        /* ws.on('disconnect', () => {
            this.emitter.emit(WebSocketChannleEvents.WEBSOCKET_CLIENT_DISCONNECTED, { webSocketClientId: ws.id, clientId: 'Unknown' });
            ws.emit(ProtocolMesssages.Time, Math.round(Date.now() / 1000.0));
            setTimeout(() => ws.emit(ProtocolMesssages.Who, ''), 2000);
        }); */
    }

    private onIsEventHandler(ws: io.Socket, data: any): void {
        const mac: string = data.mac ? data.mac : '';
        const clientId: string = data.clientId ? data.clientId.toString() : '';
        const token: string = data.code ? data.code.toString() : '';

        const result: AntiTheftSystemResponse<void> = this.ats.validateClient(clientId, token);

        const authEventData: WebSocketChannelEventData<any> = { webSocketClientId: ws.id, clientId, data: { mac } };

        if(!result.success) {
            if(result.error && result.error === AntiTheftSystemErrors.NOT_AUTHORIZED) {
                this.emitter.emit(WebSocketChannleEvents.NOT_AUTHORIZED_WEBSOCKET_CLIENT, authEventData);
            }
            ws.disconnect(true);
            return;
        }

        this.onlineClients.push({ wsId: ws.id, clientId, mac });
        this.emitter.emit(WebSocketChannleEvents.AUTHORIZED_WEBSOCKET_CLIENT, authEventData);
        this.socket.emit(this.eventsId[AntiTheftSystemEvents.CLIENT_ONLINE], { clientId: clientId });
        ws.emit(ProtocolMesssages.Events, this.eventsId);

        // ws.emit(ProtocolMesssages.Sensors, this.sensors);
        // let updateTimeInterval: NodeJS.Timer = setInterval(() => ws.emit('Time', Math.round(Date.now() / 1000.0)), 60000 * 30) // 30 minutes
        // if sensor client
        ws.on(ProtocolMesssages.state, (stateEventData: { sensors: any[]; }) => {
            if(stateEventData.sensors && Array.isArray(stateEventData.sensors)) {
                stateEventData.sensors.forEach((s: any) => {
                    if(s.pin >= 0 && s.value >= 0) {
                        const eventData: WebSocketChannelEventData<StateEventData> = {
                            webSocketClientId: ws.id,
                            clientId,
                            data: { sensor: { location: { mac, pin: s.pin }, value: s.value } }
                        };
                        this.emitter.emit(WebSocketChannleEvents.WEBSOCKET_CLIENT_STATE, eventData);
                    }
                });
            }
        });

        ws.on(ProtocolMesssages.command, (commandEventData: any) => {
            // TODO: send command to ats
            console.log('command => ', commandEventData);
            const eventData: WebSocketChannelEventData<any> = {
                webSocketClientId: ws.id,
                clientId,
                data: commandEventData
            };
            this.emitter.emit(WebSocketChannleEvents.WEBSOCKET_CLIENT_COMMAND, eventData);
        });

        ws.on('disconnect', () => {
            // clearInterval(updateTimeInterval);
            let index: number;
            this.onlineClients.forEach((client: {wsId: string, clientId: string, mac: string}, i: number) => {
                if (client.wsId === ws.id) {
                    index = i;
                    return;
                }
            });

            if(index) {
                this.onlineClients.splice(index, 1);
            }

            this.emitter.emit(WebSocketChannleEvents.WEBSOCKET_CLIENT_DISCONNECTED, authEventData);
            this.socket.emit(this.eventsId[AntiTheftSystemEvents.CLIENT_OFFLINE], { clientId, mac });
        });
    }

    private onSystemEventHandler(eventId: string, data: AntiTheftSystemEventData): void {
        const event = this.eventsId[eventId];
        if(event) {
            const payload: string = this.getPayload(data);
            this.socket.emit(event, payload);
        }
    }

    private configureEventsId(): void {
        let index = -1;
        AntiTheftSystemEvents.eventsList().forEach((event: string, i: number) => {
            this.eventsId[event] = (++index).toString();
        });
    }

    private updateSensors(): void {
        this.configureSensors();
        this.socket.emit(ProtocolMesssages.Sensors, this.sensors);
    }

    private configureSensors(): void {
        const res: AntiTheftSystemResponse<AntiTheftSystemConfig> = this.ats.getConfig();
        if(res.data) {
            const bypass: SensorLocation[] = res.data.bypass || [];
            if (res.data.sensors.length > 0) {
                this.sensors = [];
                res.data.sensors.forEach((s: Sensor) => {
                    let found: boolean = false;
                    bypass.forEach((l: SensorLocation) => {
                        if(SensorLocation.equals(l, s.location)) {
                            found = true;
                            return;
                        }
                    });
                    const sensorData: any = Object.assign({}, s, { bypass: found });
                    this.sensors.push(sensorData);
                });
            }
        }
    }

    private getPayload(data: AntiTheftSystemEventData): string {
        let payload = '';
        const systemState = data.system;
        if(systemState) {
            payload = `${systemState.state}${systemState.mode || 0}`;
            if (systemState.leftTime > 0) {
                const leftTimeout = Math.round((systemState.leftTime - systemState.uptime) / 1000);
                payload += Conversions.leftpad(leftTimeout.toString(32).toUpperCase(), 2, '0');
            } else {
                payload += '00';
            }
            if(systemState.activedSensors.length > 0) {
                payload += Conversions.leftpad(systemState.activedSensors.length.toString(32).toUpperCase(), 2, '0');
            } else {
                payload += '00';
            }
            systemState.activedSensors.forEach((sensor: Sensor) => {
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
