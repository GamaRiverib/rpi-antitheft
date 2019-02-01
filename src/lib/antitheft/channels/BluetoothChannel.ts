import { AntiTheftSystemAPI } from '../AntiTheftSystemAPI';
import { AntiTheftSystem } from '../AntiTheftSystem';
import { SystemStateService } from '../ble/SystemStateService';

import * as bleno from 'bleno';

export class BluetoothChannel {

    private static INSTANCE: BluetoothChannel = null;
    
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
        if (BluetoothChannel.INSTANCE == null) {
            BluetoothChannel.INSTANCE = new BluetoothChannel(ats);
        }
    }

    public static stop(): void {
        // TODO
        if(BluetoothChannel.INSTANCE) {
            bleno.stopAdvertising(function() {
                bleno.disconnect();
            });
            BluetoothChannel.INSTANCE = null;
        }
    }
}