import { SensorLocation } from "./SensorLocation";

export enum SensorTypes {
    PIR_MOTION = 0,
    MAGNETIC_SWITCH = 1,
    IR_SWITCH = 2
}

export enum SensorGroup {
    INTERIOR = 0,
    PERIMETER = 1,
    EXTERIOR = 2,
    ACCESS = 3
}

export class Sensor {
    private static INSTANCE_COUNTER = 0;

    location: SensorLocation;
    type: SensorTypes;
    name: string;
    group: SensorGroup;
    chime?: string;
    online?: boolean;

    constructor(location: SensorLocation, type: SensorTypes, name: string, group: SensorGroup, chime?: string) {
        this.location = location;
        this.type = type;
        this.name = name;
        this.group = group;
        this.chime = chime;
    }

    public static getSensorFromData(data: any): Sensor {
        if(data) {
            const location = SensorLocation.getSensorLocationFromData(data.location);
            return new Sensor(
                location,
                data.type || SensorTypes.MAGNETIC_SWITCH,
                data.name || `SensorWebSocket ${this.INSTANCE_COUNTER++}`,
                data.group || SensorGroup.PERIMETER,
                data.chime || '');
        }
        return new Sensor(
            SensorLocation.getSensorLocationFromData(data),
            SensorTypes.PIR_MOTION,
            `Sensor ${this.INSTANCE_COUNTER++}`,
            SensorGroup.EXTERIOR);
    }
}
