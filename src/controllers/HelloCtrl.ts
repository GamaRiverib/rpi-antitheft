import { Controller } from '../lib/Controller';
import { Request, Response, Next } from 'restify';

export class HelloController extends Controller {
    
    constructor() {
        super();
    }

    routes(server:any):void {
        server.get('/', this.hello);
        server.get('/hello/:name', this.hello);
        server.get('/hello/echo/:message', this.get);
    }

    private hello(req:Request, res:Response, next:Next):void {
        if (req.params.name) {
            res.json({ message: `Hello ${req.params.name}` });
        } else {
            res.json({ message: 'Hello Friend!' });
        }
        next();
    }

    private get(req:Request, res:Response, next:Next):void {
        if(req.params.message) {
            res.send(req.params);
        } else {
            res.send(200);
        }
        next();
    }
}