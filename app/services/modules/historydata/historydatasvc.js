import HistoryDataSvcDB from "./historydatasvc_db.js";
import ClickHouseClient from "../../../utils/clickhouse.js";

export default class HistoryDataSvc {
  constructor(pgPoolI, logger, redisSvc) {
    this.pgPoolI = pgPoolI;
    this.logger = logger;
    this.clickHouseClient = new ClickHouseClient();
    this.redisSvc = redisSvc;
    this.historyDataSvcDB = new HistoryDataSvcDB(
      pgPoolI,
      this.clickHouseClient,
      logger,
      redisSvc
    );
  }

  async GetGPSHistoryData(accountid, vinnumber, starttime, endtime) {
    return await this.historyDataSvcDB.getGPSHistoryData(
      accountid,
      vinnumber,
      starttime,
      endtime
    );
  }

  async GetCANHistoryData(accountid, vinnumber, starttime, endtime, canparams) {
    return await this.historyDataSvcDB.getCANHistoryData(
      accountid,
      vinnumber,
      starttime,
      endtime,
      canparams
    );
  }

  async GetMergedCANGPSHistoryData(
    accountid,
    vinnumber,
    starttime,
    endtime,
    canparams
  ) {
    return await this.historyDataSvcDB.getMergedCANGPSHistoryData(
      accountid,
      vinnumber,
      starttime,
      endtime,
      canparams
    );
  }

  async GetVehicleLatestCanData(vinnos) {
    try {
      return await this.historyDataSvcDB.getLatestCanData(vinnos);
    } catch (error) {
      this.logger.error("Error fetching latest CAN data:", error);
      throw new Error("Failed to fetch latest CAN data");
    }
  }

  async GetVehicleLatestGpsData(vinnos) {
    try {
      return await this.historyDataSvcDB.getLastestLatLongDataForVins(vinnos);
    } catch (error) {
      this.logger.error("Error fetching latest vehicle data:", error);
      throw new Error("Failed to fetch latest vehicle data");
    }
  }
}
