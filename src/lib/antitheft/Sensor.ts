export enum SensorTypes {
    PIR_MOTION,
    MAGNETIC_SWITCH,
    IR_SWITCH
}

export enum SensorGroup {
    INTERIOR,
    PERIMETER,
    EXTERIOR,
    ACCESS
}

export class SensorLocation {
    pin: number;
    expander?: number;

    constructor(pin: number, expander?: number) {
        this.pin = pin;
        this.expander = expander;
    }

    public static getSensorLocationFromData(data: any): SensorLocation {
        if(data) {
            return new SensorLocation(data.pin || 0, data.expander);
        }
        return new SensorLocation(0);
    }

    public static equals(one: SensorLocation, two: SensorLocation): boolean {
        if(one.pin != two.pin) {
            return false;
        }
        if(one.expander && one.expander != two.expander) {
            return false;
        }
        return true;
    }
}

export class Sensor {

    private static INSTANCE_COUNTER = 0;

    location: SensorLocation
    type: SensorTypes;
    name: string;
    group: SensorGroup;
    chime?: string;

    constructor(location: SensorLocation, type: SensorTypes, name: string, group: SensorGroup, chime?: string) {
        this.location = location;
        this.type = type;
        this.name = name;
        this.group = group;
        this.chime = chime;
    }

    public static getSensorFromData(data: any): Sensor {
        if (data) {
            let location = SensorLocation.getSensorLocationFromData(data.location);
            return new Sensor(location, data.type || SensorTypes.MAGNETIC_SWITCH, data.name || `Sensor ${this.INSTANCE_COUNTER++}`, data.group || SensorGroup.INTERIOR, data.chime || '');
        }

        return new Sensor(SensorLocation.getSensorLocationFromData(data), SensorTypes.MAGNETIC_SWITCH, `Sensor ${this.INSTANCE_COUNTER++}`, SensorGroup.INTERIOR);
    }
}