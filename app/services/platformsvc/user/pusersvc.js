import PpUserSvcDB from "./pusersvc_db.js";

const PLATFORM_ACCOUNT_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const PLATFORM_FLEET_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";

export default class PUserSvc {
  constructor(pgPoolI, logger) {
    this.pgPoolI = pgPoolI;
    this.logger = logger;
    this.pUserSvcDB = new PpUserSvcDB(pgPoolI, logger);
  }

  async EmailInviteToRootFleet(
    accountid,
    inviteid,
    email,
    invitedby,
    roleids,
    headerReferer
  ) {
    return await this.pUserSvcDB.triggerEmailInviteToRootFleet(
      accountid,
      inviteid,
      email,
      invitedby,
      roleids,
      headerReferer
    );
  }

  async ResendInvite(accountid, inviteid, invitedby, headerReferer) {
    return await this.pUserSvcDB.resendInvite(
      accountid,
      inviteid,
      invitedby,
      headerReferer
    );
  }

  async GetAllUserRoles(userid) {
    return await this.pUserSvcDB.getAllUserRoles(userid);
  }

  async GetAllRoles(accountid) {
    return await this.pUserSvcDB.getAllRoles(accountid);
  }

  async AddUserPlatformRole(userid, roleids) {
    return await this.pUserSvcDB.addUserRole(
      PLATFORM_ACCOUNT_ID,
      PLATFORM_FLEET_ID,
      userid,
      roleids
    );
  }

  async RemoveUserPlatformRole(userid, roleid) {
    return await this.pUserSvcDB.removeUserRole(
      PLATFORM_ACCOUNT_ID,
      PLATFORM_FLEET_ID,
      userid,
      roleid
    );
  }

  async ResetUserPassword(userid, resetby) {
    return await this.pUserSvcDB.resetUserPassword(userid, resetby);
  }

  async CheckSuperAdminRole(userid) {
    return await this.pUserSvcDB.checkSuperAdminRole(userid);
  }
}
