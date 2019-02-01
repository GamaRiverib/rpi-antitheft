import { AntiTheftSystemStates } from "./AntiTheftSystemStates";
import { AntiTheftSystemArmedModes } from "./AntiTheftSystemArmedModes";
import { Sensor, SensorLocation, SensorWebSocket } from "./Sensor";

export interface AntiTheftSystemConfig {
    sirenPin: number;
    state: AntiTheftSystemStates;
    mode?: AntiTheftSystemArmedModes;
    lookouted?: number;
    sensors: Sensor[];
    sensorsWebSocket: SensorWebSocket[];
    bypass: SensorLocation[]; // Stay?
    codes: {
        guest?: string,
        owner: string,
        admin: string
    };
    entryTime: number; // seconds
    exitTime: number; // seconds
    beep: boolean;
    silentAlarm: boolean;
    phones: {
        central?: string,
        owner: string[],
        admin?: string
    };
    emails: {
        central?: string,
        owner: string[],
        admin?: string
    },
    systemWasAlarmed: boolean;
    clients: { [id: string]: string };
}