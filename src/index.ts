import winston = require("winston");

import { getLogger } from "./lib/utils/Logger";
import { app }  from "./app";

const logger: winston.Logger = getLogger("SERVER");
logger.info("Starting...");

const PORT = Number(process.env.PORT) || 8080;

const server = app.listen(PORT, () => {
  logger.info(`App listening on port ${PORT}`);
});

module.exports = server;
