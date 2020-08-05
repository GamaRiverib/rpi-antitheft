import { Controller } from '../lib/Controller';
import { Request, Response, NextFunction, Application } from 'express';
import { AntiTheftSystem } from '../lib/antitheft/AntiTheftSystem';
import { AntiTheftSystemAPI } from '../lib/antitheft/AntiTheftSystemAPI';
import { AntiTheftSystemResponse } from '../lib/antitheft/AntiTheftSystemResponse';
import { AntiTheftSystemErrors } from '../lib/antitheft/AntiTheftSystemErrors';
import { SystemState } from '../lib/antitheft/SystemState';

const antiTheftSystemAPI: AntiTheftSystemAPI = AntiTheftSystem.getInstance();

export class SystemController extends Controller {

    private basePath = '';

    constructor() {
        super();
    }

    routes(app: Application):void {

        app.get(this.basePath + '/state', this.validateClient, this.getState);
        app.get(this.basePath + '/uptime', this.getUptime);

        app.put(this.basePath + '/bypass/one', this.validateClient, this.bypassOne);
        app.put(this.basePath + '/bypass/all', this.validateClient, this.bypassAll);
        app.put(this.basePath + '/unbypass/one', this.validateClient, this.clearBypassOne);
        app.put(this.basePath + '/unbypass/all', this.validateClient, this.clearBypass);

        app.put(this.basePath + '/arm', this.validateClient, this.arm);
        app.put(this.basePath + '/disarm', this.validateClient, this.disarm);
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

        const result: AntiTheftSystemResponse<void> = antiTheftSystemAPI.validateClient(clientId, token);
        if(!result.success) {
            res.status(401).send();
            return
        }
        next();
    }

    private getState(req: Request, res: Response, next: NextFunction): void {
        const result: AntiTheftSystemResponse<SystemState> = antiTheftSystemAPI.getState();
        if (result.success) {
            res.status(200).send(result.data);
        } else {
            res.status(400).send(result.error);
        }
    }

    private getUptime(req: Request, res: Response, next: NextFunction): void {
        res.status(200).send({ uptime: Date.now() });
    }

    private bypassOne(req: Request, res: Response, next: NextFunction): void {
        if (!req.body || !req.body.location) {
            res.status(400).send();
        } else {
            let location: any = req.body.location;
            if(typeof location === 'string') {
                try {
                    location = JSON.parse(location);
                } catch(err) {
                    res.status(400).send({ error: err });
                }
            }
            const result: AntiTheftSystemResponse<void> = antiTheftSystemAPI.bypassOne(location, req.body.code);
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

    private bypassAll(req: Request, res: Response, next: NextFunction): void {
        if (!req.body || !req.body.locations) {
            res.status(400).send();
        } else {
            const result: AntiTheftSystemResponse<void> = antiTheftSystemAPI.bypassAll(req.body.locations, req.body.code);
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

    private clearBypassOne(req: Request, res: Response, next: NextFunction): void {
        if (!req.body || !req.body.location) {
            res.status(400).send();
        } else {
            let location: any = req.body.location;
            if(typeof location === 'string') {
                try {
                    location = JSON.parse(location);
                } catch(err) {
                    res.status(400).send({ error: err });
                }
            }
            const result: AntiTheftSystemResponse<void> = antiTheftSystemAPI.clearBypassOne(location, req.body.code);
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

    private clearBypass(req: Request, res: Response, next: NextFunction): void {
        const result: AntiTheftSystemResponse<void> = antiTheftSystemAPI.clearBypass(req.body.code);
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

    private arm(req: Request, res: Response, next: NextFunction): void {
        if (!req.body || !req.body.mode) {
            res.status(400).send();
        } else {
            const result: AntiTheftSystemResponse<void> = antiTheftSystemAPI.arm(req.body.mode, req.body.code);
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

    private disarm(req: Request, res: Response, next: NextFunction): void {
        if (!req.body || !req.body.code) {
            res.status(400).send();
        } else {
            const result: AntiTheftSystemResponse<void> = antiTheftSystemAPI.disarm(req.body.code);
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
}
