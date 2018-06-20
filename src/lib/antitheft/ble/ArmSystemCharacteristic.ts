import { Characteristic, Descriptor } from 'bleno';
import { AntiTheftSystemAPI } from '../AntiTheftSystemAPI';
import { AntiTheftSystemResponse } from '../AntiTheftSystemResponse';

export class ArmSystemCharacteristic extends Characteristic {

    private static readonly options = {
        uuid: '11110703803103830211111012150003',
        properties: ['write'],
        descriptor: [new Descriptor({ uuid: '12363', value: 'Arm the system' })]
    };

    constructor(private antiTheftSystemApi: AntiTheftSystemAPI) {
        super(ArmSystemCharacteristic.options);
    }

    public onWriteRequest(data: any, offset: any, withoutResponse: any, callback: any): void {
        if(offset) {
            callback(Characteristic.RESULT_ATTR_NOT_LONG);
        } else if(data.length < 8 || data.length > 23) {
            callback(Characteristic.RESULT_INVALID_ATTRIBUTE_LENGTH);
        } else {
            let mode = data.readUInt8(0);
            let code = data.readUInt16BE(1).toString(); //TODO: leftpad ?
            let token = data.readUInt32BE(3).toString(); // TODO: leftpad ?
            let clientId = data.toString('ascii', 7);

            let validation: AntiTheftSystemResponse<void> = this.antiTheftSystemApi.validateClient(clientId, token);
            if(validation.success) {
                let response: AntiTheftSystemResponse<void> = this.antiTheftSystemApi.arm(mode, code);
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