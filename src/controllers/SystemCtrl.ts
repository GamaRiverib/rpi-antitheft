import { Controller } from '../lib/Controller';
import { Request, Response, Next } from 'restify';
import { AntiTheftSystem } from '../lib/antitheft/AntiTheftSystem';
import { AntiTheftSystemAPI } from '../lib/antitheft/AntiTheftSystemAPI';
import { AntiTheftSystemResponse } from '../lib/antitheft/AntiTheftSystemResponse';
import { AntiTheftSystemErrors } from '../lib/antitheft/AntiTheftSystemErrors';
import { SensorLocation, Sensor } from '../lib/antitheft/Sensor';

const antiTheftSystemAPI: AntiTheftSystemAPI = AntiTheftSystem.getInstance();

export class SystemController extends Controller {

    private basePath = '';

    constructor() {
        super();
    }

    routes(server:any):void {
        // Configure user codes
        server.put(this.basePath + '/config/codes/guest', this.validateClient, this.setGuestCode);
        server.put(this.basePath + '/config/codes/owner', this.validateClient, this.setOwnerCode);
        server.put(this.basePath + '/config/codes/admin', this.validateClient, this.setAdminCode);

        // Set programming mode
        server.put(this.basePath + '/config/programm', this.validateClient, this.setProgrammingMode);
        server.del(this.basePath + '/config/programm', this.validateClient, this.unsetProgrammingMode);

        server.put(this.basePath + '/config/sensors', this.validateClient, this.setSensor);
        server.del(this.basePath + '/config/sensors', this.validateClient, this.unsetSensor);

        server.put(this.basePath + '/config/times/entry', this.validateClient, this.setEntryTime);
        server.put(this.basePath + '/config/times/exit', this.validateClient, this.setExitTime);
        server.put(this.basePath + '/config/beep/on', this.validateClient, this.turnOnBeep);
        server.put(this.basePath + '/config/beep/off', this.validateClient, this.turnOffBeep);
        server.put(this.basePath + '/config/beep/toggle', this.validateClient, this.toggleBeep);
        server.put(this.basePath + '/config/silent/on', this.validateClient, this.turnOnSilentAlarm);
        server.put(this.basePath + '/config/silent/off', this.validateClient, this.turnOffSilentAlarm);
        server.put(this.basePath + '/config/silent/toggle', this.validateClient, this.toggleSilentAlarm);

        server.put(this.basePath + '/config/phones/central', this.validateClient, this.setCentralPhone);
        server.del(this.basePath + '/config/phones/central', this.validateClient, this.unsetCentralPhone);
        server.put(this.basePath + '/config/phones/admin', this.validateClient, this.setAdminPhone);
        server.del(this.basePath + '/config/phones/admin', this.validateClient, this.unsetAdminPhone);

        server.post(this.basePath + '/config/phones/owner', this.validateClient, this.addOwnerPhone);
        server.put(this.basePath + '/config/phones/owner/:index', this.validateClient, this.updateOwnerPhone);
        server.del(this.basePath + '/config/phones/owner/:index', this.validateClient, this.deleteOwnerPhone);

        server.put(this.basePath + '/config/emails/central', this.validateClient, this.setCentralEmail);
        server.del(this.basePath + '/config/emails/central', this.validateClient, this.unsetCentralEmail);
        server.put(this.basePath + '/config/emails/admin', this.validateClient, this.setAdminEmail);
        server.del(this.basePath + '/config/emails/admin', this.validateClient, this.unsetAdminEmail);

        server.post(this.basePath + '/config/emails/owner', this.validateClient, this.addOwnerEmail);
        server.put(this.basePath + '/config/emails/owner/:index', this.validateClient, this.updateOwnerEmail);
        server.del(this.basePath + '/config/emails/owner/:index', this.validateClient, this.deleteOwnerEmail);

        server.get(this.basePath + '/config/secret', this.validateClient, this.generateSecret);

        server.get(this.basePath + '/state', this.validateClient, this.getState);
        server.get(this.basePath + '/uptime', this.getUptime);

        server.put(this.basePath + '/bypass/one', this.validateClient, this.bypassOne);
        server.put(this.basePath + '/bypass/all', this.validateClient, this.bypassAll);
        server.del(this.basePath + '/bypass/all', this.validateClient, this.clearBypass);

        server.put(this.basePath + '/arm', this.validateClient, this.arm);
        server.put(this.basePath + '/disarm', this.validateClient, this.disarm);
    }

    private validateClient(req: Request, res: Response, next: Next): void {
        if(!req.headers.authorization) {
            return res.send(401);
        }
        let auth = req.headers.authorization.split(' ');
        if(auth.length < 2) {
            return res.send(401);
        }
        let clientId: string = auth[0] || '';
        let token: string = auth[1] || '';

        let result: AntiTheftSystemResponse = antiTheftSystemAPI.validateClient(clientId, token);
        if(!result.success) {
            return res.send(401);
        }
        next();
    }

    private setGuestCode(req: Request, res: Response, next: Next): void {
        if (!req.body.code || !req.body.guestCode) {
            res.send(400);
        } else {
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.setGuestCode(req.body.code, req.body.guestCode);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.send(403);
                } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }

