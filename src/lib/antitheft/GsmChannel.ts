import { GenericGsmClient, IGsmClient } from '../sim800/GsmClient';
import { Modem, UrcInfo } from '../sim800/Modem';
import { UnsolicitedResultCodes as URC } from '../sim800/at/UnsolicitedResultCodes';

import * as SerialPort from 'serialport';
import { AntiTheftSystem } from './AntiTheftSystem';
import { AntiTheftSystemAPI } from './AntiTheftSystemAPI';
import { AntiTheftSystemResponse } from './AntiTheftSystemResponse';
import { Sensor } from './Sensor';
import { SystemState } from './SystemState';
import { SmtpServerConfiguration, EmailAddress } from '../sim800/Email';

const SERIAL_PORT = '/dev/serial0';

const SERIAL_OPTIONS: SerialPort.OpenOptions = {
  autoOpen: false,
  baudRate: 9600,
  dataBits: 8,
  parity: 'none',
  stopBits: 1
};

const EMAIL_REGEX = /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;

const SMPT_SERVER_CONFIGURATION: SmtpServerConfiguration = {
  host: 'smtp.gmail.com',
  port: 465,
  user: '',
  pass: ''
};

const EMAIL_FROM: EmailAddress = { email: '' };

const MAX_FAILED_ATTEMPTS_COUNT = 3;

class MessageInfo {
  recipients: string[];
  message: string;
  priority: number;
  failedAttemptsCount: number;
  subject?: string;
  body?: string;

  constructor() {
  }

  public static sort(a: MessageInfo, b: MessageInfo): number {
    return a.priority - b.priority;
  }
}

export class GsmChannel {
    
    private static INSTANCE: GsmChannel = null;

    private gsmClient: IGsmClient;

    private messagesTail: MessageInfo[] = [];
    private isSendingMessage: boolean = false;
    private sendingMessageTimeout: number;

    public static start(ats: AntiTheftSystemAPI): void {
      if (GsmChannel.INSTANCE == null) {
        GsmChannel.INSTANCE = new GsmChannel(ats);
      }
    }

    public static stop(): void {
      GsmChannel.INSTANCE.gsmClient.end()
        .then(() => {
          GsmChannel.INSTANCE = null;
        })
        .catch(err => {
          console.log(err);
          GsmChannel.INSTANCE = null;
        });
    }

    private constructor(private ats: AntiTheftSystemAPI) {
      // Sim800 Configuration
      let serialPort = new SerialPort(SERIAL_PORT, SERIAL_OPTIONS);
      let modem = new Modem(serialPort);
      this.gsmClient = new GenericGsmClient(modem);

      // TODO: asyn init ?
      setTimeout(this.startGsmClient.bind(this), 5000);

      setInterval(this.sendNextMessage.bind(this), 5000);
    }

    private startGsmClient(): void {
      console.log('GsmClient starting...');
      let self = this;
      this.gsmClient.start()
        .then(this.configureGsmClient.bind(self))
        .catch((err) => { // TODO: Retry when not connect
          console.log(err);
          if(err == 'Error: Port is already open') {
            this.gsmClient.end()
              .then(this.startGsmClient.bind(self))
              .catch(err => console.log(err));
          } else {
            setTimeout(this.startGsmClient.bind(self), 5000);
          }
      });
    }
    
    private configureGsmClient(): void {

      setTimeout(this.alertSystemReboot.bind(this), 3000);

      // AntiTheftSystem Events
      this.ats.on(AntiTheftSystem.EVENTS.SYSTEM_ALERT, this.handleSystemAlertEvent.bind(this));
      this.ats.on(AntiTheftSystem.EVENTS.SYSTEM_ALARMED, this.handleSystemAlarmedEvent.bind(this));
      this.ats.on(AntiTheftSystem.EVENTS.SYSTEM_DISARMED, this.handleSystemDisarmedEvent.bind(this));

      // GsmClient Events
      this.gsmClient.on(URC.CMTI.code, this.handleReceiveSmsEvent.bind(this));
      this.gsmClient.on(URC.CMGS.code, this.handleSendedSmsEvent.bind(this));
      this.gsmClient.on(URC.SMTPSEND.code, this.handleSendedEmailEvent.bind(this));
    }

    private getOwnerPhones(): string[] {
      let res: AntiTheftSystemResponse = this.ats.getOwnerPhones();
      let phones: string[] = []
      if(res.data && res.data.phones) {
        phones = res.data.phones as string[];
      }
      return phones;
    }

    private getOwnerEmails(): string[] {
      let res: AntiTheftSystemResponse = this.ats.getOwnerEmails();
      let emails: string[] = [];
      if(res.data && res.data.emails) {
        emails = res.data.emails as string[];
      }
      return emails;
    }

    private alertSystemReboot(): void {
      console.log('Sending alert system reboot message');
      let phones: string[] = this.getOwnerPhones();
      let emails: string[] = this.getOwnerEmails();
      let recipients: string[] = phones.concat(emails);
      if(recipients.length > 0) {
        let date = new Date();
        let message: MessageInfo = {
          recipients: recipients,
          message: `Alert: system reboot at ${ date.toString() }`,
          priority: 5,
          failedAttemptsCount: 0,
          subject: 'AntiTheftSystem [ALERT]',
          body: `System reboot at ${ date.toString() }. \r\nCurrent state: \r\n${ JSON.stringify(this.ats.getState()) }\r\nLog:\r\n\t...`
        };
        this.sendMessage(message);
      }
    }

