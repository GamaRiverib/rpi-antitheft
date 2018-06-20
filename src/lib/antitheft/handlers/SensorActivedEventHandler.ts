import { AntiTheftSystemAPI } from '../AntiTheftSystemAPI';
import { Sensor, SensorLocation, SensorGroup } from '../Sensor';
import { AntiTheftSystemArmedModes } from '../AntiTheftSystemArmedModes';
import { AntiTheftSystemStates } from '../AntiTheftSystemStates';

import { AntiTheftSystemEvents, SensorActivedEventData } from '../AntiTheftSystemEvents';
import { AntiTheftSystemResponse } from '../AntiTheftSystemResponse';
import { SystemState } from '../SystemState';
import { Logger } from '../utils/Logger';
import { AntiTheftSystemConfig } from '../AntiTheftSystemConfig';

export class SensorActivedEventHandler {

    private enteringHandler: (sensor: Sensor) => void;

    private alertHandler: (sensor: Sensor) => void;

    private alarmedHandler: (sensor: Sensor) => void;

    private chimeHandler: (sensor: Sensor) => void;

    private disarmedHandler: (sensor: Sensor) => void;

    private readyHandler: (sensor: Sensor) => void;

    constructor(private antiTheftSystem: AntiTheftSystemAPI) {
        this.antiTheftSystem.on(AntiTheftSystemEvents.SENSOR_ACTIVED, this.handle.bind(this));
    }

