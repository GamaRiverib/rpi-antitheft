import { SystemState } from './SystemState';
import { Sensor } from './Sensor';

export interface AntiTheftSystemEventData {
    emitter: any; // TODO: AntiTheftSystemAPI ??
    system: SystemState;
    extra: any;
}

export interface SensorActivedEventData {
    sensor: Sensor;
    value: 1 | 0;
}

export class AntiTheftSystemEvents {

    public static readonly NOT_AUTHORIZED = 'NOT_AUTHORIZED';
    public static readonly PIN_CODE_UPDATED = 'PIN_CODE_UPDATED';
    public static readonly SYSTEM_STATE_CHANGED = 'SYSTEM_STATE_CHANGED';
    public static readonly SENSOR_REGISTERED = 'SENSOR_REGISTERED';
    public static readonly SENSOR_CHANGED = 'SENSOR_CHANGED';
    public static readonly SENSOR_DELETED = 'SENSOR_DELETED';
    public static readonly SENSOR_ACTIVED = 'SENSOR_ACTIVED';
    public static readonly ENTRY_TIME_CHANGED = 'ENTRY_TIME_CHANGED';
    public static readonly EXIT_TIME_CHANGED = 'EXIT_TIME_CHANGED';
    public static readonly BEEP_CHANGED = 'BEEP_CHANGED';
    public static readonly SILENT_ALARM_CHANGED = 'SILENT_ALARM_CHANGED';
    public static readonly CENTRAL_PHONE_CHANGED = 'CENTRAL_PHONE_CHANGED';
    public static readonly ADMIN_PHONE_CHANGED = 'ADMIN_PHONE_CHANGED';
    public static readonly OWNER_PHONE_ADDED = 'OWNER_PHONE_ADDED';
    public static readonly OWNER_PHONE_CHANGED = 'OWNER_PHONE_CHANGED';
    public static readonly OWNER_PHONE_DELETED = 'OWNER_PHONE_DELETED';
    public static readonly CENTRAL_EMAIL_CHANGED = 'CENTRAL_EMAIL_CHANGED';
    public static readonly ADMIN_EMAIL_CHANGED = 'ADMIN_EMAIL_CHANGED';
    public static readonly OWNER_EMAIL_ADDED = 'OWNER_EMAIL_ADDED';
    public static readonly OWNER_EMAIL_CHANGED = 'OWNER_EMAIL_CHANGED';
    public static readonly OWNER_EMAIL_DELETED = 'OWNER_EMAIL_DELETED';
    public static readonly BYPASS_CHANGE = 'BYPASS_CHANGE';
    public static readonly SYSTEM_ARMED = 'SYSTEM_ARMED';
    public static readonly SYSTEM_DISARMED = 'SYSTEM_DISARMED';
    public static readonly SYSTEM_ALARMED = 'SYSTEM_ALARMED';
    public static readonly SYSTEM_ALERT = 'SYSTEM_ALERT';
    public static readonly SIREN_ACTIVED = 'SIREN_ACTIVED';
    public static readonly SIREN_SILENCED = 'SIREN_SILENCED';

    public static readonly CLIENT_ONLINE = 'CLIENT_ONLINE';
    public static readonly CLIENT_OFFLINE = 'CLIENT_OFFLINE';

    public static readonly MAX_ALERTS = 'MAX_ALERTS';
    public static readonly MAX_UNAUTHORIZED_INTENTS = 'MAX_UNAUTHORIZED_INTENTS';

    public static eventsList(): string[] {
        let list: string[] = [];
        for(let k in AntiTheftSystemEvents) {
            if(typeof AntiTheftSystemEvents[k] == 'string') {
                list.push(AntiTheftSystemEvents[k]);
            }
        }
        return list;
    }

}