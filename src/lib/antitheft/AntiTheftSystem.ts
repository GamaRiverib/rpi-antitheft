import { Sensor, SensorLocation, SensorGroup } from './Sensor';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, watch } from 'fs';
import { Gpio } from 'onoff';

const configFilePath = './Config.json';

export enum AntiTheftSystemStates {
    READY = 0,
    DISARMED = 1,
    LEAVING = 2,
    ARMED = 3,
    ENTERING = 4,
    ALARMED = 5,
    PROGRAMMING = 6
}

export enum AntiTheftSystemArmedModes {
    AWAY = 0,
    STAY = 1,
    MAXIMUM = 2,
    NIGHT_STAY = 3,
    INSTANT = 4,
    CHIME = 5
}

export enum AntiTheftSystemErrors {
    INVALID_CODE_FORMAT = 1000,
    NOT_AUTHORIZED = 2000,
    INVALID_SYSTEM_STATE = 1001,
    INVALID_SENSOR_LOCATION = 1002,
    INVALID_ENTRY_TIME_VALUE = 1003,
    INVALID_EXIT_TIME_VALUE = 1004,
    INVALID_PHONE_FORMAT = 1005,
    INVALID_PHONE_POSITION = 1006,
    INVALID_EMAIL_FORMAT = 1007,
    INVALID_EMAIL_POSITION = 1008
}

export interface SystemState {
    state: AntiTheftSystemStates;
    mode: AntiTheftSystemArmedModes;
    activedSensors: Sensor[];
    uptime: number;
}

export interface AntiTheftSystemAPI {
    on(event: string, listener: (... args: any[]) => void): void;
    setGuestCode(ownerCode: string, guestCode: string): AntiTheftSystemResponse;
    updateOwnerCode(currentCode: string, newCode: string): AntiTheftSystemResponse;
    updateAdminCode(currentCode: string, newcode: string): AntiTheftSystemResponse;
    setProgrammingMode(adminCode: string): AntiTheftSystemResponse;
    unsetProgrammingMode(): AntiTheftSystemResponse;
    setSensor(sensor: Sensor): AntiTheftSystemResponse;
    unsetSensor(location: SensorLocation): AntiTheftSystemResponse;
    setEntryTime(seconds: number, code?: string): AntiTheftSystemResponse;
    setExitTime(seconds: number, code?: string): AntiTheftSystemResponse;
    turnOnBeep(code?: string): AntiTheftSystemResponse;
    turnOffBeep(code?: string): AntiTheftSystemResponse;
    toggleBeep(code?: string): AntiTheftSystemResponse;
    turnOnSilentAlarm(code?: string): AntiTheftSystemResponse;
    turnOffSilentAlarm(code?: string): AntiTheftSystemResponse;
    toggleSilentAlarm(code?: string): AntiTheftSystemResponse;
    setCentralPhone(phone: string): AntiTheftSystemResponse;
    unsetCentralPhone(): AntiTheftSystemResponse;
    setAdminPhone(phone: string): AntiTheftSystemResponse;
    unsetAdminPhone(): AntiTheftSystemResponse;
    addOwnerPhone(phone: string, code?: string): AntiTheftSystemResponse;
    updateOwnerPhone(index: number, phone: string, code?: string): AntiTheftSystemResponse;
    deleteOwnerPhone(index: number, code?: string): AntiTheftSystemResponse;
    setCentralEmail(email: string): AntiTheftSystemResponse;
    unsetCentralEmail(): AntiTheftSystemResponse;
    setAdminEmail(email: string): AntiTheftSystemResponse;
    unsetAdminEmail(): AntiTheftSystemResponse;
    addOwnerEmail(email: string, code?: string): AntiTheftSystemResponse;
    updateOwnerEmail(index: number, email: string, code?: string): AntiTheftSystemResponse;
    deleteOwnerEmail(index: number, code?: string): AntiTheftSystemResponse;
    getState(): AntiTheftSystemResponse;
    bypassOne(location: SensorLocation, code?: string): AntiTheftSystemResponse;
    bypassAll(locations: SensorLocation[], code?: string): AntiTheftSystemResponse;
    clearBypass(code?: string): AntiTheftSystemResponse;
    arm(mode: AntiTheftSystemArmedModes, code?: string): AntiTheftSystemResponse;
    disarm(code: string): AntiTheftSystemResponse;
}

export interface AntiTheftSystemConfig {
    sirenPin: number;
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
}

export interface AntiTheftSystemResponse {
    success: boolean;
    data?: any;
    message?: string;
    error?: AntiTheftSystemErrors
}

export class AntiTheftSystem implements AntiTheftSystemAPI {

    private static instance: AntiTheftSystem = null;

    private config: AntiTheftSystemConfig;

    private emitter: EventEmitter;

    private lastStateChange: Date = null;
    
    private programmingStateDuration = 60000 * 5; // 5 min

    private alarmedStateTimer: NodeJS.Timer;
    private alarmedStateDuration = 60000 * 0.5; // TODO: 3 min

    private maxUnauthorizedIntentCount = 10;
    private windowUnauthorizedIntentLength = 60000; // 1 min = 60,000 ms
    private unauthorizedIntents: Date[] = [];

    private maxAlertsCount = 5;
    private windowAlertsLength = 60000; // 1 min = 60, 000 ms
    private alerts: Date[] = [];

    private activatedSensors: Sensor[] = [];

    private siren: Gpio;

    public static readonly SensorGpios: [4, 17, 18, 27, 22, 23, 24, 25, 5, 6, 12, 13, 19, 16, 26, 20, 21];

