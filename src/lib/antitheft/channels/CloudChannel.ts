
import winston = require('winston');
import { AntiTheftSystemAPI } from '../AntiTheftSystemAPI';
import { app, credential, initializeApp, messaging } from 'firebase-admin';
import { AntiTheftSystemEvents, AntiTheftSystemEventData } from '../AntiTheftSystemEvents';
import { Logger } from '../utils/Logger';
import { AntiTheftSystemStates } from '../AntiTheftSystemStates';

const serviceAccount: string = process.env.GOOGLE_APPLICATION_CREDENTIALS;

export class CloudChannel {

    private static INSTANCE: CloudChannel = null;

    private eventsId: { [event: string]: string } = {};

    private logger: winston.Logger;

    private cloudClient: app.App = null;

    private messagingService: messaging.Messaging = null;

    private constructor(private ats: AntiTheftSystemAPI) {
        this.logger = Logger.getLogger('CloudChannel');
        this.cloudClient = initializeApp({ 
            credential: credential.cert(serviceAccount),
            projectId: 'antitheft-system'
        });

        this.messagingService = this.cloudClient.messaging();

        this.configureEventsId();
        this.setupAtsEvents();
        this.setupOwnEvents();
    }

    public static start(ats: AntiTheftSystemAPI): CloudChannel {
        if (CloudChannel.INSTANCE == null) {
            CloudChannel.INSTANCE = new CloudChannel(ats);
        }
        return CloudChannel.INSTANCE;
    }

    public static stop(): void {
        if(CloudChannel.INSTANCE) {
            CloudChannel.INSTANCE = null;
        }
    }

    private configureEventsId(): void {
        let index = -1;
        AntiTheftSystemEvents.eventsList().forEach((event: string, i: number) => {
            this.eventsId[event] = (++index).toString();
        });
    }

    private setupAtsEvents(): void {

        this.ats.on(AntiTheftSystemEvents.SYSTEM_ALARMED, (data: AntiTheftSystemEventData) =>
            this.sendNotificationAlarmed.call(this, data));
            
        this.ats.on(AntiTheftSystemEvents.SYSTEM_ARMED, (data: AntiTheftSystemEventData) =>
            this.sendNotificationArmed.call(this, data));
        
        this.ats.on(AntiTheftSystemEvents.SYSTEM_DISARMED, (data: AntiTheftSystemEventData) =>
            this.sendNotificationDisarmed.call(this, data));

        this.ats.on(AntiTheftSystemEvents.SYSTEM_STATE_CHANGED, (data: AntiTheftSystemEventData) =>
            this.sendNotificationStateChanged.call(this, data));

        this.ats.on(AntiTheftSystemEvents.MAX_ALERTS, (data: AntiTheftSystemEventData) =>
            this.sendNotificationMaxAlerts.call(this, data));

        this.ats.on(AntiTheftSystemEvents.MAX_UNAUTHORIZED_INTENTS, (data: AntiTheftSystemEventData) =>
            this.sendNotificationUnauthorizedIntents.call(this, data));

    }

    private setupOwnEvents(): void {
        
    }

    private sendNotificationAlarmed(data: AntiTheftSystemEventData): void {
        console.log('Send notification for Alarmed');
        const topic: string = 'ats';
        const payload: messaging.MessagingPayload = {
            data: {
                activedSensors: JSON.stringify(data.system.activedSensors),
                uptime: data.system.uptime.toString()
            },
            notification: {
                title: 'Antitheft System',
                body: 'SYSTEM ALARMED',
                color: '#FF0000'
            }
        };
        const options: messaging.MessagingOptions = { priority: 'high' };
        this.messagingService.sendToTopic(topic, payload, options)
            .then((resp: messaging.MessagingTopicResponse) => {
                console.log(resp.messageId);
            })
            .catch((reason: any) => {
                this.logger.error('Error Send Notification', { data: { error: reason, system: data.system } });
        });
    }

    private sendNotificationArmed(data: AntiTheftSystemEventData): void {
        console.log('Send notification for Armed');
        const topic: string = 'ats';
        const payload: messaging.MessagingPayload = {
            data: {
                activedSensors: JSON.stringify(data.system.activedSensors),
                uptime: data.system.uptime.toString()
            },
            notification: {
                title: 'Antitheft System',
                body: 'System Armed',
                color: '#00FF00'
            }
        };
        const options: messaging.MessagingOptions = { priority: 'normal' };
        this.messagingService.sendToTopic(topic, payload, options)
            .then((resp: messaging.MessagingTopicResponse) => {
                console.log(resp.messageId);
            })
            .catch((reason: any) => {
                this.logger.error('Error Send Notification', { data: { error: reason, system: data.system } });
        });
    }

