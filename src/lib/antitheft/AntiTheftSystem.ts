import winston = require('winston');
import { createTransport } from 'nodemailer';

import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, watch, FSWatcher } from 'fs';

import { Sensor, SensorGroup, SensorTypes } from './Sensor';
import { SensorLocation } from './SensorLocation';
import { AntiTheftSystemStates } from './AntiTheftSystemStates';
import { AntiTheftSystemArmedModes } from './AntiTheftSystemArmedModes';
import { AntiTheftSystemConfig } from './AntiTheftSystemConfig';
import { AntiTheftSystemAPI, AntiTheftSystemProgrammingAPI } from './AntiTheftSystemAPI';
import { SystemState } from './SystemState';
import { AntiTheftSystemErrors } from './AntiTheftSystemErrors';
import { AntiTheftSystemResponse } from './AntiTheftSystemResponse';

import { Otp } from '../utils/Otp';
import { getLogger } from '../utils/Logger';

import { AntiTheftSystemEvents, AntiTheftSystemEventData, ClientEventData } from './AntiTheftSystemEvents';
import { NotAuthorizedEventHandler, MaxUnAuthorizedIntentsEventData } from './handlers/NotAuthorizedEventHandler';
import { SystemStateChangedEventHandler } from './handlers/SystemStateChangedEventHandler';
import { EventsLogger } from './handlers/EventsLogger';
import { AlertsEventHandler, MaxAlertsEventData } from './handlers/AlertsEventHandler';
import { SensorActivedEventHandler } from './handlers/SensorActivedEventHandler';
import { WebSocketChannel, WebSocketChannleEvents, WebSocketChannelEventData, StateEventData } from './channels/WebSocketChannel';
import { ClientsEventHandler } from './handlers/ClientsEventHandler';

const configFilePath = process.env.ATS_CONFIG_FILE || './Config.json';

const emailUser = process.env.EMAIL_USER || '';
const emailPass = process.env.EMAIL_PASS || '';
const emailFrom = process.env.EMAIL_FROM || emailUser;

export class AntiTheftSystem implements AntiTheftSystemAPI, AntiTheftSystemProgrammingAPI {

    private static INSTANCE: AntiTheftSystem = null;

    private fileWatcher: FSWatcher;

    private logger: winston.Logger;

    private mailer: any;

    private otpProvider: Otp;

    private config: AntiTheftSystemConfig;

    private emitter: EventEmitter;

    private beforeState: AntiTheftSystemStates = null;

    private leftTime: number = -1;

    private programmingStateDuration = 60000 * 5; // 5 min

    private alarmedStateTimer: NodeJS.Timer;

    private alarmedStateDuration = 60000 * 0.5; // TODO: 3 min

    private alarmedTimeout = null;

    private enteringTimeout = null;

    private leavingTimeout = null;

    private activatedSensors: Sensor[] = [];

    // private siren: Gpio;

    private onlineClients: { [clientId: string]: string } = {};

    private offlineClientsTimers: { [clientId: string]: NodeJS.Timer } = {};

    // public static readonly SENSOR_GPIOS: [4, 17, 18, 27, 22, 23, 24, 25, 5, 6, 12, 13, 19, 16, 26, 20, 21];

    private static readonly EVENTS_TO_LOG: string[] = [
        AntiTheftSystemEvents.SYSTEM_STATE_CHANGED,
        AntiTheftSystemEvents.SENSOR_REGISTERED,
        AntiTheftSystemEvents.SENSOR_CHANGED,
        AntiTheftSystemEvents.SENSOR_DELETED,
        AntiTheftSystemEvents.ENTRY_TIME_CHANGED,
        AntiTheftSystemEvents.EXIT_TIME_CHANGED,
        AntiTheftSystemEvents.BEEP_CHANGED,
        AntiTheftSystemEvents.SILENT_ALARM_CHANGED,
        AntiTheftSystemEvents.CENTRAL_PHONE_CHANGED,
        AntiTheftSystemEvents.ADMIN_PHONE_CHANGED,
        AntiTheftSystemEvents.OWNER_PHONE_ADDED,
        AntiTheftSystemEvents.OWNER_PHONE_CHANGED,
        AntiTheftSystemEvents.OWNER_PHONE_DELETED,
        AntiTheftSystemEvents.CENTRAL_EMAIL_CHANGED,
        AntiTheftSystemEvents.ADMIN_EMAIL_CHANGED,
        AntiTheftSystemEvents.OWNER_EMAIL_ADDED,
        AntiTheftSystemEvents.OWNER_EMAIL_CHANGED,
        AntiTheftSystemEvents.OWNER_EMAIL_DELETED,
        AntiTheftSystemEvents.BYPASS_CHANGE,
        AntiTheftSystemEvents.SYSTEM_ARMED
    ];

    private constructor() {
        this.logger = getLogger('AntiTheftSystem');
        this.logger.info('AntiTheftSystem starting...');
        this.otpProvider = new Otp();
        this.setupConfig();
        this.setupSystemEvents();
        this.setupMailer();
    }

    // Get current system state
    private getSystemState(): SystemState {
        const systemState: SystemState = {
            before: this.beforeState,
            state: this.config.state,
            mode: this.config.mode,
            activedSensors: this.activatedSensors,
            leftTime: this.leftTime,
            uptime: Date.now()
        };
        return systemState;
    }

