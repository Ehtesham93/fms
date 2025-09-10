// import config
import NodeCache from "node-cache";
import configdata from "../app/config/config.js";
import PgPool from "../app/utils/pgpool.js";
import RedisSvc from "../app/utils/redissvc.js";
import {
  seedUser,
  seedSuperAdmin,
  seedConsoleAccount,
  seedModule,
  seedVehicleModelFamily,
  seedVehicleModel,
  seedVehicleModelFamilyParam,
  seedPackageTypesAndCategories,
  seedChargeDeviation,
  seedDocuments,
  seedBanners,
  seedSOSContacts,
  seedAllPermId,
  seedPackages,
  seedPackageModule,
  seedParamFamily,
  seedParamFamilyParam,
  seedFleetUserRole,
  seedApiKeys,
  seedCity,
  seedDealer,
  seedFuelType,
  seedColour,
  seedTGUModel,
  seedTGUSwVersion,
} from "./db_seed_util.js";
import HealthHdlr from "../app/handlers/healthhdlr/healthhdlr.js";
import ChargeInsightHdlr from "../app/handlers/modules/chargeinsights/chargeinsightshdlr.js";
import FleetInsightHdlr from "../app/handlers/modules/fleetinsights/fleetinsightshdlr.js";
import FmsAccountHdlr from "../app/handlers/modules/fmsaccount/fmsaccounthdlr.js";
import HistoryDataHdlr from "../app/handlers/modules/historydata/historydatahdlr.js";
import LivetrackingHdlr from "../app/handlers/modules/livetracking/livetrackinghdlr.js";
import TripsInsightHdlr from "../app/handlers/modules/tripsinsights/tripsinsightshdlr.js";
import PlatformHdlr from "../app/handlers/platformhdlr/platformhdlr.js";
import PublicHdlr from "../app/handlers/publichdlr/publichdlr.js";
import UserHdlr from "../app/handlers/userhdlr/userhdlr.js";
import AuthSvc from "../app/services/external/authsvc/authsvc.js";
import EmailSvc from "../app/services/external/emailsvc/emailsvc.js";
import FmsSvc from "../app/services/fmssvc/fmssvc.js";
import HealthSvc from "../app/services/healthsvc/healthsvc.js";
import ChargeInsightSvc from "../app/services/modules/chargeinsights/chargeinsightssvc.js";
import FleetInsightSvc from "../app/services/modules/fleetinsights/fleetinsightssvc.js";
import FmsAccountSvc from "../app/services/modules/fmsaccount/fmsaccountsvc.js";
import HistoryDataSvc from "../app/services/modules/historydata/historydatasvc.js";
import LivetrackingSvc from "../app/services/modules/livetracking/livetrackingsvc.js";
import TripsInsightSvc from "../app/services/modules/tripsinsights/tripsinsightssvc.js";
import PlatformSvc from "../app/services/platformsvc/platformsvc.js";
import UserSvc from "../app/services/usersvc/usersvc.js";
import { Logger } from "../lib/nemo3-lib-observability/index.js";

main();

