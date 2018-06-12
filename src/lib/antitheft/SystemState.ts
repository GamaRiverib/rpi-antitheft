import { AntiTheftSystemStates } from "./AntiTheftSystemStates";
import { AntiTheftSystemArmedModes } from "./AntiTheftSystemArmedModes";
import { Sensor } from "./Sensor";

export interface SystemState {
    before: AntiTheftSystemStates;
    state: AntiTheftSystemStates;
    mode: AntiTheftSystemArmedModes;
    activedSensors: Sensor[];
    leftTime: number;
    uptime: number;
}