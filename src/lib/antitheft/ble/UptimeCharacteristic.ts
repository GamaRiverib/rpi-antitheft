import { Characteristic, Descriptor } from 'bleno';
import { AntiTheftSystemAPI } from '../AntiTheftSystemAPI';
import { AntiTheftSystemResponse } from '../AntiTheftSystemResponse';

export class UptimeCharacteristic extends Characteristic {

    private static readonly options = {
        uuid: '11110703803103830211111012150002',
        properties: ['read'],
        descriptor: [new Descriptor({ uuid: '12362', value: 'Sends the system time' })]
    };

    constructor(private antiTheftSystemApi: AntiTheftSystemAPI) {
        super(UptimeCharacteristic.options);
    }

    public onReadRequest(offset: any, callback: any): void {
        if(offset) {
            callback(Characteristic.RESULT_ATTR_NOT_LONG, null);
        } else {
            let response: AntiTheftSystemResponse = this.antiTheftSystemApi.getState();
            if(response.success && response.data && response.data.system) {
                let result = { uptime: response.data.system.uptime };
                let data = new Buffer(JSON.stringify(result));
                callback(Characteristic.RESULT_SUCCESS, data);
            } else {
                callback(Characteristic.RESULT_UNLIKELY_ERROR);
            }
        }
    }

}