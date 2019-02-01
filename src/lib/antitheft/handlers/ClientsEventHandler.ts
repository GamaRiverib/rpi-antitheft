import { AntiTheftSystemAPI } from "../AntiTheftSystemAPI";
import { AntiTheftSystemEvents } from "../AntiTheftSystemEvents";
import { WebSocketChannelEventData } from "../channels/WebSocketChannel";
import { Logger } from "../utils/Logger";

export class ClientsEventHandler {

    constructor(private antiTheftSystem: AntiTheftSystemAPI) {
        this.antiTheftSystem.on(AntiTheftSystemEvents.CLIENT_ONLINE, this.clientOnlineHandler.bind(this));
        this.antiTheftSystem.on(AntiTheftSystemEvents.CLIENT_OFFLINE, this.clientOfflineHandler.bind(this));
    }

    private clientOnlineHandler(data: WebSocketChannelEventData<any>): void {
        // TODO
        Logger.log(`Client "${data.clientId}" is ONLINE`);
    }

    private clientOfflineHandler(data: WebSocketChannelEventData<any>): void {
        // TODO
        Logger.log(`Client "${data.clientId}" is OFFLINE`);
    }

}