import winston = require("winston");
import { AntiTheftSystemAPI } from "../AntiTheftSystemAPI";
import { Sensor, SensorGroup } from "../Sensor";
import { SensorLocation } from "../SensorLocation";
import { AntiTheftSystemArmedModes } from "../AntiTheftSystemArmedModes";
import { AntiTheftSystemStates } from "../AntiTheftSystemStates";

import { AntiTheftSystemEvents, SensorActivedEventData } from "../AntiTheftSystemEvents";
import { AntiTheftSystemResponse } from "../AntiTheftSystemResponse";
import { SystemState } from "../SystemState";
import { getLogger } from "../../utils/Logger";
import { AntiTheftSystemConfig } from "../AntiTheftSystemConfig";

export class SensorActivedEventHandler {

    private logger: winston.Logger;

    private enteringHandler: (sensor: Sensor) => void;

    private alertHandler: (sensor: Sensor) => void;

    private alarmedHandler: (sensor: Sensor) => void;

    private chimeHandler: (sensor: Sensor) => void;

    private disarmedHandler: (sensor: Sensor) => void;

    private readyHandler: (sensor: Sensor) => void;

    constructor(private antiTheftSystem: AntiTheftSystemAPI) {
        this.logger = getLogger("SensorEvents");
        this.antiTheftSystem.on(AntiTheftSystemEvents.SENSOR_ACTIVED, this.handle.bind(this));
    }

    private handle(data: SensorActivedEventData): void {
        const sensor: Sensor = data.sensor;
        const value: number = data.value;

        const resState: AntiTheftSystemResponse<SystemState> = this.antiTheftSystem.getState();
        const resConfig: AntiTheftSystemResponse<AntiTheftSystemConfig> = this.antiTheftSystem.getConfig();

        const state: AntiTheftSystemStates = resState.data.state;
        const activatedSensors: Sensor[] = resState.data.activedSensors;
        const config: AntiTheftSystemConfig = resConfig.data;
        let bypass: boolean = false;

        if (value === 1) {
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
            config.bypass.forEach((location: SensorLocation, i: number) => {
                if (SensorLocation.equals(location, sensor.location)) {
                    bypass = true;
                    return;
                }
            });

            switch(state) {
                case AntiTheftSystemStates.ALARMED:
                    // TODO: log activity
                    this.logger.info(`Sensor ${sensor.name} actived`);
                    break;
                case AntiTheftSystemStates.ARMED:
                    if(bypass) {
                        this.logger.warn(`[IGNORE]: Sensor ${sensor.name} actived, but is in the bypass list`);
                    } else {
                        const mode: AntiTheftSystemArmedModes = config.mode ? parseInt(config.mode.toString(), 10) : 0;
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
                                        this.logger.error("This message should not be displayed", { data: { event: data, config }});
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
                                        this.logger.error("This message should not be displayed", { data: { event: data, config }});
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
                                        this.logger.error("This message should not be displayed", { data: { event: data, config }});
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
                                        this.logger.error("This message should not be displayed", { data: { event: data, config }});
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
                                        this.logger.info(`[IGNORE]: Sensor ${sensor.name} actived`);
                                        break;
                                    case SensorGroup.PERIMETER:
                                        this.alarmedHandler(sensor);
                                        break;
                                    default:
                                        this.logger.error("This message should not be displayed", { data: { event: data, config }});
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
                                        this.logger.info(`[IGNORE]: Sensor ${sensor.name} actived`);
                                        break;
                                    case SensorGroup.PERIMETER:
                                        this.alarmedHandler(sensor);
                                        break;
                                    default:
                                        this.logger.error("This message should not be displayed", { data: { event: data, config }});
                                }
                                break;
                            default:
                                this.logger.error("This message should not be displayed", { data: { event: data, config }});
                        }
                    }
                    break;
                case AntiTheftSystemStates.DISARMED:
                case AntiTheftSystemStates.ENTERING:
                case AntiTheftSystemStates.LEAVING:
                case AntiTheftSystemStates.PROGRAMMING:
                    this.logger.info(`[IGNORE]: Sensor ${sensor.name} actived`);
                    break;
                case AntiTheftSystemStates.READY:
                    if(bypass) {
                        this.logger.info(`[IGNORE]: Sensor ${sensor.name} actived, but is in the bypass list`);
                    } else {
                        this.disarmedHandler(sensor);
                    }
                    break;
                default:
                    this.logger.error("This message should not be displayed", { data: { event: data, config }});
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
            if(config.state === AntiTheftSystemStates.DISARMED && activatedSensors.length === 0) {
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
