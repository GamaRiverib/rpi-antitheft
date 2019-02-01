import { Sensor, SensorLocation } from "./Sensor";
import { AntiTheftSystemArmedModes } from "./AntiTheftSystemArmedModes";
import { AntiTheftSystemResponse } from "./AntiTheftSystemResponse";
import { SystemState } from "./SystemState";
import { AntiTheftSystemConfig } from "./AntiTheftSystemConfig";
import { WebSocketChannel } from "./channels/WebSocketChannel";

export interface AntiTheftSystemAPI {
    on(event: string, listener: (... args: any[]) => void): void;
    getState(): AntiTheftSystemResponse<SystemState>;
    getConfig(): AntiTheftSystemResponse<AntiTheftSystemConfig>;
    getOwnerPhones(): AntiTheftSystemResponse<string[]>;
    getOwnerEmails(): AntiTheftSystemResponse<string[]>;
    bypassOne(location: SensorLocation, code?: string): AntiTheftSystemResponse<void>;
    bypassAll(locations: SensorLocation[], code?: string): AntiTheftSystemResponse<void>;
    clearBypass(code?: string): AntiTheftSystemResponse<void>;
    arm(mode: AntiTheftSystemArmedModes, code?: string): AntiTheftSystemResponse<void>;
    disarm(code: string): AntiTheftSystemResponse<void>;
    validateClient(clientId: string, token: string): AntiTheftSystemResponse<void>;

    addWebSocketChannel(channel: WebSocketChannel): void;
}

export interface AntiTheftSystemProgrammingAPI {
    on(event: string, listener: (... args: any[]) => void): void;
    setGuestCode(ownerCode: string, guestCode: string): AntiTheftSystemResponse<void>;
    updateOwnerCode(currentCode: string, newCode: string): AntiTheftSystemResponse<void>;
    updateAdminCode(currentCode: string, newcode: string): AntiTheftSystemResponse<void>;
    setProgrammingMode(adminCode: string): AntiTheftSystemResponse<void>;
    unsetProgrammingMode(): AntiTheftSystemResponse<void>;
    setSensor(sensor: Sensor): AntiTheftSystemResponse<void>;
    unsetSensor(location: SensorLocation): AntiTheftSystemResponse<void>;
    setEntryTime(seconds: number, code?: string): AntiTheftSystemResponse<void>;
    setExitTime(seconds: number, code?: string): AntiTheftSystemResponse<void>;
    turnOnBeep(code?: string): AntiTheftSystemResponse<void>;
    turnOffBeep(code?: string): AntiTheftSystemResponse<void>;
    toggleBeep(code?: string): AntiTheftSystemResponse<void>;
    turnOnSilentAlarm(code?: string): AntiTheftSystemResponse<void>;
    turnOffSilentAlarm(code?: string): AntiTheftSystemResponse<void>;
    toggleSilentAlarm(code?: string): AntiTheftSystemResponse<void>;
    getCentralPhone(): AntiTheftSystemResponse<string>;
    setCentralPhone(phone: string): AntiTheftSystemResponse<void>;
    unsetCentralPhone(): AntiTheftSystemResponse<void>;
    getAdminPhone(): AntiTheftSystemResponse<string>;
    setAdminPhone(phone: string): AntiTheftSystemResponse<void>;
    unsetAdminPhone(): AntiTheftSystemResponse<void>;
    getOwnerPhones(): AntiTheftSystemResponse<string[]>;
    addOwnerPhone(phone: string, code?: string): AntiTheftSystemResponse<void>;
    updateOwnerPhone(index: number, phone: string, code?: string): AntiTheftSystemResponse<void>;
    deleteOwnerPhone(index: number, code?: string): AntiTheftSystemResponse<void>;
    getCentralEmail(): AntiTheftSystemResponse<string>;
    setCentralEmail(email: string): AntiTheftSystemResponse<void>;
    unsetCentralEmail(): AntiTheftSystemResponse<void>;
    getAdminEmail(): AntiTheftSystemResponse<string>;
    setAdminEmail(email: string): AntiTheftSystemResponse<void>;
    unsetAdminEmail(): AntiTheftSystemResponse<void>;
    getOwnerEmails(): AntiTheftSystemResponse<string[]>;
    addOwnerEmail(email: string, code?: string): AntiTheftSystemResponse<void>;
    updateOwnerEmail(index: number, email: string, code?: string): AntiTheftSystemResponse<void>;
    deleteOwnerEmail(index: number, code?: string): AntiTheftSystemResponse<void>;
    generateSecret(): AntiTheftSystemResponse<string>;
    validateClient(clientId: string, token: string): AntiTheftSystemResponse<void>;
}