import { Characteristic, Descriptor } from 'bleno';
import { AntiTheftSystemAPI } from '../AntiTheftSystemAPI';
import { AntiTheftSystemResponse } from '../AntiTheftSystemResponse';

export class DisarmSystemCharacteristic extends Characteristic {

    private static readonly options = {
        uuid: '11110703803103830211111012150004',
        properties: ['write'],
        descriptor: [new Descriptor({ uuid: '12364', value: 'Disarm the system' })]
    };

    constructor(private antiTheftSystemApi: AntiTheftSystemAPI) {
        super(DisarmSystemCharacteristic.options);
    }

    public onWriteRequest(data: any, offset: any, withoutResponse: any, callback: any): void {
        if(offset) {
            callback(Characteristic.RESULT_ATTR_NOT_LONG);
        } else if(data.length < 7 || data.length > 22) {
            callback(Characteristic.RESULT_INVALID_ATTRIBUTE_LENGTH);
        } else {
            let code = data.readUInt16BE(0).toString(); //TODO: leftpad ?
            let token = data.readUInt32BE(2).toString(); // TODO: leftpad ?
            let clientId = data.toString('ascii', 6);

            let validation: AntiTheftSystemResponse<void> = this.antiTheftSystemApi.validateClient(clientId, token);
            if(validation.success) {
                let response: AntiTheftSystemResponse<void> = this.antiTheftSystemApi.disarm(code);
                if(response.success) {
                    callback(Characteristic.RESULT_SUCCESS);
                } else {
                    callback(Characteristic.RESULT_UNLIKELY_ERROR);
                }
            } else {
                callback(Characteristic.RESULT_UNLIKELY_ERROR);
            }
        }
    }

}