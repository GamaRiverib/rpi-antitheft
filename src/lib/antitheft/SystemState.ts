import { AntiTheftSystemStates } from "./AntiTheftSystemStates";
import { AntiTheftSystemArmedModes } from "./AntiTheftSystemArmedModes";
import { Sensor } from "./Sensor";

export interface SystemState {
    state: AntiTheftSystemStates;
    mode: AntiTheftSystemArmedModes;
    activedSensors: Sensor[];
    uptime: number;
}