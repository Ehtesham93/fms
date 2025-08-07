import FmsAccountSvcDB from "./fmsaccountsvc_db.js";

export default class FmsAccountSvc {
  constructor(pgPoolI, logger) {
    this.pgPoolI = pgPoolI;
    this.logger = logger;
    this.fmsAccountSvcDB = new FmsAccountSvcDB(pgPoolI, logger);
  }

  async ListInvitesOfAccount(accountid) {
    return await this.fmsAccountSvcDB.listInvitesOfAccount(accountid);
  }

  async CancelEmailInvite(accountid, inviteid, cancelledby) {
    return await this.fmsAccountSvcDB.cancelEmailInvite(
      accountid,
      inviteid,
      cancelledby
    );
  }

  async SendEmailInvite(
    accountid,
    fleetid,
    roleids,
    inviteid,
    contact,
    invitedby,
    headerReferer
  ) {
    return await this.fmsAccountSvcDB.triggerEmailInvite(
      accountid,
      fleetid,
      roleids,
      inviteid,
      contact,
      invitedby,
      headerReferer
    );
  }

  async ValidateInvite(inviteid) {
    return await this.fmsAccountSvcDB.validateInvite(inviteid);
  }

  async DeleteUserRecords(userid, accountid, fleetid, inviteid) {
    return await this.fmsAccountSvcDB.deleteUserRecords(
      userid,
      accountid,
      fleetid,
      inviteid
    );
  }

  async ResendInvite(accountid, inviteid, invitedby, headerReferer) {
    return await this.fmsAccountSvcDB.resendInvite(
      accountid,
      inviteid,
      invitedby,
      headerReferer
    );
  }

  async GetAllWebModulesInfo(accountid) {
    return await this.fmsAccountSvcDB.getAllWebModulesInfo(accountid);
  }

  async GetUserAccountFleets(accountid, userid) {
    return await this.fmsAccountSvcDB.getUserAccountFleets(accountid, userid);
  }

  // fleet management
  async CreateFleet(accountid, fleetid, parentfleetid, fleetname, createdby) {
    return await this.fmsAccountSvcDB.createFleet(
      accountid,
      fleetid,
      parentfleetid,
      fleetname,
      createdby
    );
  }

  async GetFleetInfo(accountid, fleetid) {
    return await this.fmsAccountSvcDB.getFleetInfo(accountid, fleetid);
  }

  async EditFleet(accountid, fleetid, updateFields, updatedby) {
    return await this.fmsAccountSvcDB.editFleet(
      accountid,
      fleetid,
      updateFields,
      updatedby
    );
  }

  async GetSubFleets(accountid, fleetid, recursive = false) {
    return await this.fmsAccountSvcDB.getSubFleets(
      accountid,
      fleetid,
      recursive
    );
  }

  // role management
  async CreateRole(role) {
    return await this.fmsAccountSvcDB.createRole(role);
  }

  async UpdateRole(accountid, roleid, updateFields, updatedby) {
    return await this.fmsAccountSvcDB.updateRole(
      accountid,
      roleid,
      updateFields,
      updatedby
    );
  }

  async GetAllRoles(accountid) {
    return await this.fmsAccountSvcDB.getAllRoles(accountid);
  }

  async GetRoleInfo(accountid, roleid) {
    return await this.fmsAccountSvcDB.getRoleInfo(accountid, roleid);
  }

  async GetAllPlatformModulePerms() {
    return await this.fmsAccountSvcDB.getAllPlatformModulePerms();
  }

  async GetRolePerms(accountid, roleid) {
    return await this.fmsAccountSvcDB.getRolePermsForAcc(accountid, roleid);
  }

  async UpdateRolePerms(
    accountid,
    roleid,
    permsToAdd,
    permsToRemove,
    updatedby
  ) {
    return await this.fmsAccountSvcDB.updateRolePerms(
      accountid,
      roleid,
      permsToAdd,
      permsToRemove,
      updatedby
    );
  }

  // vehicle management
  async GetVehicles(accountid, fleetid, recursive = false) {
    return await this.fmsAccountSvcDB.getVehicles(
      accountid,
      fleetid,
      recursive
    );
  }

  async MoveVehicle(accountid, fromfleetid, tofleetid, vehicleid) {
    return await this.fmsAccountSvcDB.moveVehicle(
      accountid,
      fromfleetid,
      tofleetid,
      vehicleid
    );
  }

  async RemoveVehicle(accountid, fleetid, vehicleid) {
    return await this.fmsAccountSvcDB.removeVehicle(
      accountid,
      fleetid,
      vehicleid
    );
  }

  async ListMoveableFleets(accountid, vehicleid, userid) {
    return await this.fmsAccountSvcDB.listMoveableFleets(
      accountid,
      vehicleid,
      userid
    );
  }

  async GetSubscribedVehiclesFromList(accountid, vehicles) {
    return await this.fmsAccountSvcDB.getSubscribedVehiclesFromList(
      accountid,
      vehicles
    );
  }

  // user management
  async ListUsers(accountid, fleetid) {
    return await this.fmsAccountSvcDB.getFleetUsers(accountid, fleetid);
  }

  async GetAssignableRoles(accountid, fleetid, userid, assignedby) {
    return await this.fmsAccountSvcDB.getAssignableRoles(
      accountid,
      fleetid,
      userid,
      assignedby
    );
  }

  async AssignUserRole(accountid, fleetid, userid, roleids, assignedby) {
    return await this.fmsAccountSvcDB.assignUserRoles(
      accountid,
      fleetid,
      userid,
      roleids,
      assignedby
    );
  }

