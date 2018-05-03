import { ResHandler } from './ResHandler';
import { Request, Response, Next } from 'restify';

export class Handlers {

    static useResHandler(req:Request, res:Response, next:Next):void {
        req.resHandler = new ResHandler(res);
        return next();
    }
}