import winston = require("winston");
import { AntiTheftSystemAPI } from "../AntiTheftSystemAPI";
import { AntiTheftSystemEvents, ClientEventData } from "../AntiTheftSystemEvents";
import { getLogger } from "../../utils/Logger";

export class ClientsEventHandler {

    private logger: winston.Logger;

    constructor(private antiTheftSystem: AntiTheftSystemAPI) {
        this.logger = getLogger("ClientsEventHandler");
        this.antiTheftSystem.on(AntiTheftSystemEvents.CLIENT_ONLINE, this.clientOnlineHandler.bind(this));
        this.antiTheftSystem.on(AntiTheftSystemEvents.CLIENT_OFFLINE, this.clientOfflineHandler.bind(this));
    }

    private clientOnlineHandler(data: ClientEventData): void {
        // TODO
        this.logger.info(`Client "${data.clientId}" is ONLINE`);
    }

    private clientOfflineHandler(data: ClientEventData): void {
        // TODO
         this.logger.info(`Client "${data.clientId}" is OFFLINE`);
    }

}