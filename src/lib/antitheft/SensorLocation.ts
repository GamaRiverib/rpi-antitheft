export class SensorLocation {
    mac: string;
    pin: number;

    constructor(mac: string, pin: number) {
        this.mac = mac;
        this.pin = pin;
    }

    public static getSensorLocationFromData(data: any): SensorLocation {
        if(data) {
            return new SensorLocation(data.mac || "", data.pin || 0);
        }
        return new SensorLocation("", 0);
    }

    public static equals(one: SensorLocation, two: SensorLocation): boolean {
        if(one.mac !== two.mac) {
            return false;
        }
        if(one.pin !== two.pin) {
            return false;
        }
        return true;
    }
}