  async DeassignUserRole(accountid, fleetid, userid, roleid, deassignedby) {
    return await this.fmsAccountSvcDB.deassignUserRole(
      accountid,
      fleetid,
      userid,
      roleid,
      deassignedby
    );
  }

  async GetAllUserRolesOnFleet(accountid, fleetid, userid) {
    return await this.fmsAccountSvcDB.getAllUserRolesOnFleet(
      accountid,
      fleetid,
      userid
    );
  }

  async RemoveUser(accountid, userid, removedby) {
    return await this.fmsAccountSvcDB.removeUser(accountid, userid, removedby);
  }

  // subscription management
  async GetDefaultAccountPkgs(accountid) {
    let pkgs = await this.fmsAccountSvcDB.getDefaultAccountPkgs(accountid);
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

  async GetCustomAccountPkgs(accountid) {
    let pkgs = await this.fmsAccountSvcDB.getCustomAccountPkgs(accountid);
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

  async GetSubscriptionInfo(accountid) {
    return await this.fmsAccountSvcDB.getSubscriptionInfo(accountid);
  }

  async UpdateSubscription(accountid, pkgid, subscriptioninfo, updatedby) {
    return await this.fmsAccountSvcDB.updateSubscription(
      accountid,
      pkgid,
      subscriptioninfo,
      updatedby
    );
  }

  async GetSubscriptionHistory(accountid) {
    return await this.fmsAccountSvcDB.getSubscriptionHistory(accountid);
  }

  async GetRootFleetId(accountid) {
    return await this.fmsAccountSvcDB.getRootFleetId(accountid);
  }

  async GetPackageWithModules(pkgid) {
    return await this.fmsAccountSvcDB.getPackageWithModules(pkgid);
  }

  async CheckChangeSubscriptionPackage(accountid, newpkgid) {
    return await this.fmsAccountSvcDB.checkChangeSubscriptionPackage(
      accountid,
      newpkgid
    );
  }

  async GetSubscribedVehicles(accountid) {
    return await this.fmsAccountSvcDB.getSubscribedVehicles(accountid);
  }

  async CreateSubscriptionIntent(accountid, vinnos, userid) {
    return await this.fmsAccountSvcDB.createSubscriptionIntent(
      accountid,
      vinnos,
      userid
    );
  }

  async SubscribeVehicle(accountid, vinnos, userid, intentResult) {
    return await this.fmsAccountSvcDB.subscribeVehicle(
      accountid,
      vinnos,
      userid,
      intentResult
    );
  }

  async UnsubscribeVehicle(accountid, vinnos, userid) {
    return await this.fmsAccountSvcDB.unsubscribeVehicle(
      accountid,
      vinnos,
      userid
    );
  }

  async GetLastestGpsDataForVehicles(vinnos) {
    return await this.fmsAccountSvcDB.getLastestGpsDataForVehicles(vinnos);
  }

  async IsRoleAssignedToUsers(roleid) {
    return await this.fmsAccountSvcDB.isRoleAssignedToUsers(roleid);
  }

  async DoesRoleHavePermissions(roleid) {
    return await this.fmsAccountSvcDB.doesRoleHavePermissions(roleid);
  }

  async DeleteRole(roleid, deletedby) {
    return await this.fmsAccountSvcDB.deleteRole(roleid, deletedby);
  }

  async DoesFleetHaveVehicles(accountid, fleetid) {
    return await this.fmsAccountSvcDB.doesFleetHaveVehicles(accountid, fleetid);
  }

  async DoesFleetHaveSubfleets(accountid, fleetid) {
    return await this.fmsAccountSvcDB.doesFleetHaveSubfleets(
      accountid,
      fleetid
    );
  }

  async DoesFleetHaveUsers(accountid, fleetid) {
    return await this.fmsAccountSvcDB.doesFleetHaveUsers(accountid, fleetid);
  }

  async DoesFleetHaveConstraints(accountid, fleetid) {
    return await this.fmsAccountSvcDB.doesFleetHaveConstraints(
      accountid,
      fleetid
    );
  }

  async DeleteFleet(accountid, fleetid, deletedby, hasConstraints) {
    return await this.fmsAccountSvcDB.deleteFleet(
      accountid,
      fleetid,
      deletedby,
      hasConstraints
    );
  }

  async IsUserInAccount(accountid, userid) {
    return await this.fmsAccountSvcDB.isUserInAccount(accountid, userid);
  }

  async DeleteUser(accountid, userid, deletedby) {
    return await this.fmsAccountSvcDB.deleteUser(accountid, userid, deletedby);
  }

  async TagVehicle(srcaccountid, dstaccountid, vinnos, allow_retag, taggedby) {
    return await this.fmsAccountSvcDB.tagVehicle(
      srcaccountid,
      dstaccountid,
      vinnos,
      allow_retag,
      taggedby
    );
  }

  async UntagVehicle(srcaccountid, dstaccountid, vinnos, untaggedby) {
    return await this.fmsAccountSvcDB.untagVehicle(
      srcaccountid,
      dstaccountid,
      vinnos,
      untaggedby
    );
  }

  async GetRegno(vinNumbers) {
    return await this.fmsAccountSvcDB.getRegno(vinNumbers);
  }

  async GetChargeStationTypes(accountid) {
    return await this.fmsAccountSvcDB.getChargeStationTypes(accountid);
  }

  async getLatestCanDataForVins(vinNumbers) {
    return await this.fmsAccountSvcDB.getLatestCanDataForVins(vinNumbers);
  }
}
