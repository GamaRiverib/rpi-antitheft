import { EventEmitter } from "events";
import winston = require("winston");
import { connect, IClientOptions, Client, IClientPublishOptions } from "mqtt";
import { AntiTheftSystemAPI } from "../AntiTheftSystemAPI";
import { getLogger } from "../../utils/Logger";
import { AntiTheftSystemEvents, AntiTheftSystemEventData, ClientEventData } from "../AntiTheftSystemEvents";
import { Sensor } from "../Sensor";
import { SensorLocation } from "../SensorLocation";
import { AntiTheftSystemResponse } from "../AntiTheftSystemResponse";
import { AntiTheftSystemConfig } from "../AntiTheftSystemConfig";
import { SystemState } from "../SystemState";

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://127.0.0.1";
const MQTT_BROKER_PORT = process.env.MQTT_BROKER_PORT || 1883;
const MQTT_CLIENT_ID = process.env.MQTT_CLIENT_ID || "ats_system_mqtt_client";
const MQTT_TOPIC = process.env.MQTT_TOPIC || "/ats";
const MQTT_USER = process.env.MQTT_USER || "";
const MQTT_PASS = process.env.MQTT_PASS || "";

export class MqttChannleEvents {
    public static readonly CLIENT_CONNECTED = "CLIENT_CONNECTED";
    public static readonly CLIENT_DISCONNECTED = "CLIENT_DISCONNECTED";
    public static readonly CLIENT_STATE = "CLIENT_STATE";
}

// tslint:disable-next-line: max-classes-per-file
export class MqttChannel {

    private static INSTANCE: MqttChannel = null;

    private mqttClient: Client;

    private emitter: EventEmitter;

    private eventsId: { [event: string]: string } = {};

    private logger: winston.Logger;

    private sensors: Sensor[] = [];

    private constructor(private ats: AntiTheftSystemAPI) {

        this.logger = getLogger("MqttChannel");

        this.configureEventsId();

        this.configureSensors();

        this.emitter = new EventEmitter();

        this.configureMqttClient();

        this.setupAtsEvents();

        this.setupOwnEvents();
    }

    private configureEventsId(): void {
        let index = -1;
        AntiTheftSystemEvents.eventsList().forEach((event: string, i: number) => {
            this.eventsId[event] = (++index).toString();
        });
    }

    private updateSensors(): void {
        this.configureSensors();
        if(this.mqttClient) {
            this.mqttClient.publish(`${MQTT_TOPIC}/sensors`, JSON.stringify(this.sensors), { retain: true, qos: 1 });
        }
    }

    private configureSensors(): void {
        const res: AntiTheftSystemResponse<AntiTheftSystemConfig> = this.ats.getConfig();
        if(res.data) {
            const bypass: SensorLocation[] = res.data.bypass || [];
            if (res.data.sensors.length > 0) {
                this.sensors = [];
                res.data.sensors.forEach((s: Sensor) => {
                    let found: boolean = false;
                    bypass.forEach((l: SensorLocation) => {
                        if(SensorLocation.equals(l, s.location)) {
                            found = true;
                            return;
                        }
                    });
                    const sensorData: any = Object.assign({}, s, { bypass: found });
                    this.sensors.push(sensorData);
                });
            }
        }
    }

    private configureMqttClient(): void {
        // connect to mqtt
        const mqttOpts: IClientOptions = {
            clean: false,
            clientId: MQTT_CLIENT_ID,
            // protocol: "ws",
            username: MQTT_USER,
            password: MQTT_PASS,
            reconnectPeriod: 5 * 1000,
            will: {
                payload: "offline",
                topic: `${MQTT_TOPIC}/lwt`,
                retain: true,
                qos: 0
            }
        };
        this.mqttClient = connect(`${MQTT_BROKER_URL}:${MQTT_BROKER_PORT}`, mqttOpts);

        this.mqttClient.on("error", this.onMqttClientError.bind(this));
        this.mqttClient.on("connect", this.onMqttClientConnected.bind(this));
    }

