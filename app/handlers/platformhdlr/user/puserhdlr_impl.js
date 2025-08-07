import { EncryptPassword } from "../../../utils/eccutil.js";
import { v4 as uuidv4 } from "uuid";

export default class PUserHdlrImpl {
  constructor(pUserSvcI, userSvcI, fmsAccountSvcI, authSvcI, logger) {
    this.pUserSvcI = pUserSvcI;
    this.userSvcI = userSvcI;
    this.fmsAccountSvcI = fmsAccountSvcI;
    this.authSvcI = authSvcI;
    this.logger = logger;
  }

  CreateUserLogic = async (displayname, email, password, mobile, createdby) => {
    let userid = uuidv4();
    let encryptedpassword = await EncryptPassword(password);
    let user = {
      userid: userid,
      displayname: displayname,
      usertype: null,
      userinfo: {},
      isenabled: false,
      isdeleted: false,
      isemailverified: false,
      ismobileverified: false,
    };
    let userssoinfo = {
      email: email,
      password: encryptedpassword,
      mobile: mobile,
    };
    let res = await this.userSvcI.CreateUser(user, userssoinfo, createdby);
    if (!res) {
      this.logger.error("Failed to create user");
      throw new Error("Failed to create user");
    }

    // TODO: there has to be auth svc integration here

    user.email = email;
    user.mobile = mobile;
    return {
      userid: userid,
      user: user,
    };
  };

  ListPlatformUsersLogic = async (offset, limit) => {
    let users = await this.userSvcI.GetPlatformUsers(offset, limit);
    if (!users) {
      users = [];
    }
    return { users: users };
  };

  ListAccountUsersLogic = async (offset, limit) => {
    let users = await this.userSvcI.GetAccountUsers(offset, limit);
    if (!users) {
      users = [];
    }
    return { users: users };
  };

  ListUsersLogic = async (offset, limit) => {
    let users = await this.userSvcI.GetAllUsers(offset, limit);
    if (!users) {
      users = [];
    }
    return { users: users };
  };

  InvitePlatformUserLogic = async (
    email,
    roleids,
    invitedby,
    headerReferer
  ) => {
    let accountid = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    let inviteid = uuidv4();
    let res = await this.pUserSvcI.EmailInviteToRootFleet(
      accountid,
      inviteid,
      email,
      invitedby,
      roleids,
      headerReferer
    );
    if (!res) {
      this.logger.error("Failed to invite platform user");
      throw new Error("Failed to invite platform user");
    }
    return {
      inviteid: inviteid,
    };
  };

  //   SmsInvitePlatformUserLogic = async (
  //     mobile,
  //     roleids,
  //     invitedby,
  //     headerReferer
  //   ) => {
  //     throw new Error("Not implemented");
  //   };

  ListPlatformInvitesLogic = async (userid) => {
    let accountid = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    let result = await this.fmsAccountSvcI.ListInvitesOfAccount(accountid);
    if (!result) {
      this.logger.error("Failed to list invites of account");
      throw new Error("Failed to list invites of account");
    }

    const currentTime = new Date();

    for (let invite of result) {
      if (invite.invitestatus === "PENDING" && invite.expiresat) {
        const expiresAt = new Date(invite.expiresat);
        if (currentTime > expiresAt) {
          invite.invitestatus = "EXPIRED";
        }
      }
    }

    return result;
  };

  CancelPlatformInviteLogic = async (inviteid, cancelledby) => {
    let accountid = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    let result = await this.fmsAccountSvcI.CancelEmailInvite(
      accountid,
      inviteid,
      cancelledby
    );
    if (!result) {
      this.logger.error("Failed to cancel platform invite");
      throw new Error("Failed to cancel platform invite");
    }
    return result;
  };

  ResendPlatformInviteLogic = async (inviteid, resendedby, headerReferer) => {
    let accountid = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    let result = await this.pUserSvcI.ResendInvite(
      accountid,
      inviteid,
      resendedby,
      headerReferer
    );
    if (!result) {
      this.logger.error("Failed to resend platform invite");
      throw new Error("Failed to resend platform invite");
    }
    return result;
  };

  GetUserLogic = async (userid) => {
    let user = await this.userSvcI.GetUserDetails(userid);
    if (!user) {
      this.logger.error("User not found");
      throw new Error("User not found");
    }

    let userRoles = await this.pUserSvcI.GetAllUserRoles(userid);
    if (!userRoles) {
      userRoles = [];
    }

    let platformRoles = userRoles.filter(
      (role) => role.roletype === "platform"
    );
    platformRoles = platformRoles.map((role) => {
      return {
        roleid: role.roleid,
        rolename: role.rolename,
        roletype: role.roletype,
      };
    });

    let accountRoles = userRoles.filter((role) => role.roletype === "account");
    accountRoles = accountRoles.map((role) => {
      return {
        accountid: role.accountid,
        accountname: role.accountname,
        fleetid: role.fleetid,
        fleetname: role.fleetname,
        roleid: role.roleid,
        rolename: role.rolename,
        roletype: role.roletype,
      };
    });

    return {
      user: user,
      roles: {
        platform: platformRoles,
        account: accountRoles,
      },
    };
  };

