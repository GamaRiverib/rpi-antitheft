import { PrimaryService } from 'bleno';
import { AntiTheftSystemAPI } from '../AntiTheftSystemAPI';
import { SystemStateCharacteristic } from './SystemStateCharacteristic';
import { UptimeCharacteristic } from './UptimeCharacteristic';
import { ArmSystemCharacteristic } from './ArmSystemCharacteristic';
import { DisarmSystemCharacteristic } from './DisarmSystemCharacteristic';

export class SystemStateService extends PrimaryService {

    private static readonly options = {
        uuid: '11110703803103830211111012150000'
    };

    constructor(antiTheftSystemApi: AntiTheftSystemAPI) {
        super(SystemStateService.options);
        super.characteristics = [
            new SystemStateCharacteristic(antiTheftSystemApi),
            new UptimeCharacteristic(antiTheftSystemApi),
            new ArmSystemCharacteristic(antiTheftSystemApi),
            new DisarmSystemCharacteristic(antiTheftSystemApi)
        ];
    }
}