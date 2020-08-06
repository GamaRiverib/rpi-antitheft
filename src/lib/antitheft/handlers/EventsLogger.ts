import winston = require("winston");
import { AntiTheftSystemAPI } from "../AntiTheftSystemAPI";
import { AntiTheftSystemEventData } from "../AntiTheftSystemEvents";
import { getLogger } from "../../utils/Logger";

export class EventsLogger {

    private logger: winston.Logger;

    constructor(private antiTheftSystem: AntiTheftSystemAPI, events: string[]) {
        this.logger = getLogger("SystemEvents");
        events.forEach((event: string, i: number) => {
            const self = this;
            this.antiTheftSystem.on(event, (data: AntiTheftSystemEventData) => self.logger.info(event, { data }));
        });
    }
}
