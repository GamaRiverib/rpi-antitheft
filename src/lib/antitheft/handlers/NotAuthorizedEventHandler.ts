import { EventEmitter } from "events";
import { AntiTheftSystemEventData, AntiTheftSystemEvents } from "../AntiTheftSystemEvents";
import { AntiTheftSystemAPI } from "../AntiTheftSystemAPI";

export interface MaxUnAuthorizedIntentsEventData {
    intents: Date[]
}

export class NotAuthorizedEventHandler {

    private emitter: EventEmitter;

    private maxUnauthorizedIntentCount = 10;

    private windowUnauthorizedIntentLength = 60000; // 1 min = 60,000 ms

    private unauthorizedIntents: Date[] = [];

    constructor(private antiTheftSystem: AntiTheftSystemAPI) {
        this.emitter = new EventEmitter();
        this.antiTheftSystem.on(AntiTheftSystemEvents.NOT_AUTHORIZED, this.handle.bind(this));
    }

    private handle(data: AntiTheftSystemEventData): void {
        this.unauthorizedIntents.push(new Date());
        const now = Date.now();
        const intents: Date[] = [];
        this.unauthorizedIntents.forEach((intent: Date, index: number) => {
            if(now - intent.getTime() < this.windowUnauthorizedIntentLength) {
                intents.push(intent);
            }
        });
        this.unauthorizedIntents = intents;
        if (this.unauthorizedIntents.length > this.maxUnauthorizedIntentCount) {
            const eventData: MaxUnAuthorizedIntentsEventData = { intents: this.unauthorizedIntents };
            this.emitter.emit(AntiTheftSystemEvents.MAX_UNAUTHORIZED_INTENTS, eventData);
        }
    }

    public setMax(max: number): void {
        if (max > 0) {
            this.maxUnauthorizedIntentCount = max;
        }
    }

    public getMax(): number {
        return this.maxUnauthorizedIntentCount;
    }

    public setWindow(len: number): void {
        if(len >= 1000) {
            this.windowUnauthorizedIntentLength = len;
        }
    }

    public getWindow(): number {
        return this.windowUnauthorizedIntentLength;
    }

    public getUnauthorizedIntents(): Date[] {
        return this.unauthorizedIntents;
    }

    public onMaxUnauthorizedIntents(listener: (data: MaxUnAuthorizedIntentsEventData) => void): void {
        this.emitter.on(AntiTheftSystemEvents.MAX_UNAUTHORIZED_INTENTS, listener);
    }

}