    public static readonly Events = {
        NOT_AUTHORIZED: 'AntiTheftSystemEvent::NOT_AUTHORIZED',
        PIN_CODE_UPDATED: 'AntiTheftSystemEvent::PIN_CODE_UPDATED',
        SYSTEM_STATE_CHANGED: 'AntiTheftSystemEvent::SYSTEM_STATE_CHANGED',
        SENSOR_REGISTERED: 'AntiTheftSystemEvent::SENSOR_REGISTERED',
        SENSOR_CHANGED: 'AntiTheftSystemEvent::SENSOR_CHANGED',
        SENSOR_DELETED: 'AntiTheftSystemEvent::SENSOR_DELETED',
        SENSOR_ACTIVED: 'AntiTheftSystemEvent::SENSOR_ACTIVED',
        ENTRY_TIME_CHANGED: 'AntiTheftSystemEvent::ENTRY_TIME_CHANGED',
        EXIT_TIME_CHANGED: 'AntiTheftSystemEvent::EXIT_TIME_CHANGED',
        BEEP_CHANGED: 'AntiTheftSystemEvent::BEEP_CHANGED',
        SILENT_ALARM_CHANGED: 'AntiTheftSystemEvent::SILENT_ALARM_CHANGED',
        CENTRAL_PHONE_CHANGED: 'AntiTheftSystemEvent::CENTRAL_PHONE_CHANGED',
        ADMIN_PHONE_CHANGED: 'AntiTheftSystemEvent::ADMIN_PHONE_CHANGED',
        OWNER_PHONE_ADDED: 'AntiTheftSystemEvent::OWNER_PHONE_ADDED',
        OWNER_PHONE_CHANGED: 'AntiTheftSystemEvent::OWNER_PHONE_CHANGED',
        OWNER_PHONE_DELETED: 'AntiTheftSystemEvent::OWNER_PHONE_DELETED',
        CENTRAL_EMAIL_CHANGED: 'AntiTheftSystemEvent::CENTRAL_EMAIL_CHANGED',
        ADMIN_EMAIL_CHANGED: 'AntiTheftSystemEvent::ADMIN_EMAIL_CHANGED',
        OWNER_EMAIL_ADDED: 'AntiTheftSystemEvent::OWNER_EMAIL_ADDED',
        OWNER_EMAIL_CHANGED: 'AntiTheftSystemEvent::OWNER_EMAIL_CHANGED',
        OWNER_EMAIL_DELETED: 'AntiTheftSystemEvent::OWNER_EMAIL_DELETED',
        BYPASS_CHANGE: 'AntiTheftSystemEvent::BYPASS_CHANGE',
        SYSTEM_ARMED: 'AntiTheftSystemEvent::SYSTEM_ARMED',
        SYSTEM_DISARMED: 'AntiTheftSystemEvent::SYSTEM_DISARMED',
        SYSTEM_ALARMED: 'AntiTheftSystemEvent::SYSTEM_ALARMED',
        ALERT: 'AntiTheftSystemEvent::ALERT',
        SIREN_ACTIVED: 'AntiTheftSystemEvent::SIREN_ACTIVED',
        SIREN_SILENCED: 'AntiTheftSystemEvent::SIREN_SILENCED'
    };

    private constructor() {
        this.log('AntiTheftSystem starting...');
        this.setupConfig();
        this.setupSystemEvents();
    }

    private log(message: string, ... args: any[]): void {
        if(args.length > 0) {
            console.log(`[${new Date().toLocaleTimeString()}]\t${message}\t`, args);
        } else {
            console.log(`[${new Date().toLocaleTimeString()}]\t${message}`);
        }
    }

    private getSystemState(): SystemState {
        let systemState: SystemState = {
            state: this.config.state,
            mode: this.config.mode,
            activedSensors: this.activatedSensors,
            uptime: Date.now()
        };
        return systemState;
    }

    private setupConfig(): void {
        this.loadConfigFromFile();
        this.setupSiren();
        this.setupSensors();
        // TODO: ??
    }

    private loadConfigFromFile(): void {
        if(!existsSync(configFilePath)) {
            // Default values
            this.log(`Configuration file: '${configFilePath}' not found.`);
            this.config = {
                sirenPin: 18, // TODO: ?
                state: AntiTheftSystemStates.DISARMED,
                mode: null,
                lookouted: 0,
                sensors: [],
                bypass: [],
                codes: { owner: '81DC9BDB52D04DC20036DBD8313ED055', admin: '1E4D36177D71BBB3558E43AF9577D70E' },
                entryTime: 60,
                exitTime: 90,
                beep: true,
                silentAlarm: false,
                phones: { owner: [] },
                emails: { owner: [] },
                systemWasAlarmed: false
            };
            this.log(`Saving configuration file with default values...`);
            writeFileSync(configFilePath, JSON.stringify(this.config));
        } else {
            this.log(`Getting last values from configuration file: '${configFilePath}'...`)
            let data: Buffer = readFileSync(configFilePath);
            let lastConfig: AntiTheftSystemConfig = JSON.parse(data.toString());
            if (lastConfig.state == AntiTheftSystemStates.PROGRAMMING) {
                lastConfig.state = AntiTheftSystemStates.DISARMED;
            }
            this.config = lastConfig;
        }

        watch(configFilePath, (event: string, fileName: string | Buffer) => {
            this.log('Config file ', event, fileName);
            if (event == 'rename') {
                // TODO: send alerts
                // TODO: restore file
            }
        });

        this.log(`AntiTheftSystem running with this configuration: `, this.config);
    }

