import { AntiTheftSystemStates } from "./AntiTheftSystemStates";
import { AntiTheftSystemArmedModes } from "./AntiTheftSystemArmedModes";
import { Sensor } from "./Sensor";
import { SensorLocation } from "./SensorLocation";

export interface AntiTheftSystemConfig {
    state: AntiTheftSystemStates;
    mode?: AntiTheftSystemArmedModes;
    lookouted?: number;
    sensors: Sensor[];
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
    clients: { [id: string]: {
        secret: string,
        mac?: string
    } };
}
