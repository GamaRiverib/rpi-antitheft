import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, watch } from 'fs';
import { Gpio } from 'onoff';

import { Sensor, SensorLocation, SensorGroup } from './Sensor';
import { Otp } from './Otp';

import { AntiTheftSystemStates } from './AntiTheftSystemStates';
import { AntiTheftSystemArmedModes } from './AntiTheftSystemArmedModes';
import { AntiTheftSystemConfig } from './AntiTheftSystemConfig';
import { AntiTheftSystemAPI } from './AntiTheftSystemAPI';
import { SystemState } from './SystemState';
import { AntiTheftSystemErrors } from './AntiTheftSystemErrors';
import { AntiTheftSystemResponse } from './AntiTheftSystemResponse';

const configFilePath = './Config.json';

export interface AntiTheftSystemEventData {
    system: SystemState;
    extra: any;
}

export class AntiTheftSystem implements AntiTheftSystemAPI {

    private static INSTANCE: AntiTheftSystem = null;

    private otpProvider: Otp;

    private config: AntiTheftSystemConfig;

    private emitter: EventEmitter;

    private lastStateChange: Date = null;

    private beforeState: AntiTheftSystemStates = null;

    private leftTime: number = -1;
    
    private programmingStateDuration = 60000 * 5; // 5 min

    private alarmedStateTimer: NodeJS.Timer;
    private alarmedStateDuration = 60000 * 0.5; // TODO: 3 min
    private alarmedTimeout = null;
    private enteringTimeout = null;
    private leavingTimeout = null;

    private maxUnauthorizedIntentCount = 10;
    private windowUnauthorizedIntentLength = 60000; // 1 min = 60,000 ms
    private unauthorizedIntents: Date[] = [];

    private maxAlertsCount = 5;
    private windowAlertsLength = 60000; // 1 min = 60, 000 ms
    private alerts: Date[] = [];

    private activatedSensors: Sensor[] = [];

    private siren: Gpio;

    public static readonly SENSOR_GPIOS: [4, 17, 18, 27, 22, 23, 24, 25, 5, 6, 12, 13, 19, 16, 26, 20, 21];

    public static readonly EVENTS = {
        NOT_AUTHORIZED: 'NOT_AUTHORIZED',
        PIN_CODE_UPDATED: 'PIN_CODE_UPDATED',
        SYSTEM_STATE_CHANGED: 'SYSTEM_STATE_CHANGED',
        SENSOR_REGISTERED: 'SENSOR_REGISTERED',
        SENSOR_CHANGED: 'SENSOR_CHANGED',
        SENSOR_DELETED: 'SENSOR_DELETED',
        SENSOR_ACTIVED: 'SENSOR_ACTIVED',
        ENTRY_TIME_CHANGED: 'ENTRY_TIME_CHANGED',
        EXIT_TIME_CHANGED: 'EXIT_TIME_CHANGED',
        BEEP_CHANGED: 'BEEP_CHANGED',
        SILENT_ALARM_CHANGED: 'SILENT_ALARM_CHANGED',
        CENTRAL_PHONE_CHANGED: 'CENTRAL_PHONE_CHANGED',
        ADMIN_PHONE_CHANGED: 'ADMIN_PHONE_CHANGED',
        OWNER_PHONE_ADDED: 'OWNER_PHONE_ADDED',
        OWNER_PHONE_CHANGED: 'OWNER_PHONE_CHANGED',
        OWNER_PHONE_DELETED: 'OWNER_PHONE_DELETED',
        CENTRAL_EMAIL_CHANGED: 'CENTRAL_EMAIL_CHANGED',
        ADMIN_EMAIL_CHANGED: 'ADMIN_EMAIL_CHANGED',
        OWNER_EMAIL_ADDED: 'OWNER_EMAIL_ADDED',
        OWNER_EMAIL_CHANGED: 'OWNER_EMAIL_CHANGED',
        OWNER_EMAIL_DELETED: 'OWNER_EMAIL_DELETED',
        BYPASS_CHANGE: 'BYPASS_CHANGE',
        SYSTEM_ARMED: 'SYSTEM_ARMED',
        SYSTEM_DISARMED: 'SYSTEM_DISARMED',
        SYSTEM_ALARMED: 'SYSTEM_ALARMED',
        SYSTEM_ALERT: 'SYSTEM_ALERT',
        SIREN_ACTIVED: 'SIREN_ACTIVED',
        SIREN_SILENCED: 'SIREN_SILENCED'
    };

