
import winston = require('winston');
import { AntiTheftSystemAPI } from '../AntiTheftSystemAPI';
import { app, credential, initializeApp, messaging } from 'firebase-admin';
import { AntiTheftSystemEvents, AntiTheftSystemEventData } from '../AntiTheftSystemEvents';
import { getLogger } from '../../utils/Logger';
import { AntiTheftSystemStates } from '../AntiTheftSystemStates';
import { SystemState } from '../SystemState';
import { AntiTheftSystemResponse } from '../AntiTheftSystemResponse';

const serviceAccount: string = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const projectId: string = process.env.GOOGLE_PROJECT_ID;

export class CloudChannel {

    private static INSTANCE: CloudChannel = null;

    private eventsId: { [event: string]: string } = {};

    private logger: winston.Logger;

    private cloudClient: app.App = null;

    private messagingService: messaging.Messaging = null;

    private constructor(private ats: AntiTheftSystemAPI) {
        this.logger = getLogger('CloudChannel');
        this.cloudClient = initializeApp({
            credential: credential.cert(serviceAccount),
            projectId
        });

        this.messagingService = this.cloudClient.messaging();

        this.configureEventsId();
        this.setupAtsEvents();
        this.setupOwnEvents();

        const response: AntiTheftSystemResponse<SystemState> = this.ats.getState();

        this.sendStartupNotification(response.data);
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

    // tslint:disable-next-line: no-empty
    private setupOwnEvents(): void {

    }

    private getServerDateTimeString(): string {
        const now = new Date();
        return `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
    }

    private sendStartupNotification(system: SystemState): void {
        const topic: string = 'ats';
        const payload: messaging.MessagingPayload = {
            data: {
                system: JSON.stringify(system)
            },
            notification: {
                title: 'Antitheft System',
                body: `[${this.getServerDateTimeString()}] Startup...`,
                color: '#FFFF00'
            }
        };
        const options: messaging.MessagingOptions = { priority: 'high' };
        this.messagingService.sendToTopic(topic, payload, options)
            .then((resp: messaging.MessagingTopicResponse) => {
                console.log('Startup Notification', resp.messageId);
            })
            .catch((reason: any) => {
                this.logger.error('Error Send Notification', { data: { error: reason, system } });
        });
    }

    private sendNotificationAlarmed(data: AntiTheftSystemEventData): void {
        console.log('Send notification for Alarmed');
        const topic: string = 'ats';
        const payload: messaging.MessagingPayload = {
            data: {
                system: JSON.stringify(data.system)
            },
            notification: {
                title: 'Antitheft System',
                body: `[${this.getServerDateTimeString()}] SYSTEM ALARMED`,
                color: '#FF0000'
            }
        };
        const options: messaging.MessagingOptions = { priority: 'high' };
        this.messagingService.sendToTopic(topic, payload, options)
            .then((resp: messaging.MessagingTopicResponse) => {
                console.log('Alarmed Notification', resp.messageId);
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
                system: JSON.stringify(data.system)
            },
            notification: {
                title: 'Antitheft System',
                body: `[${this.getServerDateTimeString()}] System Armed`,
                color: '#00FF00'
            }
        };
        const options: messaging.MessagingOptions = { priority: 'normal' };
        this.messagingService.sendToTopic(topic, payload, options)
            .then((resp: messaging.MessagingTopicResponse) => {
                console.log('Armed Notification', resp.messageId);
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
                system: JSON.stringify(data.system)
            },
            notification: {
                title: 'Antitheft System',
                body: `[${this.getServerDateTimeString()}] System Disarmed`,
                color: '#00FF00'
            }
        };
        const options: messaging.MessagingOptions = { priority: 'normal' };
        this.messagingService.sendToTopic(topic, payload, options)
            .then((resp: messaging.MessagingTopicResponse) => {
                console.log('Disarmed Notification', resp.messageId);
            })
            .catch((reason: any) => {
                this.logger.error('Error Send Notification', { data: { error: reason, system: data.system } });
        });
    }

    private sendNotificationStateChanged(data: AntiTheftSystemEventData): void {
        const state: AntiTheftSystemStates = data.system.state;
        const topic: string = 'ats';
        const payload: messaging.MessagingPayload = {
            data: {
                system: JSON.stringify(data.system)
            },
            notification: { title: 'Antitheft System' }
        };
        const options: messaging.MessagingOptions = { priority: 'normal' };
        switch(state) {
            case AntiTheftSystemStates.LEAVING:
                console.log('Send notification for Leaving');
                payload.notification.body = `[${this.getServerDateTimeString()}] Leaving`;
                payload.notification.color = '#0000FF';
                this.messagingService.sendToTopic(topic, payload, options)
                    .then((resp: messaging.MessagingTopicResponse) => {
                        console.log('Leaving Notification', resp.messageId);
                    })
                    .catch((reason: any) => {
                        this.logger.error('Error Send Notification', { data: { error: reason, system: data.system } });
                });
                break;
            case AntiTheftSystemStates.ENTERING:
                console.log('Send notification for Entering');
                payload.notification.body = `[${this.getServerDateTimeString()}] Entering`;
                payload.notification.color = '#FFFF00';
                this.messagingService.sendToTopic(topic, payload, options)
                    .then((resp: messaging.MessagingTopicResponse) => {
                        console.log('Entering Notification', resp.messageId);
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
                system: JSON.stringify(data.system)
            },
            notification: {
                title: 'Antitheft System',
                body: `[${this.getServerDateTimeString()}] WARNING MAX ALERTS`,
                color: '#FFFF00'
            }
        };
        const options: messaging.MessagingOptions = { priority: 'high' };
        this.messagingService.sendToTopic(topic, payload, options)
            .then((resp: messaging.MessagingTopicResponse) => {
                console.log('Max Alerts', resp.messageId);
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
                system: JSON.stringify(data.system)
            },
            notification: {
                title: 'Antitheft System',
                body: `[${this.getServerDateTimeString()}] Warning max unauthorized intents`,
                color: '#FFFF00'
            }
        };
        const options: messaging.MessagingOptions = { priority: 'normal' };
        this.messagingService.sendToTopic(topic, payload, options)
            .then((resp: messaging.MessagingTopicResponse) => {
                console.log('Max Unauthorized Notification', resp.messageId);
            })
            .catch((reason: any) => {
                this.logger.error('Error Send Notification', { data: { error: reason, system: data.system } });
        });
    }


}
