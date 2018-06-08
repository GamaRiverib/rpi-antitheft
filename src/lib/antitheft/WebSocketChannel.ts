import { AntiTheftSystemAPI } from "./AntiTheftSystemAPI";
import { AntiTheftSystem } from "./AntiTheftSystem";
import { Server } from "http";

import * as io from 'socket.io';

export class WebSocketChannel {
    
    private static instance: WebSocketChannel = null;

    private socket: io.Server;

    private constructor(private ats: AntiTheftSystemAPI, private server: Server) {
        this.socket = io.listen(this.server);
    
        this.socket.on('connection', (ws) => {
            console.log('New web socket client');
        });

        this.ats.on(AntiTheftSystem.Events.ALERT, () => {
            this.socket.emit(AntiTheftSystem.Events.ALERT);
        });
        this.ats.on(AntiTheftSystem.Events.SENSOR_ACTIVED, (data) => {
            this.socket.emit(AntiTheftSystem.Events.SENSOR_ACTIVED, data);
        });
        this.ats.on(AntiTheftSystem.Events.SIREN_ACTIVED, () => {
            this.socket.emit(AntiTheftSystem.Events.SIREN_ACTIVED);
        });
        this.ats.on(AntiTheftSystem.Events.SIREN_SILENCED, () => {
            this.socket.emit(AntiTheftSystem.Events.SIREN_SILENCED);
        });
        this.ats.on(AntiTheftSystem.Events.SYSTEM_ALARMED, (data) => {
            this.socket.emit(AntiTheftSystem.Events.SYSTEM_ALARMED, data);
        });
        this.ats.on(AntiTheftSystem.Events.SYSTEM_ARMED, (data) => {
            this.socket.emit(AntiTheftSystem.Events.SYSTEM_ARMED, data);
        });
        this.ats.on(AntiTheftSystem.Events.SYSTEM_DISARMED, () => {
            this.socket.emit(AntiTheftSystem.Events.SYSTEM_DISARMED);
        });
        this.ats.on(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, (data) => {
            this.socket.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, data);
        });
    }

    public static start(ats: AntiTheftSystemAPI, server: Server): void {
        if (WebSocketChannel.instance == null) {
            WebSocketChannel.instance = new WebSocketChannel(ats, server);
        }
    }

    public static stop(): void {
        WebSocketChannel.instance.socket.close(() => {
            WebSocketChannel.instance = null;
        });
    }

}