import { AntiTheftSystemAPI } from '../AntiTheftSystemAPI';
import { Sensor } from '../Sensor';

import { AntiTheftSystemEvents, AntiTheftSystemEventData } from '../AntiTheftSystemEvents';

import { Conversions } from '../utils/Conversions';

import { Server } from 'http';

import * as io from 'socket.io';
import { AntiTheftSystemResponse } from '../AntiTheftSystemResponse';
import { AntiTheftSystemConfig } from '../AntiTheftSystemConfig';

export class WebSocketChannel {
    
    private static INSTANCE: WebSocketChannel = null;

    private socket: io.Server;

    private eventsId: { [event: string]: string } = {};

    private sensors: Sensor[] = [];

    private constructor(private ats: AntiTheftSystemAPI, private server: Server) {

        this.configureEventsId();
        this.configureSensors();

        this.socket = io.listen(this.server);
    
        this.socket.on('connection', (ws: io.Socket) => {
            console.log(`[WebSocketChannel] Client ${ws.id} connected`);
            ws.emit('Time', Math.round(Date.now() / 1000.0));
            ws.on('is', (data: any) => {
                console.log(data); 
                let clientId: string = data.clientId ? data.clientId.toString() : '';
                let token: string = data.code ? data.code.toString() : '';
                let result: AntiTheftSystemResponse<void> = ats.validateClient(clientId, token);
                if(!result.success) {
                    // TODO: emit unauthorized event and implement handler
                    console.log(`Unauthorized client: ${clientId}`);
                    ws.disconnect(true);
                    return;
                }
                
                // TODO: if display app send Events and Sensors
                ws.emit('Events', this.eventsId); // .send(this.eventsId);
                ws.emit('Sensors', this.sensors);
                
                // if sensor client
                ws.on('state', (data) => {
                    // TODO: send state to ats
                    console.log(data);
                });
            });
            setTimeout(() => ws.emit('Who', ''), 2000);
            ws.on('disconnect', () => {
                console.log(`[WebSocketChannel] Client ${ws.id} disconnected`);
                // TODO: emit event and implement handler
            });
        });

        this.ats.on(AntiTheftSystemEvents.SYSTEM_ALERT, (data: AntiTheftSystemEventData) => {
            let event = this.eventsId[AntiTheftSystemEvents.SYSTEM_ALERT];
            if(event) {
                let payload: string = this.getPayload(data);
                this.socket.emit(event, payload);
            }
        });
        this.ats.on(AntiTheftSystemEvents.SYSTEM_ALARMED, (data: AntiTheftSystemEventData) => {
            let event = this.eventsId[AntiTheftSystemEvents.SYSTEM_ALARMED];
            if(event) {
                let payload: string = this.getPayload(data);
                this.socket.emit(event, payload);
            }
        });
        this.ats.on(AntiTheftSystemEvents.SYSTEM_ARMED, (data: AntiTheftSystemEventData) => {
            let event = this.eventsId[AntiTheftSystemEvents.SYSTEM_ARMED];
            if(event) {
                let payload: string = this.getPayload(data);
                this.socket.emit(event, payload);
            }
        });
        this.ats.on(AntiTheftSystemEvents.SYSTEM_DISARMED, (data: AntiTheftSystemEventData) => {
            let event = this.eventsId[AntiTheftSystemEvents.SYSTEM_DISARMED];
            if(event) {
                let payload: string = this.getPayload(data);
                this.socket.emit(event, payload);
            }
        });
        this.ats.on(AntiTheftSystemEvents.SYSTEM_STATE_CHANGED, (data: AntiTheftSystemEventData) => {
            let event = this.eventsId[AntiTheftSystemEvents.SYSTEM_STATE_CHANGED];
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
        AntiTheftSystemEvents.eventsList().forEach((event: string, i: number) => {
            this.eventsId[event] = (++index).toString();
        });
    }

    private configureSensors(): void {
        let res: AntiTheftSystemResponse<AntiTheftSystemConfig> = this.ats.getConfig();
        this.sensors = res.data.sensors;
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
                payload += Conversions.leftpad(sensor.location.pin.toString(32).toUpperCase(), 2, '0');
            });
        }
        return payload;
    }

}