    private setupAtsEvents(): void {
        this.ats.on(AntiTheftSystemEvents.SYSTEM_ALERT, (data: AntiTheftSystemEventData) =>
            this.onSystemEventHandler.call(this, AntiTheftSystemEvents.SYSTEM_ALERT, data));

        this.ats.on(AntiTheftSystemEvents.SYSTEM_ALARMED, (data: AntiTheftSystemEventData) =>
            this.onSystemEventHandler.call(this, AntiTheftSystemEvents.SYSTEM_ALARMED, data));

        this.ats.on(AntiTheftSystemEvents.SYSTEM_ARMED, (data: AntiTheftSystemEventData) =>
            this.onSystemEventHandler.call(this, AntiTheftSystemEvents.SYSTEM_ARMED, data));

        this.ats.on(AntiTheftSystemEvents.SYSTEM_DISARMED, (data: AntiTheftSystemEventData) =>
            this.onSystemEventHandler.call(this, AntiTheftSystemEvents.SYSTEM_DISARMED, data));

        this.ats.on(AntiTheftSystemEvents.SYSTEM_STATE_CHANGED, (data: AntiTheftSystemEventData) =>
            this.onSystemEventHandler.call(this, AntiTheftSystemEvents.SYSTEM_STATE_CHANGED, data));

        this.ats.on(AntiTheftSystemEvents.MAX_ALERTS, (data: AntiTheftSystemEventData) =>
            this.onSystemEventHandler.call(this, AntiTheftSystemEvents.MAX_ALERTS, data));

        this.ats.on(AntiTheftSystemEvents.MAX_UNAUTHORIZED_INTENTS, (data: AntiTheftSystemEventData) =>
            this.onSystemEventHandler.call(this, AntiTheftSystemEvents.MAX_UNAUTHORIZED_INTENTS, data));

        this.ats.on(AntiTheftSystemEvents.BYPASS_CHANGE, (data: AntiTheftSystemEventData) =>
            this.updateSensors.call(this));

        this.ats.on(AntiTheftSystemEvents.SENSOR_REGISTERED, (data: AntiTheftSystemEventData) =>
            this.updateSensors.call(this));

        this.ats.on(AntiTheftSystemEvents.SENSOR_CHANGED, (data: AntiTheftSystemEventData) =>
            this.updateSensors.call(this));

        this.ats.on(AntiTheftSystemEvents.SENSOR_DELETED, (data: AntiTheftSystemEventData) =>
            this.updateSensors.call(this));

        this.ats.on(AntiTheftSystemEvents.CLIENT_ONLINE, (data: ClientEventData) => {
            if(data.mac) {
                this.updateSensors();
            }
        });

        this.ats.on(AntiTheftSystemEvents.CLIENT_OFFLINE, (data: ClientEventData) =>  {
            if(data.mac) {
                this.updateSensors();
            }
        });
    }

    private setupOwnEvents(): void {
        // TODO
    }

    private onSystemEventHandler(eventId: string, data: AntiTheftSystemEventData): void {
        const event = this.eventsId[eventId];
        if(event) {
            const topic: string = `${MQTT_TOPIC}/state/${eventId}`;
            this.mqttClient.publish(topic, JSON.stringify(data.system), { qos: 1 });
        }
    }

    private getSubcribeTopics(): string[] {
        const topics: string[] = [];
        topics.push(`${MQTT_TOPIC}/devices/+/#`);
        return topics;
    }

    private onMqttClientConnected(): void {
        this.logger.info("MQTT Channel connected to Broker", { data: { broker: MQTT_BROKER_URL, port: MQTT_BROKER_PORT } });
        if (this.mqttClient) {
            this.mqttClient.publish(`${MQTT_TOPIC}/time`, (Math.round(Date.now() / 1000.0).toString()), { qos: 0 });

            const opts: IClientPublishOptions = { retain: true, qos: 1 };
            this.mqttClient.publish(`${MQTT_TOPIC}/lwt`, "online", opts);
            this.mqttClient.publish(`${MQTT_TOPIC}/events`, JSON.stringify(this.eventsId), opts);
            this.mqttClient.publish(`${MQTT_TOPIC}/sensors`, JSON.stringify(this.sensors), opts);

            const topics: string[] = this.getSubcribeTopics();
            this.mqttClient.subscribe(topics, { qos: 0 }, this.subscriptionsResultCb.bind(this));
            this.mqttClient.on("message", this.messageHandler.bind(this));
        }
    }

    private onMqttClientError(error: any): void {
        this.logger.error("MQTT client cannot connect", { data: { error } });
    }

    private subscriptionsResultCb(err: any, granted: [{ topic: string, qos: number }]): void {
        if(err) {
            this.logger.error("Subcribe to topics failed", err);
            return;
        }

        this.logger.info("Subscribed to", { data: { granted } });
    }

