import PlatformSvcDB from "./platformsvc_db.js";
import ModuleSvc from "./module/modulesvc.js";
import RoleSvc from "./role/rolesvc.js";
import PackageSvc from "./package/packagesvc.js";
import PUserSvc from "./user/pusersvc.js";
import AccountSvc from "./account/accountsvc.js";
import ModelSvc from "./model/modelsvc.js";
export default class PlatformSvc {
  constructor(pgPoolI, logger) {
    this.pgPoolI = pgPoolI;
    this.logger = logger;
    this.platformSvcDB = new PlatformSvcDB(pgPoolI, logger);
    this.moduleSvc = new ModuleSvc(pgPoolI, logger);
    this.roleSvc = new RoleSvc(pgPoolI, logger);
    this.packageSvc = new PackageSvc(pgPoolI, logger);
    this.pUserSvc = new PUserSvc(pgPoolI, logger);
    this.accountSvc = new AccountSvc(pgPoolI, logger);
    this.modelSvc = new ModelSvc(pgPoolI, logger);
  }

  async GetAllPlatformModulesInfo() {
    return await this.platformSvcDB.getAllPlatformModulesInfo();
  }

  getModuleSvc() {
    return this.moduleSvc;
  }

  getPackageSvc() {
    return this.packageSvc;
  }

  getPUserSvc() {
    return this.pUserSvc;
  }

  getRoleSvc() {
    return this.roleSvc;
  }

  getAccountSvc() {
    return this.accountSvc;
  }

  getModelSvc() {
    return this.modelSvc;
  }

  async CreateVehicle(vinno, modelcode, vehicleinfo, mobileno, assignedby) {
    return await this.platformSvcDB.createVehicle(
      vinno,
      modelcode,
      vehicleinfo,
      mobileno,
      assignedby
    );
  }

  async AddVehicleToCustomFleet(accountid, fleetid, vinno, assignedby) {
    return await this.platformSvcDB.addVehicleToCustomFleet(
      accountid,
      fleetid,
      vinno,
      assignedby
    );
  }

  async UpdateVehicleInfo(vinno, updateFields, updatedby) {
    return await this.platformSvcDB.updateVehicleInfo(
      vinno,
      updateFields,
      updatedby
    );
  }

  async GetAccountByName(accountname) {
    return await this.platformSvcDB.getAccountByName(accountname);
  }
}
