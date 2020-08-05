import { Controller } from '../lib/Controller';
import { Request, Response, NextFunction, Application } from 'express';
import { AntiTheftSystem } from '../lib/antitheft/AntiTheftSystem';
import { AntiTheftSystemProgrammingAPI } from '../lib/antitheft/AntiTheftSystemAPI';
import { AntiTheftSystemResponse } from '../lib/antitheft/AntiTheftSystemResponse';
import { AntiTheftSystemErrors } from '../lib/antitheft/AntiTheftSystemErrors';
import { Sensor } from '../lib/antitheft/Sensor';
import { SensorLocation } from '../lib/antitheft/SensorLocation';

const antiTheftProgrammingAPI: AntiTheftSystemProgrammingAPI = AntiTheftSystem.getInstance();

export class ConfigController extends Controller {

    private basePath = '/config';

    constructor() {
        super();
    }

    routes(app: Application):void {
        // Configure user codes
        app.put(this.basePath + '/codes/guest', this.validateClient, this.setGuestCode);
        app.put(this.basePath + '/codes/owner', this.validateClient, this.setOwnerCode);
        app.put(this.basePath + '/codes/admin', this.validateClient, this.setAdminCode);

        // Set programming mode
        app.put(this.basePath + '/programm', this.validateClient, this.setProgrammingMode);
        app.delete(this.basePath + '/programm', this.validateClient, this.unsetProgrammingMode);

        app.put(this.basePath + '/sensors', this.validateClient, this.setSensor);
        app.delete(this.basePath + '/sensors', this.validateClient, this.unsetSensor);

        app.put(this.basePath + '/times/entry', this.validateClient, this.setEntryTime);
        app.put(this.basePath + '/times/exit', this.validateClient, this.setExitTime);
        app.put(this.basePath + '/beep/on', this.validateClient, this.turnOnBeep);
        app.put(this.basePath + '/beep/off', this.validateClient, this.turnOffBeep);
        app.put(this.basePath + '/beep/toggle', this.validateClient, this.toggleBeep);
        app.put(this.basePath + '/silent/on', this.validateClient, this.turnOnSilentAlarm);
        app.put(this.basePath + '/silent/off', this.validateClient, this.turnOffSilentAlarm);
        app.put(this.basePath + '/silent/toggle', this.validateClient, this.toggleSilentAlarm);

        app.put(this.basePath + '/phones/central', this.validateClient, this.setCentralPhone);
        app.delete(this.basePath + '/phones/central', this.validateClient, this.unsetCentralPhone);
        app.put(this.basePath + '/phones/admin', this.validateClient, this.setAdminPhone);
        app.delete(this.basePath + '/phones/admin', this.validateClient, this.unsetAdminPhone);

        app.post(this.basePath + '/phones/owner', this.validateClient, this.addOwnerPhone);
        app.put(this.basePath + '/phones/owner/:index', this.validateClient, this.updateOwnerPhone);
        app.delete(this.basePath + '/phones/owner/:index', this.validateClient, this.deleteOwnerPhone);

        app.put(this.basePath + '/emails/central', this.validateClient, this.setCentralEmail);
        app.delete(this.basePath + '/emails/central', this.validateClient, this.unsetCentralEmail);
        app.put(this.basePath + '/emails/admin', this.validateClient, this.setAdminEmail);
        app.delete(this.basePath + '/emails/admin', this.validateClient, this.unsetAdminEmail);

        app.post(this.basePath + '/emails/owner', this.validateClient, this.addOwnerEmail);
        app.put(this.basePath + '/emails/owner/:index', this.validateClient, this.updateOwnerEmail);
        app.delete(this.basePath + '/emails/owner/:index', this.validateClient, this.deleteOwnerEmail);

        app.get(this.basePath + '/secret', this.validateClient, this.generateSecret);
    }

    private validateClient(req: Request, res: Response, next: NextFunction): void {
        if(!req.headers.authorization) {
            res.status(401).send();
            return;
        }
        const auth = req.headers.authorization.split(' ');
        if(auth.length < 2) {
            res.status(401).send();
            return
        }
        const clientId: string = auth[0] || '';
        const token: string = auth[1] || '';

        const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.validateClient(clientId, token);
        if(!result.success) {
            res.status(401).send();
            return;
        }
        next();
    }

