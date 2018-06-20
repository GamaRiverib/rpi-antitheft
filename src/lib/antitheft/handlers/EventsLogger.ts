import { AntiTheftSystemAPI } from '../AntiTheftSystemAPI';
import { AntiTheftSystemEvents, AntiTheftSystemEventData } from '../AntiTheftSystemEvents';
import { Logger } from '../utils/Logger';

export class EventsLogger {

    constructor(private antiTheftSystem: AntiTheftSystemAPI, events: string[]) {
        events.forEach((event: string, i: number) => {
            this.antiTheftSystem.on(event, (data: AntiTheftSystemEventData) => Logger.log(event, data));
        });
    }
}