    private handleSystemAlarmedEvent(data: { system: SystemState, sensor: Sensor }): void {
      console.log('Alarmed -> Send SMS');
      let phones: string[] = this.getOwnerPhones();
      if (phones.length > 0) {
        let smsMessage: MessageInfo = {
          recipients: phones,
          message: `ALARMED: ${ data.sensor.name }, ${ data.system.uptime }`,
          priority: 1,
          failedAttemptsCount: 0
        };
        this.sendMessage(smsMessage);
      }
    }

    private handleSystemAlertEvent(data: { system: SystemState }): void {
      console.log('Alert -> Send SMS');
      let phones: string[] = this.getOwnerPhones();
      if(phones.length > 0) {
        let smsMessage: MessageInfo = {
          recipients: phones,
          message: `ALERT: ${ data.system.activedSensors[0] }, ${ data.system.uptime } }`,
          priority: 2,
          failedAttemptsCount: 0
        };
        this.sendMessage(smsMessage);
      }
    }

    private handleSystemDisarmedEvent(): void {
      console.log('Disarmed -> Send SMS');
      let phones: string[] = this.getOwnerPhones();
      if(phones.length > 0) {
        let smsMessage: MessageInfo = {
          recipients: phones,
          message: `System disarmed`,
          priority: 3,
          failedAttemptsCount: 0
        };
        this.sendMessage(smsMessage);
      }
    }

    private handleReceiveSmsEvent(data): void {
      console.log('GsmClient event - Receive SMS'); // TODO: emit event
      console.log(data); 
      // Get SMS 
      // Analize SMS message
      // Send info to AntiTheftSystem
    }

    private handleSendedSmsEvent(info: UrcInfo): void {
      console.log('GsmClient event - Sended SMS'); // TODO: emit event 
      console.log(info); // TODO: analize info
      clearTimeout(this.sendingMessageTimeout);
      this.sendingMessageTimeout = null;
      this.isSendingMessage = false;
      let phone: string = this.messagesTail[0].recipients.shift();
      if(this.messagesTail[0].recipients.length == 0) {
        let smsMessage: MessageInfo = this.messagesTail.shift();
        this.messageLog(smsMessage);
      }
    }

    private handleSendedEmailEvent(info: UrcInfo): void {
      console.log('GsmClient event - Sended Email'); // TODO: emit event
      console.log(info); // TODO: analize info
      clearTimeout(this.sendingMessageTimeout);
      this.sendingMessageTimeout = null;
      this.isSendingMessage = false;
      let email: string = this.messagesTail[0].recipients.shift();
      if(this.messagesTail[0].recipients.length == 0) {
        let emailMessage: MessageInfo = this.messagesTail.shift();
        this.messageLog(emailMessage);
      }
    }

    private hanldeFailedSendSmsEvent(): void {
      clearTimeout(this.sendingMessageTimeout);
      this.sendingMessageTimeout = null;
      this.isSendingMessage = false;
      this.messagesTail[0].failedAttemptsCount++;
      if(this.messagesTail[0].failedAttemptsCount > MAX_FAILED_ATTEMPTS_COUNT) {
        let recipient: string = this.messagesTail[0].recipients.shift();
        if(this.messagesTail[0].recipients.length == 0) {
          let smsMessage: MessageInfo = this.messagesTail.shift();
          this.messageLog(smsMessage);
        } else {
          this.messagesTail[0].failedAttemptsCount = 0;
        }
      }
    }

    private messageLog(sms: MessageInfo): void {
      console.log(sms);
    }

    private sendSms(sms: MessageInfo): void {
      this.gsmClient.sms.sendSms(sms.recipients[0], sms.message)
        .then(() => {
          this.sendingMessageTimeout = setTimeout(this.hanldeFailedSendSmsEvent.bind(this), 30000);
        })
        .catch(err => {
          console.log(err);
          this.hanldeFailedSendSmsEvent();
        });
    }

    private sendEmail(email: MessageInfo): void {
      this.gsmClient.email.sendEmail(
        SMPT_SERVER_CONFIGURATION, 
        EMAIL_FROM, 
        { email: email.recipients[0] },
        email.subject || 'AntiTheftSystem',
        email.body || email.message)
          .then(() => {
            this.sendingMessageTimeout = setTimeout(this.hanldeFailedSendSmsEvent.bind(this), 60000);
          })
          .catch(err => {
            console.log(err);
            this.hanldeFailedSendSmsEvent();
          })
    }

    private sendNextMessage(): void {
      if(this.messagesTail.length > 0 && !this.isSendingMessage && !this.sendingMessageTimeout) {
        this.isSendingMessage = true;
        this.messagesTail.sort(MessageInfo.sort);
        let message: MessageInfo = this.messagesTail[0];
        if(message.recipients[0].match(EMAIL_REGEX)) {
          this.sendEmail(message);
        } else {
          this.sendSms(message);
        }
      }
    }

    private sendMessage(smsMessage: MessageInfo): void {
      this.messagesTail.push(smsMessage);
    }

}