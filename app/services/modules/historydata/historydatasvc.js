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
      let missingRegnos = [];
      let response = [];
      if (type === "vinno") {
        vinnos = value;
      } else if (type === "regno") {
        const result = await this.historyDataSvcDB.getVinNoFromRegNo(value);
        vinnos = result.vinnos;
        missingRegnos = result.missingRegnos;
      } else {
        throw new Error("Invalid type");
      }
      if(vinnos && vinnos.length > 0) {
        const [lastConnectedData, accountDetails] = await Promise.all([
          this.historyDataSvcDB.getVehicleLastConnectedData(vinnos),
          this.historyDataSvcDB.getVehicleAccountDetails(vinnos),
        ]);
        if (lastConnectedData && Object.keys(lastConnectedData).length > 0) {
          for (let vin of vinnos) {
            let connectionstatus = false;
            if(accountDetails && accountDetails.size > 0) {
              const accountDetail = accountDetails.get(vin);
              if(accountDetail && accountDetail.accountid) {
                let lastConnectedTime = Math.max(lastConnectedData[vin].can.utctime, lastConnectedData[vin].gps.utctime);
                if (Date.now() - lastConnectedTime < 24 * 60 * 60 * 1000) {
                  connectionstatus = true;
                } else {
                  connectionstatus = false;
                }
                response.push({
                  vinno: vin,
                  accountid: accountDetail.accountid,
                  accountname: accountDetail.accountname,
                  regno: accountDetail.regno,
                  vehiclecity: accountDetail.vehicle_city,
                  modelcode: accountDetail.modelcode,
                  deliverydate: accountDetail.delivered_date,
                  onboardeddate: accountDetail.createdat,
                  lastconnectedtime: formatEpochToDateTime(lastConnectedTime),
                  lat: lastConnectedData[vin].gps.lat,
                  lng: lastConnectedData[vin].gps.lng,
                  status: "FOUND",
                  connectionstatus: connectionstatus,
                });
              }else{
                response.push({
                  vinno: vin,
                  accountid: "NA",
                  accountname: "NA",
                  regno: "NA",
                  vehiclecity: "NA",
                  modelcode: "NA",
                  deliverydate: "NA",
                  onboardeddate: "NA",
                  lastconnectedtime: "NA",
                  lat: "NA",
                  lng: "NA",
                  status: "NOT FOUND",
                  connectionstatus: connectionstatus,
                });
              }
            }else{
              response.push({
                vinno: vin,
                accountid: "NA",
                accountname: "NA",
                regno: "NA",
                vehiclecity: "NA",
                modelcode: "NA",
                deliverydate: "NA",
                onboardeddate: "NA",
                lastconnectedtime: "NA",
                lat: "NA",
                lng: "NA",
                status: "NOT FOUND",
                connectionstatus: connectionstatus,
              });
            }
          }
        }
      }
      if(missingRegnos.length > 0) {
        for(let regno of missingRegnos) {
          response.push({
            vinno: "NA",
            accountid: "NA",
            accountname: "NA",
            regno: regno,
            vehiclecity: "NA",
            modelcode: "NA",
            deliverydate: "NA",
            onboardeddate: "NA",
            lastconnectedtime: "NA",
            lat: "NA",
            lng: "NA",
            status: "NOT FOUND",
            connectionstatus: false,
          });
        }
      }
        return response;
    } catch (error) {
      this.logger.error("Error fetching vehicle last connected data:", error);
      throw new Error("Failed to fetch vehicle last connected data");
    }
  }
}
