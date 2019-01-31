import * as restify from 'restify';
import { Request, Response, Next, Route, createServer, Server } from 'restify';
import * as controllers from './controllers';
import { Controller } from './lib/Controller';
import { AntiTheftSystem } from './lib/antitheft/AntiTheftSystem';
import { AntiTheftSystemAPI } from './lib/antitheft/AntiTheftSystemAPI';
import { WebSocketChannel } from './lib/antitheft/channels/WebSocketChannel';
import { GsmChannel } from './lib/antitheft/channels/GsmChannel';
import { BluetoothChannel } from './lib/antitheft/channels/BluetoothChannel';

const ServerInfo = {
    name: 'rats-web-api',
    version: '0.1.0',
    baseUrl: {
        development: '/',
        test: '/'
    }
};

class App {

  public server: Server;
  private ats: AntiTheftSystemAPI;

  constructor () {
    this.server = createServer(ServerInfo);
    this.configure();
  }

  private configure(): void {
    this.configureAntiTheftSystem();
    this.configureMiddleware();
    this.configureErrorHandler();
    this.configureRoutes();
  }

  private configureAntiTheftSystem(): void {
    // AntiTheftSystem Configuration
    this.ats = AntiTheftSystem.getInstance();

    // Gsm channel start
    //GsmChannel.start(this.ats);

    // Web Sockets channel start
    WebSocketChannel.start(this.ats, this.server.server);

    // Bluetooth channel start
    //BluetoothChannel.start(this.ats);

  }

  private configureMiddleware():void {
    this.server.pre(restify.pre.sanitizePath());
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
    res.header('Access-Control-Allow-Methods', 'POST,GET,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-type,Authorization');
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
    this.server.opts('/*', this.opts);
    this.server.get('/favicon.ico', this.favicon);
  }

  private opts(req: Request, res: Response, next: Next): void {
    res.send(200);
    next();
  }

  private favicon(req: Request, res: Response, next: Next): void {
    res.header('Content-Type', 'text/plain');
    res.sendRaw('Not have a favicon');
    next();
  }

  private onInternalServerError(req: Request, res: Response, err:Error, next: Next):void {
    console.log('INTERNAL_SERVER_ERROR', req);
    console.log('INTERNAL_SERVER_ERROR', err);
    res.send(500);
    next();
  }

  private onRestifyError(req: Request, res: Response, err:Error, next: Next):void {
    console.log('RESTIFY_ERROR', req);
    console.log('RESTIFY_ERROR', err);
    res.send(404);
    next();
  }

  private onUncaughtException(req: Request, res: Response, route: Route, err: Error):void {
    console.log('UNCAUGHT_EXCEPTION', req);
    console.log('UNCAUGHT_EXCEPTION', err);
    res.send(500);
  }

}

export default new App().server
