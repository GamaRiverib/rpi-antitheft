// import { EventEmitter } from 'events';
import winston = require("winston");
import { connect, IClientOptions, Client, IClientSubscribeOptions } from "mqtt";
import { AntiTheftSystemAPI } from "../AntiTheftSystemAPI";
import { Logger } from "../utils/Logger";
import { AntiTheftSystemEvents, AntiTheftSystemEventData, SensorActivedEventData } from '../AntiTheftSystemEvents';
import { Conversions } from '../utils/Conversions';
import { Sensor, SensorLocation } from '../Sensor';
import { AntiTheftSystemResponse } from '../AntiTheftSystemResponse';
import { AntiTheftSystemConfig } from '../AntiTheftSystemConfig';

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://192.168.137.1';
const MQTT_BROKER_PORT = process.env.MQTT_BROKER_PORT || 1883;
const MQTT_CLIENT_ID = process.env.MQTT_CLIENT_ID || 'ats';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'ats';

export class MqttChannel {

    private static INSTANCE: MqttChannel = null;

    private mqttClient: Client;

    // private emitter: EventEmitter;

    private eventsId: { [event: string]: string } = {};

    private logger: winston.Logger;

    private sensors: Sensor[] = [];

    private constructor(private ats: AntiTheftSystemAPI) {

        this.logger = Logger.getLogger('MqttChannel');

        this.configureEventsId();

        this.configureSensors();

        // this.emitter = new EventEmitter();

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
    }

    private configureSensors(): void {
        let res: AntiTheftSystemResponse<AntiTheftSystemConfig> = this.ats.getConfig();
        if(res.data) {
            let bypass: SensorLocation[] = res.data.bypass || [];
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
                    let sensorData: any = Object.assign({}, s, { bypass: found });
                    this.sensors.push(sensorData);
                });
            }
        }
    }

    private configureMqttClient(): void {
        // connect to mqtt
        let mqttOpts: IClientOptions = {
            clean: false,
            clientId: MQTT_CLIENT_ID,
            // protocol: "ws",
            reconnectPeriod: 5 * 1000,
            will: {
                payload: 'OFFLINE',
                topic: `${MQTT_TOPIC}/LWT`,
                retain: true,
                qos: 0
            }
        };
        this.mqttClient = connect(`${MQTT_BROKER_URL}:${MQTT_BROKER_PORT}`, mqttOpts);

        this.mqttClient.on('error', this.onMqttClientError.bind(this));
        this.mqttClient.on('connect', this.onMqttClientConnected.bind(this));
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
    }

    private setupOwnEvents(): void {
        // TODO
    }

    private onSystemEventHandler(eventId: string, data: AntiTheftSystemEventData): void {
        let event = this.eventsId[eventId];
        if(event) {
            let topic: string = `${MQTT_TOPIC}/${eventId}`;
            let payload: string = this.getPayload(data);
            this.mqttClient.publish(topic, payload);
        }
    }
    
    private getPayload(data: AntiTheftSystemEventData): string {
        let payload = '';
        let s = data.system;
        if(s) {
            payload = `${s.state}${s.mode || 0}`;
            if (s.leftTime > 0) {
                let leftTimeout = Math.round((s.leftTime - s.uptime) / 1000);
                payload += Conversions.leftpad(leftTimeout.toString(32).toUpperCase(), 2, '0');
            } else {
                payload += '00';
            }
            if(s.activedSensors.length > 0) {
                payload += Conversions.leftpad(s.activedSensors.length.toString(32).toUpperCase(), 2, '0');
            } else {
                payload += '00';
            }
            s.activedSensors.forEach((sensor: Sensor, i: number) => {
                this.sensors.forEach((s: Sensor, i: number) => {
                    if(SensorLocation.equals(s.location, sensor.location)) {
                        payload += Conversions.leftpad(i.toString(32).toUpperCase(), 2, '0');
                        return;
                    }
                });
            });
        }
        return payload;
    }

    private getSubcribeTopics(): string[] {
        let topics: string[] = [];
        topics.push(`${MQTT_TOPIC}/cmnd`);
        return topics;
    }

    private onMqttClientConnected(): void {
        this.logger.info('MQTT Channel connected to Broker', { data: { broker: MQTT_BROKER_URL, port: MQTT_BROKER_PORT } });
        if (this.mqttClient) {
            this.mqttClient.publish(`${MQTT_TOPIC}/LWT`, 'ONLINE');

            let topics: string[] = this.getSubcribeTopics();
            this.mqttClient.subscribe(topics, { qos: 0 }, this.subscriptionsResultCb.bind(this));
            this.mqttClient.on("message", this.messageHandler.bind(this));
        }
    }

    private onMqttClientError(error: any): void {
        this.logger.error('MQTT client cannot connect', { data: { error } });
    }

    private subscriptionsResultCb(err: any, granted: [{ topic: string, qos: number }]): void {
        if(err) {
            this.logger.error('Subcribe to topics failed', err);
            return;
        }

        this.logger.info('Subscribed to', { data: { granted } });
    }

    private messageHandler(topic: string, message: string): void {
        console.log(`${topic} \t ${message}`);
    }

    public static start(ats: AntiTheftSystemAPI): MqttChannel {
        if (MqttChannel.INSTANCE == null) {
            MqttChannel.INSTANCE = new MqttChannel(ats);
        }
        return MqttChannel.INSTANCE;
    }

    public static stop(): void {
        if(MqttChannel.INSTANCE) {
            let topics: string[] = MqttChannel.INSTANCE.getSubcribeTopics();
            MqttChannel.INSTANCE.mqttClient.unsubscribe(topics);
            MqttChannel.INSTANCE.mqttClient.removeAllListeners();
            MqttChannel.INSTANCE.mqttClient.end(true, () => {
                MqttChannel.INSTANCE.mqttClient = null;
                MqttChannel.INSTANCE = null;
            });
        }
    }
    
}