    private sendNotificationDisarmed(data: AntiTheftSystemEventData): void {
        console.log('Send notification for Disarmed');
        const topic: string = 'ats';
        const payload: messaging.MessagingPayload = {
            data: {
                activedSensors: JSON.stringify(data.system.activedSensors),
                uptime: data.system.uptime.toString()
            },
            notification: {
                title: 'Antitheft System',
                body: 'System Disarmed',
                color: '#00FF00'
            }
        };
        const options: messaging.MessagingOptions = { priority: 'normal' };
        this.messagingService.sendToTopic(topic, payload, options)
            .then((resp: messaging.MessagingTopicResponse) => {
                console.log(resp.messageId);
            })
            .catch((reason: any) => {
                this.logger.error('Error Send Notification', { data: { error: reason, system: data.system } });
        });
    }

    private sendNotificationStateChanged(data: AntiTheftSystemEventData): void {
        const state: AntiTheftSystemStates = data.system.state;
        const topic: string = 'ats';
        let payload: messaging.MessagingPayload = {
            data: {
                activedSensors: JSON.stringify(data.system.activedSensors),
                uptime: data.system.uptime.toString()
            },
            notification: { title: 'Antitheft System' }
        };
        const options: messaging.MessagingOptions = { priority: 'normal' };
        switch(state) {
            case AntiTheftSystemStates.LEAVING:
                console.log('Send notification for Leaving');
                payload.notification.body = 'Leaving';
                payload.notification.color = '#0000FF';
                this.messagingService.sendToTopic(topic, payload, options)
                    .then((resp: messaging.MessagingTopicResponse) => {
                        console.log(resp.messageId);
                    })
                    .catch((reason: any) => {
                        this.logger.error('Error Send Notification', { data: { error: reason, system: data.system } });
                });
                break;
            case AntiTheftSystemStates.ENTERING:
                console.log('Send notification for Entering');
                payload.notification.body = 'Entering';
                payload.notification.color = '#FFFF00';
                this.messagingService.sendToTopic(topic, payload, options)
                    .then((resp: messaging.MessagingTopicResponse) => {
                        console.log(resp.messageId);
                    })
                    .catch((reason: any) => {
                        this.logger.error('Error Send Notification', { data: { error: reason, system: data.system } });
                });
                break;
        }
    }

    private sendNotificationMaxAlerts(data: AntiTheftSystemEventData): void {
        console.log('Send notification for Max Alerts');
        const topic: string = 'ats';
        const payload: messaging.MessagingPayload = {
            data: {
                activedSensors: JSON.stringify(data.system.activedSensors),
                uptime: data.system.uptime.toString()
            },
            notification: {
                title: 'Antitheft System',
                body: 'MAX ALERTS',
                color: '#FFFF00'
            }
        };
        const options: messaging.MessagingOptions = { priority: 'high' };
        this.messagingService.sendToTopic(topic, payload, options)
            .then((resp: messaging.MessagingTopicResponse) => {
                console.log(resp.messageId);
            })
            .catch((reason: any) => {
                this.logger.error('Error Send Notification', { data: { error: reason, system: data.system } });
        });
    }

    private sendNotificationUnauthorizedIntents(data: AntiTheftSystemEventData): void {
        console.log('Send notification for Unauthorized Intents');
        const topic: string = 'ats';
        const payload: messaging.MessagingPayload = {
            data: {
                activedSensors: JSON.stringify(data.system.activedSensors),
                uptime: data.system.uptime.toString()
            },
            notification: {
                title: 'Antitheft System',
                body: 'Max unauthorized intents',
                color: '#FFFF00'
            }
        };
        const options: messaging.MessagingOptions = { priority: 'normal' };
        this.messagingService.sendToTopic(topic, payload, options)
            .then((resp: messaging.MessagingTopicResponse) => {
                console.log(resp.messageId);
            })
            .catch((reason: any) => {
                this.logger.error('Error Send Notification', { data: { error: reason, system: data.system } });
        });
    }


}