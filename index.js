import winston from "winston";

import APIServer from "./app/apiserver.js";
import config from "./app/config/config.js";
import PgPool from "./app/utils/pgpool.js";
import RedisSvc from "./app/utils/redissvc.js";
import { swaggerDocs } from "./docs/swagger.js";

import HealthHdlr from "./app/handlers/healthhdlr/healthhdlr.js";
import ChargeInsightHdlr from "./app/handlers/modules/chargeinsights/chargeinsightshdlr.js";
import FleetInsightHdlr from "./app/handlers/modules/fleetinsights/fleetinsightshdlr.js";
import FmsAccountHdlr from "./app/handlers/modules/fmsaccount/fmsaccounthdlr.js";
import HistoryDataHdlr from "./app/handlers/modules/historydata/historydatahdlr.js";
import LivetrackingHdlr from "./app/handlers/modules/livetracking/livetrackinghdlr.js";
import TripsInsightHdlr from "./app/handlers/modules/tripsinsights/tripsinsightshdlr.js";
import PlatformHdlr from "./app/handlers/platformhdlr/platformhdlr.js";
import PublicHdlr from "./app/handlers/publichdlr/publichdlr.js";
import UserHdlr from "./app/handlers/userhdlr/userhdlr.js";
import AuthSvc from "./app/services/external/authsvc/authsvc.js";
import EmailSvc from "./app/services/external/emailsvc/emailsvc.js";
import FmsSvc from "./app/services/fmssvc/fmssvc.js";
import HealthSvc from "./app/services/healthsvc/healthsvc.js";
import ChargeInsightSvc from "./app/services/modules/chargeinsights/chargeinsightssvc.js";
import FleetInsightSvc from "./app/services/modules/fleetinsights/fleetinsightssvc.js";
import FmsAccountSvc from "./app/services/modules/fmsaccount/fmsaccountsvc.js";
import HistoryDataSvc from "./app/services/modules/historydata/historydatasvc.js";
import LivetrackingSvc from "./app/services/modules/livetracking/livetrackingsvc.js";
import TripsInsightSvc from "./app/services/modules/tripsinsights/tripsinsightssvc.js";
import PlatformSvc from "./app/services/platformsvc/platformsvc.js";
import UserSvc from "./app/services/usersvc/usersvc.js";

// The config has been given here, we can proceed with the starting of the services...
const myFormat = winston.format.printf(
  ({ level, message, label, timestamp }) => {
    return `${timestamp} [${label}] ${level}: ${JSON.stringify(message)}`;
  }
);

// 0. Config Related...
let apiserverport = config.apiserver.port;

// 1. Services...
let servicelogger = console;
let pgPoolI = new PgPool(config.pgdb, servicelogger);
let redisSvc = new RedisSvc(config.redis, servicelogger);

let healthSvcI = new HealthSvc();
let authSvcI = new AuthSvc(config, servicelogger);
let userSvcI = new UserSvc(pgPoolI, servicelogger);
let platformSvcI = new PlatformSvc(pgPoolI, servicelogger);
let fmsSvcI = new FmsSvc(pgPoolI, servicelogger);
let fmsAccountSvcI = new FmsAccountSvc(pgPoolI, servicelogger);
let historyDataSvcI = new HistoryDataSvc(pgPoolI, servicelogger);
let livetrackingSvcI = new LivetrackingSvc(pgPoolI, servicelogger);
let tripsInsightSvcI = new TripsInsightSvc(pgPoolI, servicelogger);
let chargeInsightSvcI = new ChargeInsightSvc(pgPoolI, servicelogger);
let fleetInsightSvcI = new FleetInsightSvc(pgPoolI, servicelogger);
let emailSvcI = new EmailSvc(pgPoolI, config, servicelogger);
emailSvcI.Start();

// 2. Handlers...
let healthHdlrI = new HealthHdlr(healthSvcI);
let platformHdlrI = new PlatformHdlr(
  platformSvcI,
  userSvcI,
  authSvcI,
  fmsAccountSvcI,
  servicelogger
);
let userHdlrI = new UserHdlr(
  userSvcI,
  authSvcI,
  fmsSvcI,
  platformSvcI,
  config,
  servicelogger
);
let fmsAccountHdlrI = new FmsAccountHdlr(
  fmsAccountSvcI,
  userSvcI,
  servicelogger
);
let historyDataHdlrI = new HistoryDataHdlr(
  historyDataSvcI,
  fmsAccountSvcI,
  servicelogger
);
let livetrackingHdlrI = new LivetrackingHdlr(
  livetrackingSvcI,
  fmsAccountSvcI,
  servicelogger
);
let tripsInsightHdlrI = new TripsInsightHdlr(
  tripsInsightSvcI,
  fmsAccountSvcI,
  servicelogger
);
let chargeInsightHdlrI = new ChargeInsightHdlr(
  chargeInsightSvcI,
  fmsAccountSvcI,
  tripsInsightSvcI,
  servicelogger
);
let fleetInsightHdlrI = new FleetInsightHdlr(
  fleetInsightSvcI,
  fmsAccountSvcI,
  servicelogger
);

let publicHdlrI = new PublicHdlr(
  userSvcI,
  authSvcI,
  fmsSvcI,
  platformSvcI,
  config,
  servicelogger
);

// 3. Handler Map...
let publicRoutes = [
  ["/api/v1/fms/health/", healthHdlrI],
  ["/api/v1/fms/public/", publicHdlrI],
];

let apiRoutes = [
  ["/api/v1/platform/", platformHdlrI],
  ["/api/v1/fms/user/", userHdlrI],
  ["/api/v1/fms/account/", fmsAccountHdlrI],
  ["/api/v1/fms/historydata/", historyDataHdlrI],
  ["/api/v1/fms/livetracking/", livetrackingHdlrI],
  ["/api/v1/fms/tripinsights/", tripsInsightHdlrI],
  ["/api/v1/fms/chargeinsights/", chargeInsightHdlrI],
  ["/api/v1/fms/fleetinsights/", fleetInsightHdlrI],
];

// 4. API Server...
let apiserverlogger = console;
let App = new APIServer(publicRoutes, apiRoutes, config, apiserverlogger);

// 5. Initialize Swagger documentation
swaggerDocs(App.app, config);

App.Start(apiserverport);
