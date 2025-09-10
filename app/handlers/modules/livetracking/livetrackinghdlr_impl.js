export default class LivetrackinghdlrImpl {
  constructor(livetrackingsvcI, logger) {
    this.livetrackingsvcI = livetrackingsvcI;
    this.logger = logger;
  }

  GetVehiclesLogic = async (accountid, fleetid, recursive) => {
    let result = await this.livetrackingsvcI.getVehicles(
      accountid,
      fleetid,
      recursive
    );
    if (!result) {
      this.logger.error("Failed to get vehicles");
      throw new Error("Failed to get vehicles");
    }
    return result;
  };

  GetVehicleInfoLogic = async (accountid, vinno) => {
    const vehicleExists = await this.livetrackingsvcI.checkVehicleExists(
      accountid,
      vinno
    );
    if (!vehicleExists) {
      throw new Error("VEHICLE_DOES_NOT_EXIST_IN_ACCOUNT");
    }

    let result = await this.livetrackingsvcI.getVehicleInfo(accountid, vinno);
    if (!result) {
      this.logger.error("Failed to get vehicle info");
      throw new Error("Failed to get vehicle info");
    }
    if (result.delivered_date) {
      const deliveredDate = new Date(result.delivered_date);
      const now = new Date();
      const diffMs = now - deliveredDate;

      const totalSeconds = Math.floor(Math.abs(diffMs) / 1000);
      const days = Math.floor(totalSeconds / (24 * 60 * 60));
      const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
      const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
      const seconds = totalSeconds % 60;
      result.vehicleage = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    } else {
      result.vehicleage = null;
    }
    return result;
  };
}
