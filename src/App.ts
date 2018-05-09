import * as restify from 'restify';
import { Request, Response, Next, route } from 'restify';
import * as controllers from './controllers';
import { Controller } from './lib/Controller';
import { Handlers } from './lib/Handlers';
import { AntiTheftSystem, AntiTheftSystemAPI } from './lib/antitheft/AntiTheftSystem';

const ServerInfo = {
    name: 'rats-web-api',
    version: '0.1.0',
    baseUrl: {
        development: '/',
        test: '/'
    }
};

class App {

  public server;
  private ats: AntiTheftSystemAPI;

  constructor () {
    this.server = restify.createServer(ServerInfo);
    this.configure();
  }

  private configure(): void {
    this.configureAntiTheftSystem();
    this.configureMiddleware();
    this.configureErrorHandler();
    this.configureRoutes();
  }

  private configureAntiTheftSystem(): void {
    this.ats = AntiTheftSystem.getInstance();
  }

  private configureMiddleware():void {
    this.server.pre(restify.pre.sanitizePath());
    this.server.pre(Handlers.useResHandler);
    this.server.use(this.crossOrigin);
    this.server.use(restify.plugins.acceptParser(this.server.acceptable));
    this.server.use(restify.plugins.authorizationParser());
    this.server.use(restify.plugins.dateParser());
    this.server.use(restify.plugins.queryParser());
    this.server.use(restify.plugins.gzipResponse());
    this.server.use(restify.plugins.bodyParser());
    this.server.use(restify.plugins.fullResponse());
  }

  private crossOrigin(req,res,next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'X-Requested-With');
    res.header('Access-Control-Allow-Methods', 'POST,GET,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-type,Accept,X-Access-Token,X-Key');
    return next();
  }

  private configureErrorHandler():void {
    this.server.on('InternalServer', this.onInternalServerError);
    this.server.on('restifyError', this.onRestifyError);
    this.server.on('uncaughtException', this.onUncaughtException);
  }

  private configureRoutes():void {
    for (let k in controllers) {
      let controller = new controllers[k]() as Controller;
      controller.routes(this.server);
    }
    // this.server.opts(/\.*/, this.opts);
    this.server.get('/favicon.ico', this.favicon);
  }

  /*private opts(req: Request, res: Response, next: Next): void {
    res.send(200);
    next();
  }*/

  private favicon(req: Request, res: Response, next: Next): void {
    res.header('Content-Type', 'text/plain');
    res.sendRaw('Not have a favicon');
    next();
  }

  private onInternalServerError(req:Request, res:Response, err:Error, next:Next):void {
    console.log('INTERNAL_SERVER_ERROR', req);
    console.log('INTERNAL_SERVER_ERROR', err);
    res.send(500);
    next();
  }

  private onRestifyError(req:Request, res:Response, err:Error, next:Next):void {
    console.log('RESTIFY_ERROR', req);
    console.log('RESTIFY_ERROR', err);
    res.send(404);
    next();
  }

  private onUncaughtException(req:Request, res:Response, route:route, err:Error):void {
    console.log('UNCAUGHT_EXCEPTION', req);
    console.log('UNCAUGHT_EXCEPTION', err);
    res.send(500);
  }

  private onMongooseConnectionError(err:any):void {
    console.error('Mongoose default connection error: ' + err);
    process.exit(err);
  }

  private onMongooseConnectionOpen(err:any):void {
    if (err) {
      console.error('Mongoose default connection error: ' + err);
      process.exit(err);
    }
  }

}

export default new App().server
