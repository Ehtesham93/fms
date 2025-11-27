import PackageSvcDB from "./packagesvc_db.js";

export default class PackageSvc {
  constructor(pgPoolI, logger, config) {
    this.pgPoolI = pgPoolI;
    this.logger = logger;
    this.config = config;
    this.packageSvcDB = new PackageSvcDB(pgPoolI, logger, config);
  }

  async CreatePackageType(pkgtype, createdby) {
    return await this.packageSvcDB.createPackageType(pkgtype, createdby);
  }

  async GetAllPackageTypes() {
    return await this.packageSvcDB.getAllPackageTypes();
  }

  async CreatePackage(pkg, createdby) {
    return await this.packageSvcDB.createPackage(pkg, createdby);
  }

  async LogPackageHistory(pkg, updatedby){
    return await this.packageSvcDB.logPackageHistory(pkg, updatedby);
  }

  async LogPackagePermHistory(pkgid, permid, updatedby){
    return await this.packageSvcDB.logPackagePermHistory(pkgid, permid, updatedby);
  }

  async GetPackageHistory(pkgid, starttime, endtime){
    return await this.packageSvcDB.getPackageHistory(pkgid, starttime, endtime);
  }

  async GetPackagePermHistory(pkgid, moduleid, starttime, endtime){
    return await this.packageSvcDB.getPackagePermHistory(pkgid, moduleid, starttime, endtime);
  }

  async UpdatePackage(pkgid, updateFields, updatedby) {
    return await this.packageSvcDB.updatePackage(
      pkgid,
      updateFields,
      updatedby
    );
  }

  async GetAllPackages() {
    return await this.packageSvcDB.getAllPackages();
  }

  async GetPkgInfo(pkgid) {
    return await this.packageSvcDB.getPkgInfo(pkgid);
  }

  async GetPkgModules(pkgid) {
    return await this.packageSvcDB.getPkgModules(pkgid);
  }

  async UpdatePkgModules(pkgid, selectedmodules, deselectedmodules, updatedby) {
    return await this.packageSvcDB.updatePkgModules(
      pkgid,
      selectedmodules,
      deselectedmodules,
      updatedby
    );
  }

  async GetAllModulesInfo() {
    return await this.packageSvcDB.getAllModulesInfo();
  }

  async IsPackageAssignedToAccount(pkgid) {
    return await this.packageSvcDB.isPackageAssignedToAccount(pkgid);
  }

  async DoesPackageHaveModules(pkgid) {
    return await this.packageSvcDB.doesPackageHaveModules(pkgid);
  }

  async DoesPackageHaveHistory(pkgid) {
    return await this.packageSvcDB.doesPackageHaveHistory(pkgid);
  }

  async DeletePackage(pkgid, deletedby) {
    return await this.packageSvcDB.deletePackage(pkgid, deletedby);
  }
}