    private setupSiren(): void {
        this.siren = new Gpio(this.config.sirenPin, 'out');
        process.on('SIGINT', () => this.siren.unexport());
        this.log(`Siren configured in the GPIO ${this.config.sirenPin}...`);
    }

    private setupSensors(): void {
        this.log('Configuring sensors...');
        let gpiosConfigured: Gpio[] = [];
        this.config.sensors.forEach((s: Sensor, i: number) => {
            if (!s.location.expander) {
                let gpio = new Gpio(s.location.pin, 'in', 'both');
                gpio.watch((err: Error, val: number) => {
                    if(err) {
                        console.log(err);
                        // TODO: ??
                        return;
                    }
                    this.emitter.emit(AntiTheftSystem.Events.SENSOR_ACTIVED, { sensor: s, value: val });
                });
                gpiosConfigured.push(gpio);
            } else {
                this.log('\tExpander support not implemented yet');
            }
        });
        process.on('SIGINT', () => {
            gpiosConfigured.forEach((gpio: Gpio) => gpio.unexport());
        });
        this.log(`${gpiosConfigured.length} sensors were configured in total`);
    }

    private setupSystemEvents(): void {
        this.emitter = new EventEmitter();

        this.emitter.on(AntiTheftSystem.Events.NOT_AUTHORIZED, (data) => {
            this.unauthorizedIntents.push(new Date());
            let now = Date.now();
            let intents: Date[] = [];
            this.unauthorizedIntents.forEach((intent: Date, index: number) => {
                if(now - intent.getTime() < this.windowUnauthorizedIntentLength) {
                    intents.push(intent);
                }
            });
            this.unauthorizedIntents = intents;
            if (this.unauthorizedIntents.length > this.maxUnauthorizedIntentCount) {
                this.handleMaxUnauthorizedIntents();
            }
        });

        // TODO: Intents by INVALID_STATE

        this.emitter.on(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, (data) => {
            this.lastStateChange = new Date();
            this.log('SYSTEM_STATE_CHANGED', data);
            if (data.before == AntiTheftSystemStates.PROGRAMMING) {
                this.saveConfig();
                this.setupConfig();
            }
        });

        this.emitter.on(AntiTheftSystem.Events.SENSOR_REGISTERED, (data) => {
            this.log('SENSOR_REGISTERED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.Events.SENSOR_CHANGED, (data) => {
            this.log('SENSOR_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.Events.SENSOR_DELETED, (data) => {
            this.log('SENSOR_DELETED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.Events.ENTRY_TIME_CHANGED, (data) => {
            this.log('ENTRY_TIME_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.Events.EXIT_TIME_CHANGED, (data) => {
            this.log('EXIT_TIME_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.Events.BEEP_CHANGED, (data) => {
            this.log('BEEP_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.Events.SILENT_ALARM_CHANGED, (data) => {
            this.log('SILENT_ALARM_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.Events.CENTRAL_PHONE_CHANGED, (data) => {
            this.log('CENTRAL_PHONE_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.Events.ADMIN_PHONE_CHANGED, (data) => {
            this.log('ADMIN_PHONE_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.Events.OWNER_PHONE_ADDED, (data) => {
            this.log('OWNER_PHONE_ADDED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.Events.OWNER_PHONE_CHANGED, (data) => {
            this.log('OWNER_PHONE_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.Events.OWNER_PHONE_DELETED, (data) => {
            this.log('OWNER_PHONE_DELETED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.Events.CENTRAL_EMAIL_CHANGED, (data) => {
            this.log('CENTRAL_EMAIL_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.Events.ADMIN_EMAIL_CHANGED, (data) => {
            this.log('ADMIN_EMAIL_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.Events.OWNER_EMAIL_ADDED, (data) => {
            this.log('OWNER_EMAIL_ADDED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.Events.OWNER_EMAIL_CHANGED, (data) => {
            this.log('OWNER_EMAIL_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.Events.OWNER_EMAIL_DELETED, (data) => {
            this.log('OWNER_EMAIL_DELETED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.Events.BYPASS_CHANGE, (data) => {
            this.log('BYPASS_CHANGE', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.Events.SYSTEM_ARMED, (data) => {
            this.log('SYSTEM_ARMED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.Events.SYSTEM_DISARMED, (data) => {
            this.log('SYSTEM_DISARMED');
            this.siren.writeSync(0);
            let systemState: SystemState = this.getSystemState();
            this.emitter.emit(AntiTheftSystem.Events.SIREN_SILENCED, { system: systemState });

            if(this.alarmedStateTimer) {
                clearInterval(this.alarmedStateTimer);
            }

            if(this.config.systemWasAlarmed) {
                this.alarmedStateTimer = setInterval(() => {
                    this.siren.writeSync(this.siren.readSync() ^ 1);
                }, 200);

                setTimeout(() => {
                    clearInterval(this.alarmedStateTimer);
                    this.siren.writeSync(0);
                }, 1200);

                this.config.systemWasAlarmed = false;
            }

            this.saveConfig();
        });

        this.emitter.on(AntiTheftSystem.Events.SYSTEM_ALARMED, (data) => {
            this.log('SYSTEM_ALARMED', data);
            // TODO:
            this.saveConfig(); // TODO: <- ?

            if(this.alarmedStateTimer) {
                clearInterval(this.alarmedStateTimer);
            }

            this.alarmedStateTimer = setInterval(() => {
                this.siren.writeSync(this.siren.readSync() ^ 1);
            }, 400);

            let systemState: SystemState = this.getSystemState();
            this.emitter.emit(AntiTheftSystem.Events.SIREN_ACTIVED, { system: systemState });

            setTimeout(() => {
                this.log('The system has not been disarmed yet');
                this.config.systemWasAlarmed = true;
                clearInterval(this.alarmedStateTimer);
                this.siren.writeSync(0);
                let systemState = this.getSystemState();
                this.emitter.emit(AntiTheftSystem.Events.SIREN_SILENCED, { system: systemState });
                let currentState = this.config.state;
                this.config.state = AntiTheftSystemStates.ARMED;
                this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, { system: systemState, before: currentState, after: AntiTheftSystemStates.ARMED });
            }, this.alarmedStateDuration);
        });

        this.emitter.on(AntiTheftSystem.Events.SENSOR_ACTIVED, (data) => {
            this.log('SENSOR_ACTIVED', data.sensor.name, data.value == 0 ? 'OFF' : 'ON');
            let sensor: Sensor = data.sensor;
            let value: number = data.value;
            let state: AntiTheftSystemStates = this.config.state;
            let systemState: SystemState;
            // TODO: 
            if (value == 1) {
                let index = -1;
                this.activatedSensors.forEach((s: Sensor, i: number) => {
                    if(SensorLocation.equals(s.location, sensor.location)) {
                        index = i;
                        return;
                    }
                });
                if (index < 0) {
                    this.activatedSensors.push(sensor);
                }
                switch(state) {
                    case AntiTheftSystemStates.ALARMED:
                        // TODO: log activity
                        this.log('Log activity');
                        break;
                    case AntiTheftSystemStates.ARMED:
                        let mode: AntiTheftSystemArmedModes = this.config.mode ? parseInt(this.config.mode.toString()) : 0;
                        switch(mode) {
                            case AntiTheftSystemArmedModes.AWAY:
                                switch(sensor.group) {
                                    case SensorGroup.ACCESS:
                                        this.config.state = AntiTheftSystemStates.ENTERING;
                                        systemState = this.getSystemState();
                                        let entryTime = this.config.entryTime * 1000;
                                        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, 
                                            { 
                                                system: systemState, 
                                                before: AntiTheftSystemStates.ARMED, 
                                                after: AntiTheftSystemStates.ENTERING,
                                                entryTime: entryTime
                                            });
                                        setTimeout(() => {
                                            let currentState = this.config.state;
                                            if(currentState == AntiTheftSystemStates.ENTERING) {
                                                let systemState = this.getSystemState();
                                                this.config.state = AntiTheftSystemStates.ALARMED;
                                                systemState = this.getSystemState();
                                                this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, { system: systemState, before: AntiTheftSystemStates.ARMED, after: AntiTheftSystemStates.ALARMED });
                                                this.emitter.emit(AntiTheftSystem.Events.SYSTEM_ALARMED, { system: systemState, sensor: sensor });
                                            }
                                        }, entryTime);
                                        break;
                                    case SensorGroup.EXTERIOR:
                                        this.log('Alert');
                                        this.emitter.emit(AntiTheftSystem.Events.ALERT, { system: systemState });
                                        break;
                                    case SensorGroup.INTERIOR:
                                    case SensorGroup.PERIMETER:
                                        this.config.state = AntiTheftSystemStates.ALARMED;
                                        systemState = this.getSystemState();
                                        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, { system: systemState, before: AntiTheftSystemStates.ARMED, after: AntiTheftSystemStates.ALARMED });
                                        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_ALARMED, { system: systemState, sensor: sensor });
                                        break;
                                    default:
                                        this.log('This message should not be displayed');
                                }
                                break;
                            case AntiTheftSystemArmedModes.CHIME:
                                switch(sensor.group) {
                                    case SensorGroup.ACCESS:
                                    case SensorGroup.EXTERIOR:
                                    case SensorGroup.INTERIOR:
                                    case SensorGroup.PERIMETER:
                                        this.log('Chime');
                                        break;
                                    default:
                                        this.log('This message should not be displayed');
                                }
                                break;
                            case AntiTheftSystemArmedModes.INSTANT:
                                switch(sensor.group) {
                                    case SensorGroup.ACCESS:
                                        this.config.state = AntiTheftSystemStates.ALARMED;
                                        systemState = this.getSystemState();
                                        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, { system: systemState, before: AntiTheftSystemStates.ARMED, after: AntiTheftSystemStates.ALARMED });
                                        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_ALARMED, { system: systemState, sensor: sensor });
                                        break;
                                    case SensorGroup.EXTERIOR:
                                        this.log('Log activity'); // TODO: ??
                                        break;
                                    case SensorGroup.INTERIOR:
                                    case SensorGroup.PERIMETER:
                                        this.config.state = AntiTheftSystemStates.ALARMED;
                                        systemState = this.getSystemState();
                                        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, { system: systemState, before: AntiTheftSystemStates.ARMED, after: AntiTheftSystemStates.ALARMED });
                                        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_ALARMED, { system: systemState, sensor: sensor });
                                        break;
                                    default:
                                        this.log('This message should not be displayed');
                                }
                                break;
                            case AntiTheftSystemArmedModes.MAXIMUM:
                                switch(sensor.group) {
                                    case SensorGroup.ACCESS:
                                    case SensorGroup.EXTERIOR:
                                    case SensorGroup.INTERIOR:
                                    case SensorGroup.PERIMETER:
                                        this.config.state = AntiTheftSystemStates.ALARMED;
                                        systemState = this.getSystemState();
                                        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, { system: systemState, before: AntiTheftSystemStates.ARMED, after: AntiTheftSystemStates.ALARMED });
                                        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_ALARMED, { system: systemState, sensor: sensor });
                                        break;
                                    default:
                                        this.log('This message should not be displayed');
                                }
                                break;
                            case AntiTheftSystemArmedModes.NIGHT_STAY:
                                switch(sensor.group) {
                                    case SensorGroup.ACCESS:
                                        this.config.state = AntiTheftSystemStates.ALARMED;
                                        systemState = this.getSystemState();
                                        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, { system: systemState, before: AntiTheftSystemStates.ARMED, after: AntiTheftSystemStates.ALARMED });
                                        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_ALARMED, { system: systemState, sensor: sensor });
                                        break;
                                    case SensorGroup.EXTERIOR:
                                        this.log('Alert');
                                        this.emitter.emit(AntiTheftSystem.Events.ALERT, { system: systemState });
                                        break;
                                    case SensorGroup.INTERIOR:
                                        this.log('Ignore');
                                        break;
                                    case SensorGroup.PERIMETER:
                                        this.config.state = AntiTheftSystemStates.ALARMED;
                                        systemState = this.getSystemState();
                                        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, { system: systemState, before: AntiTheftSystemStates.ARMED, after: AntiTheftSystemStates.ALARMED });
                                        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_ALARMED, { system: systemState, sensor: sensor });
                                        break;
                                    default:
                                        this.log('This message should not be displayed');
                                }
                                break;
                            case AntiTheftSystemArmedModes.STAY:
                                switch(sensor.group) {
                                    case SensorGroup.ACCESS:
                                        this.config.state = AntiTheftSystemStates.ENTERING;
                                        systemState = this.getSystemState();
                                        let entryTime = this.config.entryTime * 1000;
                                        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, 
                                            { 
                                                system: systemState, 
                                                before: AntiTheftSystemStates.ARMED, 
                                                after: AntiTheftSystemStates.ENTERING,
                                                entryTime: entryTime
                                            });
                                        setTimeout(() => {
                                            let currentState = this.config.state;
                                            if(currentState == AntiTheftSystemStates.ENTERING) {
                                                this.config.state = AntiTheftSystemStates.ALARMED;
                                                systemState = this.getSystemState();
                                                this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, { system: systemState, before: AntiTheftSystemStates.ARMED, after: AntiTheftSystemStates.ALARMED });
                                                this.emitter.emit(AntiTheftSystem.Events.SYSTEM_ALARMED, { system: systemState, sensor: sensor });
                                            }
                                        }, entryTime);
                                        break;
                                    case SensorGroup.EXTERIOR:
                                        this.log('Alert');
                                        this.emitter.emit(AntiTheftSystem.Events.ALERT, { system: systemState });
                                        break;
                                    case SensorGroup.INTERIOR:
                                        this.log('Ignore');
                                        break;
                                    case SensorGroup.PERIMETER:
                                        this.config.state = AntiTheftSystemStates.ALARMED;
                                        systemState = this.getSystemState();
                                        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, { system: systemState, before: AntiTheftSystemStates.ARMED, after: AntiTheftSystemStates.ALARMED });
                                        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_ALARMED, { system: systemState, sensor: sensor });
                                        break;
                                    default:
                                        this.log('This message should not be displayed');
                                }
                                break;
                            default:
                                this.log('This message should not be displayed');
                        }
                        break;
                    case AntiTheftSystemStates.DISARMED:
                    case AntiTheftSystemStates.ENTERING:
                    case AntiTheftSystemStates.LEAVING:
                    case AntiTheftSystemStates.PROGRAMMING:
                        this.log('Ignore');
                        break;
                    case AntiTheftSystemStates.READY:
                        let index = -1;
                        this.config.bypass.forEach((location: SensorLocation, i: number) => {
                            if (SensorLocation.equals(location, sensor.location)) {
                                index = i;
                                return;
                            }
                        });
                        if (index < 0) {
                            this.config.state = AntiTheftSystemStates.DISARMED;
                            systemState = this.getSystemState();
                            this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, { system: systemState, before: AntiTheftSystemStates.READY, after: AntiTheftSystemStates.DISARMED });
                        }
                        break;
                    default:
                        this.log('This message should not be displayed');
                }
            } else {
                let index = -1;
                this.activatedSensors.forEach((s: Sensor, i: number) => {
                    if(SensorLocation.equals(s.location, sensor.location)) {
                        index = i;
                        return;
                    }
                });
                if(index >= 0) {
                    this.activatedSensors.splice(index, 1);
                }
                if(this.config.state == AntiTheftSystemStates.DISARMED && this.activatedSensors.length == 0) {
                    this.config.state = AntiTheftSystemStates.READY;
                    systemState = this.getSystemState();
                    this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, { system: systemState, before: AntiTheftSystemStates.DISARMED, after: AntiTheftSystemStates.READY });
                }
            }
        });

