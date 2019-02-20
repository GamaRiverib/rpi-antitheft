import { Controller } from '../lib/Controller';
import { Request, Response, Next } from 'restify';
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

    routes(server:any):void {

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

        let result: AntiTheftSystemResponse<void> = antiTheftSystemAPI.validateClient(clientId, token);
        if(!result.success) {
            return res.send(401);
        }
        next();
    }

    private getState(req: Request, res: Response, next: Next): void {
        let result: AntiTheftSystemResponse<SystemState> = antiTheftSystemAPI.getState();
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
            let location: any = req.body.location;
            if(typeof location === 'string') {
                try {
                    location = JSON.parse(location);
                } catch(err) {
                    res.send(400, { error: err });
                }
            }
            let result: AntiTheftSystemResponse<void> = antiTheftSystemAPI.bypassOne(location, req.body.code);
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
            let result: AntiTheftSystemResponse<void> = antiTheftSystemAPI.bypassAll(req.body.locations, req.body.code);
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
        let result: AntiTheftSystemResponse<void> = antiTheftSystemAPI.clearBypass(req.body.code);
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
            let result: AntiTheftSystemResponse<void> = antiTheftSystemAPI.arm(req.body.mode, req.body.code);
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
            let result: AntiTheftSystemResponse<void> = antiTheftSystemAPI.disarm(req.body.code);
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