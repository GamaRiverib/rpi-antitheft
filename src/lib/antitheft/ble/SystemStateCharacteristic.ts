import { Characteristic, Descriptor } from 'bleno';
import { AntiTheftSystemAPI, AntiTheftSystemResponse } from '../AntiTheftSystem';

export class SystemStateCharacteristic extends Characteristic {

    private static readonly options = {
        uuid: '11110703803103830211111012150001',
        properties: ['notify', 'read'],
        descriptor: [new Descriptor({ uuid: '12361', value: 'Notify when system state changes' })]
    };

    constructor(private antiTheftSystemApi: AntiTheftSystemAPI) {
        super(SystemStateCharacteristic.options);
    }

    public onReadRequest(offset: any, callback: any): void {
        if(offset) {
            callback(Characteristic.RESULT_ATTR_NOT_LONG, null);
        } else {
            let response: AntiTheftSystemResponse = this.antiTheftSystemApi.getState();
            if (response.success && response.data && response.data.system) {
                let data = new Buffer(JSON.stringify(response.data.system));
                callback(Characteristic.RESULT_SUCCESS, data);
            } else {
                callback(Characteristic.RESULT_UNLIKELY_ERROR);
            }
        }
    }

}