    // Set new system state
    private setSystemState(newState: AntiTheftSystemStates, mode?: AntiTheftSystemArmedModes, sensor?: Sensor): SystemState {
        if (newState === this.config.state && mode === this.config.mode) {
            const actualSystemState: SystemState = this.getSystemState();
            this.logger.info(`Trying set the same system state`, actualSystemState);
            return actualSystemState;
        }
        this.beforeState = this.config.state;
        this.config.state = newState;
        this.config.mode = Number.isInteger(mode) ? mode : null;
        this.leftTime = -1;

        switch(newState) {
            case AntiTheftSystemStates.ENTERING:
                this.leftTime = Date.now() + (this.config.entryTime * 1000);
                break;
            case AntiTheftSystemStates.LEAVING:
                this.leftTime = Date.now() + (this.config.exitTime * 1000);
                break;
            case AntiTheftSystemStates.DISARMED:
                if (this.activatedSensors.length === 0) {
                    this.config.state = AntiTheftSystemStates.READY;
                }
                break;
            case AntiTheftSystemStates.READY:
                if (this.activatedSensors.length > 0) {
                    this.config.state = AntiTheftSystemStates.DISARMED;
                }
                break;
        }

        const currentSystemState: SystemState = this.getSystemState();

        this.emitter.emit(AntiTheftSystemEvents.SYSTEM_STATE_CHANGED, { system: currentSystemState });

        switch(newState) {
            case AntiTheftSystemStates.ALARMED:
                this.emitter.emit(AntiTheftSystemEvents.SYSTEM_ALARMED, { system: currentSystemState, sensor });
                break;
            case AntiTheftSystemStates.ARMED:
                this.emitter.emit(AntiTheftSystemEvents.SYSTEM_ARMED, { system: currentSystemState });
                break;
            /*case AntiTheftSystemStates.DISARMED:
                if (this.beforeState != AntiTheftSystemStates.READY) {
                    this.emitter.emit(AntiTheftSystemEvents.SYSTEM_DISARMED, { system: systemState });
                }
                break;*/
        }
        return currentSystemState;
    }

    private setupConfig(): void {
        this.loadConfigFromFile();
        this.setupSiren();
        this.setupSensors();
    }

    private loadConfigFromFile(): void {
        if(!existsSync(configFilePath)) {
            // Default values
            this.logger.error(`Configuration file: '${configFilePath}' not found.`);
            this.config = {
                state: AntiTheftSystemStates.DISARMED,
                mode: null,
                lookouted: 0,
                sensors: [{
                    location: {
                        mac: '68:C6:3A:80:98:68',
                        pin: 16
                    },
                    type: SensorTypes.PIR_MOTION,
                    name: 'PIR01',
                    group: SensorGroup.EXTERIOR
                }],
                bypass: [],
                codes: { owner: '81DC9BDB52D04DC20036DBD8313ED055', admin: '1E4D36177D71BBB3558E43AF9577D70E' }, // TODO: change defaults
                entryTime: 10, // TODO: 60
                exitTime: 10, // TODO: 90
                beep: true,
                silentAlarm: false,
                phones: { owner: [] },
                emails: { owner: [] },
                systemWasAlarmed: false,
                clients: { // TODO: change defaults
                    galaxys6: '79STCF7GW7Q64TLD',
                    iphone6: 'CHARVSV676S39NQJ',
                    device8427624: '6GN2ITLOKDAEL2QN'
                }
            };
            this.logger.info(`Saving configuration file with default values...`);
            writeFileSync(configFilePath, JSON.stringify(this.config));
        } else {
            this.logger.info(`Getting last values from configuration file: '${configFilePath}'...`)
            const data: Buffer = readFileSync(configFilePath);
            const lastConfig: AntiTheftSystemConfig = JSON.parse(data.toString());
            if (lastConfig.state === AntiTheftSystemStates.PROGRAMMING) {
                lastConfig.state = AntiTheftSystemStates.DISARMED;
            }
            lastConfig.sensors.forEach((s: Sensor) => s.online = false);
            setTimeout(() => {
                let allOffline: boolean = true;
                this.config.sensors.forEach((s: Sensor) => {
                    if(s.online) {
                        allOffline = false;
                    }
                });
                if (allOffline && this.config.state === AntiTheftSystemStates.DISARMED) {
                    this.setSystemState(AntiTheftSystemStates.READY);
                }
            }, 5000);
            this.config = lastConfig;
        }

        this.fileWatcher = watch(configFilePath, (event: string, fileName: string | Buffer) => {
            // this.logger.info(`Config file event "${event}"`, { data: fileName } );
            if (event === 'rename') {
                // TODO: send alerts
                // TODO: restore file
            }
        });

        this.logger.info('AntiTheftSystem running with this configuration:', { data: this.config });
    }

    private setupSiren(): void {
        /*this.siren = new Gpio(this.config.sirenPin, 'out');
        process.on('SIGINT', () => this.siren.unexport());
        this.logger.info(`Siren configured in the GPIO ${this.config.sirenPin}...`);*/
    }

