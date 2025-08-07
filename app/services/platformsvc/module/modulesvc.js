import ModuleSvcDB from "./modulesvc_db.js";

export default class ModuleSvc {
  constructor(pgPoolI, logger) {
    this.pgPoolI = pgPoolI;
    this.logger = logger;
    this.moduleSvcDB = new ModuleSvcDB(pgPoolI, logger);
  }

  async CreateModule(module) {
    return await this.moduleSvcDB.createModule(module);
  }

  async GetAllModulesInfo() {
    return await this.moduleSvcDB.getAllModulesInfo();
  }

  async GetModuleInfo(moduleid) {
    return await this.moduleSvcDB.getModuleInfo(moduleid);
  }

  async GetModulePerms(moduleid) {
    return await this.moduleSvcDB.getModulePerms(moduleid);
  }

  async UpdateModule(moduleid, updateFields, updatedby) {
    return await this.moduleSvcDB.updateModule(
      moduleid,
      updateFields,
      updatedby
    );
  }

  async AddModulePerm(moduleid, permid, isenabled, moduleperminfo, createdby) {
    return await this.moduleSvcDB.addModulePerm(
      moduleid,
      permid,
      isenabled,
      moduleperminfo,
      createdby
    );
  }

  async AddModulePerms(moduleid, permids, createdby) {
    return await this.moduleSvcDB.addModulePerms(moduleid, permids, createdby);
  }

  async UpdateModulePerm(moduleid, permid, updateFields, updatedby) {
    return await this.moduleSvcDB.updateModulePerm(
      moduleid,
      permid,
      updateFields,
      updatedby
    );
  }

  async DeleteModulePerm(moduleid, permid) {
    return await this.moduleSvcDB.deleteModulePerm(moduleid, permid);
  }

  async IsModuleAssignedToPackage(moduleid) {
    return await this.moduleSvcDB.isModuleAssignedToPackage(moduleid);
  }

  async DeleteModule(moduleid, deletedby) {
    return await this.moduleSvcDB.deleteModule(moduleid, deletedby);
  }
}