        this.emitter.on(AntiTheftSystem.Events.ALERT, (data) => {
            this.log('ALERT', data);
            this.alerts.push(new Date());
            let now = Date.now();
            let alerts: Date[] = [];
            this.alerts.forEach((alert: Date, index: number) => {
                if(now - alert.getTime() < this.windowAlertsLength) {
                    alerts.push(alert);
                }
            });
            this.alerts = alerts;
            if (this.alerts.length > this.maxAlertsCount) {
                this.handleMaxAlerts();
            }
        });
    }

    private saveConfig(): void {
        writeFileSync(configFilePath, JSON.stringify(this.config));
    }

    private getErrorResponse(error: AntiTheftSystemErrors, message?: string, data?: any): AntiTheftSystemResponse {
        return {
            success: false,
            message: message,
            data: data,
            error: error
        };
    }

    private getSuccessResponse(data?: any, message?: string): AntiTheftSystemResponse {
        return {
            success: true,
            message: message,
            data: data,
            error: null
        };
    }

    private validateCode(code: string, user: string): boolean {
        if (this.config.codes[user]) {
            let hash = createHash('md5').update(code).digest('hex').toUpperCase();
            return this.config.codes[user] == hash;
        }
        return false;
    }

    private validateCodeFormat(code: string): boolean {
        let regexp = new RegExp('^[1-9][0-9]{3}$');
        return regexp.test(code);
    }

    private updateCode(currentCode: string, newCode: string, user: string, destinationUser?: string): AntiTheftSystemResponse {
        if(!this.validateCodeFormat(newCode)) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_CODE_FORMAT);
        }
        if(!this.validateCode(currentCode, user)) {
            this.emitter.emit(AntiTheftSystem.Events.NOT_AUTHORIZED, { action: 'updateCode', config: this.config });
            return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);;
        }
        let hash = createHash('md5').update(newCode).digest('hex').toUpperCase();
        this.config.codes[destinationUser || user] = hash;
        this.emitter.emit(AntiTheftSystem.Events.PIN_CODE_UPDATED, destinationUser || user);
        return this.getSuccessResponse();
    }

    private getSensorIndexByLocation(location: SensorLocation): number {
        let index = -1;
        this.config.sensors.forEach((s: Sensor, i: number) => {
            if(SensorLocation.equals(s.location, location)) {
                index = i;
                return;
            }
        });
        return index;
    }

    private setBeep(value: boolean, code?: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state != AntiTheftSystemStates.READY && this.config.state != AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        this.config.beep = value;
        this.emitter.emit(AntiTheftSystem.Events.BEEP_CHANGED, { beep: this.config.beep });
        return this.getSuccessResponse();
    }

    private setSilentAlarm(value: boolean, code?: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state != AntiTheftSystemStates.READY && this.config.state != AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        this.config.silentAlarm = value;
        this.emitter.emit(AntiTheftSystem.Events.SILENT_ALARM_CHANGED, { silentAlarm: this.config.silentAlarm });
        return this.getSuccessResponse();
    }

    private handleMaxUnauthorizedIntents(): void {
        this.log('Unauthorized Intents', this.unauthorizedIntents);
        // TODO: System Blocked | Alarmed
    }

    private handleMaxAlerts(): void {
        this.log('Alerts', this.alerts);
        // TODO: 
    }

    public static getInstance(): AntiTheftSystem {
        if (this.instance == null) {
            this.instance = new AntiTheftSystem();
        }
        return this.instance;
    }

    public on(event: string, listener: (... args: any[]) => void): void {
        this.emitter.addListener(event, listener);
    }

    public setGuestCode(ownerCode: string, guestCode: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        return this.updateCode(ownerCode, guestCode, 'owner', 'guest');
    }

    public updateOwnerCode(currentCode: string, newCode: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        return this.updateCode(currentCode, newCode, 'owner');
    }

    public updateAdminCode(currentCode: string, newCode: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        return this.updateCode(currentCode, newCode, 'admin');
    }

    public setProgrammingMode(adminCode: string): AntiTheftSystemResponse {
        let currentState = this.config.state;
        if(currentState != AntiTheftSystemStates.READY && currentState != AntiTheftSystemStates.DISARMED) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        if(!this.validateCode(adminCode, 'admin')) {
            this.emitter.emit(AntiTheftSystem.Events.NOT_AUTHORIZED, { action: 'setProgrammingMode', config: this.config });
            return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }
        this.config.state = AntiTheftSystemStates.PROGRAMMING;
        let systemState: SystemState = this.getSystemState();
        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, { system: systemState, before: currentState, after: AntiTheftSystemStates.PROGRAMMING });

        setTimeout(() => {
            if (this.config.state == AntiTheftSystemStates.PROGRAMMING) {
                this.config.state = AntiTheftSystemStates.DISARMED;
                let systemState: SystemState = this.getSystemState();
                this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, { system: systemState, before: AntiTheftSystemStates.PROGRAMMING, after: AntiTheftSystemStates.DISARMED });
                this.emitter.emit(AntiTheftSystem.Events.SYSTEM_DISARMED, { system: systemState });
            }
        }, this.programmingStateDuration);
        
        return this.getSuccessResponse();
    }

    public unsetProgrammingMode(): AntiTheftSystemResponse {
        let currentState = this.config.state;
        if(currentState != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        this.config.state = AntiTheftSystemStates.DISARMED;
        let systemState: SystemState = this.getSystemState();
        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, { system: systemState, before: AntiTheftSystemStates.PROGRAMMING, after: AntiTheftSystemStates.DISARMED });
        return this.getSuccessResponse();
    }

    public setSensor(sensor: Sensor): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        // TODO: validate Sensor info (gpios)
        let index = this.getSensorIndexByLocation(sensor.location);
        if(index < 0) {
            this.config.sensors.push(sensor);
            this.emitter.emit(AntiTheftSystem.Events.SENSOR_REGISTERED, { sensor: sensor });
        } else {
            let currentSensor: Sensor = this.config.sensors[index];
            this.config.sensors[index] = sensor;
            this.emitter.emit(AntiTheftSystem.Events.SENSOR_CHANGED, { before: currentSensor, after: sensor });
        }
        return this.getSuccessResponse();
    }

    public unsetSensor(location: SensorLocation): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        let index = this.getSensorIndexByLocation(location);
        if(index < 0) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SENSOR_LOCATION);
        }
        let deletedSensors: Sensor[] = this.config.sensors.splice(index, 1);
        this.emitter.emit(AntiTheftSystem.Events.SENSOR_DELETED, { sensor: deletedSensors[0] });
        return this.getSuccessResponse();
    }

    public setEntryTime(seconds: number, code?: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state != AntiTheftSystemStates.READY && this.config.state != AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        if(seconds < 5 || seconds > (60 * 5)) { // TODO: Min & Max entry time (5 min)
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_ENTRY_TIME_VALUE);
        }
        this.config.entryTime = seconds;
        this.emitter.emit(AntiTheftSystem.Events.ENTRY_TIME_CHANGED, { entryTime: seconds });
        return this.getSuccessResponse();
    }

    public setExitTime(seconds: number, code?: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state != AntiTheftSystemStates.READY && this.config.state != AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        if(seconds < 5 || seconds > (60 * 10)) { // TODO: Min & Max entry time (10 min)
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_EXIT_TIME_VALUE);
        }
        this.config.exitTime = seconds;
        this.emitter.emit(AntiTheftSystem.Events.EXIT_TIME_CHANGED, { exitTime: seconds });
        return this.getSuccessResponse();
    }

    public turnOnBeep(code?: string): AntiTheftSystemResponse {
        return this.setBeep(true, code);
    }

    public turnOffBeep(code?: string): AntiTheftSystemResponse {
        return this.setBeep(false, code);
    }

    public toggleBeep(code?: string): AntiTheftSystemResponse {
        return this.setBeep(!this.config.beep, code);
    }

    public turnOnSilentAlarm(code?: string): AntiTheftSystemResponse {
        return this.setSilentAlarm(true, code);
    }

    public turnOffSilentAlarm(code?: string): AntiTheftSystemResponse {
        return this.setSilentAlarm(false, code);
    }
    
    public toggleSilentAlarm(code?: string): AntiTheftSystemResponse {
        return this.setSilentAlarm(!this.config.silentAlarm, code);
    }

    public setCentralPhone(phone: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        // TODO: Validate phone format
        this.config.phones.central = phone;
        this.emitter.emit(AntiTheftSystem.Events.CENTRAL_PHONE_CHANGED, { phone: phone });
        return this.getSuccessResponse();
    }
    
    public unsetCentralPhone(): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        this.config.phones.central = '';
        this.emitter.emit(AntiTheftSystem.Events.CENTRAL_PHONE_CHANGED, { phone: '' });
        return this.getSuccessResponse();
    }
    
    public setAdminPhone(phone: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        // TODO: Validate phone format
        this.config.phones.admin = phone;
        this.emitter.emit(AntiTheftSystem.Events.ADMIN_PHONE_CHANGED, { phone: phone });
        return this.getSuccessResponse();
    }
    
    public unsetAdminPhone(): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        this.config.phones.admin = '';
        this.emitter.emit(AntiTheftSystem.Events.ADMIN_PHONE_CHANGED, { phone: '' });
        return this.getSuccessResponse();
    }
    
    public addOwnerPhone(phone: string, code?: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state != AntiTheftSystemStates.READY && this.config.state != AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        // TODO: Validate phone format
        // TODO: Validate repeat
        // TODO: Validate max 
        this.config.phones.owner.push(phone);
        this.emitter.emit(AntiTheftSystem.Events.OWNER_PHONE_ADDED, { phone: phone });
        return this.getSuccessResponse();
    }
    
    public updateOwnerPhone(index: number, phone: string, code?: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state != AntiTheftSystemStates.READY && this.config.state != AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        // TODO: Validate phone format
        // TODO: Validate repeat
        if(index < 0 || index > this.config.phones.owner.length) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_PHONE_POSITION);
        }
        this.config.phones.owner[index] = phone
        this.emitter.emit(AntiTheftSystem.Events.OWNER_PHONE_CHANGED, { phone: phone });
        return this.getSuccessResponse();
    }
    
    public deleteOwnerPhone(index: number, code?: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state != AntiTheftSystemStates.READY && this.config.state != AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        // TODO: Validate phone format
        // TODO: Validate repeat
        if(index < 0 || index > this.config.phones.owner.length) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_PHONE_POSITION);
        }
        let phone = this.config.phones.owner.splice(index, 1);
        this.emitter.emit(AntiTheftSystem.Events.OWNER_PHONE_DELETED, { phone: phone[0] });
        return this.getSuccessResponse();
    }
    
    public setCentralEmail(email: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        // TODO: Validate email format
        this.config.emails.central = email;
        this.emitter.emit(AntiTheftSystem.Events.CENTRAL_EMAIL_CHANGED, { email: email });
        return this.getSuccessResponse();
    }
    
    public unsetCentralEmail(): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        this.config.emails.central = '';
        this.emitter.emit(AntiTheftSystem.Events.CENTRAL_EMAIL_CHANGED, { email: '' });
        return this.getSuccessResponse();
    }
    
    public setAdminEmail(email: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        // TODO: Validate email format
        this.config.emails.admin = email;
        this.emitter.emit(AntiTheftSystem.Events.ADMIN_EMAIL_CHANGED, { email: email });
        return this.getSuccessResponse();
    }
    
    public unsetAdminEmail(): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        // TODO: Validate email format
        this.config.emails.admin = '';
        this.emitter.emit(AntiTheftSystem.Events.ADMIN_EMAIL_CHANGED, { email: '' });
        return this.getSuccessResponse();
    }
    
    public addOwnerEmail(email: string, code?: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state != AntiTheftSystemStates.READY && this.config.state != AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        // TODO: Validate email format
        // TODO: Validate repeat
        // TODO: Validate max 
        this.config.emails.owner.push(email);
        this.emitter.emit(AntiTheftSystem.Events.OWNER_EMAIL_ADDED, { email: email });
        return this.getSuccessResponse();
    }
    
    public updateOwnerEmail(index: number, email: string, code?: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state != AntiTheftSystemStates.READY && this.config.state != AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        // TODO: Validate email format
        // TODO: Validate repeat
        if(index < 0 || index > this.config.emails.owner.length) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_EMAIL_POSITION);
        }
        this.config.emails.owner[index] = email
        this.emitter.emit(AntiTheftSystem.Events.OWNER_EMAIL_CHANGED, { email: email });
        return this.getSuccessResponse();
    }
    
    public deleteOwnerEmail(index: number, code?: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state != AntiTheftSystemStates.READY && this.config.state != AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        // TODO: Validate email format
        // TODO: Validate repeat
        if(index < 0 || index > this.config.emails.owner.length) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_EMAIL_POSITION);
        }
        let email = this.config.emails.owner.splice(index, 1);
        this.emitter.emit(AntiTheftSystem.Events.OWNER_EMAIL_DELETED, { email: email[0] });
        return this.getSuccessResponse();
    }

    public getState(): AntiTheftSystemResponse {
        let systemState: SystemState = this.getSystemState();
        return this.getSuccessResponse({ system: systemState });
    }

    public bypassOne(location: SensorLocation, code?: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.READY && this.config.state != AntiTheftSystemStates.DISARMED) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        if (!code || !this.validateCode(code, 'owner') || !this.validateCode(code, 'guest')) {
            return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }
        let index: number = this.getSensorIndexByLocation(location);
        if(index < 0) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SENSOR_LOCATION);
        }
        // TODO: Validate repeat
        this.config.bypass.push(location);
        this.emitter.emit(AntiTheftSystem.Events.BYPASS_CHANGE, { bypass: this.config.bypass });
        return this.getSuccessResponse();
    }
    
    public bypassAll(locations: SensorLocation[], code?: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.READY && this.config.state != AntiTheftSystemStates.DISARMED) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        if (!code || !this.validateCode(code, 'owner') || !this.validateCode(code, 'guest')) {
            return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }
        locations.forEach((location: SensorLocation, i: number) => {
            let index: number = this.getSensorIndexByLocation(location);
            if(index < 0) {
                return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SENSOR_LOCATION);
            }
        });
        // TODO: Validate repeat
        locations.forEach((l: SensorLocation) => this.config.bypass.push(l));
        
        this.emitter.emit(AntiTheftSystem.Events.BYPASS_CHANGE, { bypass: this.config.bypass });
        return this.getSuccessResponse();
    }

    public clearBypass(code?: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.READY && this.config.state != AntiTheftSystemStates.DISARMED) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        if (!code || (!this.validateCode(code, 'owner') && !this.validateCode(code, 'guest'))) {
            return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }
        this.config.bypass = [];
        this.emitter.emit(AntiTheftSystem.Events.BYPASS_CHANGE, { bypass: this.config.bypass });
        return this.getSuccessResponse();
    }
    
    public arm(mode: AntiTheftSystemArmedModes, code?: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.READY) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        if (code && (!this.validateCode(code, 'owner') && !this.validateCode(code, 'guest'))) { // TODO: code is optional?
            return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }
        this.config.state = AntiTheftSystemStates.LEAVING;
        let systemState: SystemState = this.getSystemState();
        let exitTime = this.config.exitTime * 1000;
        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, 
            { 
                system: systemState, 
                before: AntiTheftSystemStates.READY, 
                after: AntiTheftSystemStates.LEAVING,
                exitTime: exitTime
            });

        mode = parseInt(mode.toString());

        setTimeout(() => {
            let currentState = this.config.state;
            this.config.state = AntiTheftSystemStates.ARMED;
            this.config.mode = mode;
            let systemState: SystemState = this.getSystemState();
            this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, { system: systemState, before: currentState, after: AntiTheftSystemStates.ARMED });
            this.emitter.emit(AntiTheftSystem.Events.SYSTEM_ARMED, { system: systemState, mode: mode });
        }, exitTime);
        
        return this.getSuccessResponse();
    }
    
    public disarm(code: string): AntiTheftSystemResponse {
        let state = this.config.state;
        if(state != AntiTheftSystemStates.ARMED && state != AntiTheftSystemStates.ENTERING && state != AntiTheftSystemStates.ALARMED) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        if (!this.validateCode(code, 'owner') && !this.validateCode(code, 'guest')) {
            return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }
        this.config.state = AntiTheftSystemStates.DISARMED;
        this.config.mode = null;
        let systemState: SystemState = this.getSystemState();
        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, { system: systemState, before: state, after: AntiTheftSystemStates.DISARMED });
        this.emitter.emit(AntiTheftSystem.Events.SYSTEM_DISARMED);
        return this.getSuccessResponse();
    }
}