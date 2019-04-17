import * as winston from 'winston';
import { AntiTheftSystemAPI } from "../AntiTheftSystemAPI";
import { AntiTheftSystemEvents } from "../AntiTheftSystemEvents";
import { WebSocketChannelEventData } from "../channels/WebSocketChannel";
import { Logger } from "../utils/Logger";

export class ClientsEventHandler {

    private logger: winston.Logger;

    private timers: { [clientId: string]: NodeJS.Timer } = {};

    constructor(private antiTheftSystem: AntiTheftSystemAPI) {
        this.logger = Logger.getLogger('ClientsEventHandler');
        this.antiTheftSystem.on(AntiTheftSystemEvents.CLIENT_ONLINE, this.clientOnlineHandler.bind(this));
        this.antiTheftSystem.on(AntiTheftSystemEvents.CLIENT_OFFLINE, this.clientOfflineHandler.bind(this));
    }

    private clientOnlineHandler(data: WebSocketChannelEventData<any>): void {
        // TODO
        this.logger.info(`Client "${data.clientId}" is ONLINE`);

        if (this.timers[data.clientId]) {
            clearTimeout(this.timers[data.clientId]);
        }
    }

    private clientOfflineHandler(data: WebSocketChannelEventData<any>): void {
        // TODO
        // this.logger.info(`Client "${data.clientId}" is OFFLINE`);

        if (this.timers[data.clientId]) {
            clearTimeout(this.timers[data.clientId]);
        }
        this.timers[data.clientId] = setTimeout(() => {
            console.log(`Sending notification: Client ${data.clientId} is OFFLINE`);
        }, 30000);
    }

}