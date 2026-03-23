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

  async GetPackageHistory(starttime, endtime){
    return await this.packageSvcDB.getPackageHistory(starttime, endtime);
  }

  async GetPackageModHistory(starttime, endtime){
    return await this.packageSvcDB.getPackageModHistory(starttime, endtime);
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

  async GetDefaultPackagesWithModules() {
    let pkgs = await this.packageSvcDB.getDefaultPackagesWithModules();
    if (!pkgs) {
      return [];
    }
    let pkgsMap = {};
    for (let pkg of pkgs) {
      if (!pkgsMap[pkg.pkgid]) {
        pkgsMap[pkg.pkgid] = {
          pkgid: pkg.pkgid,
          pkgname: pkg.pkgname,
          pkgtype: pkg.pkgtype,
          pkginfo: pkg.pkginfo,
          isenabled: pkg.isenabled,
          createdat: pkg.createdat,
          createdby: pkg.createdby,
          updatedat: pkg.updatedat,
          updatedby: pkg.updatedby,
          modules: [],
        };
      }
      if (pkg.moduleid) {
        pkgsMap[pkg.pkgid].modules.push({
          moduleid: pkg.moduleid,
          modulename: pkg.modulename,
          creditspervehicleday: pkg.creditspervehicleday,
        });
      }
    }
    return Object.values(pkgsMap);
  }



  async GetCustomPackagesWithModules() {
    let pkgs = await this.packageSvcDB.getCustomPackagesWithModules();
    if (!pkgs) {
      return [];
    }
    let pkgsMap = {};
    for (let pkg of pkgs) {
      if (!pkgsMap[pkg.pkgid]) {
        pkgsMap[pkg.pkgid] = {
          pkgid: pkg.pkgid,
          pkgname: pkg.pkgname,
          pkgtype: pkg.pkgtype,
          pkginfo: pkg.pkginfo,
          isenabled: pkg.isenabled,
          createdat: pkg.createdat,
          createdby: pkg.createdby,
          updatedat: pkg.updatedat,
          updatedby: pkg.updatedby,
          modules: [],
        };
      }
      if (pkg.moduleid) {
        pkgsMap[pkg.pkgid].modules.push({
          moduleid: pkg.moduleid,
          modulename: pkg.modulename,
          creditspervehicleday: pkg.creditspervehicleday,
        });
      }
    }
    return Object.values(pkgsMap);
  }

  async GetPkgInfo(pkgid) {
    return await this.packageSvcDB.getPkgInfo(pkgid);
  }

  async LogPackageHistory(pkg, updatedby, updatedat, action, previousstate) {
    return await this.packageSvcDB.logPackageHistory(pkg, updatedby, updatedat, action, previousstate);
  }

  async LogPackageModHistory(pkgid, moduleid, action, updatedby, updatedat) {
    return await this.packageSvcDB.logPackageModHistory(pkgid, moduleid, action, updatedby, updatedat);
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
  async UpdatePkgModulesWithTxn(pkgid, selectedmodules, deselectedmodules, updatedby, txclient) {
    return await this.packageSvcDB.updatePkgModulesWithTxn(
      pkgid,
      selectedmodules,
      deselectedmodules,
      updatedby,
      txclient
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

  async CreatePackageWithTxn(pkg, createdby, txclient) {
    return await this.packageSvcDB.createPackageWithTxn(pkg, createdby, txclient);
  }

  async CheckAccountHasCustomPackage(accountid, pkgid) {
    return await this.packageSvcDB.checkAccountHasCustomPackage(accountid, pkgid);
  }
}
