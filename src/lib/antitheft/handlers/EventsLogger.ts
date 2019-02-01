import * as winston from 'winston';
import { AntiTheftSystemAPI } from '../AntiTheftSystemAPI';
import { AntiTheftSystemEvents, AntiTheftSystemEventData } from '../AntiTheftSystemEvents';
import { Logger } from '../utils/Logger';

export class EventsLogger {

    private logger: winston.Logger;

    constructor(private antiTheftSystem: AntiTheftSystemAPI, events: string[]) {
        this.logger = Logger.getLogger('SystemEvents');
        events.forEach((event: string, i: number) => {
            let self = this;
            this.antiTheftSystem.on(event, (data: AntiTheftSystemEventData) => self.logger.info(event, { data: data }));
        });
    }
}