  EnableUserLogic = async (userid, updatedby) => {
    let res = await this.userSvcI.EnableUser(userid, updatedby);
    if (!res) {
      this.logger.error("Failed to enable user");
      throw new Error("Failed to enable user");
    }
    return this.GetUserLogic(userid);
  };

  DisableUserLogic = async (userid, updatedby) => {
    let res = await this.userSvcI.DisableUser(userid, updatedby);
    if (!res) {
      this.logger.error("Failed to disable user");
      throw new Error("Failed to disable user");
    }
    return this.GetUserLogic(userid);
  };

  ListUserAccountsLogic = async (userid) => {
    let accounts = await this.userSvcI.GetUserAccounts(userid);
    if (!accounts) {
      accounts = [];
    }
    return accounts;
  };

  ListUnassignedUserRolesLogic = async (userid, roletype) => {
    let accountid = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    let allRoles = await this.pUserSvcI.GetAllRoles(accountid);
    if (!allRoles) {
      allRoles = [];
    }

    let userRoles = await this.pUserSvcI.GetAllUserRoles(userid);
    if (!userRoles) {
      userRoles = [];
    }

    let assignedRolesOfRoleType = userRoles.filter(
      (role) => role.roletype === roletype
    );
    let assignedRoles = assignedRolesOfRoleType.map((role) => role.roleid);

    allRoles = allRoles.map((role) => {
      return {
        roleid: role.roleid,
        rolename: role.rolename,
        roletype: role.roletype,
        isAssigned: assignedRoles.includes(role.roleid),
      };
    });

    return { roles: allRoles };
  };

  AddUserPlatformRoleLogic = async (userid, roleids, updatedby) => {
    let res = await this.pUserSvcI.AddUserPlatformRole(userid, roleids);
    if (!res) {
      this.logger.error("Failed to add user platform role");
      throw new Error("Failed to add user platform role");
    }
    return this.GetUserLogic(userid);
  };

  RemoveUserPlatformRoleLogic = async (userid, roleid, updatedby) => {
    let res = await this.pUserSvcI.RemoveUserPlatformRole(userid, roleid);
    if (!res) {
      this.logger.error("Failed to remove user platform role");
      throw new Error("Failed to remove user platform role");
    }
    return this.GetUserLogic(userid);
  };

  CreateSuperAdminLogic = async (seededUserId, email, password) => {
    let userid = await this.userSvcI.GetUserIdByEmail(email);
    if (userid) {
      this.logger.error("Superadmin already exists");
      throw new Error("Superadmin already exists");
    }

    userid = uuidv4();

    let encryptedPassword = await EncryptPassword(password);
    let res = await this.userSvcI.CreateSuperAdmin(
      userid,
      email,
      encryptedPassword
    );

    // TODO: this should be called first. after we split create consumer api
    res = await this.authSvcI.CreateConsumer(userid, seededUserId);

    return res;
  };

