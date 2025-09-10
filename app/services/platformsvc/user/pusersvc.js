import PpUserSvcDB from "./pusersvc_db.js";

const PLATFORM_ACCOUNT_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";

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
    const rootFleetId = await this.pUserSvcDB.getRootFleetId(
      PLATFORM_ACCOUNT_ID
    );
    if (!rootFleetId) {
      throw new Error("Platform account root fleet not found");
    }

    return await this.pUserSvcDB.addUserRole(
      PLATFORM_ACCOUNT_ID,
      rootFleetId,
      userid,
      roleids
    );
  }

  async RemoveUserPlatformRole(userid, roleid) {
    const rootFleetId = await this.pUserSvcDB.getRootFleetId(
      PLATFORM_ACCOUNT_ID
    );
    if (!rootFleetId) {
      throw new Error("Platform account root fleet not found");
    }

    return await this.pUserSvcDB.removeUserRole(
      PLATFORM_ACCOUNT_ID,
      rootFleetId,
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

  async ListPendingUsers() {
    return await this.pUserSvcDB.listPendingUsers();
  }

  async ListDoneUsers() {
    return await this.pUserSvcDB.listDoneUsers();
  }
  async AddReviewDoneUser(userData) {
    return await this.pUserSvcDB.addReviewDoneUser(userData);
  }



  async AddReviewPendingUser(userData) {
    return await this.pUserSvcDB.addReviewPendingUser(userData);
  }

  async AddUserInfo(userid, userinfo, createdby) {
    return await this.pUserSvcDB.addUserInfo(userid, userinfo, createdby);
  }

  async GetMetadataOptions() {
    return await this.pUserSvcDB.getMetadataOptions();
  }

  async GetUserInfo(userid) {
    return await this.pUserSvcDB.getUserInfo(userid);
  }

  async GetPendingUserReviewById(userid) {
    return await this.pUserSvcDB.getPendingUserReviewById(userid);
  }

  async DeletePendingUserReviewById(userid) {
    return await this.pUserSvcDB.deletePendingUserReviewById(userid);
  }
  async UpdateReviewPendingUser(userid, updateFields, updatedby) {
    return await this.pUserSvcDB.updateReviewPendingUser(userid, updateFields, updatedby);
  }

  async UpdateUserInfo(userid, userinfo, updatedby) {
    return await this.pUserSvcDB.updateUserInfo(userid, userinfo, updatedby);
  }

  async checkIsUserAddedToAccount(userid, accountid) {
    return await this.pUserSvcDB.checkIsUserAddedToAccount(userid, accountid);
  }

  async checkIsVehicleAddedToAccount(vinno) {
    return await this.pUserSvcDB.checkIsVehicleAddedToAccount(vinno);
  }
}