    private constructor() {
        this.log('AntiTheftSystem starting...');
        this.otpProvider = new Otp();
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
            before: this.beforeState,
            state: this.config.state,
            mode: this.config.mode,
            activedSensors: this.activatedSensors,
            leftTime: this.leftTime,
            uptime: Date.now()
        };
        return systemState;
    }

    private setSystemState(newState: AntiTheftSystemStates, mode?: AntiTheftSystemArmedModes): SystemState {
        this.beforeState = this.config.state;
        this.config.state = newState;
        if(mode) {
            this.config.mode = mode;
        } else {
            this.config.mode = null;
        }
        this.leftTime = -1;
        if(newState == AntiTheftSystemStates.ENTERING) {
            this.leftTime = Date.now() + (this.config.entryTime * 1000);
        } else if(newState == AntiTheftSystemStates.LEAVING) {
            this.leftTime = Date.now() + (this.config.exitTime * 1000);
        }
        return this.getSystemState();
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
                entryTime: 10, // TODO: 60
                exitTime: 10, // TODO: 90
                beep: true,
                silentAlarm: false,
                phones: { owner: [] },
                emails: { owner: [] },
                systemWasAlarmed: false,
                clients: {
                    'galaxys6': '79STCF7GW7Q64TLD',
                    'iphone6': 'CHARVSV676S39NQJ'
                }
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
        this.log(`Configuring ${this.config.sensors.length} sensors...`);
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
                    this.emitter.emit(AntiTheftSystem.EVENTS.SENSOR_ACTIVED, { sensor: s, value: val });
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

        this.emitter.on(AntiTheftSystem.EVENTS.NOT_AUTHORIZED, (data) => {
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

        this.emitter.on(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, (data) => {
            this.lastStateChange = new Date();
            this.log('SYSTEM_STATE_CHANGED', data);
            if (data.system.beforeState == AntiTheftSystemStates.PROGRAMMING) {
                this.saveConfig();
                this.setupConfig();
            }
        });

        this.emitter.on(AntiTheftSystem.EVENTS.SENSOR_REGISTERED, (data) => {
            this.log('SENSOR_REGISTERED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.EVENTS.SENSOR_CHANGED, (data) => {
            this.log('SENSOR_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.EVENTS.SENSOR_DELETED, (data) => {
            this.log('SENSOR_DELETED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.EVENTS.ENTRY_TIME_CHANGED, (data) => {
            this.log('ENTRY_TIME_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.EVENTS.EXIT_TIME_CHANGED, (data) => {
            this.log('EXIT_TIME_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.EVENTS.BEEP_CHANGED, (data) => {
            this.log('BEEP_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.EVENTS.SILENT_ALARM_CHANGED, (data) => {
            this.log('SILENT_ALARM_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.EVENTS.CENTRAL_PHONE_CHANGED, (data) => {
            this.log('CENTRAL_PHONE_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.EVENTS.ADMIN_PHONE_CHANGED, (data) => {
            this.log('ADMIN_PHONE_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.EVENTS.OWNER_PHONE_ADDED, (data) => {
            this.log('OWNER_PHONE_ADDED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.EVENTS.OWNER_PHONE_CHANGED, (data) => {
            this.log('OWNER_PHONE_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.EVENTS.OWNER_PHONE_DELETED, (data) => {
            this.log('OWNER_PHONE_DELETED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.EVENTS.CENTRAL_EMAIL_CHANGED, (data) => {
            this.log('CENTRAL_EMAIL_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.EVENTS.ADMIN_EMAIL_CHANGED, (data) => {
            this.log('ADMIN_EMAIL_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.EVENTS.OWNER_EMAIL_ADDED, (data) => {
            this.log('OWNER_EMAIL_ADDED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.EVENTS.OWNER_EMAIL_CHANGED, (data) => {
            this.log('OWNER_EMAIL_CHANGED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.EVENTS.OWNER_EMAIL_DELETED, (data) => {
            this.log('OWNER_EMAIL_DELETED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.EVENTS.BYPASS_CHANGE, (data) => {
            this.log('BYPASS_CHANGE', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.EVENTS.SYSTEM_ARMED, (data) => {
            this.log('SYSTEM_ARMED', data);
            // this.saveConfig(); ?
        });

        this.emitter.on(AntiTheftSystem.EVENTS.SYSTEM_DISARMED, (data) => {
            this.log('SYSTEM_DISARMED');
            
            if(this.alarmedTimeout) {
                clearTimeout(this.alarmedTimeout);
            }
            if(this.enteringTimeout) {
                clearTimeout(this.enteringTimeout);
            }
            if(this.leavingTimeout) {
                clearTimeout(this.leavingTimeout);
            }
            if(this.alarmedStateTimer) {
                clearInterval(this.alarmedStateTimer);
            }

            this.siren.writeSync(0);
            let systemState: SystemState = this.getSystemState();
            this.emitter.emit(AntiTheftSystem.EVENTS.SIREN_SILENCED, { system: systemState });

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

        this.emitter.on(AntiTheftSystem.EVENTS.SYSTEM_ALARMED, (data) => {
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
            this.emitter.emit(AntiTheftSystem.EVENTS.SIREN_ACTIVED, { system: systemState });

            this.alarmedTimeout = setTimeout(() => {
                this.log('The system has not been disarmed yet');
                this.config.systemWasAlarmed = true;
                clearInterval(this.alarmedStateTimer);
                this.siren.writeSync(0);
                let systemState = this.setSystemState(AntiTheftSystemStates.ARMED);
                this.emitter.emit(AntiTheftSystem.EVENTS.SIREN_SILENCED, { system: systemState });
                this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });
            }, this.alarmedStateDuration);
        });

        this.emitter.on(AntiTheftSystem.EVENTS.SENSOR_ACTIVED, (data) => {
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
                        this.log(`Sensor ${sensor.name} actived`);
                        break;
                    case AntiTheftSystemStates.ARMED:
                        // TODO: Bypass sensors/zones
                        let mode: AntiTheftSystemArmedModes = this.config.mode ? parseInt(this.config.mode.toString()) : 0;
                        switch(mode) {
                            case AntiTheftSystemArmedModes.AWAY:
                                switch(sensor.group) {
                                    case SensorGroup.ACCESS:
                                        systemState = this.setSystemState(AntiTheftSystemStates.ENTERING);
                                        let entryTime = this.config.entryTime * 1000;
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });
                                        this.enteringTimeout = setTimeout(() => {
                                            let currentState = this.config.state;
                                            if(currentState == AntiTheftSystemStates.ENTERING) {
                                                systemState = this.setSystemState(AntiTheftSystemStates.ALARMED);
                                                this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });
                                                this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_ALARMED, { system: systemState, sensor: sensor });
                                            }
                                        }, entryTime);
                                        break;
                                    case SensorGroup.EXTERIOR:
                                        this.log(`[ALERT]: Sensor ${sensor.name} actived`);
                                        systemState = this.getSystemState();
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_ALERT, { system: systemState });
                                        break;
                                    case SensorGroup.INTERIOR:
                                    case SensorGroup.PERIMETER:
                                        systemState = this.setSystemState(AntiTheftSystemStates.ALARMED);
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_ALARMED, { system: systemState, sensor: sensor });
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
                                        this.log(`[CHIME]: Sensor ${sensor.name} actived`);
                                        break;
                                    default:
                                        this.log('This message should not be displayed');
                                }
                                break;
                            case AntiTheftSystemArmedModes.INSTANT:
                                switch(sensor.group) {
                                    case SensorGroup.ACCESS:
                                        systemState = this.setSystemState(AntiTheftSystemStates.ALARMED);
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_ALARMED, { system: systemState, sensor: sensor });
                                        break;
                                    case SensorGroup.EXTERIOR:
                                        this.log(`[ALERT]: Sensor ${sensor.name} actived`); // TODO: ??
                                        systemState = this.getSystemState();
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_ALERT, { system: systemState });
                                        break;
                                    case SensorGroup.INTERIOR:
                                    case SensorGroup.PERIMETER:
                                        systemState = this.setSystemState(AntiTheftSystemStates.ALARMED);
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_ALARMED, { system: systemState, sensor: sensor });
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
                                        systemState = this.setSystemState(AntiTheftSystemStates.ALARMED);
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_ALARMED, { system: systemState, sensor: sensor });
                                        break;
                                    default:
                                        this.log('This message should not be displayed');
                                }
                                break;
                            case AntiTheftSystemArmedModes.NIGHT_STAY:
                                switch(sensor.group) {
                                    case SensorGroup.ACCESS:
                                        systemState = this.setSystemState(AntiTheftSystemStates.ALARMED);
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_ALARMED, { system: systemState, sensor: sensor });
                                        break;
                                    case SensorGroup.EXTERIOR:
                                        this.log(`[ALERT]: Sensor ${sensor.name} actived`);
                                        systemState = this.getSystemState();
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_ALERT, { system: systemState });
                                        break;
                                    case SensorGroup.INTERIOR:
                                        this.log(`[IGNORE]: Sensor ${sensor.name} actived`);
                                        break;
                                    case SensorGroup.PERIMETER:
                                        systemState = this.setSystemState(AntiTheftSystemStates.ALARMED);
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_ALARMED, { system: systemState, sensor: sensor });
                                        break;
                                    default:
                                        this.log('This message should not be displayed');
                                }
                                break;
                            case AntiTheftSystemArmedModes.STAY:
                                switch(sensor.group) {
                                    case SensorGroup.ACCESS:
                                        systemState = this.setSystemState(AntiTheftSystemStates.ENTERING);
                                        let entryTime = this.config.entryTime * 1000;
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });
                                        this.enteringTimeout = setTimeout(() => {
                                            let currentState = this.config.state;
                                            if(currentState == AntiTheftSystemStates.ENTERING) {
                                                systemState = this.setSystemState(AntiTheftSystemStates.ALARMED);
                                                this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });
                                                this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_ALARMED, { system: systemState, sensor: sensor });
                                            }
                                        }, entryTime);
                                        break;
                                    case SensorGroup.EXTERIOR:
                                        this.log(`[ALERT]: Sensor ${sensor.name} actived`);
                                        systemState = this.getSystemState();
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_ALERT, { system: systemState });
                                        break;
                                    case SensorGroup.INTERIOR:
                                        this.log(`[IGNORE]: Sensor ${sensor.name} actived`);
                                        break;
                                    case SensorGroup.PERIMETER:
                                        systemState = this.setSystemState(AntiTheftSystemStates.ALARMED);
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });
                                        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_ALARMED, { system: systemState, sensor: sensor });
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
                        this.log(`[IGNORE]: Sensor ${sensor.name} actived`);
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
                            systemState = this.setSystemState(AntiTheftSystemStates.DISARMED);
                            this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });
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
                    systemState = this.setSystemState(AntiTheftSystemStates.READY);
                    this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });
                }
            }
        });

        this.emitter.on(AntiTheftSystem.EVENTS.SYSTEM_ALERT, (data) => {
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
            this.emitter.emit(AntiTheftSystem.EVENTS.NOT_AUTHORIZED, { action: 'updateCode', config: this.config });
            return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);;
        }
        let hash = createHash('md5').update(newCode).digest('hex').toUpperCase();
        this.config.codes[destinationUser || user] = hash;
        this.emitter.emit(AntiTheftSystem.EVENTS.PIN_CODE_UPDATED, destinationUser || user);
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
        this.emitter.emit(AntiTheftSystem.EVENTS.BEEP_CHANGED, { beep: this.config.beep });
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
        this.emitter.emit(AntiTheftSystem.EVENTS.SILENT_ALARM_CHANGED, { silentAlarm: this.config.silentAlarm });
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
        if (this.INSTANCE == null) {
            this.INSTANCE = new AntiTheftSystem();
        }
        return this.INSTANCE;
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
            this.emitter.emit(AntiTheftSystem.EVENTS.NOT_AUTHORIZED, { action: 'setProgrammingMode', config: this.config });
            return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }
        let systemState: SystemState = this.setSystemState(AntiTheftSystemStates.PROGRAMMING);
        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });

        setTimeout(() => {
            if (this.config.state == AntiTheftSystemStates.PROGRAMMING) {
                let systemState: SystemState = this.setSystemState(AntiTheftSystemStates.DISARMED);
                this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });
                this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_DISARMED, { system: systemState });
            }
        }, this.programmingStateDuration);
        
        return this.getSuccessResponse();
    }

    public unsetProgrammingMode(): AntiTheftSystemResponse {
        let currentState = this.config.state;
        if(currentState != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        let systemState: SystemState = this.setSystemState(AntiTheftSystemStates.DISARMED);
        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });
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
            this.emitter.emit(AntiTheftSystem.EVENTS.SENSOR_REGISTERED, { sensor: sensor });
        } else {
            let currentSensor: Sensor = this.config.sensors[index];
            this.config.sensors[index] = sensor;
            this.emitter.emit(AntiTheftSystem.EVENTS.SENSOR_CHANGED, { before: currentSensor, after: sensor });
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
        this.emitter.emit(AntiTheftSystem.EVENTS.SENSOR_DELETED, { sensor: deletedSensors[0] });
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
        this.emitter.emit(AntiTheftSystem.EVENTS.ENTRY_TIME_CHANGED, { entryTime: seconds });
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
        this.emitter.emit(AntiTheftSystem.EVENTS.EXIT_TIME_CHANGED, { exitTime: seconds });
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

    public getCentralPhone(): AntiTheftSystemResponse {
        let phone: string = this.config.phones.central || '';
        return this.getSuccessResponse({ phone: phone });
    }

    public setCentralPhone(phone: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        // TODO: Validate phone format
        this.config.phones.central = phone;
        this.emitter.emit(AntiTheftSystem.EVENTS.CENTRAL_PHONE_CHANGED, { phone: phone });
        return this.getSuccessResponse();
    }
    
    public unsetCentralPhone(): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        this.config.phones.central = '';
        this.emitter.emit(AntiTheftSystem.EVENTS.CENTRAL_PHONE_CHANGED, { phone: '' });
        return this.getSuccessResponse();
    }

    public getAdminPhone(): AntiTheftSystemResponse {
        let phone: string = this.config.phones.admin || '';
        return this.getSuccessResponse({ phone: phone });
    }
    
    public setAdminPhone(phone: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        // TODO: Validate phone format
        this.config.phones.admin = phone;
        this.emitter.emit(AntiTheftSystem.EVENTS.ADMIN_PHONE_CHANGED, { phone: phone });
        return this.getSuccessResponse();
    }
    
    public unsetAdminPhone(): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        this.config.phones.admin = '';
        this.emitter.emit(AntiTheftSystem.EVENTS.ADMIN_PHONE_CHANGED, { phone: '' });
        return this.getSuccessResponse();
    }

    public getOwnerPhones(): AntiTheftSystemResponse {
        let phones: string[] = this.config.phones.owner || [];
        return this.getSuccessResponse({ phones: phones });
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
        // TODO: Send SMS
        this.config.phones.owner.push(phone);
        this.emitter.emit(AntiTheftSystem.EVENTS.OWNER_PHONE_ADDED, { phone: phone });
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
        // TODO: Send SMS
        if(index < 0 || index > this.config.phones.owner.length) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_PHONE_POSITION);
        }
        this.config.phones.owner[index] = phone
        this.emitter.emit(AntiTheftSystem.EVENTS.OWNER_PHONE_CHANGED, { phone: phone });
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
        // TODO: Send SMS
        if(index < 0 || index > this.config.phones.owner.length) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_PHONE_POSITION);
        }
        let phone = this.config.phones.owner.splice(index, 1);
        this.emitter.emit(AntiTheftSystem.EVENTS.OWNER_PHONE_DELETED, { phone: phone[0] });
        return this.getSuccessResponse();
    }

    public getCentralEmail(): AntiTheftSystemResponse {
        let email: string = this.config.emails.central || '';
        return this.getSuccessResponse({ email: email });
    }
    
    public setCentralEmail(email: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        // TODO: Validate email format
        this.config.emails.central = email;
        this.emitter.emit(AntiTheftSystem.EVENTS.CENTRAL_EMAIL_CHANGED, { email: email });
        return this.getSuccessResponse();
    }
    
    public unsetCentralEmail(): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        this.config.emails.central = '';
        this.emitter.emit(AntiTheftSystem.EVENTS.CENTRAL_EMAIL_CHANGED, { email: '' });
        return this.getSuccessResponse();
    }

    public getAdminEmail(): AntiTheftSystemResponse {
        let email: string = this.config.emails.admin || '';
        return this.getSuccessResponse({ email: email });
    }
    
    public setAdminEmail(email: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        // TODO: Validate email format
        this.config.emails.admin = email;
        this.emitter.emit(AntiTheftSystem.EVENTS.ADMIN_EMAIL_CHANGED, { email: email });
        return this.getSuccessResponse();
    }
    
    public unsetAdminEmail(): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        // TODO: Validate email format
        this.config.emails.admin = '';
        this.emitter.emit(AntiTheftSystem.EVENTS.ADMIN_EMAIL_CHANGED, { email: '' });
        return this.getSuccessResponse();
    }

    public getOwnerEmails(): AntiTheftSystemResponse {
        let emails: string[] = this.config.emails.owner || [];
        return this.getSuccessResponse({ emails: emails });
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
        // TODO: Send email notification
        this.config.emails.owner.push(email);
        this.emitter.emit(AntiTheftSystem.EVENTS.OWNER_EMAIL_ADDED, { email: email });
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
        // TODO: Send email notification
        if(index < 0 || index > this.config.emails.owner.length) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_EMAIL_POSITION);
        }
        this.config.emails.owner[index] = email
        this.emitter.emit(AntiTheftSystem.EVENTS.OWNER_EMAIL_CHANGED, { email: email });
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
        // TODO: Send email notification
        if(index < 0 || index > this.config.emails.owner.length) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_EMAIL_POSITION);
        }
        let email = this.config.emails.owner.splice(index, 1);
        this.emitter.emit(AntiTheftSystem.EVENTS.OWNER_EMAIL_DELETED, { email: email[0] });
        return this.getSuccessResponse();
    }

    public generateSecret(): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        let secret: string = this.otpProvider.getSecret();
        return this.getSuccessResponse({ secret: secret });

    }
    public validateClient(clientId: string, token: string): AntiTheftSystemResponse {
        if (!this.config.clients[clientId]) {
            console.log(`Client ${clientId} not exits`);
            return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }
        let secret: string = this.config.clients[clientId];
        let result: boolean = this.otpProvider.verify(token, secret);
        if (!result) {
            return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }
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
        this.emitter.emit(AntiTheftSystem.EVENTS.BYPASS_CHANGE, { bypass: this.config.bypass });
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
        
        this.emitter.emit(AntiTheftSystem.EVENTS.BYPASS_CHANGE, { bypass: this.config.bypass });
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
        this.emitter.emit(AntiTheftSystem.EVENTS.BYPASS_CHANGE, { bypass: this.config.bypass });
        return this.getSuccessResponse();
    }
    
    public arm(mode: AntiTheftSystemArmedModes, code?: string): AntiTheftSystemResponse {
        if(this.config.state != AntiTheftSystemStates.READY) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        if (code && (!this.validateCode(code, 'owner') && !this.validateCode(code, 'guest'))) { // TODO: code is optional? !code || !this.validateCode(code, 'owner') || !this.validateCode(code, 'guest')
            return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }
        let systemState: SystemState = this.setSystemState(AntiTheftSystemStates.LEAVING);
        let exitTime = this.config.exitTime * 1000;
        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });

        mode = parseInt(mode.toString());

        this.leavingTimeout = setTimeout(() => {
            let systemState: SystemState = this.setSystemState(AntiTheftSystemStates.ARMED, mode);
            this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });
            this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_ARMED, { system: systemState, mode: mode });
        }, exitTime);
        
        return this.getSuccessResponse();
    }
    
    public disarm(code: string): AntiTheftSystemResponse {
        let state = this.config.state;
        if(state != AntiTheftSystemStates.ARMED && state != AntiTheftSystemStates.ENTERING && state != AntiTheftSystemStates.ALARMED) { // TODO: Add LEAVING
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        if (!this.validateCode(code, 'owner') && !this.validateCode(code, 'guest')) {
            return this.getErrorResponse(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }
        let newState: AntiTheftSystemStates;
        if (this.activatedSensors.length > 0) {
            newState = AntiTheftSystemStates.DISARMED;
        } else {
            newState = AntiTheftSystemStates.READY;
        }
        let systemState: SystemState = this.setSystemState(newState);
        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_STATE_CHANGED, { system: systemState });
        this.emitter.emit(AntiTheftSystem.EVENTS.SYSTEM_DISARMED, { system: systemState });
        return this.getSuccessResponse();
    }
}