    private setGuestCode(req: Request, res: Response, next: NextFunction): void {
        if (!req.body.code || !req.body.guestCode) {
            res.status(400).send();
        } else {
            const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.setGuestCode(req.body.code, req.body.guestCode);
            if (result.success) {
                res.status(204).send();
            } else {
                if (result.error === AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.status(403).send();
                } else if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.status(409).send();
                } else {
                    res.status(400).send({ error: result.error });
                }
            }
        }
        next();
    }

    private setOwnerCode(req: Request, res: Response, next: NextFunction): void {
        if (!req.body.code || !req.body.newCode) {
            res.status(400).send();
        } else {
            const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.updateOwnerCode(req.body.code, req.body.newCode);
            if (result.success) {
                res.status(204).send();
            } else {
                if (result.error === AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.status(403).send();
                } else if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.status(409).send();
                } else {
                    res.status(400).send({ error: result.error });
                }
            }
        }
        next();
    }

    private setAdminCode(req: Request, res: Response, next: NextFunction): void {
        if (!req.body.code || !req.body.newCode) {
            res.status(400).send();
        } else {
            const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.updateAdminCode(req.body.code, req.body.newCode);
            if (result.success) {
                res.status(204).send();
            } else {
                if (result.error === AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.status(403).send();
                } else if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.status(409).send();
                } else {
                    res.status(400).send({ error: result.error });
                }
            }
        }
        next();
    }

    private setProgrammingMode(req: Request, res: Response, next: NextFunction): void {
        if (!req.body.code) {
            res.status(400).send();
        } else {
            const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.setProgrammingMode(req.body.code);
            if (result.success) {
                res.status(204).send();
            } else {
                if (result.error === AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.status(403).send();
                } else if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.status(409).send();
                } else {
                    res.status(400).send({ error: result.error });
                }
            }
        }
        next();
    }

    private unsetProgrammingMode(req: Request, res: Response, next: NextFunction): void {
        const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.unsetProgrammingMode();
        if (result.success) {
            res.status(204).send();
        } else {
            if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.status(409).send();
            } else {
                res.status(400).send({ error: result.error });
            }
        }
        next();
    }

    private setSensor(req: Request, res: Response, next: NextFunction): void {
        if (!req.body) {
            res.status(400).send();
        } else {
            const sensor = Sensor.getSensorFromData(req.body);
            const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.setSensor(sensor);
            if (result.success) {
                res.status(204).send();
            } else {
                if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.status(409).send();
                } else {
                    res.status(400).send({ error: result.error });
                }
            }
        }
        next();
    }

    private unsetSensor(req: Request, res: Response, next: NextFunction): void {
        if (!req.body) {
            res.status(400).send();
        } else {
            const location = SensorLocation.getSensorLocationFromData(req.body);
            const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.unsetSensor(location);
            if (result.success) {
                res.status(204).send();
            } else {
                if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.status(409).send();
                } else {
                    res.status(400).send({ error: result.error });
                }
            }
        }
        next();
    }

    private setEntryTime(req: Request, res: Response, next: NextFunction): void {
        if (!req.body.time) {
            res.status(400).send();
        } else {
            const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.setEntryTime(req.body.time, req.body.code);
            if (result.success) {
                res.status(204).send();
            } else {
                if (result.error === AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.status(403).send();
                } else if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.status(409).send();
                } else {
                    res.status(400).send({ error: result.error });
                }
            }
        }
        next();
    }

    private setExitTime(req: Request, res: Response, next: NextFunction): void {
        if (!req.body.time) {
            res.status(400).send();
        } else {
            const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.setExitTime(req.body.time, req.body.code);
            if (result.success) {
                res.status(204).send();
            } else {
                if (result.error === AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.status(403).send();
                } else if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.status(409).send();
                } else {
                    res.status(400).send({ error: result.error });
                }
            }
        }
        next();
    }

    private turnOnBeep(req: Request, res: Response, next: NextFunction): void {
        const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.turnOnBeep(req.body.code);
        if (result.success) {
            res.status(204).send();
        } else {
            if (result.error === AntiTheftSystemErrors.NOT_AUTHORIZED) {
                res.status(403).send();
            } else if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.status(409).send();
            } else {
                res.status(400).send({ error: result.error });
            }
        }
        next();
    }

    private turnOffBeep(req: Request, res: Response, next: NextFunction): void {
        const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.turnOffBeep(req.body.code);
        if (result.success) {
            res.status(204).send();
        } else {
            if (result.error === AntiTheftSystemErrors.NOT_AUTHORIZED) {
                res.status(403).send();
            } else if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.status(409).send();
            } else {
                res.status(400).send({ error: result.error });
            }
        }
        next();
    }

    private toggleBeep(req: Request, res: Response, next: NextFunction): void {
        const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.toggleBeep(req.body.code);
        if (result.success) {
            res.status(204).send();
        } else {
            if (result.error === AntiTheftSystemErrors.NOT_AUTHORIZED) {
                res.status(403).send();
            } else if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.status(409).send();
            } else {
                res.status(400).send({ error: result.error });
            }
        }
        next();
    }

    private turnOnSilentAlarm(req: Request, res: Response, next: NextFunction): void {
        const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.turnOnSilentAlarm(req.body.code);
        if (result.success) {
            res.status(204).send();
        } else {
            if (result.error === AntiTheftSystemErrors.NOT_AUTHORIZED) {
                res.status(403).send();
            } else if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.status(409).send();
            } else {
                res.status(400).send({ error: result.error });
            }
        }
        next();
    }

    private turnOffSilentAlarm(req: Request, res: Response, next: NextFunction): void {
        const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.turnOffSilentAlarm(req.body.code);
        if (result.success) {
            res.status(204).send();
        } else {
            if (result.error === AntiTheftSystemErrors.NOT_AUTHORIZED) {
                res.status(403).send();
            } else if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.status(409).send();
            } else {
                res.status(400).send({ error: result.error });
            }
        }
        next();
    }

    private toggleSilentAlarm(req: Request, res: Response, next: NextFunction): void {
        const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.toggleSilentAlarm(req.body.code);
        if (result.success) {
            res.status(204).send();
        } else {
            if (result.error === AntiTheftSystemErrors.NOT_AUTHORIZED) {
                res.status(403).send();
            } else if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.status(409).send();
            } else {
                res.status(400).send({ error: result.error });
            }
        }
        next();
    }

    private setCentralPhone(req: Request, res: Response, next: NextFunction): void {
        if (!req.body) {
            res.status(400).send();
        } else {
            const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.setCentralPhone(req.body);
            if (result.success) {
                res.status(204).send();
            } else {
                if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.status(409).send();
                } else {
                    res.status(400).send({ error: result.error });
                }
            }
        }
        next();
    }

    private unsetCentralPhone(req: Request, res: Response, next: NextFunction): void {
        const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.unsetCentralPhone();
        if (result.success) {
            res.status(204).send();
        } else {
            if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.status(409).send();
            } else {
                res.status(400).send({ error: result.error });
            }
        }
        next();
    }

    private setAdminPhone(req: Request, res: Response, next: NextFunction): void {
        if (!req.body) {
            res.status(400).send();
        } else {
            const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.setAdminPhone(req.body);
            if (result.success) {
                res.status(204).send();
            } else {
                if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.status(409).send();
                } else {
                    res.status(400).send({ error: result.error });
                }
            }
        }
        next();
    }

    private unsetAdminPhone(req: Request, res: Response, next: NextFunction): void {
        const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.unsetAdminPhone();
        if (result.success) {
            res.status(204).send();
        } else {
            if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.status(409).send();
            } else {
                res.status(400).send({ error: result.error });
            }
        }
        next();
    }

    private addOwnerPhone(req: Request, res: Response, next: NextFunction): void {
        if (!req.body.phone) {
            res.status(400).send();
        } else {
            const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.addOwnerPhone(req.body.phone, req.body.code);
            if (result.success) {
                res.status(204).send();
            } else {
                if (result.error === AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.status(403).send();
                } else if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.status(409).send();
                } else {
                    res.status(400).send({ error: result.error });
                }
            }
        }
        next();
    }

    private updateOwnerPhone(req: Request, res: Response, next: NextFunction): void {
        if (!req.body.phone) {
            res.status(400).send();
        } else {
            const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.updateOwnerPhone(req.body.index, req.body.phone, req.body.code);
            if (result.success) {
                res.status(204).send();
            } else {
                if (result.error === AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.status(403).send();
                } else if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.status(409).send();
                } else {
                    res.status(400).send({ error: result.error });
                }
            }
        }
        next();
    }

    private deleteOwnerPhone(req: Request, res: Response, next: NextFunction): void {
        const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.deleteOwnerPhone(req.body.index, req.body.code);
        if (result.success) {
            res.status(204).send();
        } else {
            if (result.error === AntiTheftSystemErrors.NOT_AUTHORIZED) {
                res.status(403).send();
            } else if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.status(409).send();
            } else {
                res.status(400).send({ error: result.error });
            }
        }
        next();
    }

    private setCentralEmail(req: Request, res: Response, next: NextFunction): void {
        if (!req.body) {
            res.status(400).send();
        } else {
            const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.setCentralEmail(req.body);
            if (result.success) {
                res.status(204).send();
            } else {
                if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.status(409).send();
                } else {
                    res.status(400).send({ error: result.error });
                }
            }
        }
        next();
    }

    private unsetCentralEmail(req: Request, res: Response, next: NextFunction): void {
        const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.unsetCentralEmail();
        if (result.success) {
            res.status(204).send();
        } else {
            if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.status(409).send();
            } else {
                res.status(400).send({ error: result.error });
            }
        }
        next();
    }

    private setAdminEmail(req: Request, res: Response, next: NextFunction): void {
        if (!req.body) {
            res.status(400).send();
        } else {
            const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.setAdminEmail(req.body);
            if (result.success) {
                res.status(204).send();
            } else {
                if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.status(409).send();
                } else {
                    res.status(400).send({ error: result.error });
                }
            }
        }
        next();
    }

    private unsetAdminEmail(req: Request, res: Response, next: NextFunction): void {
        const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.unsetAdminEmail();
        if (result.success) {
            res.status(204).send();
        } else {
            if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.status(409).send();
            } else {
                res.status(400).send({ error: result.error });
            }
        }
        next();
    }

    private addOwnerEmail(req: Request, res: Response, next: NextFunction): void {
        if (!req.body.email) {
            res.status(400).send();
        } else {
            const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.addOwnerEmail(req.body.email, req.body.code);
            if (result.success) {
                res.status(204).send();
            } else {
                if (result.error === AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.status(403).send();
                } else if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.status(409).send();
                } else {
                    res.status(400).send({ error: result.error });
                }
            }
        }
        next();
    }

    private updateOwnerEmail(req: Request, res: Response, next: NextFunction): void {
        if (!req.body.email) {
            res.status(400).send();
        } else {
            const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.updateOwnerEmail(req.body.index, req.body.email, req.body.code);
            if (result.success) {
                res.status(204).send();
            } else {
                if (result.error === AntiTheftSystemErrors.NOT_AUTHORIZED) {
                    res.status(403).send();
                } else if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                    res.status(409).send();
                } else {
                    res.status(400).send({ error: result.error });
                }
            }
        }
        next();
    }

    private deleteOwnerEmail(req: Request, res: Response, next: NextFunction): void {
        const result: AntiTheftSystemResponse<void> = antiTheftProgrammingAPI.deleteOwnerEmail(req.body.index, req.body.code);
        if (result.success) {
            res.status(204).send();
        } else {
            if (result.error === AntiTheftSystemErrors.NOT_AUTHORIZED) {
                res.status(403).send();
            } else if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.status(409).send();
            } else {
                res.status(400).send({ error: result.error });
            }
        }
        next();
    }

    private generateSecret(req: Request, res: Response, next: NextFunction): void {
        const result: AntiTheftSystemResponse<string> = antiTheftProgrammingAPI.generateSecret();
        if (result.success) {
            res.status(200).send(result.data);
        } else {
            if (result.error === AntiTheftSystemErrors.INVALID_SYSTEM_STATE) {
                res.status(409).send();
            } else {
                res.status(400).send({ error: result.error });
            }
        }
        next();
    }
}