    private setupSensors(): void {
        /*this.logger.info(`Configuring ${this.config.sensors.length} sensors...`);
        let gpiosConfigured: Gpio[] = [];
        this.config.sensors.forEach((s: Sensor, i: number) => {
            if (!s.location.expander) {
                let gpio;
                try {
                    gpio = new Gpio(s.location.pin, 'in', 'both');
                } catch(err) {
                    console.log(err);
                }
                if(gpio) {
                    gpio.watch((err: Error, val: number) => {
                        if(err) {
                            console.log(err);
                            // TODO: ??
                            return;
                        }
                        this.emitter.emit(AntiTheftSystemEvents.SENSOR_ACTIVED, { sensor: s, value: val });
                    });
                    gpiosConfigured.push(gpio);
                }
            } else {
                this.logger.error('\tExpander support not implemented yet'); // TODO: Support for expander
            }
        });
        process.on('SIGINT', () => gpiosConfigured.forEach((gpio: Gpio) => gpio.unexport()));
        this.logger.info(`${gpiosConfigured.length} sensors were configured in total`);*/
    }

    private setupSystemEvents(): void {
        this.emitter = new EventEmitter();

        // TODO: Intents by INVALID_STATE

        // tslint:disable-next-line: no-unused-expression
        new SystemStateChangedEventHandler(this);
        const sensorActivedEventHandler = new SensorActivedEventHandler(this);
        const notAuthorizedEventHandler = new NotAuthorizedEventHandler(this);
        const alertsEventHandler = new AlertsEventHandler(this);

        // tslint:disable-next-line: no-unused-expression
        new ClientsEventHandler(this);
        // tslint:disable-next-line: no-unused-expression
        new EventsLogger(this, AntiTheftSystem.EVENTS_TO_LOG);

        // Handle SYSTEM_DISARMED event
        this.emitter.on(AntiTheftSystemEvents.SYSTEM_DISARMED, this.onSystemDisarmed.bind(this));
        // Handle SYSTEM_ALARMED event
        this.emitter.on(AntiTheftSystemEvents.SYSTEM_ALARMED, this.onSystemAlarmed.bind(this));

        // Handle sensor events
        sensorActivedEventHandler.onAlarmedEvent(this.onSensorActiveAlarm.bind(this));
        sensorActivedEventHandler.onAlertEvent(this.onSensorActiveAlert.bind(this));
        sensorActivedEventHandler.onChimeEvent(this.onSensorActiveChime.bind(this));
        sensorActivedEventHandler.onDisarmEvent(this.onSensorActiveDisarm.bind(this));
        sensorActivedEventHandler.onEnteringEvent(this.onSensorActiveEntering.bind(this));
        sensorActivedEventHandler.onReadyEvent(this.onSensorDeactiveReady.bind(this));

        alertsEventHandler.onMaxAlertsEvent(this.onMaxAlertsEventHandler.bind(this));
        notAuthorizedEventHandler.onMaxUnauthorizedIntents(this.onMaxUnauthorizedIntentsEventHandler.bind(this));
    }

    private onSystemDisarmed(/*data: AntiTheftSystemEventData*/): void {
        this.logger.info('System was disarmed');

        // Clear timers
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

        // Deactivate the siren
        this.deactiveSiren();

        // Warn that the system was alarmed
        if(this.config.systemWasAlarmed) {
            this.alarmedStateTimer = setInterval(() => {
                // this.siren.writeSync(this.siren.readSync() ^ 1);
            }, 200);

            setTimeout(() => {
                clearInterval(this.alarmedStateTimer);
                // this.siren.writeSync(0);
            }, 1200);

            this.config.systemWasAlarmed = false;
        }

        // clear bypassed sensors
        this.config.bypass = [];

        this.saveConfig();
    }

    private onSystemAlarmed(data: AntiTheftSystemEventData): void {
        this.logger.info('System is alarmed', { data });

        // TODO:
        this.saveConfig(); // TODO: <- ?

        if(this.alarmedStateTimer) {
            clearInterval(this.alarmedStateTimer);
        }

        // Activate the siren
        this.activeSiren();

        this.alarmedTimeout = setTimeout(() => {
            this.logger.info('The system has not been disarmed yet');
            this.config.systemWasAlarmed = true;
            clearInterval(this.alarmedStateTimer);
            this.setSystemState(AntiTheftSystemStates.ARMED);
            this.deactiveSiren();
        }, this.alarmedStateDuration);

        this.sendEmail(
            'SYSTEM ALARMED',
            `
                <h3>El sistema está alarmado</h3>
                <div>
                    ${JSON.stringify(data)}
                </div>
        `);
    }

    private onSensorActiveAlarm(sensor: Sensor): void {
        this.setSystemState(AntiTheftSystemStates.ALARMED, null, sensor);
    }

    private onSensorActiveAlert(sensor: Sensor): void {
        this.logger.info(`[ALERT]: Sensor ${sensor.name} actived`); // TODO: move
        const currentSystemState: SystemState = this.getSystemState();
        this.emitter.emit(AntiTheftSystemEvents.SYSTEM_ALERT, { system: currentSystemState, sensor });
    }

    private onSensorActiveChime(sensor: Sensor): void {
        this.logger.info(`[CHIME]: Sensor ${sensor.name} actived`); // TODO
    }

    private onSensorActiveDisarm(sensor: Sensor): void {
        this.setSystemState(AntiTheftSystemStates.DISARMED);
    }

    private onSensorActiveEntering(sensor: Sensor): void {
        this.setSystemState(AntiTheftSystemStates.ENTERING);
        const entryTime = this.config.entryTime * 1000;
        this.enteringTimeout = setTimeout(() => {
            const currentState = this.config.state;
            if(currentState === AntiTheftSystemStates.ENTERING) {
                this.setSystemState(AntiTheftSystemStates.ALARMED, null, sensor);
            }
        }, entryTime);
    }

