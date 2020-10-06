import { Server, createServer } from "http";
import winston = require("winston");
import express = require("express");
import { Application, Request, Response, NextFunction } from "express";
import cors = require("cors");
import { getLogger } from "./lib/utils/Logger";
import { ConfigController, SystemController } from "./controllers";
import { AntiTheftSystem } from "./lib/antitheft/AntiTheftSystem";
import { WebSocketChannel } from "./lib/antitheft/channels/WebSocketChannel";
import { MqttChannel } from "./lib/antitheft/channels/MqttChannel";
import { CloudChannel } from "./lib/antitheft/channels/CloudChannel";

const logger: winston.Logger = getLogger("APP");

const app: Application = express();

const server: Server = createServer(app);

const ats = AntiTheftSystem.getInstance();

// Gsm channel start
// GsmChannel.start(ats);

// Web Sockets channel start
const wsChannel: WebSocketChannel = WebSocketChannel.start(ats, server);
ats.addWebSocketChannel(wsChannel);

// MQTT channel start
const mqttChannel: MqttChannel = MqttChannel.start(ats);
ats.addMqttChannel(mqttChannel);

// Cloud channel (Firebase)
// CloudChannel.start(ats);

// Bluetooth channel start
// BluetoothChannel.start(ats);

// Before of any app.use
app.enable("case sensitive routing");

app.use(cors({ origin: true }));

app.use(express.json());

const configController = new ConfigController();
configController.routes(app);

const systemController = new SystemController();
systemController.routes(app);

app.options("/*", (req: Request, res: Response, next: NextFunction) => {
  res.send(200);
  next();
});

app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  logger.error("APP ERROR", { error, req });
  res.send(400).send({ error: { code: "DEFAULT_ERROR", message: "Something was wrong" } });
});

async function terminate(): Promise<void> {
  try {
      // GsmChannel.stop();
      WebSocketChannel.stop();
      MqttChannel.stop();
      CloudChannel.stop();
      ats.stop();
      // BluetoothChannel.stop();
      process.exit(0);
  } catch(err) {
      process.exit(1);
  }
}

if(process.platform === "win32") {
  const input = process.stdin;
  const output = process.stdout;
  // tslint:disable-next-line: no-var-requires
  const rl = require("readline");
  rl.createInterface({ input, output })
      .on("SIGINT", terminate);
}
process.on("SIGINT", terminate);

export { app, server };
