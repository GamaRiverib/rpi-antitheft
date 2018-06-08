import { AntiTheftSystemAPI } from "./AntiTheftSystemAPI";
import { AntiTheftSystem } from "./AntiTheftSystem";
import { SystemStateService } from "./ble/SystemStateService";

import * as bleno from 'bleno';

export class BluetoothChannel {

    private static instance: BluetoothChannel = null;
    
    private constructor(private ats: AntiTheftSystemAPI) {
        // Bluetooth configuration
        let bleService = new SystemStateService(this.ats);

        bleno.on('stateChange', (state) => {
            if(state == 'poweredOn') {
                bleno.startAdvertising('RaspberryPi', [bleService.uuid], (err) => {
                    if(err) {
                        console.log(err);
                    }
                });
            } else {
                bleno.stopAdvertising(() => { console.log('Stoped advertising') });
            }
        });

        bleno.on('advertisingStart', (err) => {
            if(!err) {
                console.log('Advertising...');
                bleno.setServices([bleService], (err) =>  {
                    if(err) {
                        console.log(err);
                    }
                });
            }
        });
    }

    public static start(ats: AntiTheftSystemAPI): void {
        if (BluetoothChannel.instance == null) {
            BluetoothChannel.instance = new BluetoothChannel(ats);
        }
    }

    public static stop(): void {
        // TODO
        bleno.stopAdvertising(function() {
            bleno.disconnect();
        });
        BluetoothChannel.instance = null;
    }
}