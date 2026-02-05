import HistoryDataSvcDB from "./historydatasvc_db.js";
import ClickHouseClient from "../../../utils/clickhouse.js";
import { formatEpochToDateTime } from "../../../utils/epochconverter.js";

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
  async GetVehicleLastConnectedData(value, type) {
    try {
      let vinnos = null;
      if (type === "vinno") {
        vinnos = value;
      } else if (type === "regno") {
        vinnos = await this.historyDataSvcDB.getVinNoFromRegNo(value);
      } else {
        throw new Error("Invalid type");
      }

      const [lastConnectedData, accountDetails] = await Promise.all([
        this.historyDataSvcDB.getVehicleLastConnectedData(vinnos),
        this.historyDataSvcDB.getVehicleAccountDetails(vinnos),
      ]);
      let response = [];
      if (lastConnectedData && Object.keys(lastConnectedData).length > 0) {
        for (let vin of vinnos) {
          if(accountDetails && accountDetails.size > 0) {
            const accountDetail = accountDetails.get(vin);
            if(accountDetail && accountDetail.accountid) {
              response.push({
                vinno: vin,
                accountid: accountDetail.accountid,
                accountname: accountDetail.accountname,
                regno: accountDetail.regno,
                canutctime: formatEpochToDateTime(lastConnectedData[vin].can.utctime),
                gpsutctime: formatEpochToDateTime(lastConnectedData[vin].gps.utctime),
                lat: lastConnectedData[vin].gps.lat,
                lng: lastConnectedData[vin].gps.lng,
                status: "PRESENT"
              });
            }else{
              response.push({
                vinno: vin,
                accountid: "NA",
                accountname: "NA",
                regno: "NA",
                canutctime: "NA",
                gpsutctime: "NA",
                lat: "NA",
                lng: "NA",
                status: "ABSENT"
              });
            }
          }else{
            response.push({
              vinno: vin,
              accountid: "NA",
              accountname: "NA",
              regno: "NA",
              canutctime: "NA",
              gpsutctime: "NA",
              lat: "NA",
              lng: "NA",
              status: "ABSENT"
            });
          }
        }
        return response;
      } else {
        return [];
      }
    } catch (error) {
      this.logger.error("Error fetching vehicle last connected data:", error);
      throw new Error("Failed to fetch vehicle last connected data");
    }
  }
}