    private handleCommand(device: string, command: string, id: string, params?: any): void {
        this.logger.debug("Recieve command", { data: { command, id, params } });
        if (command === "state") {
            const response: AntiTheftSystemResponse<SystemState> = this.ats.getState();
            const state: SystemState = response.data;
            this.mqttClient.publish(`${MQTT_TOPIC}/devices/${device}/response/${id}`, JSON.stringify(state), { qos: 1 });
        } else if(command === "time") {
            const time: number = Math.round(Date.now() / 1000.0);
            this.mqttClient.publish(`${MQTT_TOPIC}/devices/${device}/response/${id}`, time.toString(), { qos: 1 });
        } else if (command === "arm") {
            try {
                if (params && params.token && Number.isInteger(params.mode)) {
                    let result: AntiTheftSystemResponse<void> = this.ats.validateClient(device, params.token);
                    if(result.success) {
                        result = this.ats.arm(params.mode, params.code);
                        this.mqttClient.publish(`${MQTT_TOPIC}/devices/${device}/response/${id}`, result.success.toString().toUpperCase(), { qos: 0 });
                    } else {
                        this.logger.warn("Invalid client", { data: { result, device, params } });
                    }
                } else {
                    this.logger.warn("Missing params", { data: { params } });
                }
            } catch(e) {
                this.logger.warn(e);
            }
        } else if (command === "disarm") {
            try {
                if (params && params.token && params.code) {
                    let result: AntiTheftSystemResponse<void> = this.ats.validateClient(device, params.token);
                    if(result.success) {
                        result = this.ats.disarm(params.code);
                        this.mqttClient.publish(`${MQTT_TOPIC}/devices/${device}/response/${id}`, result.success.toString().toUpperCase(), { qos: 0 });
                    } else {
                        this.logger.warn("Invalid client", { data: { result, device, params } });
                    }
                } else {
                    this.logger.warn("Missing params", { data: { params } });
                }
            } catch(e) {
                this.logger.warn(e);
            }
        } else if (command === "bypass") {
            try {
                if (params && params.token && params.location) {
                    let result: AntiTheftSystemResponse<void> = this.ats.validateClient(device, params.token);
                    if(result.success) {
                        result = this.ats.bypassOne(params.location, params.code);
                        this.mqttClient.publish(`${MQTT_TOPIC}/devices/${device}/response/${id}`, result.success.toString().toUpperCase(), { qos: 0 });
                    } else {
                        this.logger.warn("Invalid client", { data: { result, device, params } });
                    }
                } else {
                    this.logger.warn("Missing params", { data: { params } });
                }
            } catch(e) {
                this.logger.warn(e);
            }
        } else if (command === "clearbypassone") {
            try {
                if (params && params.token && params.location) {
                    let result: AntiTheftSystemResponse<void> = this.ats.validateClient(device, params.token);
                    if(result.success) {
                        result = this.ats.clearBypassOne(params.location, params.code);
                        this.mqttClient.publish(`${MQTT_TOPIC}/devices/${device}/response/${id}`, result.success.toString().toUpperCase(), { qos: 0 });
                    } else {
                        this.logger.warn("Invalid client", { data: { result, device, params } });
                    }
                } else {
                    this.logger.warn("Missing params", { data: { params } });
                }
            } catch(e) {
                this.logger.warn(e);
            }
        } else {
            this.logger.warn(`Command not implemented: ${command}`);
        }
    }

    private messageHandler(topic: string, message: Buffer): void {
        const TOPIC_PATTERN = /^(?<prefix>[a-zA-Z0-9_\/]*){1}\/devices\/(?<device>(?![_.])(?!.*[_.]{2})[a-zA-Z0-9._-]+(?<![_.])){1}\/(?<posfix>lwt|state|commands)$/gs;
        try {
            if (!topic.match(TOPIC_PATTERN)) {
                return;
            }
            const exec = TOPIC_PATTERN.exec(topic);
            if (!exec || !exec.groups) {
                return;
            }
            const prefix = exec.groups.prefix;
            const device = exec.groups.device;
            const posfix = exec.groups.posfix;

            if (prefix !== MQTT_TOPIC) {
                return;
            }

            const payload: string = message.toString();

            if (posfix === "lwt") {
                if (payload === "online") {
                    this.emitter.emit(MqttChannleEvents.CLIENT_CONNECTED, { device });
                } else {
                    this.emitter.emit(MqttChannleEvents.CLIENT_DISCONNECTED, { device })
                }
            } else if (posfix === "state") {
                const states: [{ mac: string, pin: number, value: 0|1 }] = JSON.parse(payload).sensors || [];
                this.emitter.emit(MqttChannleEvents.CLIENT_STATE, { device, states });
            } else if (posfix === "commands") {
                const data: { command: string, id: string, params?: any } = JSON.parse(payload);
                this.handleCommand(device, data.command, data.id, data.params);
            }

        } catch (error) {
            this.logger.error(error, { data: { topic, payload: message.toString() } });
        }
    }

    public on(event: string, listener: (... args: any[]) => void): void {
        this.emitter.addListener(event, listener);
    }

    public static start(ats: AntiTheftSystemAPI): MqttChannel {
        if (MqttChannel.INSTANCE == null) {
            MqttChannel.INSTANCE = new MqttChannel(ats);
        }
        return MqttChannel.INSTANCE;
    }

    public static stop(): void {
        if(MqttChannel.INSTANCE) {
            const topics: string[] = MqttChannel.INSTANCE.getSubcribeTopics();
            MqttChannel.INSTANCE.mqttClient.unsubscribe(topics);
            MqttChannel.INSTANCE.mqttClient.removeAllListeners();
            MqttChannel.INSTANCE.mqttClient.end(true, () => {
                MqttChannel.INSTANCE.mqttClient = null;
                MqttChannel.INSTANCE = null;
            });
        }
    }

}
