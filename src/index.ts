import { createServer, Server } from "http";

import winston = require("winston");

import { getLogger } from "./lib/utils/Logger";
import { app }  from "./app";

const logger: winston.Logger = getLogger("ATS SERVER");
logger.info("Starting...");

const PORT = Number(process.env.PORT) || 3000;

const httpServer: Server = createServer(app);

const server = httpServer.listen(PORT, () => {
  logger.info(`App listening on port ${PORT}`);
});

module.exports = { server };
