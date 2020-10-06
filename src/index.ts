import winston = require("winston");

import { getLogger } from "./lib/utils/Logger";
import { server }  from "./App";

const logger: winston.Logger = getLogger("ATS SERVER");
logger.info("Starting...");

const PORT = Number(process.env.PORT) || 3000;

server.listen(PORT, () => {
  logger.info(`App listening on port ${PORT}`);
});

module.exports = { server };
