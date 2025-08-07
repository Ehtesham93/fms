import { v4 as uuidv4 } from "uuid";
import { EncryptPassword } from "../../../utils/eccutil.js";

export default class fmsAccountHdlrImpl {
  constructor(fmsAccountSvcI, userSvcI, authSvcI, logger) {
    this.fmsAccountSvcI = fmsAccountSvcI;
    this.userSvcI = userSvcI;
    this.logger = logger;
    this.authSvcI = authSvcI;
  }

  ListInvitesOfAccountLogic = async (accountid) => {
    let result = await this.fmsAccountSvcI.ListInvitesOfAccount(accountid);
    if (!result) {
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

  CancelEmailInviteLogic = async (accountid, inviteid, cancelledby) => {
    let result = await this.fmsAccountSvcI.CancelEmailInvite(
      accountid,
      inviteid,
      cancelledby
    );
    if (!result) {
      throw new Error("Failed to cancel email invite");
    }
    return result;
  };

  SendUserInviteLogic = async (
    accountid,
    fleetid,
    roleids,
    contact,
    invitedby,
    headerReferer
  ) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const indianMobileRegex = /^[6-9]\d{9}$/;

    if (emailRegex.test(contact)) {
      let inviteid = uuidv4();
      let res = await this.fmsAccountSvcI.SendEmailInvite(
        accountid,
        fleetid,
        roleids,
        inviteid,
        contact,
        invitedby,
        headerReferer
      );
      if (!res) {
        throw new Error("Failed to send email invite");
      }
      return {
        accountid: accountid,
        fleetid: res.fleetid,
        roleids: res.roleids,
        inviteid: inviteid,
        contact: res.inviteemail,
        type: "email_invite",
      };
    } else if (indianMobileRegex.test(contact)) {
      try {
        let userid = await this.userSvcI.GetUserIdByMobile(contact);

        if (!userid) {
          const displayname = `${contact}`;
          const userinfo = {};

          let createRes = await this.userSvcI.CreateUserByPlatformAdmin(
            "mobile",
            true,
            contact,
            displayname,
            userinfo,
            invitedby
          );

          if (!createRes) {
            throw new Error("Failed to create user");
          }

          userid = createRes.userid;
        }

        let res = await this.userSvcI.AddUserToAccount(
          invitedby,
          contact,
          accountid
        );
        if (!res) {
          throw new Error("Failed to add user to account");
        }

        return {
          accountid: accountid,
          fleetid: fleetid,
          roleids: roleids,
          contact: contact,
          userid: userid,
          type: "mobile_user_added",
        };
      } catch (error) {
        if (error.message === "User with this mobile number does not exist") {
          throw error;
        }
        throw error;
      }
    } else {
      throw new Error("Invalid contact format");
    }
  };

  GetAccountFleetsLogic = async (accountid, userid) => {
    let fleets = await this.fmsAccountSvcI.GetUserAccountFleets(
      accountid,
      userid
    );
    if (!fleets) {
      fleets = [];
    }
    return fleets;
  };

  GetAccountModulesLogic = async (accountid, userid) => {
    let webModulesInfo = await this.fmsAccountSvcI.GetAllWebModulesInfo(
      accountid
    );
    if (!webModulesInfo || webModulesInfo.length === 0) {
      webModulesInfo = [];
    }
    let modules = [];
    for (let module of webModulesInfo) {
      modules.push({
        moduleid: module.moduleid,
        moduleinfo: module,
      });
    }

    return {
      userid: userid,
      accountid: accountid,
      modules: modules,
    };
  };

  GetChargeStationTypesLogic = async (accountid) => {
    try {
      let result = await this.fmsAccountSvcI.GetChargeStationTypes(accountid);
      return result;
    } catch (error) {
      throw error;
    }
  };

  ValidateInviteLogic = async (inviteid) => {
    let result = await this.fmsAccountSvcI.ValidateInvite(inviteid);
    if (!result) {
      throw new Error("Failed to validate invite");
    }
    return result;
  };

  ResendEmailInviteLogic = async (accountid, inviteid, resendedby, referer) => {
    let result = await this.fmsAccountSvcI.ResendInvite(
      accountid,
      inviteid,
      resendedby,
      referer
    );
    if (!result) {
      throw new Error("Failed to resend platform invite");
    }
    return result;
  };

  // fleet management
  CreateFleetLogic = async (accountid, parentfleetid, fleetname, createdby) => {
    let fleetid = uuidv4();
    let result = await this.fmsAccountSvcI.CreateFleet(
      accountid,
      fleetid,
      parentfleetid,
      fleetname,
      createdby
    );
    if (!result) {
      throw new Error("Failed to create fleet");
    }
    return result;
  };

  GetFleetInfoLogic = async (accountid, fleetid) => {
    let fleet = await this.fmsAccountSvcI.GetFleetInfo(accountid, fleetid);
    if (!fleet) {
      throw new Error("Failed to get fleet info");
    }
    return fleet;
  };

  EditFleetLogic = async (accountid, fleetid, updateFields, updatedby) => {
    const allowedFields = ["name", "fleetinfo"];

    const fieldsToUpdate = {};
    for (const [key, value] of Object.entries(updateFields)) {
      if (allowedFields.includes(key)) {
        fieldsToUpdate[key] = value;
      }
    }

    let fleet = await this.fmsAccountSvcI.EditFleet(
      accountid,
      fleetid,
      fieldsToUpdate,
      updatedby
    );
    if (!fleet) {
      throw new Error("Failed to edit fleet");
    }
    return fleet;
  };

  GetSubFleetsLogic = async (accountid, fleetid, recursive = false) => {
    let subfleets = await this.fmsAccountSvcI.GetSubFleets(
      accountid,
      fleetid,
      recursive
    );
    if (!subfleets) {
      throw new Error("Failed to get subfleets");
    }
    return subfleets;
  };

  DeleteFleetLogic = async (accountid, fleetid, deletedby) => {
    let fleetInfo = await this.fmsAccountSvcI.GetFleetInfo(accountid, fleetid);
    if (!fleetInfo) {
      throw {
        errcode: "FLEET_NOT_FOUND",
        errdata: "Fleet not found",
        message: "Fleet not found",
      };
    }

    if (fleetInfo.isroot) {
      throw {
        errcode: "ROOT_FLEET_PROTECTED",
        errdata: "Root fleet protected",
        message: "Cannot delete root fleet. It is protected from deletion.",
      };
    }

    let hasVehicles = await this.fmsAccountSvcI.DoesFleetHaveVehicles(
      accountid,
      fleetid
    );
    if (hasVehicles) {
      throw {
        errcode: "FLEET_HAS_VEHICLES",
        errdata: "Fleet has vehicles",
        message: "Cannot delete fleet. It has vehicles assigned to it.",
      };
    }

    let hasSubfleets = await this.fmsAccountSvcI.DoesFleetHaveSubfleets(
      accountid,
      fleetid
    );
    if (hasSubfleets) {
      throw {
        errcode: "FLEET_HAS_SUBFLEETS",
        errdata: "Fleet has subfleets",
        message:
          "Cannot delete fleet. It has subfleets. Please delete subfleets first.",
      };
    }

    let hasUsers = await this.fmsAccountSvcI.DoesFleetHaveUsers(
      accountid,
      fleetid
    );
    if (hasUsers) {
      throw {
        errcode: "FLEET_HAS_USERS",
        errdata: "Fleet has users",
        message: "Cannot delete fleet. It has users assigned to it.",
      };
    }

    let hasConstraints = await this.fmsAccountSvcI.DoesFleetHaveConstraints(
      accountid,
      fleetid
    );

    let res = await this.fmsAccountSvcI.DeleteFleet(
      accountid,
      fleetid,
      deletedby,
      hasConstraints
    );
    if (!res) {
      this.logger.error("Failed to delete fleet");
      throw new Error("Failed to delete fleet");
    }

    return {
      fleetid: fleetid,
      fleetname: fleetInfo.fleetname,
      deletedat: new Date(),
      deletedby: deletedby,
      deletetype: hasConstraints ? "soft" : "hard",
    };
  };

  ListSubscribedVehiclesLogic = async (accountid) => {
    let rootFleetId = await this.fmsAccountSvcI.GetRootFleetId(accountid);
    if (!rootFleetId) {
      throw new Error("Failed to get root fleet for account");
    }

    let allVehicles = await this.GetVehiclesLogic(accountid, rootFleetId, true);
    if (!allVehicles) {
      allVehicles = [];
    }

    let subscriptionData =
      await this.fmsAccountSvcI.GetSubscribedVehiclesFromList(
        accountid,
        allVehicles
      );
    if (!subscriptionData) {
      subscriptionData = [];
    }

    let subscriptionMap = new Map();
    for (let subData of subscriptionData) {
      subscriptionMap.set(subData.vinno, {
        startsat: subData.startsat,
        endsat: subData.endsat,
        createdat: subData.createdat,
        createdby: subData.createdby,
      });
    }

    let subscribedVehicles = [];
    for (let vehicle of allVehicles) {
      if (subscriptionMap.has(vehicle.vinno)) {
        let subInfo = subscriptionMap.get(vehicle.vinno);
        subscribedVehicles.push({
          ...vehicle,
          subscriptionstartsat: subInfo.startsat,
          subscriptionendsat: subInfo.endsat,
          subscriptioncreatedat: subInfo.createdat,
          subscriptioncreatedby: subInfo.createdby,
        });
      }
    }

    return subscribedVehicles;
  };

  // role management
  CreateRoleLogic = async (
    accountid,
    rolename,
    roletype,
    isenabled,
    createdby
  ) => {
    let roleid = uuidv4();
    let role = {
      accountid: accountid,
      roleid: roleid,
      rolename: rolename,
      roletype: roletype,
      isenabled: !!isenabled,
      createdby: createdby,
    };
    let res = await this.fmsAccountSvcI.CreateRole(role);
    if (!res) {
      throw new Error("Failed to create role");
    }
    delete role.accountid;

    return {
      roleid: roleid,
      role: role,
    };
  };

  UpdateRoleLogic = async (accountid, roleid, updateFields, updatedby) => {
    const allowedFields = ["rolename", "roletype", "isenabled"];

    const filteredFields = {};
    for (const [key, value] of Object.entries(updateFields)) {
      if (allowedFields.includes(key)) {
        filteredFields[key] = key === "isenabled" ? !!value : value;
      }
    }

    if (Object.keys(filteredFields).length === 0) {
      throw new Error("No valid fields provided for update");
    }

    const res = await this.fmsAccountSvcI.UpdateRole(
      accountid,
      roleid,
      filteredFields,
      updatedby
    );
    if (!res) {
      throw new Error("Failed to update role");
    }

    return {
      roleid: roleid,
      role: {
        roleid: roleid,
        ...filteredFields,
        updatedby: updatedby,
      },
    };
  };

  ListRolesLogic = async (accountid) => {
    let roles = await this.fmsAccountSvcI.GetAllRoles(accountid);
    if (!roles) {
      roles = [];
    }
    return {
      roles: roles,
    };
  };

  GetRoleLogic = async (accountid, roleid) => {
    let roleInfo = await this.fmsAccountSvcI.GetRoleInfo(accountid, roleid);
    if (roleInfo === null) {
      throw new Error("Role not found");
    }
    delete roleInfo.accountid;

    let allPlatformModulePerms =
      await this.fmsAccountSvcI.GetAllPlatformModulePerms();
    if (!allPlatformModulePerms) {
      allPlatformModulePerms = [];
    }

    let rolePerms = await this.fmsAccountSvcI.GetRolePerms(accountid, roleid);
    if (!rolePerms) {
      rolePerms = [];
    }

    rolePerms = rolePerms.map((permid) => permid.permid);

    let permmap = {};

    for (let platformModulePerm of allPlatformModulePerms) {
      if (!permmap[platformModulePerm.moduleid]) {
        permmap[platformModulePerm.moduleid] = {
          moduleid: platformModulePerm.moduleid,
          moduleName: platformModulePerm.modulename,
          perms: [],
        };
      }
      let perm = {
        permid: platformModulePerm.permid,
        isAssigned: false,
      };
      if (rolePerms.includes(platformModulePerm.permid)) {
        perm.isAssigned = true;
      }
      permmap[platformModulePerm.moduleid].perms.push(perm);
    }

    permmap = Object.values(permmap);

    return {
      roleInfo: roleInfo,
      perms: permmap,
    };
  };

  // vehicle management
  GetVehiclesLogic = async (accountid, fleetid, recursive = false) => {
    let vehicles = await this.fmsAccountSvcI.GetVehicles(
      accountid,
      fleetid,
      recursive
    );
    if (!vehicles) {
      return [];
    }
    return vehicles;
  };

  MoveVehicleLogic = async (accountid, fromfleetid, tofleetid, vehicleid) => {
    let result = await this.fmsAccountSvcI.MoveVehicle(
      accountid,
      fromfleetid,
      tofleetid,
      vehicleid
    );
    if (!result) {
      throw new Error("Failed to move vehicle");
    }
    return result;
  };

  RemoveVehicleLogic = async (accountid, fleetid, vehicleid) => {
    let result = await this.fmsAccountSvcI.RemoveVehicle(
      accountid,
      fleetid,
      vehicleid
    );
    if (!result) {
      throw new Error("Failed to remove vehicle");
    }
    return result;
  };

  ListMoveableFleetsLogic = async (accountid, vehicleid, userid) => {
    let fleets = await this.fmsAccountSvcI.ListMoveableFleets(
      accountid,
      vehicleid,
      userid
    );
    if (!fleets) {
      return [];
    }
    return fleets;
  };

  // user management
  ListUsersLogic = async (accountid, fleetid) => {
    let users = await this.fmsAccountSvcI.ListUsers(accountid, fleetid);
    if (!users) {
      return [];
    }
    return users;
  };

  GetAssignableRolesLogic = async (accountid, fleetid, userid, assignedby) => {
    let roles = await this.fmsAccountSvcI.GetAssignableRoles(
      accountid,
      fleetid,
      userid,
      assignedby
    );
    if (!roles) {
      return [];
    }
    return roles;
  };

  AssignUserRoleLogic = async (
    accountid,
    fleetid,
    userid,
    roleids,
    assignedby
  ) => {
    let result = await this.fmsAccountSvcI.AssignUserRole(
      accountid,
      fleetid,
      userid,
      roleids,
      assignedby
    );
    if (!result) {
      throw new Error("Failed to assign user role");
    }
    return result;
  };

  DeassignUserRoleLogic = async (
    accountid,
    fleetid,
    userid,
    roleid,
    deassignedby
  ) => {
    let result = await this.fmsAccountSvcI.DeassignUserRole(
      accountid,
      fleetid,
      userid,
      roleid,
      deassignedby
    );
    if (!result) {
      throw new Error("Failed to deassign user role");
    }
    return result;
  };

  GetUserInfoLogic = async (accountid, fleetid, userid) => {
    let user = await this.userSvcI.GetUserDetails(userid);
    if (!user) {
      throw new Error("User not found");
    }

    let userRoles = await this.fmsAccountSvcI.GetAllUserRolesOnFleet(
      accountid,
      fleetid,
      userid
    );
    if (!userRoles) {
      userRoles = [];
    }

    let accountRoles = userRoles.filter((role) => role.roletype === "account");
    accountRoles = accountRoles.map((role) => {
      return {
        roleid: role.roleid,
        rolename: role.rolename,
        roletype: role.roletype,
      };
    });

    return {
      user: user,
      roles: {
        account: accountRoles,
      },
    };
  };

  RemoveUserLogic = async (accountid, userid, removedby) => {
    if (userid === removedby) {
      throw {
        errcode: "CANNOT_REMOVE_SELF",
        errdata: "Cannot remove self",
        message: "You cannot remove yourself from the account",
      };
    }

    if (userid === "ffffffff-ffff-ffff-ffff-ffffffffffff") {
      throw {
        errcode: "CANNOT_REMOVE_SEED_USER",
        errdata: "Cannot remove seed user",
        message:
          "Cannot remove seed user (super admin). It is protected from removal.",
      };
    }

    // Check if user exists
    let userDetails = await this.userSvcI.GetUserDetails(userid);
    if (!userDetails) {
      throw {
        errcode: "USER_NOT_FOUND",
        errdata: "User not found",
        message: "User not found",
      };
    }

    if (userDetails.isdeleted) {
      throw {
        errcode: "USER_NOT_FOUND",
        errdata: "User not found",
        message: "User not found or already deleted",
      };
    }

    // Check if user is part of this account
    let isUserInAccount = await this.fmsAccountSvcI.IsUserInAccount(
      accountid,
      userid
    );
    if (!isUserInAccount) {
      throw {
        errcode: "USER_NOT_IN_ACCOUNT",
        errdata: "User not in account",
        message: "User is not a member of this account",
      };
    }

    let result = await this.fmsAccountSvcI.RemoveUser(
      accountid,
      userid,
      removedby
    );
    if (!result) {
      this.logger.error("Failed to remove user from account");
      throw new Error("Failed to remove user from account");
    }

    return {
      userid: userid,
      accountid: accountid,
      removedby: removedby,
      removedat: new Date(),
      message: "User removed from account successfully",
    };
  };

  DeleteUserLogic = async (accountid, userid, deletedby) => {
    if (userid === deletedby) {
      throw {
        errcode: "CANNOT_DELETE_SELF",
        errdata: "Cannot delete self",
        message: "You cannot delete yourself",
      };
    }

    if (userid === "ffffffff-ffff-ffff-ffff-ffffffffffff") {
      throw {
        errcode: "CANNOT_DELETE_SEED_USER",
        errdata: "Cannot delete seed user",
        message:
          "Cannot delete seed user (super admin). It is protected from deletion.",
      };
    }

    let userDetails = await this.userSvcI.GetUserDetails(userid);
    if (!userDetails) {
      throw {
        errcode: "USER_NOT_FOUND",
        errdata: "User not found",
        message: "User not found",
      };
    }

    if (userDetails.isdeleted) {
      throw {
        errcode: "USER_ALREADY_DELETED",
        errdata: "User already deleted",
        message: "User is already deleted",
      };
    }

    // Check if user is part of this account
    let isUserInAccount = await this.fmsAccountSvcI.IsUserInAccount(
      accountid,
      userid
    );
    if (!isUserInAccount) {
      throw {
        errcode: "USER_NOT_IN_ACCOUNT",
        errdata: "User not in account",
        message: "User is not a member of this account",
      };
    }

    let result = await this.fmsAccountSvcI.DeleteUser(
      accountid,
      userid,
      deletedby
    );
    if (!result) {
      this.logger.error("Failed to delete user from account");
      throw new Error("Failed to delete user");
    }

    return {
      userid: userid,
      accountid: accountid,
      original_displayname: userDetails.displayname,
      new_displayname: result.new_displayname,
      deletedat: new Date(),
      deletedby: deletedby,
      sso_records_updated: result.sso_records_updated || 0,
    };
  };

  /**
   * updatedperms is an array of objects with moduleid and permid
   * @param {*} roleid
   * @param {[{moduleid: string, selectedpermids: string[], deselectedpermids: string[]}]} updatedperms
   * @param {*} updatedby
   * @returns
   */
  UpdateRolePermsLogic = async (accountid, roleid, updatedperms, updatedby) => {
    let permsToAdd = [];
    let permsToRemove = [];
    for (let updatedperm of updatedperms) {
      if (
        updatedperm.selectedpermids &&
        updatedperm.selectedpermids.length > 0
      ) {
        for (let permid of updatedperm.selectedpermids) {
          permsToAdd.push(permid);
        }
      }
      if (
        updatedperm.deselectedpermids &&
        updatedperm.deselectedpermids.length > 0
      ) {
        for (let permid of updatedperm.deselectedpermids) {
          permsToRemove.push(permid);
        }
      }
    }
    let res = await this.fmsAccountSvcI.UpdateRolePerms(
      accountid,
      roleid,
      permsToAdd,
      permsToRemove,
      updatedby
    );
    if (!res) {
      throw new Error("Failed to update role permissions");
    }
    return this.GetRoleLogic(accountid, roleid);
  };

  DeleteRoleLogic = async (accountid, roleid, deletedby) => {
    // Check if role exists and get role info
    let roleInfo = await this.fmsAccountSvcI.GetRoleInfo(accountid, roleid);
    if (!roleInfo) {
      throw {
        errcode: "ROLE_NOT_FOUND",
        errdata: "Role not found",
        message: "Role not found",
      };
    }

    if (roleid === "ffffffff-ffff-ffff-ffff-ffffffffffff") {
      throw {
        errcode: "CANNOT_DELETE_ADMIN_ROLE",
        errdata: "Cannot delete admin role",
        message: "Cannot delete admin role. It is protected from deletion.",
      };
    }

    if (roleInfo.roletype !== "account") {
      throw {
        errcode: "INVALID_ROLE_TYPE",
        errdata: "Invalid role type",
        message:
          "Only account roles can be deleted. Platform roles are protected.",
      };
    }

    let isAssignedToUsers = await this.fmsAccountSvcI.IsRoleAssignedToUsers(
      roleid
    );
    if (isAssignedToUsers) {
      throw {
        errcode: "ROLE_IN_USE",
        errdata: "Role assigned to users",
        message:
          "Cannot delete role. It is currently assigned to one or more users.",
      };
    }

    let hasPermissions = await this.fmsAccountSvcI.DoesRoleHavePermissions(
      roleid
    );
    if (hasPermissions) {
      throw {
        errcode: "ROLE_HAS_PERMISSIONS",
        errdata: "Role has permissions",
        message: "Cannot delete role. It has permissions assigned.",
      };
    }

    let res = await this.fmsAccountSvcI.DeleteRole(roleid, deletedby);
    if (!res) {
      this.logger.error("Failed to delete role");
      throw new Error("Failed to delete role");
    }

    return {
      roleid: roleid,
      rolename: roleInfo.rolename,
      deletedat: new Date(),
      deletedby: deletedby,
    };
  };

  // subscription management
  GetAccountSubscriptionsLogic = async (accountid) => {
    let defaultPkgs = await this.fmsAccountSvcI.GetDefaultAccountPkgs();
    if (!defaultPkgs) {
      defaultPkgs = [];
    }
    let customPkgs = await this.fmsAccountSvcI.GetCustomAccountPkgs(accountid);
    if (!customPkgs) {
      customPkgs = [];
    }

    let subscription = await this.fmsAccountSvcI.GetSubscriptionInfo(accountid);
    let activepkgid = subscription?.pkgid;

    for (let pkg of defaultPkgs) {
      let totalcredits = 0;
      if (pkg.modules && pkg.modules.length > 0) {
        for (let module of pkg.modules) {
          totalcredits += Number(module.creditspervehicleday);
        }
      }
      pkg.totalcredits = totalcredits;

      pkg.issubscribed = pkg.pkgid === activepkgid;
      if (pkg.issubscribed && subscription) {
        pkg.subscriptioninfo = {
          startdate: subscription.subscriptioninfo.startdate,
          enddate: subscription.subscriptioninfo.enddate,
        };
      }
    }

    for (let pkg of customPkgs) {
      let totalcredits = 0;
      if (pkg.modules && pkg.modules.length > 0) {
        for (let module of pkg.modules) {
          totalcredits += Number(module.creditspervehicleday);
        }
      }
      pkg.totalcredits = totalcredits;

      pkg.issubscribed = pkg.pkgid === activepkgid;
      if (pkg.issubscribed && subscription) {
        pkg.subscriptioninfo = {
          startdate: subscription.subscriptioninfo.startdate,
          enddate: subscription.subscriptioninfo.enddate,
        };
      }
    }

    return {
      accountid: accountid,
      defaultpkgs: defaultPkgs,
      custompkgs: customPkgs,
    };
  };

  CheckChangeSubscriptionPackageLogic = async (accountid, newpkgid) => {
    let res = await this.fmsAccountSvcI.CheckChangeSubscriptionPackage(
      accountid,
      newpkgid
    );
    if (!res) {
      throw new Error("Failed to check change subscription package");
    }
    return { accountid: accountid, pkgid: newpkgid, subscriptioninfo: res };
  };

  UpdateAccountSubscriptionLogic = async (accountid, pkgid, updatedby) => {
    let startdate = new Date();
    let enddate = new Date(
      startdate.getFullYear(),
      startdate.getMonth() + 1,
      0
    );
    enddate.setHours(23, 59, 59, 999);

    let subscriptioninfo = {
      startdate: startdate.toISOString(),
      enddate: enddate.toISOString(),
    };

    let result = await this.fmsAccountSvcI.UpdateSubscription(
      accountid,
      pkgid,
      subscriptioninfo,
      updatedby
    );
    if (!result) {
      throw new Error("Failed to update subscription");
    }
    return {
      accountid: accountid,
      pkgid: pkgid,
      subscription: subscriptioninfo,
    };
  };

  GetSubscriptionHistoryLogic = async (accountid) => {
    let subscriptionHistory = await this.fmsAccountSvcI.GetSubscriptionHistory(
      accountid
    );
    if (!subscriptionHistory) {
      subscriptionHistory = [];
    }
    return subscriptionHistory;
  };

  GetSubscriptionVehiclesLogic = async (accountid) => {
    let rootFleetId = await this.fmsAccountSvcI.GetRootFleetId(accountid);
    if (!rootFleetId) {
      throw new Error("Failed to get root fleet for account");
    }

    let allVehicles = await this.GetVehiclesLogic(accountid, rootFleetId, true);
    if (!allVehicles) {
      allVehicles = [];
    }

    const vinNumbers = allVehicles.map((vehicle) => vehicle.vinno);
    const gpsDataMap = await this.fmsAccountSvcI.GetLastestGpsDataForVehicles(
      vinNumbers
    );

    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;

    let subscriptionInfo = await this.fmsAccountSvcI.GetSubscriptionInfo(
      accountid
    );

    let currentPackage = null;
    if (subscriptionInfo) {
      let packageDetails = await this.fmsAccountSvcI.GetPackageWithModules(
        subscriptionInfo.pkgid
      );
      if (packageDetails) {
        let totalCredits = 0;
        if (packageDetails.modules && packageDetails.modules.length > 0) {
          for (let module of packageDetails.modules) {
            totalCredits += Number(module.creditspervehicleday);
          }
        }

        currentPackage = {
          pkgid: packageDetails.pkgid,
          pkgname: packageDetails.pkgname,
          pkgtype: packageDetails.pkgtype,
          totalcredits: totalCredits,
          modules: packageDetails.modules,
          subscriptioninfo: {
            startdate: subscriptionInfo.subscriptioninfo.startdate,
            enddate: subscriptionInfo.subscriptioninfo.enddate,
          },
          subscribeddate: subscriptionInfo.createdat,
          subscribedby: subscriptionInfo.createdby,
        };
      }
    }

    let subscribedVehiclesData =
      await this.fmsAccountSvcI.GetSubscribedVehicles(accountid);
    if (!subscribedVehiclesData) {
      subscribedVehiclesData = [];
    }

    let subscriptionMap = new Map();
    let currentDate = new Date();

    for (let subData of subscribedVehiclesData) {
      subscriptionMap.set(subData.vinno, {
        issubscribed: true,
        isunsubscribable: subData.lockedtill
          ? currentDate > new Date(subData.lockedtill)
          : false,
        endsat: subData.endsat,
        startsat: subData.startsat,
        lockedtill: subData.lockedtill,
      });
    }

    let subscribedVehicles = [];
    let unsubscribedvehicles = [];

    for (let vehicle of allVehicles) {
      const lastConnectedAt = gpsDataMap[vehicle.vinno]
        ? parseInt(gpsDataMap[vehicle.vinno])
        : null;
      const isConnected =
        lastConnectedAt && lastConnectedAt > twentyFourHoursAgo ? true : false;

      if (subscriptionMap.has(vehicle.vinno)) {
        let subInfo = subscriptionMap.get(vehicle.vinno);
        subscribedVehicles.push({
          ...vehicle,
          issubscribed: true,
          isunsubscribable: subInfo.isunsubscribable,
          subscriptionstartsat: subInfo.startsat,
          subscriptionlockedtill: subInfo.lockedtill,
          subscriptionendsat: subInfo.endsat,
          lastconnectedat: lastConnectedAt,
          isconnected: isConnected,
          issubscribable: false,
        });
      } else {
        unsubscribedvehicles.push({
          ...vehicle,
          issubscribed: false,
          isunsubscribable: false,
          issubscribable: isConnected,
          lastconnectedat: lastConnectedAt,
          isconnected: isConnected,
        });
      }
    }

    return {
      accountid: accountid,
      currentpackage: currentPackage,
      vehicles: {
        subscribed: subscribedVehicles,
        unsubscribed: unsubscribedvehicles,
        total: allVehicles.length,
        subscribedcount: subscribedVehicles.length,
        unsubscribedcount: unsubscribedvehicles.length,
      },
    };
  };

  CreateSubscriptionIntentLogic = async (accountid, vinnos, userid) => {
    const originalcount = vinnos.length;
    const uniquevins = [...new Set(vinnos)];

    let result = await this.fmsAccountSvcI.CreateSubscriptionIntent(
      accountid,
      uniquevins,
      userid,
      originalcount
    );
    if (!result) {
      throw new Error("Failed to create subscription intent");
    }
    return result;
  };

  SubscribeVehicleLogic = async (accountid, vinnos, userid) => {
    const originalcount = vinnos.length;
    const uniquevins = [...new Set(vinnos)];

    if (originalcount !== uniquevins.length) {
      return {
        status: "error",
        message: `Duplicate VINs found and filtered out. Original: ${originalcount}, Unique: ${uniquevins.length}`,
        details: {
          originalcount,
          uniquevins: uniquevins.length,
          duplicatecount: originalcount - uniquevins.length,
        },
      };
    }

    let intentResult = await this.fmsAccountSvcI.CreateSubscriptionIntent(
      accountid,
      uniquevins,
      userid,
      originalcount
    );

    if (!intentResult) {
      return {
        status: "error",
        message: "Failed to validate subscription intent",
        details: {
          accountid,
          vinnos: uniquevins,
        },
      };
    }

    const errorResults = intentResult.vinresults.filter(
      (r) => r.status === "error"
    );

    if (errorResults.length > 0) {
      const errorDetails = errorResults
        .map((r) => `${r.vinno}: ${r.reason} - ${r.message}`)
        .join("; ");

      return {
        status: "error",
        message: "Cannot subscribe vehicles. Validation failed",
        details: {
          failedvehicles: errorResults.map((r) => ({
            vinno: r.vinno,
            reason: r.reason,
            message: r.message,
            details: r.details || {},
          })),
          errorcount: errorResults.length,
          totalvehicles: uniquevins.length,
        },
        vinresults: intentResult.vinresults,
      };
    }

    const subscribableVehicles = intentResult.vinresults
      .filter((r) => r.status === "success")
      .map((r) => r.vinno);

    if (subscribableVehicles.length !== uniquevins.length) {
      return {
        status: "error",
        message: "Validation inconsistency detected",
        details: {
          expectedcount: uniquevins.length,
          actualcount: subscribableVehicles.length,
          vinnos: uniquevins,
        },
      };
    }

    let result = await this.fmsAccountSvcI.SubscribeVehicle(
      accountid,
      subscribableVehicles,
      userid,
      intentResult
    );

    if (!result) {
      return {
        status: "error",
        message: "Failed to subscribe vehicles",
        details: {
          accountid,
          vinnos: subscribableVehicles,
        },
      };
    }

    return result;
  };

  UnsubscribeVehicleLogic = async (accountid, vinnos, userid) => {
    const originalcount = vinnos.length;
    const uniquevins = [...new Set(vinnos)];

    if (originalcount !== uniquevins.length) {
      return {
        status: "error",
        message: `Duplicate VINs found and filtered out. Original: ${originalcount}, Unique: ${uniquevins.length}`,
        details: {
          originalcount,
          uniquevins: uniquevins.length,
          duplicatecount: originalcount - uniquevins.length,
        },
      };
    }

    let result = await this.fmsAccountSvcI.UnsubscribeVehicle(
      accountid,
      uniquevins,
      userid
    );

    if (!result) {
      return {
        status: "error",
        message: "Failed to unsubscribe vehicles",
        details: {
          accountid,
          vinnos: uniquevins,
        },
      };
    }

    return result;
  };

  TagVehicleLogic = async (
    srcaccountid,
    dstaccountid,
    vinnos,
    allow_retag,
    taggedby
  ) => {
    // const originalcount = vinnos.length;

    // if (originalcount !== uniquevins.length) {
    //   return {
    //     status: "error",
    //     message: `Duplicate VINs found and filtered out. Original: ${originalcount}, Unique: ${uniquevins.length}`,
    //     details: {
    //       originalcount,
    //       uniquevins: uniquevins.length,
    //       duplicatecount: originalcount - uniquevins.length,
    //     },
    //   };
    // }

    const uniquevins = [...new Set(vinnos)];
    let result = await this.fmsAccountSvcI.TagVehicle(
      srcaccountid,
      dstaccountid,
      uniquevins,
      allow_retag,
      taggedby
    );

    if (!result) {
      return {
        status: "error",
        message: "Failed to tag vehicles",
        details: {
          srcaccountid,
          dstaccountid,
          vinnos: uniquevins,
        },
      };
    }

    return result;
  };

  UntagVehicleLogic = async (
    srcaccountid,
    dstaccountid,
    vinnos,
    untaggedby
  ) => {
    // const originalcount = vinnos.length;

    // if (originalcount !== uniquevins.length) {
    //   return {
    //     status: "error",
    //     message: `Duplicate VINs found and filtered out. Original: ${originalcount}, Unique: ${uniquevins.length}`,
    //     details: {
    //       originalcount,
    //       uniquevins: uniquevins.length,
    //       duplicatecount: originalcount - uniquevins.length,
    //     },
    //   };
    // }

    const uniquevins = [...new Set(vinnos)];
    let result = await this.fmsAccountSvcI.UntagVehicle(
      srcaccountid,
      dstaccountid,
      uniquevins,
      untaggedby
    );

    if (!result) {
      return {
        status: "error",
        message: "Failed to untag vehicles",
        details: {
          srcaccountid,
          dstaccountid,
          vinnos: uniquevins,
        },
      };
    }

    return result;
  };
}