    private setOwnerCode(req: Request, res: Response, next: Next): void {
        if (!req.body.code || !req.body.newCode) {
            res.send(400);
        } else {
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.updateOwnerCode(req.body.code, req.body.newCode);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.send(403);
                } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }

    private setAdminCode(req: Request, res: Response, next: Next): void {
        if (!req.body.code || !req.body.newCode) {
            res.send(400);
        } else {
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.updateAdminCode(req.body.code, req.body.newCode);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.send(403);
                } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }

    private setProgrammingMode(req: Request, res: Response, next: Next): void {
        if (!req.body.code) {
            res.send(400);
        } else {
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.setProgrammingMode(req.body.code);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.send(403);
                } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }

    private unsetProgrammingMode(req: Request, res: Response, next: Next): void {
        let result: AntiTheftSystemResponse = antiTheftSystemAPI.unsetProgrammingMode();
        if (result.success) {
            res.send(204);
        } else {
            if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.send(409);
            } else {
                res.send(400, { error: result.error });
            }
        }
        next();
    }

    private setSensor(req: Request, res: Response, next: Next): void {
        if (!req.body) {
            res.send(400);
        } else {
            let sensor = Sensor.getSensorFromData(req.body);
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.setSensor(sensor);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }

    private unsetSensor(req: Request, res: Response, next: Next): void {
        if (!req.body) {
            res.send(400);
        } else {
            let location = SensorLocation.getSensorLocationFromData(req.body);
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.unsetSensor(location);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }

    private setEntryTime(req: Request, res: Response, next: Next): void {
        if (!req.body.time) {
            res.send(400);
        } else {
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.setEntryTime(req.body.time, req.body.code);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.send(403);
                } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }

    private setExitTime(req: Request, res: Response, next: Next): void {
        if (!req.body.time) {
            res.send(400);
        } else {
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.setExitTime(req.body.time, req.body.code);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.send(403);
                } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }

    private turnOnBeep(req: Request, res: Response, next: Next): void {
        let result: AntiTheftSystemResponse = antiTheftSystemAPI.turnOnBeep(req.body.code);
        if (result.success) {
            res.send(204);
        } else {
            if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                res.send(403);
            } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.send(409);
            } else {
                res.send(400, { error: result.error });
            }
        }
        next();
    }

    private turnOffBeep(req: Request, res: Response, next: Next): void {
        let result: AntiTheftSystemResponse = antiTheftSystemAPI.turnOffBeep(req.body.code);
        if (result.success) {
            res.send(204);
        } else {
            if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                res.send(403);
            } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.send(409);
            } else {
                res.send(400, { error: result.error });
            }
        }
        next();
    }

    private toggleBeep(req: Request, res: Response, next: Next): void {
        let result: AntiTheftSystemResponse = antiTheftSystemAPI.toggleBeep(req.body.code);
        if (result.success) {
            res.send(204);
        } else {
            if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                res.send(403);
            } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.send(409);
            } else {
                res.send(400, { error: result.error });
            }
        }
        next();
    }

    private turnOnSilentAlarm(req: Request, res: Response, next: Next): void {
        let result: AntiTheftSystemResponse = antiTheftSystemAPI.turnOnSilentAlarm(req.body.code);
        if (result.success) {
            res.send(204);
        } else {
            if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                res.send(403);
            } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.send(409);
            } else {
                res.send(400, { error: result.error });
            }
        }
        next();
    }

    private turnOffSilentAlarm(req: Request, res: Response, next: Next): void {
        let result: AntiTheftSystemResponse = antiTheftSystemAPI.turnOffSilentAlarm(req.body.code);
        if (result.success) {
            res.send(204);
        } else {
            if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                res.send(403);
            } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.send(409);
            } else {
                res.send(400, { error: result.error });
            }
        }
        next();
    }

    private toggleSilentAlarm(req: Request, res: Response, next: Next): void {
        let result: AntiTheftSystemResponse = antiTheftSystemAPI.toggleSilentAlarm(req.body.code);
        if (result.success) {
            res.send(204);
        } else {
            if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                res.send(403);
            } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.send(409);
            } else {
                res.send(400, { error: result.error });
            }
        }
        next();
    }

    private setCentralPhone(req: Request, res: Response, next: Next): void {
        if (!req.body) {
            res.send(400);
        } else {
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.setCentralPhone(req.body);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }

    private unsetCentralPhone(req: Request, res: Response, next: Next): void {
        let result: AntiTheftSystemResponse = antiTheftSystemAPI.unsetCentralPhone();
        if (result.success) {
            res.send(204);
        } else {
            if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.send(409);
            } else {
                res.send(400, { error: result.error });
            }
        }
        next();
    }
    
    private setAdminPhone(req: Request, res: Response, next: Next): void {
        if (!req.body) {
            res.send(400);
        } else {
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.setAdminPhone(req.body);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }
    
    private unsetAdminPhone(req: Request, res: Response, next: Next): void {
        let result: AntiTheftSystemResponse = antiTheftSystemAPI.unsetAdminPhone();
        if (result.success) {
            res.send(204);
        } else {
            if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.send(409);
            } else {
                res.send(400, { error: result.error });
            }
        }
        next();
    }
    
    private addOwnerPhone(req: Request, res: Response, next: Next): void {
        if (!req.body.phone) {
            res.send(400);
        } else {
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.addOwnerPhone(req.body.phone, req.body.code);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.send(403);
                } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }
    
    private updateOwnerPhone(req: Request, res: Response, next: Next): void {
        if (!req.body.phone) {
            res.send(400);
        } else {
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.updateOwnerPhone(req.body.index, req.body.phone, req.body.code);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.send(403);
                } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }
    
    private deleteOwnerPhone(req: Request, res: Response, next: Next): void {
        let result: AntiTheftSystemResponse = antiTheftSystemAPI.deleteOwnerPhone(req.body.index, req.body.code);
        if (result.success) {
            res.send(204);
        } else {
            if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                res.send(403);
            } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.send(409);
            } else {
                res.send(400, { error: result.error });
            }
        }
        next();
    }
    
    private setCentralEmail(req: Request, res: Response, next: Next): void {
        if (!req.body) {
            res.send(400);
        } else {
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.setCentralEmail(req.body);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }
    
    private unsetCentralEmail(req: Request, res: Response, next: Next): void {
        let result: AntiTheftSystemResponse = antiTheftSystemAPI.unsetCentralEmail();
        if (result.success) {
            res.send(204);
        } else {
            if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.send(409);
            } else {
                res.send(400, { error: result.error });
            }
        }
        next();
    }
    
    private setAdminEmail(req: Request, res: Response, next: Next): void {
        if (!req.body) {
            res.send(400);
        } else {
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.setAdminEmail(req.body);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }
    
    private unsetAdminEmail(req: Request, res: Response, next: Next): void {
        let result: AntiTheftSystemResponse = antiTheftSystemAPI.unsetAdminEmail();
        if (result.success) {
            res.send(204);
        } else {
            if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.send(409);
            } else {
                res.send(400, { error: result.error });
            }
        }
        next();
    }
    
    private addOwnerEmail(req: Request, res: Response, next: Next): void {
        if (!req.body.email) {
            res.send(400);
        } else {
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.addOwnerEmail(req.body.email, req.body.code);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.send(403);
                } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }
    
    private updateOwnerEmail(req: Request, res: Response, next: Next): void {
        if (!req.body.email) {
            res.send(400);
        } else {
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.updateOwnerEmail(req.body.index, req.body.email, req.body.code);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.send(403);
                } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }
    
    private deleteOwnerEmail(req: Request, res: Response, next: Next): void {
        let result: AntiTheftSystemResponse = antiTheftSystemAPI.deleteOwnerEmail(req.body.index, req.body.code);
        if (result.success) {
            res.send(204);
        } else {
            if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                res.send(403);
            } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.send(409);
            } else {
                res.send(400, { error: result.error });
            }
        }
        next();
    }

    private generateSecret(req: Request, res: Response, next: Next): void {
        let result: AntiTheftSystemResponse = antiTheftSystemAPI.deleteOwnerEmail(req.body.index, req.body.code);
        if (result.success) {
            res.send(204, result.data);
        } else {
            if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.send(409);
            } else {
                res.send(400, { error: result.error });
            }
        }
        next();
    }

    private getState(req: Request, res: Response, next: Next): void {
        let result: AntiTheftSystemResponse = antiTheftSystemAPI.getState();
        if (result.success) {
            res.send(200, result.data);
        } else {
            res.send(400, result.error);
        }
    }

    private getUptime(req: Request, res: Response, next: Next): void {
        res.send(200, { uptime: Date.now() });
    }

    private bypassOne(req: Request, res: Response, next: Next): void {
        if (!req.body.location) {
            res.send(400);
        } else {
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.bypassOne(req.body.location, req.body.code);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.send(403);
                } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }

    private bypassAll(req: Request, res: Response, next: Next): void {
        if (!req.body.locations) {
            res.send(400);
        } else {
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.bypassAll(req.body.locations, req.body.code);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.send(403);
                } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }

    private clearBypass(req: Request, res: Response, next: Next): void {
        let result: AntiTheftSystemResponse = antiTheftSystemAPI.clearBypass(req.body.code);
        if (result.success) {
            res.send(204);
        } else {
            if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                res.send(403);
            } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.send(409);
            } else {
                res.send(400, { error: result.error });
            }
        }
        next();
    }

    private arm(req: Request, res: Response, next: Next): void {
        if (!req.body.mode) {
            res.send(400);
        } else {
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.arm(req.body.mode, req.body.code);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.send(403);
                } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }

    private disarm(req: Request, res: Response, next: Next): void {
        if (!req.body.code) {
            res.send(400);
        } else {
            let result: AntiTheftSystemResponse = antiTheftSystemAPI.disarm(req.body.code);
            if (result.success) {
                res.send(204);
            } else {
                if (result.error == AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.send(403);
                } else if (result.error == AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.send(409);
                } else {
                    res.send(400, { error: result.error });
                }
            }
        }
        next();
    }
}