    private onSensorDeactiveReady(sensor: Sensor): void {
        this.setSystemState(AntiTheftSystemStates.READY);
    }

    private onMaxAlertsEventHandler(data: MaxAlertsEventData): void {
        this.sendEmail(
            'Max Alerts',
            `
                <h3>Se ha alcanzado el número máximo de alertas</h3>
                <div>
                    ${JSON.stringify(data.alerts)}
                </div>
        `);
        const currentSystemState: SystemState = this.getSystemState();
        this.emitter.emit(AntiTheftSystemEvents.MAX_ALERTS, { system: currentSystemState, extra: data });
        this.logger.warn('Max Alerts Event', { data });
    }

    private onMaxUnauthorizedIntentsEventHandler(data: MaxUnAuthorizedIntentsEventData): void {
        console.log('Max Unauthorized Intents Event', data);
        // TODO: send push notification
        this.sendEmail(
            'Max unauthorized intents',
            `
                <h3>Se ha alcanzado el número máximo de intentos no autorizados</h3>
                <div>
                    ${JSON.stringify(data.intents)}
                </div>
        `);
        const currentSystemState: SystemState = this.getSystemState();
        this.emitter.emit(AntiTheftSystemEvents.MAX_UNAUTHORIZED_INTENTS, { system: currentSystemState, extra: data });
    }

    private saveConfig(): void {
        writeFileSync(configFilePath, JSON.stringify(this.config));
    }

    private activeSiren(): void {
        this.alarmedStateTimer = setInterval(() => {
            // this.siren.writeSync(this.siren.readSync() ^ 1); // TODO
        }, 400);

        const currentSystemState: SystemState = this.getSystemState();
        this.emitter.emit(AntiTheftSystemEvents.SIREN_ACTIVED, { system: currentSystemState });
    }

    private deactiveSiren(): void {
        // this.siren.writeSync(0); // TODO
        const currentSystemState: SystemState = this.getSystemState();
        this.emitter.emit(AntiTheftSystemEvents.SIREN_SILENCED, { system: currentSystemState });
    }

    private setupMailer(): void {
        if (!emailUser) {
            this.logger.warn('Email account has not been provided');
        }
        this.mailer = createTransport({
            // service: 'gmail',
            host: 'smtp.gmail.com',
            port: 587,
            auth: {
                user: emailUser,
                pass: emailPass
            }
        });
    }

    private sendEmail(subject: string, content: string): void {
        const receivers: string[] = this.config.emails.owner;
        if(receivers.length === 0) {
            this.logger.error('Not owner email configured');
            return;
        }
        const mailOpts = {
            from: emailFrom,
            to: receivers,
            subject: `[AntiTheftSystem] - ${subject}`,
            html: content
        };

        this.mailer.sendMail(mailOpts, (err: any, info: any) => {
            if(err) {
                this.logger.error('Send email fail', { data: { error: err } });
                return;
            }
            this.logger.info('Send email successful', { data: info });
        });
    }

    private getErrorResponse<T>(error: AntiTheftSystemErrors, message?: string, data?: T): AntiTheftSystemResponse<T> {
        return { success: false, message, data, error };
    }

    private getSuccessResponse<T>(data?: T, message?: string): AntiTheftSystemResponse<T> {
        return { success: true, message, data, error: null };
    }

    private validateCode(code: string, user: string): boolean {
        if (this.config.codes[user]) {
            const hash = createHash('md5').update(code).digest('hex').toUpperCase();
            return this.config.codes[user] === hash;
        }
        return false;
    }

    private validateCodeFormat(code: string): boolean {
        const regexp = new RegExp('^[1-9][0-9]{3}$');
        return regexp.test(code);
    }