  CreateUserByPlatformAdminLogic = async (
    useridtype,
    forceuseridtypeverified,
    contact,
    displayname,
    userinfo,
    createdby
  ) => {
    try {
      // Validation
      if (!useridtype || !contact || !displayname) {
        throw new Error("useridtype, contact, and displayname are required");
      }

      if (useridtype !== "email" && useridtype !== "mobile") {
        throw new Error("useridtype must be either 'email' or 'mobile'");
      }

      if (typeof forceuseridtypeverified !== "boolean") {
        throw new Error("forceuseridtypeverified must be a boolean");
      }

      // Validate contact format based on useridtype
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const indianMobileRegex = /^[6-9]\d{9}$/;

      if (useridtype === "email" && !emailRegex.test(contact)) {
        throw new Error("Invalid email format");
      }

      if (useridtype === "mobile" && !indianMobileRegex.test(contact)) {
        throw new Error(
          "Mobile must be a valid Indian mobile number (10 digits starting with 6-9)"
        );
      }

      // Validate displayname
      if (displayname.trim().length === 0) {
        throw new Error("displayname cannot be empty");
      }

      if (displayname.length > 100) {
        throw new Error("displayname is too long (maximum 100 characters)");
      }

      // Validate userinfo is an object
      if (userinfo && typeof userinfo !== "object") {
        throw new Error("userinfo must be an object");
      }

      // Check if contact already exists
      if (useridtype === "email") {
        const existingUser = await this.userSvcI.GetUserIdByEmail(contact);
        if (existingUser) {
          throw new Error("User with this email already exists");
        }
      } else {
        const existingUser = await this.userSvcI.GetUserIdByMobile(contact);
        if (existingUser) {
          throw new Error("User with this mobile number already exists");
        }
      }

      // Create the user in our metadata tables
      let res = await this.userSvcI.CreateUserByPlatformAdmin(
        useridtype,
        forceuseridtypeverified,
        contact,
        displayname,
        userinfo,
        createdby
      );

      if (!res) {
        this.logger.error("Failed to create user");
        throw new Error("Failed to create user");
      }

      // Register user with auth service
      try {
        let authres = await this.authSvcI.CreateConsumer(res.userid, createdby);

        if (authres === undefined || authres === null || !authres) {
          this.logger.error("Failed to create user in auth service");
          // Rollback by deleting all user records
          await this.userSvcI.DeleteUserRecordsByUserid(res.userid);
          throw new Error("Failed to create user in auth service");
        }

        res.token = authres?.token;
        res.refreshtoken = authres?.refreshtoken;
      } catch (error) {
        this.logger.error("Failed to register user with auth service", error);
        // Rollback by deleting all user records
        await this.userSvcI.DeleteUserRecordsByUserid(res.userid);
        throw new Error("Failed to register user with auth service");
      }

      return {
        userid: res.userid,
        contact: contact,
        useridtype: useridtype,
        displayname: displayname,
        isemailverified: res.isemailverified,
        ismobileverified: res.ismobileverified,
        needsPasswordChange: res.needsPasswordChange,
        usertoken: res.token,
      };
    } catch (err) {
      this.logger.error("Create user logic failed", err);
      throw err;
    }
  };

  AddUserToAccountLogic = async (addedby, contact, accountid) => {
    let res = await this.userSvcI.AddUserToAccount(addedby, contact, accountid);
    if (!res) {
      this.logger.error("Failed to add user to account");
      throw new Error("Failed to add user to account");
    }
    return {
      userid: res.userid,
      accountid: accountid,
      contact: contact,
      contacttype: res.contacttype,
    };
  };

  RemoveUserFromAccountLogic = async (removedby, contact, accountid) => {
    let res = await this.userSvcI.RemoveUserFromAccount(
      removedby,
      contact,
      accountid
    );
    if (!res) {
      this.logger.error("Failed to remove user from account");
      throw new Error("Failed to remove user from account");
    }
    return {
      userid: res.userid,
      accountid: accountid,
      contact: contact,
      contacttype: res.contacttype,
    };
  };

  DeleteUserLogic = async (userid, deletedby) => {
    if (userid === deletedby) {
      const error = new Error("You cannot delete yourself");
      error.errcode = "CANNOT_DELETE_SELF";
      throw error;
    }

    if (userid === "ffffffff-ffff-ffff-ffff-ffffffffffff") {
      const error = new Error("Cannot delete seed user (super admin)");
      error.errcode = "CANNOT_DELETE_SEED_USER";
      throw error;
    }

    let userDetails = await this.userSvcI.GetUserDetails(userid);
    if (!userDetails) {
      const error = new Error("User not found");
      error.errcode = "USER_NOT_FOUND";
      throw error;
    }

    if (userDetails.isdeleted) {
      const error = new Error("User is already deleted");
      error.errcode = "USER_ALREADY_DELETED";
      throw error;
    }

    let result = await this.userSvcI.DeleteUser(userid, deletedby);
    if (!result) {
      throw new Error("Failed to delete user");
    }

    try {
      await this.authSvcI.DeleteConsumer(userid);
    } catch (error) {
      this.logger.error(
        `Failed to delete consumer from auth service for user ${userid}`,
        error
      );
    }
    return result;
  };

  ResetUserPasswordLogic = async (userid, resetby) => {
    let resetByUser = await this.pUserSvcI.CheckSuperAdminRole(resetby);
    if (!resetByUser) {
      this.logger.error("Only superadmin can reset user passwords");
      throw new Error("Only superadmin can reset user passwords");
    }

    let targetUser = await this.userSvcI.GetUserDetails(userid);
    if (!targetUser) {
      this.logger.error("Target user not found");
      throw new Error("Target user not found");
    }

    let result = await this.pUserSvcI.ResetUserPassword(userid, resetby);
    if (!result) {
      this.logger.error("Failed to reset user password");
      throw new Error("Failed to reset user password");
    }

    let logoutresult = await this.authSvcI.InvalidateToken(userid);
    if (!logoutresult) {
      throw new Error("Failed to logout, password reset successfully");
    }

    return {
      userid: userid,
      resetby: resetby,
      message:
        "Password reset successfully and user logged out from all devices",
    };
  };
}
