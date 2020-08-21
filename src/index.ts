import { readFileSync } from "fs";
import { join } from "path";
import { createServer, Server } from "http";
import { createServer as createSecureServer } from "https";

import winston = require("winston");

import { getLogger } from "./lib/utils/Logger";
import { app }  from "./app";

const logger: winston.Logger = getLogger("SERVER");
logger.info("Starting...");

const PORT = Number(process.env.PORT) || 3000;
const SECURE_PORT = Number(process.env.SECURE_NODE_PORT) || 3443;
const PATH_TO_CERTS: string = process.env.PATH_TO_CERTS || "certs";

// Certificate
const key: string = readFileSync(join(PATH_TO_CERTS, "private.key"), "utf8");
const cert: string = readFileSync(join(PATH_TO_CERTS, "certificate.pem"), "utf-8");

const credentials: any = { key, cert };

const httpServer: Server = createServer(app);
const httpsServer: Server = createSecureServer(credentials, app);

const server = httpServer.listen(PORT, () => {
  logger.info(`App listening on port ${PORT}`);
});

const secureServer = httpsServer.listen(SECURE_PORT, () => {
  logger.info(`App listening on secure port ${SECURE_PORT}`);
});

module.exports = { server, secureServer };
