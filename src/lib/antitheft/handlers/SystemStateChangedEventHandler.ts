import { AntiTheftSystemAPI } from "../AntiTheftSystemAPI";
import { AntiTheftSystemEvents, AntiTheftSystemEventData } from "../AntiTheftSystemEvents";

export class SystemStateChangedEventHandler {

    private lastStateChange: Date = null;

    constructor(private antiTheftSystem: AntiTheftSystemAPI) {
        this.antiTheftSystem.on(AntiTheftSystemEvents.SYSTEM_STATE_CHANGED, this.handle);
    }

    private handle(data: AntiTheftSystemEventData): void {
        this.lastStateChange = new Date();
    }

}