    private updateCode(currentCode: string, newCode: string, user: string, destinationUser?: string): AntiTheftSystemResponse<void> {
        if(!this.validateCodeFormat(newCode)) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_CODE_FORMAT);
        }
        if(!this.validateCode(currentCode, user)) {
            this.emitter.emit(AntiTheftSystemEvents.NOT_AUTHORIZED, { action: 'updateCode', config: this.config });
            return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);;
        }
        const hash = createHash('md5').update(newCode).digest('hex').toUpperCase();
        this.config.codes[destinationUser || user] = hash;
        this.emitter.emit(AntiTheftSystemEvents.PIN_CODE_UPDATED, destinationUser || user);
        return this.getSuccessResponse<void>();
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

    private getBypassByLocation(location: SensorLocation): number {
        let index = -1;
        this.config.bypass.forEach((s: SensorLocation, i: number) => {
            if(SensorLocation.equals(s, location)) {
                index = i;
                return;
            }
        });
        return index;
    }

    private setBeep(value: boolean, code?: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state !== AntiTheftSystemStates.READY && this.config.state !== AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        this.config.beep = value;
        this.emitter.emit(AntiTheftSystemEvents.BEEP_CHANGED, { beep: this.config.beep });
        return this.getSuccessResponse<void>();
    }

    private setSilentAlarm(value: boolean, code?: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state !== AntiTheftSystemStates.READY && this.config.state !== AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        this.config.silentAlarm = value;
        this.emitter.emit(AntiTheftSystemEvents.SILENT_ALARM_CHANGED, { silentAlarm: this.config.silentAlarm });
        return this.getSuccessResponse<void>();
    }

    private clientIsOnline(clientId: string): boolean {
        for(const id in this.onlineClients) {
            if(id === clientId) {
                return true;
            }
        }
        return false;
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

    public setProgrammingMode(adminCode: string): AntiTheftSystemResponse<void> {
        const currentState = this.config.state;
        if(currentState !== AntiTheftSystemStates.READY && currentState !== AntiTheftSystemStates.DISARMED) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        if(!this.validateCode(adminCode, 'admin')) {
            this.emitter.emit(AntiTheftSystemEvents.NOT_AUTHORIZED, { action: 'setProgrammingMode', config: this.config });
            return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }

        this.setSystemState(AntiTheftSystemStates.PROGRAMMING);

        setTimeout(() => {
            if (this.config.state === AntiTheftSystemStates.PROGRAMMING) {
                this.setSystemState(AntiTheftSystemStates.DISARMED);
            }
        }, this.programmingStateDuration);

        return this.getSuccessResponse<void>();
    }

    public unsetProgrammingMode(): AntiTheftSystemResponse<void> {
        const currentState = this.config.state;
        if(currentState !== AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        this.setSystemState(AntiTheftSystemStates.DISARMED);
        return this.getSuccessResponse<void>();
    }

    public setGuestCode(ownerCode: string, guestCode: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        return this.updateCode(ownerCode, guestCode, 'owner', 'guest');
    }

    public updateOwnerCode(currentCode: string, newCode: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        return this.updateCode(currentCode, newCode, 'owner');
    }

    public updateAdminCode(currentCode: string, newCode: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        return this.updateCode(currentCode, newCode, 'admin');
    }

    public setSensor(sensor: Sensor): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        // TODO: validate Sensor info (gpios)
        const index = this.getSensorIndexByLocation(sensor.location);
        if(index < 0) {
            this.config.sensors.push(sensor);
            this.emitter.emit(AntiTheftSystemEvents.SENSOR_REGISTERED, { sensor });
        } else {
            const currentSensor: Sensor = this.config.sensors[index];
            this.config.sensors[index] = sensor;
            this.emitter.emit(AntiTheftSystemEvents.SENSOR_CHANGED, { before: currentSensor, after: sensor });
        }
        return this.getSuccessResponse<void>();
    }

    public unsetSensor(location: SensorLocation): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        const index = this.getSensorIndexByLocation(location);
        if(index < 0) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SENSOR_LOCATION);
        }
        const deletedSensors: Sensor[] = this.config.sensors.splice(index, 1);
        this.emitter.emit(AntiTheftSystemEvents.SENSOR_DELETED, { sensor: deletedSensors[0] });
        return this.getSuccessResponse<void>();
    }

    public setEntryTime(seconds: number, code?: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state !== AntiTheftSystemStates.READY && this.config.state !== AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        if(seconds < 5 || seconds > (60 * 5)) { // TODO: Min & Max entry time (5 min)
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_ENTRY_TIME_VALUE);
        }
        this.config.entryTime = seconds;
        this.emitter.emit(AntiTheftSystemEvents.ENTRY_TIME_CHANGED, { entryTime: seconds });
        return this.getSuccessResponse<void>();
    }

    public setExitTime(seconds: number, code?: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state !== AntiTheftSystemStates.READY && this.config.state !== AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        if(seconds < 5 || seconds > (60 * 10)) { // TODO: Min & Max entry time (10 min)
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_EXIT_TIME_VALUE);
        }
        this.config.exitTime = seconds;
        this.emitter.emit(AntiTheftSystemEvents.EXIT_TIME_CHANGED, { exitTime: seconds });
        return this.getSuccessResponse<void>();
    }

    public turnOnBeep(code?: string): AntiTheftSystemResponse<void> {
        return this.setBeep(true, code);
    }

    public turnOffBeep(code?: string): AntiTheftSystemResponse<void> {
        return this.setBeep(false, code);
    }

    public toggleBeep(code?: string): AntiTheftSystemResponse<void> {
        return this.setBeep(!this.config.beep, code);
    }

    public turnOnSilentAlarm(code?: string): AntiTheftSystemResponse<void> {
        return this.setSilentAlarm(true, code);
    }

    public turnOffSilentAlarm(code?: string): AntiTheftSystemResponse<void> {
        return this.setSilentAlarm(false, code);
    }

    public toggleSilentAlarm(code?: string): AntiTheftSystemResponse<void> {
        return this.setSilentAlarm(!this.config.silentAlarm, code);
    }

    public getCentralPhone(): AntiTheftSystemResponse<string> {
        const phone: string = this.config.phones.central || '';
        return this.getSuccessResponse<string>(phone);
    }

    public setCentralPhone(phone: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        // TODO: Validate phone format
        this.config.phones.central = phone;
        this.emitter.emit(AntiTheftSystemEvents.CENTRAL_PHONE_CHANGED, { phone });
        return this.getSuccessResponse<void>();
    }

    public unsetCentralPhone(): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        this.config.phones.central = '';
        this.emitter.emit(AntiTheftSystemEvents.CENTRAL_PHONE_CHANGED, { phone: '' });
        return this.getSuccessResponse<void>();
    }

    public getAdminPhone(): AntiTheftSystemResponse<string> {
        const phone: string = this.config.phones.admin || '';
        return this.getSuccessResponse<string>(phone);
    }

    public setAdminPhone(phone: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        // TODO: Validate phone format
        this.config.phones.admin = phone;
        this.emitter.emit(AntiTheftSystemEvents.ADMIN_PHONE_CHANGED, { phone });
        return this.getSuccessResponse<void>();
    }

    public unsetAdminPhone(): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        this.config.phones.admin = '';
        this.emitter.emit(AntiTheftSystemEvents.ADMIN_PHONE_CHANGED, { phone: '' });
        return this.getSuccessResponse<void>();
    }

    public getOwnerPhones(): AntiTheftSystemResponse<string[]> {
        const phones: string[] = this.config.phones.owner || [];
        return this.getSuccessResponse<string[]>(phones);
    }

    public addOwnerPhone(phone: string, code?: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state !== AntiTheftSystemStates.READY && this.config.state !== AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        // TODO: Validate phone format
        // TODO: Validate repeat
        // TODO: Validate max
        // TODO: Send SMS
        this.config.phones.owner.push(phone);
        this.emitter.emit(AntiTheftSystemEvents.OWNER_PHONE_ADDED, { phone });
        return this.getSuccessResponse<void>();
    }

    public updateOwnerPhone(index: number, phone: string, code?: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state !== AntiTheftSystemStates.READY && this.config.state !== AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        // TODO: Validate phone format
        // TODO: Validate repeat
        // TODO: Send SMS
        if(index < 0 || index > this.config.phones.owner.length) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_PHONE_POSITION);
        }
        this.config.phones.owner[index] = phone
        this.emitter.emit(AntiTheftSystemEvents.OWNER_PHONE_CHANGED, { phone });
        return this.getSuccessResponse<void>();
    }

    public deleteOwnerPhone(index: number, code?: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state !== AntiTheftSystemStates.READY && this.config.state !== AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        // TODO: Validate phone format
        // TODO: Validate repeat
        // TODO: Send SMS
        if(index < 0 || index > this.config.phones.owner.length) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_PHONE_POSITION);
        }
        const phone = this.config.phones.owner.splice(index, 1);
        this.emitter.emit(AntiTheftSystemEvents.OWNER_PHONE_DELETED, { phone: phone[0] });
        return this.getSuccessResponse<void>();
    }

    public getCentralEmail(): AntiTheftSystemResponse<string> {
        const email: string = this.config.emails.central || '';
        return this.getSuccessResponse<string>(email);
    }

    public setCentralEmail(email: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        // TODO: Validate email format
        this.config.emails.central = email;
        this.emitter.emit(AntiTheftSystemEvents.CENTRAL_EMAIL_CHANGED, { email });
        return this.getSuccessResponse<void>();
    }

    public unsetCentralEmail(): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        this.config.emails.central = '';
        this.emitter.emit(AntiTheftSystemEvents.CENTRAL_EMAIL_CHANGED, { email: '' });
        return this.getSuccessResponse<void>();
    }

    public getAdminEmail(): AntiTheftSystemResponse<string> {
        const email: string = this.config.emails.admin || '';
        return this.getSuccessResponse<string>(email);
    }

    public setAdminEmail(email: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        // TODO: Validate email format
        this.config.emails.admin = email;
        this.emitter.emit(AntiTheftSystemEvents.ADMIN_EMAIL_CHANGED, { email });
        return this.getSuccessResponse<void>();
    }

    public unsetAdminEmail(): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        // TODO: Validate email format
        this.config.emails.admin = '';
        this.emitter.emit(AntiTheftSystemEvents.ADMIN_EMAIL_CHANGED, { email: '' });
        return this.getSuccessResponse<void>();
    }

    public getOwnerEmails(): AntiTheftSystemResponse<string[]> {
        const emails: string[] = this.config.emails.owner || [];
        return this.getSuccessResponse<string[]>(emails);
    }

    public addOwnerEmail(email: string, code?: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state !== AntiTheftSystemStates.READY && this.config.state !== AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        // TODO: Validate email format
        // TODO: Validate repeat
        // TODO: Validate max
        // TODO: Send email notification
        this.config.emails.owner.push(email);
        this.emitter.emit(AntiTheftSystemEvents.OWNER_EMAIL_ADDED, { email });
        return this.getSuccessResponse<void>();
    }

    public updateOwnerEmail(index: number, email: string, code?: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state !== AntiTheftSystemStates.READY && this.config.state !== AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        // TODO: Validate email format
        // TODO: Validate repeat
        // TODO: Send email notification
        if(index < 0 || index > this.config.emails.owner.length) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_EMAIL_POSITION);
        }
        this.config.emails.owner[index] = email
        this.emitter.emit(AntiTheftSystemEvents.OWNER_EMAIL_CHANGED, { email });
        return this.getSuccessResponse<void>();
    }

    public deleteOwnerEmail(index: number, code?: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            if(this.config.state !== AntiTheftSystemStates.READY && this.config.state !== AntiTheftSystemStates.DISARMED) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
            }
            if (!code || !this.validateCode(code, 'owner')) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);
            }
        }
        // TODO: Validate email format
        // TODO: Validate repeat
        // TODO: Send email notification
        if(index < 0 || index > this.config.emails.owner.length) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_EMAIL_POSITION);
        }
        const email = this.config.emails.owner.splice(index, 1);
        this.emitter.emit(AntiTheftSystemEvents.OWNER_EMAIL_DELETED, { email: email[0] });
        return this.getSuccessResponse<void>();
    }

    public generateSecret(): AntiTheftSystemResponse<string> {
        if(this.config.state !== AntiTheftSystemStates.PROGRAMMING) {
            return this.getErrorResponse<string>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        const secret: string = this.otpProvider.getSecret();
        return this.getSuccessResponse<string>(secret);

    }
    public validateClient(clientId: string, token: string): AntiTheftSystemResponse<void> {
        if (!this.config.clients[clientId]) {
            console.log(`Client ${clientId} not exits`);
            return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }
        const secret: string = this.config.clients[clientId];
        const result: boolean = this.otpProvider.verify(token, secret);
        if (!result) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }
        return this.getSuccessResponse<void>();
    }

    public getState(): AntiTheftSystemResponse<SystemState> {
        const currntSystemState: SystemState = this.getSystemState();
        return this.getSuccessResponse<SystemState>(currntSystemState);
    }

    public getConfig(): AntiTheftSystemResponse<AntiTheftSystemConfig> {
        return this.getSuccessResponse<AntiTheftSystemConfig>(this.config);
    }

    public bypassOne(location: SensorLocation, code?: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.READY && this.config.state !== AntiTheftSystemStates.DISARMED) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        if (!code || (!this.validateCode(code, 'owner') && !this.validateCode(code, 'guest'))) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }
        let index: number = this.getSensorIndexByLocation(location);
        if(index < 0) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SENSOR_LOCATION);
        }

        index = this.getBypassByLocation(location);
        if(index < 0) {
            this.config.bypass.push(location);
            this.emitter.emit(AntiTheftSystemEvents.BYPASS_CHANGE, { bypass: this.config.bypass });
        }

        return this.getSuccessResponse<void>();
    }

    public bypassAll(locations: SensorLocation[], code?: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.READY && this.config.state !== AntiTheftSystemStates.DISARMED) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        if (!code || (!this.validateCode(code, 'owner') && !this.validateCode(code, 'guest'))) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }
        locations.forEach((location: SensorLocation, i: number) => {
            const index: number = this.getSensorIndexByLocation(location);
            if(index < 0) {
                return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SENSOR_LOCATION);
            }
        });

        const notFoundList: SensorLocation[] = [];
        locations.forEach((l: SensorLocation) => {
            const index: number = this.getBypassByLocation(l);
            if(index < 0) {
                notFoundList.push(l);
            }
        });
        if (notFoundList.length > 0) {
            notFoundList.forEach((l: SensorLocation) => this.config.bypass.push(l));
            this.emitter.emit(AntiTheftSystemEvents.BYPASS_CHANGE, { bypass: this.config.bypass });
        }

        return this.getSuccessResponse<void>();
    }

    public clearBypass(code?: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.READY && this.config.state !== AntiTheftSystemStates.DISARMED) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        if (!code || (!this.validateCode(code, 'owner') && !this.validateCode(code, 'guest'))) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }
        this.config.bypass = [];
        this.emitter.emit(AntiTheftSystemEvents.BYPASS_CHANGE, { bypass: this.config.bypass });
        return this.getSuccessResponse<void>();
    }

    public clearBypassOne(location: SensorLocation, code?: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.READY && this.config.state !== AntiTheftSystemStates.DISARMED) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        if(!code || (!this.validateCode(code, 'owner') && !this.validateCode(code, 'guest'))) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }
        let index: number = this.getSensorIndexByLocation(location);
        if(index < 0) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SENSOR_LOCATION);
        }

        this.config.bypass.forEach((s: SensorLocation, i: number) => {
            if(SensorLocation.equals(s, location)) {
                index = i;
                return;
            }
        });
        this.config.bypass.splice(index, 1);
        this.emitter.emit(AntiTheftSystemEvents.BYPASS_CHANGE, { bypass: this.config.bypass });
        return this.getSuccessResponse<void>();
    }

    public arm(mode: AntiTheftSystemArmedModes, code?: string): AntiTheftSystemResponse<void> {
        if(this.config.state !== AntiTheftSystemStates.READY) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        if (code && (!this.validateCode(code, 'owner') && !this.validateCode(code, 'guest'))) { // TODO: code is optional? !code || !this.validateCode(code, 'owner') || !this.validateCode(code, 'guest')
            return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }
        this.setSystemState(AntiTheftSystemStates.LEAVING);
        const exitTime = this.config.exitTime * 1000;

        mode = parseInt(mode.toString(), 10);

        /*this.leavingTimeout =*/ setTimeout(() => {
            this.setSystemState(AntiTheftSystemStates.ARMED, mode);
        }, exitTime);

        return this.getSuccessResponse<void>();
    }

    public disarm(code: string): AntiTheftSystemResponse<void> {
        const state = this.config.state;
        if(state !== AntiTheftSystemStates.ARMED && state !== AntiTheftSystemStates.ENTERING && state !== AntiTheftSystemStates.ALARMED) { // TODO: Add LEAVING
            return this.getErrorResponse<void>(AntiTheftSystemErrors.INVALID_SYSTEM_STATE);
        }
        if (!this.validateCode(code, 'owner') && !this.validateCode(code, 'guest')) {
            return this.getErrorResponse<void>(AntiTheftSystemErrors.NOT_AUTHORIZED);
        }
        let newState: AntiTheftSystemStates;
        if (this.activatedSensors.length > 0) {
            newState = AntiTheftSystemStates.DISARMED;
        } else {
            newState = AntiTheftSystemStates.READY;
        }
        const systemState: SystemState = this.setSystemState(newState);
        this.emitter.emit(AntiTheftSystemEvents.SYSTEM_DISARMED, { system: systemState });
        return this.getSuccessResponse<void>();
    }

    public addWebSocketChannel(channel: WebSocketChannel): void {
        channel.on(WebSocketChannleEvents.WEBSOCKET_CLIENT_STATE, (eventData: WebSocketChannelEventData<StateEventData>) => {
            if(eventData.clientId) {
                if(!this.clientIsOnline(eventData.clientId)) {
                    this.logger.warn('[WARN] Client is already online', { data: eventData });
                    this.onlineClients[eventData.clientId] = eventData.webSocketClientId;
                    /*if(eventData.data.sensor && eventData.data.sensor.location) {
                        this.config.sensors.forEach((s: Sensor) => {
                            if (SensorLocation.equals(s.location, eventData.data.sensor.location)) {
                                s.online = true;
                                return;
                            }
                        });
                    }
                    this.emitter.emit(AntiTheftSystemEvents.CLIENT_ONLINE, eventData);*/
                }
                if(this.onlineClients[eventData.clientId] !== eventData.webSocketClientId) {
                    this.logger.warn('[WARN] Bad web socket clientId', { data: eventData });
                    delete this.onlineClients[eventData.clientId];
                    this.emitter.emit(AntiTheftSystemEvents.CLIENT_OFFLINE, { clientId: eventData.clientId });
                    return;
                }
                const state: StateEventData = eventData.data;
                const location: SensorLocation = SensorLocation.getSensorLocationFromData(state.sensor.location);
                this.config.sensors.forEach((sensor: Sensor) => {
                    if(SensorLocation.equals(sensor.location, location)) {
                        this.emitter.emit(AntiTheftSystemEvents.SENSOR_ACTIVED, { sensor, value: state.sensor.value });
                    }
                });
            }
        });

        channel.on(WebSocketChannleEvents.WEBSOCKET_CLIENT_DISCONNECTED, (eventData: WebSocketChannelEventData<any>) => {
            const clientId: string = eventData.clientId;
            if(clientId) {
                if(eventData.data && eventData.data.mac) {
                    const mac = eventData.data.mac;
                    this.config.sensors.forEach((s: Sensor) => {
                        if(s.location.mac === mac) {
                            s.online = false;
                        }
                    });
                }

                const activatedSensorsOfClient: Sensor[] = [];
                this.activatedSensors.forEach((s: Sensor, i: number) => {
                    if (s.location.mac === eventData.data.mac) {
                        activatedSensorsOfClient.push(s);
                    }
                });

                if(activatedSensorsOfClient.length > 0) {
                    activatedSensorsOfClient.forEach((s: Sensor) => {
                        this.emitter.emit(AntiTheftSystemEvents.SENSOR_ACTIVED, { sensor: s, value: 0 });
                    });
                }

                if (this.offlineClientsTimers[clientId]) {
                    this.offlineClientsTimers[clientId].unref();
                    clearTimeout(this.offlineClientsTimers[clientId]);
                    delete this.offlineClientsTimers[clientId];
                }
                this.offlineClientsTimers[clientId] = setTimeout(() => {
                    delete this.onlineClients[eventData.clientId];
                    const clientEventData: ClientEventData = {
                        clientId: eventData.clientId,
                        mac: eventData.data.mac ? eventData.data.mac : undefined
                    };
                    this.emitter.emit(AntiTheftSystemEvents.CLIENT_OFFLINE, clientEventData);
                }, 25000);
            }
        });

        channel.on(WebSocketChannleEvents.AUTHORIZED_WEBSOCKET_CLIENT, (eventData: WebSocketChannelEventData<any>) => {
            const clientId: string = eventData.clientId;
            if(clientId) {
                if(this.clientIsOnline(clientId)) {
                    this.logger.warn('[WARN] Client is already auth', { data: eventData });
                }
                if(eventData.data && eventData.data.mac) {
                    const mac = eventData.data.mac;
                    this.config.sensors.forEach((s: Sensor) => {
                        if (s.location.mac === mac) {
                            s.online = true;
                        }
                    });
                }
                this.onlineClients[clientId] = eventData.webSocketClientId;

                if (this.offlineClientsTimers[clientId]) {
                    this.offlineClientsTimers[clientId].unref();
                    clearTimeout(this.offlineClientsTimers[clientId]);
                    delete this.offlineClientsTimers[clientId];
                }

                const clientEventData: ClientEventData = {
                    clientId,
                    mac: eventData.data.mac ? eventData.data.mac : undefined
                };
                this.emitter.emit(AntiTheftSystemEvents.CLIENT_ONLINE, clientEventData);
            }
        });
    }

    stop(): void {
        if(this.fileWatcher) {
            console.log('fileWatcher remove all listeners...');
            this.fileWatcher.removeAllListeners();
            this.fileWatcher.close();
            this.fileWatcher = null;
        }
        for (const k of Object.keys(this.offlineClientsTimers)) {
            console.log('unref ', k);
            this.offlineClientsTimers[k].unref();
            clearTimeout(this.offlineClientsTimers[k]);
        }
        this.offlineClientsTimers = null;
    }
}