    private handle(data: SensorActivedEventData): void {
        let sensor: Sensor = data.sensor;
        let value: number = data.value;

        let resState: AntiTheftSystemResponse<SystemState> = this.antiTheftSystem.getState();
        let resConfig: AntiTheftSystemResponse<AntiTheftSystemConfig> = this.antiTheftSystem.getConfig();

        let state: AntiTheftSystemStates = resState.data.state;
        let activatedSensors: Sensor[] = resState.data.activedSensors;
        let config = resConfig.data;

        // TODO: 
        if (value == 1) {
            let index = -1;
            activatedSensors.forEach((s: Sensor, i: number) => {
                if(SensorLocation.equals(s.location, sensor.location)) {
                    index = i;
                    return;
                }
            });
            if (index < 0) {
                activatedSensors.push(sensor);
            }
            switch(state) {
                case AntiTheftSystemStates.ALARMED:
                    // TODO: log activity
                    Logger.log(`Sensor ${sensor.name} actived`);
                    break;
                case AntiTheftSystemStates.ARMED:
                    // TODO: Bypass sensors/zones
                    let mode: AntiTheftSystemArmedModes = config.mode ? parseInt(config.mode.toString()) : 0;
                    switch(mode) {
                        case AntiTheftSystemArmedModes.AWAY:
                            switch(sensor.group) {
                                case SensorGroup.ACCESS:
                                    this.enteringHandler(sensor);
                                    break;
                                case SensorGroup.EXTERIOR:
                                    this.alertHandler(sensor);
                                    break;
                                case SensorGroup.INTERIOR:
                                case SensorGroup.PERIMETER:
                                    this.alarmedHandler(sensor);
                                    break;
                                default:
                                    Logger.log('This message should not be displayed');
                            }
                            break;
                        case AntiTheftSystemArmedModes.CHIME:
                            switch(sensor.group) {
                                case SensorGroup.ACCESS:
                                case SensorGroup.EXTERIOR:
                                case SensorGroup.INTERIOR:
                                case SensorGroup.PERIMETER:
                                    this.chimeHandler(sensor);
                                    break;
                                default:
                                    Logger.log('This message should not be displayed');
                            }
                            break;
                        case AntiTheftSystemArmedModes.INSTANT:
                            switch(sensor.group) {
                                case SensorGroup.ACCESS:
                                    this.alarmedHandler(sensor);
                                    break;
                                case SensorGroup.EXTERIOR:
                                    this.alertHandler(sensor);
                                    break;
                                case SensorGroup.INTERIOR:
                                case SensorGroup.PERIMETER:
                                    this.alarmedHandler(sensor);
                                    break;
                                default:
                                    Logger.log('This message should not be displayed');
                            }
                            break;
                        case AntiTheftSystemArmedModes.MAXIMUM:
                            switch(sensor.group) {
                                case SensorGroup.ACCESS:
                                case SensorGroup.EXTERIOR:
                                case SensorGroup.INTERIOR:
                                case SensorGroup.PERIMETER:
                                    this.alarmedHandler(sensor);
                                    break;
                                default:
                                    Logger.log('This message should not be displayed');
                            }
                            break;
                        case AntiTheftSystemArmedModes.NIGHT_STAY:
                            switch(sensor.group) {
                                case SensorGroup.ACCESS:
                                    this.alarmedHandler(sensor);
                                    break;
                                case SensorGroup.EXTERIOR:
                                    this.alertHandler(sensor);
                                    break;
                                case SensorGroup.INTERIOR:
                                    Logger.log(`[IGNORE]: Sensor ${sensor.name} actived`);
                                    break;
                                case SensorGroup.PERIMETER:
                                    this.alarmedHandler(sensor);
                                    break;
                                default:
                                    Logger.log('This message should not be displayed');
                            }
                            break;
                        case AntiTheftSystemArmedModes.STAY:
                            switch(sensor.group) {
                                case SensorGroup.ACCESS:
                                    this.enteringHandler(sensor);
                                    break;
                                case SensorGroup.EXTERIOR:
                                    this.alertHandler(sensor);
                                    break;
                                case SensorGroup.INTERIOR:
                                    Logger.log(`[IGNORE]: Sensor ${sensor.name} actived`);
                                    break;
                                case SensorGroup.PERIMETER:
                                    this.alarmedHandler(sensor);
                                    break;
                                default:
                                    Logger.log('This message should not be displayed');
                            }
                            break;
                        default:
                            Logger.log('This message should not be displayed');
                    }
                    break;
                case AntiTheftSystemStates.DISARMED:
                case AntiTheftSystemStates.ENTERING:
                case AntiTheftSystemStates.LEAVING:
                case AntiTheftSystemStates.PROGRAMMING:
                    Logger.log(`[IGNORE]: Sensor ${sensor.name} actived`);
                    break;
                case AntiTheftSystemStates.READY:
                    let index = -1;
                    config.bypass.forEach((location: SensorLocation, i: number) => {
                        if (SensorLocation.equals(location, sensor.location)) {
                            index = i;
                            return;
                        }
                    });
                    if (index < 0) {
                        this.disarmedHandler(sensor);
                    }
                    break;
                default:
                    Logger.log('This message should not be displayed');
            }
        } else {
            let index = -1;
            activatedSensors.forEach((s: Sensor, i: number) => {
                if(SensorLocation.equals(s.location, sensor.location)) {
                    index = i;
                    return;
                }
            });
            if(index >= 0) {
                activatedSensors.splice(index, 1);
            }
            if(config.state == AntiTheftSystemStates.DISARMED && activatedSensors.length == 0) {
                this.readyHandler(sensor);
            }
        }
    }

    public onEnteringEvent(listener: (sensor: Sensor) => void): void {
        this.enteringHandler = listener;
    }

    public onAlertEvent(listener: (sensor: Sensor) => void): void {
        this.alertHandler = listener;
    }

    public onAlarmedEvent(listener: (sensor: Sensor) => void): void {
        this.alarmedHandler = listener;
    }

    public onChimeEvent(listener: (sensor: Sensor) => void): void {
        this.chimeHandler = listener;
    }

    public onDisarmEvent(listener: (sensor: Sensor) => void): void {
        this.disarmedHandler = listener;
    }

    public onReadyEvent(listener: (sensor: Sensor) => void): void {
        this.readyHandler = listener;
    }

}