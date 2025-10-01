import MetaSvcDB from "./metasvc_db.js";

export default class MetaSvc {
  constructor(pgPoolI, logger) {
    this.pgPoolI = pgPoolI;
    this.logger = logger;
    this.metaSvcDB = new MetaSvcDB(pgPoolI, logger);
  }

  // Vehicle City CRUD
  CreateVehicleCity = async (citycode, cityname) => {
    return await this.metaSvcDB.createVehicleCity(citycode, cityname);
  };

  IsCityCodeAvailable = async (citycode) => {
    return await this.metaSvcDB.isCityCodeAvailable(citycode);
  };
  UpdateVehicleCity = async (citycode, cityname) => {
    return await this.metaSvcDB.updateVehicleCity(citycode, cityname);
  };
  DeleteVehicleCity = async (citycode) => {
    return await this.metaSvcDB.deleteVehicleCity(citycode);
  };
  // Vehicle Dealer CRUD
  CreateVehicleDealer = async (dealercode, dealername) => {
    return await this.metaSvcDB.createVehicleDealer(dealercode, dealername);
  };

  IsDealerCodeAvailable = async (dealercode) => {
    return await this.metaSvcDB.isDealerCodeAvailable(dealercode);
  };
  UpdateVehicleDealer = async (dealercode, dealername) => {
    return await this.metaSvcDB.updateVehicleDealer(dealercode, dealername);
  };
  DeleteVehicleDealer = async (dealercode) => {
    return await this.metaSvcDB.deleteVehicleDealer(dealercode);
  };

  // Vehicle Color CRUD
  CreateVehicleColor = async (colorcode, colorname) => {
    return await this.metaSvcDB.createVehicleColor(colorcode, colorname);
  };

  IsColorCodeAvailable = async (colorcode) => {
    return await this.metaSvcDB.isColorCodeAvailable(colorcode);
  };

  UpdateVehicleColor = async (colorcode, colorname) => {
    return await this.metaSvcDB.updateVehicleColor(colorcode, colorname);
  };
  DeleteVehicleColor = async (colorcode) => {
    return await this.metaSvcDB.deleteVehicleColor(colorcode);
  };

  IsColorNameAvailable = async (colorname) => {
    return await this.metaSvcDB.isColorNameAvailable(colorname);
  };
  IsDealerNameAvailable = async (dealername) => {
    return await this.metaSvcDB.isDealerNameAvailable(dealername);
  };
  IsCityNameAvailable = async (cityname) => {
    return await this.metaSvcDB.isCityNameAvailable(cityname);
  };
}
