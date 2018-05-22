import * as restify from 'restify';
import { Request, Response, Next, Route, createServer, Server } from 'restify';
import * as controllers from './controllers';
import { Controller } from './lib/Controller';
import { Handlers } from './lib/Handlers';
import { AntiTheftSystem, AntiTheftSystemAPI, AntiTheftSystemResponse } from './lib/antitheft/AntiTheftSystem';
import { SystemStateService } from './lib/antitheft/ble/SystemStateService';

import * as io from 'socket.io';
import * as bleno from 'bleno';

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
  private socket: io.Server;

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
    this.ats = AntiTheftSystem.getInstance();


    this.socket = io.listen(this.server.server);

    /*this.socket.use((socket, next) => {
      console.log('Authorize web socket client');
      console.log(socket.request);
      if(!socket.request.headers.authorization) {
        console.log('Not token received');
        return next(new Error('Not token received'));
      }
      let auth = socket.request.headers.authorization.split(' ');
      if (auth.length < 2) {
        console.log('Bad authorization header')
        return next(new Error('Bad authorization header'));
      }
      let clientId: string = auth[0] || '';
      let token: string = auth[1] || '';
      console.log('clientId', clientId);
      console.log('token', token);
      let result: AntiTheftSystemResponse = this.ats.validateClient(clientId, token);
      if(!result.success) {
        console.log('Not authorized');
        return next(new Error('Not authorized'));
      }
      return next();
    });*/

    this.socket.on('connection', (ws) => {
      console.log('New web socket client');
    });

    this.ats.on(AntiTheftSystem.Events.ALERT, () => {
      this.socket.emit(AntiTheftSystem.Events.ALERT);
    });
    this.ats.on(AntiTheftSystem.Events.SENSOR_ACTIVED, (data) => {
      this.socket.emit(AntiTheftSystem.Events.SENSOR_ACTIVED, data);
    });
    this.ats.on(AntiTheftSystem.Events.SIREN_ACTIVED, () => {
      this.socket.emit(AntiTheftSystem.Events.SIREN_ACTIVED);
    });
    this.ats.on(AntiTheftSystem.Events.SIREN_SILENCED, () => {
      this.socket.emit(AntiTheftSystem.Events.SIREN_SILENCED);
    });
    this.ats.on(AntiTheftSystem.Events.SYSTEM_ALARMED, (data) => {
      this.socket.emit(AntiTheftSystem.Events.SYSTEM_ALARMED, data);
    });
    this.ats.on(AntiTheftSystem.Events.SYSTEM_ARMED, (data) => {
      this.socket.emit(AntiTheftSystem.Events.SYSTEM_ARMED, data);
    });
    this.ats.on(AntiTheftSystem.Events.SYSTEM_DISARMED, () => {
      this.socket.emit(AntiTheftSystem.Events.SYSTEM_DISARMED);
    });
    this.ats.on(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, (data) => {
      this.socket.emit(AntiTheftSystem.Events.SYSTEM_STATE_CHANGED, data);
    });

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
        bleno.setServices([
          bleService
        ], (err) =>  {
          if(err) {
            console.log(err);
          }
        });
      }
    });
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