async function main() {
  if (process.env.SEED_DB !== "true") {
    console.log("SEED_DB is not true. Skipping seeding.");
    return;
  }

  // setup logger
  const logger = new Logger({
    environment: process.env.APP_ENV || "LOCAL",
    service: "nemo3-api-fms-svc",
    instance: process.env.INSTANCE || "localhost",
    ip: process.env.IP || "127.0.0.1",
    loglevel: "info",
    logToConsole: true,
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    maxBackups: 5,
    checkIntervalMs: 2 * 1000,
    autoInstrument: true,
    flushInterval: 5000,
  });

  // pgpool config
  let pgDBCfg = configdata.pgdb;

  if (process.env.TEST_SCHEMA) {
    pgDBCfg = { ...pgDBCfg, schema: process.env.TEST_SCHEMA };
    console.log(`Using test schema: ${process.env.TEST_SCHEMA}`);
  }

  // Initialize services like in index.js
  let servicelogger = logger;
  let pgPool = new PgPool(pgDBCfg, servicelogger);
  let inMemCacheI = new NodeCache(configdata.inMemCache);
  let redisSvc = new RedisSvc(configdata.redis, servicelogger);

  let healthSvcI = new HealthSvc();
  let authSvcI = new AuthSvc(configdata, servicelogger);
  let userSvcI = new UserSvc(pgPool, configdata, servicelogger);
  let platformSvcI = new PlatformSvc(pgPool, servicelogger);
  let fmsSvcI = new FmsSvc(pgPool, servicelogger);
  let fmsAccountSvcI = new FmsAccountSvc(pgPool, servicelogger);
  let historyDataSvcI = new HistoryDataSvc(pgPool, servicelogger);
  let livetrackingSvcI = new LivetrackingSvc(pgPool, servicelogger);
  let tripsInsightSvcI = new TripsInsightSvc(pgPool, servicelogger);
  let chargeInsightSvcI = new ChargeInsightSvc(pgPool, servicelogger);
  let fleetInsightSvcI = new FleetInsightSvc(pgPool, servicelogger);

  // Initialize handlers like in index.js
  let healthHdlrI = new HealthHdlr(healthSvcI);
  let platformHdlrI = new PlatformHdlr(
    platformSvcI,
    userSvcI,
    authSvcI,
    fmsAccountSvcI,
    historyDataSvcI,
    inMemCacheI,
    servicelogger
  );
  let userHdlrI = new UserHdlr(
    userSvcI,
    authSvcI,
    fmsSvcI,
    platformSvcI,
    configdata,
    servicelogger
  );
  let fmsAccountHdlrI = new FmsAccountHdlr(
    fmsAccountSvcI,
    userSvcI,
    servicelogger,
    platformSvcI,
    inMemCacheI
  );
  let historyDataHdlrI = new HistoryDataHdlr(
    historyDataSvcI,
    fmsAccountSvcI,
    servicelogger
  );
  let livetrackingHdlrI = new LivetrackingHdlr(
    livetrackingSvcI,
    fmsAccountSvcI,
    userSvcI,
    servicelogger
  );
  let tripsInsightHdlrI = new TripsInsightHdlr(
    tripsInsightSvcI,
    fmsAccountSvcI,
    userSvcI,
    servicelogger
  );
  let chargeInsightHdlrI = new ChargeInsightHdlr(
    chargeInsightSvcI,
    fmsAccountSvcI,
    tripsInsightSvcI,
    userSvcI,
    servicelogger
  );
  let fleetInsightHdlrI = new FleetInsightHdlr(
    fleetInsightSvcI,
    fmsAccountSvcI,
    userSvcI,
    servicelogger
  );

  let publicHdlrI = new PublicHdlr(
    userSvcI,
    authSvcI,
    fmsSvcI,
    platformSvcI,
    inMemCacheI,
    configdata,
    servicelogger
  );

  // should we first clear the database?
  let clearDB = process.env.CLEAR_DB === "true";
  if (clearDB) {
    // TODO: implement clearDB
    // await pgPool.clearDB();
  }

  // do entire seeding in a transaction. also, we need transaction for deferred constraints
  let [tx, err] = await pgPool.StartTransaction();
  if (err) {
    throw err;
  }

  try {
    let userid = await seedUser(tx);
    await seedAllPermId(tx, userid);
    let commiterr = await pgPool.TxCommit(tx);
    if (commiterr) {
      throw commiterr;
    }

    // Start a new transaction for the rest
    [tx, err] = await pgPool.StartTransaction();
    if (err) {
      throw err;
    }
    // Now create superadmin and account
    await seedModule(platformHdlrI, userid);
    await seedPackageTypesAndCategories(platformHdlrI, userid);
    await seedPackages(platformHdlrI, userid);
    await seedPackageModule(platformHdlrI, tx, userid);
    await seedConsoleAccount(platformHdlrI, userid);
    await seedSuperAdmin(platformHdlrI, userid);
    await seedFleetUserRole(tx);
    await seedVehicleModelFamily(platformHdlrI, userid);
    await seedVehicleModel(platformHdlrI, userid, tx);
    await seedParamFamily(tx, userid);
    await seedParamFamilyParam(tx, userid);
    await seedVehicleModelFamilyParam(tx, userid);
    await seedChargeDeviation(tx);
    await seedDocuments(tx);
    await seedSOSContacts(tx);
    await seedBanners(tx);
    await seedApiKeys(tx);
    await seedCity(tx);
    await seedDealer(tx);
    await seedFuelType(tx);
    await seedColour(tx);
    await seedTGUModel(tx);
    await seedTGUSwVersion(tx);
    commiterr = await pgPool.TxCommit(tx);
    if (commiterr) {
      throw commiterr;
    }

    console.log("Seeding completed successfully.");

    // Now you can use the initialized services to create super admin
    // Example: Create a super admin using the platform handler
    if (process.env.CREATE_SUPER_ADMIN === "true") {
      console.log("Creating super admin...");
      // You can access platformHdlrI.pUserHdlrImpl.CreateSuperAdminLogic here
      // or create a mock request object and call the handler method
    }
  } catch (error) {
    console.error("Error during seeding:", error);
    let rollbackerr = await pgPool.TxRollback(tx);
    if (rollbackerr) {
      console.error("Error rolling back transaction:", rollbackerr);
    }
    throw error;
  } finally {
    await pgPool.End();
  }
}
