import { v4 as uuidv4 } from "uuid";
import { EmailMobileValidation } from "../../../utils/commonutil.js";

const CUSTOMER_ACCOUNT_TYPE = "customer";
const ROOT_FLEET_NAME = "Home";

export default class AccountHdlrImpl {
  constructor(accountSvcI, userSvcI, authSvcI, fmsAccountSvcI, logger) {
    this.accountSvcI = accountSvcI;
    this.userSvcI = userSvcI;
    this.authSvcI = authSvcI;
    this.fmsAccountSvcI = fmsAccountSvcI;
    this.logger = logger;
  }

  CreateAccountLogic = async (
    accountname,
    accountinfo,
    isenabled = true,
    createdby
  ) => {
    let accountid = uuidv4();
    let rootfleetid = uuidv4();
    let rootfleetparentid = uuidv4();
    let account = {
      accountid: accountid,
      rootfleetid: rootfleetid,
      rootFleetParentId: rootfleetparentid,
      rootFleetName: ROOT_FLEET_NAME,
      accountname: accountname,
      accounttype: CUSTOMER_ACCOUNT_TYPE,
      accountinfo: accountinfo,
      isenabled: isenabled,
      createdby: createdby,
    };

    let accountinfovalidation = EmailMobileValidation(accountinfo);

    if (!accountinfovalidation.isvalid) {
      this.logger.error(accountinfovalidation.message);
      throw new Error(accountinfovalidation.message);
    }

    let res = await this.accountSvcI.CreateAccount(account);
    if (!res) {
      this.logger.error("Failed to create account");
      throw new Error("Failed to create account");
    }
    delete account.rootfleetid;
    delete account.rootFleetParentId;
    delete account.rootFleetName;
    return {
      accountid: accountid,
      account: account,
    };
  };

  ListAccountsLogic = async () => {
    let platformAccountId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    let accounts = await this.accountSvcI.GetAllAccounts(platformAccountId);
    if (!accounts) {
      accounts = [];
    }
    return { accounts: accounts };
  };

  GetAccountOverviewLogic = async (accountid) => {
    let account = await this.accountSvcI.GetAccountOverview(accountid);
    if (!account) {
      this.logger.error("Account not found");
      throw new Error("Account not found");
    }
    return { accountid: accountid, overview: account };
  };

  UpdateAccountLogic = async (accountid, updateFields, updatedby) => {
    const allowedFields = ["accountname", "accountinfo", "isenabled", "mobile"];

    const fieldsToUpdate = {};
    for (const [key, value] of Object.entries(updateFields)) {
      if (allowedFields.includes(key)) {
        fieldsToUpdate[key] = value;
      }
    }

    if (Object.keys(fieldsToUpdate).length === 0) {
      throw new Error("No valid fields provided for update");
    }

    let emailmobilevalidation = EmailMobileValidation(
      fieldsToUpdate.accountinfo
    );

    if (!emailmobilevalidation.isvalid) {
      this.logger.error(emailmobilevalidation.message);
      throw new Error(emailmobilevalidation.message);
    }

    let res = await this.accountSvcI.UpdateAccount(
      accountid,
      fieldsToUpdate,
      updatedby
    );

    if (!res) {
      this.logger.error("Failed to update account");
      throw new Error("Failed to update account");
    }

    return { accountid: accountid, updatedFields: Object.keys(fieldsToUpdate) };
  };

  DeleteAccountLogic = async (accountid, deletedby) => {
    let res = await this.accountSvcI.DeleteAccount(accountid, deletedby);
    if (!res) {
      this.logger.error("Failed to delete account");
      throw new Error("Failed to delete account");
    }
    return {
      accountid: accountid,
      accountname: res.accountname,
      deletedat: res.deletedat,
      deletedby: res.deletedby,
    };
  };

  AddAdminToAccRootFleetLogic = async (accountid, contact, updatedby) => {
    let res = await this.accountSvcI.AddAdminToAccRootFleet(
      accountid,
      contact,
      updatedby
    );
    if (!res) {
      this.logger.error("Failed to add admin to account root fleet");
      throw new Error("Failed to add admin to account root fleet");
    }
    return this.GetAccountUsersLogic(accountid);
  };

  GetAccountUsersLogic = async (accountid) => {
    let users = await this.accountSvcI.GetAccountUsersInfoWithRoles(accountid);
    if (!users) {
      users = [];
    }

    return { accountid: accountid, users: users };
  };

  RemoveUserFromAccountLogic = async (accountid, userid, updatedby) => {
    let res = await this.accountSvcI.RemoveUserFromAccount(
      accountid,
      userid,
      updatedby
    );
    if (!res) {
      this.logger.error("Failed to remove user from account");
      throw new Error("Failed to remove user from account");
    }
    return this.GetAccountUsersLogic(accountid);
  };

  GetAccountPkgsLogic = async (accountid) => {
    let defaultPkgs = await this.accountSvcI.GetDefaultAccountPkgs();
    if (!defaultPkgs) {
      defaultPkgs = [];
    }
    let customPkgs = await this.accountSvcI.GetCustomAccountPkgs(accountid);
    if (!customPkgs) {
      customPkgs = [];
    }

    // Get subscription info to determine which package is currently subscribed
    let subscription = await this.accountSvcI.GetSubscriptionInfo(accountid);
    let activepkgid = subscription?.pkgid;

    // Calculate total credits for default packages
    for (let pkg of defaultPkgs) {
      let totalcredits = 0;
      if (pkg.modules && pkg.modules.length > 0) {
        for (let module of pkg.modules) {
          totalcredits += Number(module.creditspervehicleday);
        }
      }
      pkg.totalcredits = totalcredits;

      // Add subscription information
      pkg.issubscribed = pkg.pkgid === activepkgid;
      if (pkg.issubscribed && subscription) {
        pkg.subscriptioninfo = {
          startdate: subscription.subscriptioninfo.startdate,
          enddate: subscription.subscriptioninfo.enddate,
        };
      }
    }

    // Calculate total credits for custom packages
    for (let pkg of customPkgs) {
      let totalcredits = 0;
      if (pkg.modules && pkg.modules.length > 0) {
        for (let module of pkg.modules) {
          totalcredits += Number(module.creditspervehicleday);
        }
      }
      pkg.totalcredits = totalcredits;

      // Add subscription information
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

  GetUnassignedCustomPkgsLogic = async (accountid) => {
    let customPkgs = await this.accountSvcI.GetUnassignedCustomPkgs(accountid);
    if (!customPkgs) {
      customPkgs = [];
    }
    return { pkgs: customPkgs };
  };

  AddCustomPkgToAccountLogic = async (accountid, pkgids, updatedby) => {
    let res = await this.accountSvcI.AddCustomPkgToAccount(
      accountid,
      pkgids,
      updatedby
    );
    if (!res) {
      this.logger.error("Failed to add custom package to account");
      throw new Error("Failed to add custom package to account");
    }
    return this.GetAccountPkgsLogic(accountid);
  };

  RemoveCustomPkgFromAccountLogic = async (accountid, pkgid, updatedby) => {
    let res = await this.accountSvcI.RemoveCustomPkgFromAccount(
      accountid,
      pkgid,
      updatedby
    );
    if (!res) {
      this.logger.error("Failed to remove custom package from account");
      throw new Error("Failed to remove custom package from account");
    }

    return this.GetAccountPkgsLogic(accountid);
  };

  EmailInviteToRootFleetLogic = async (
    accountid,
    email,
    invitedby,
    roles,
    headerReferer
  ) => {
    let inviteid = uuidv4();
    let res = await this.accountSvcI.EmailInviteToRootFleet(
      accountid,
      inviteid,
      email,
      invitedby,
      roles,
      headerReferer
    );
    if (!res) {
      this.logger.error("Failed to create invite email");
      throw new Error("Failed to create invite email");
    }
    return {
      accountid: accountid,
      fleetid: res.fleetid,
      roles: roles,
      inviteid: res.inviteid,
      contact: email,
    };
  };

  MobileInviteToRootFleetLogic = async (
    accountid,
    mobile,
    invitedby,
    roles,
    headerReferer
  ) => {
    let inviteid = uuidv4();
    let res = await this.accountSvcI.MobileInviteToRootFleet(
      accountid,
      inviteid,
      mobile,
      invitedby,
      roles,
      headerReferer
    );
    if (!res) {
      this.logger.error("Failed to create invite sms");
      throw new Error("Failed to create invite sms");
    }
    return {
      accountid: accountid,
      fleetid: res.fleetid,
      roles: roles,
      inviteid: inviteid,
      contact: mobile,
    };
  };

  ListInvitesOfAccountLogic = async (accountid) => {
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

  ResendInviteLogic = async (accountid, inviteid, invitedby, headerReferer) => {
    let res = await this.accountSvcI.ResendInvite(
      accountid,
      inviteid,
      invitedby,
      headerReferer
    );
    if (!res) {
      this.logger.error("Failed to resend invite");
      throw new Error("Failed to resend invite");
    }
    return {
      accountid: accountid,
      fleetid: res.fleetid,
      roles: res.roles,
      inviteid: inviteid,
      contact: res.inviteemail,
    };
  };

  CancelEmailInviteLogic = async (accountid, inviteid, cancelledby) => {
    let result = await this.fmsAccountSvcI.CancelEmailInvite(
      accountid,
      inviteid,
      cancelledby
    );
    if (!result) {
      this.logger.error("Failed to cancel email invite");
      throw new Error("Failed to cancel email invite");
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

  ResendPlatformInviteLogic = async (inviteid, resendedby) => {
    let accountid = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    let result = await this.accountSvcI.ResendInvite(
      accountid,
      inviteid,
      resendedby
    );
    if (!result) {
      this.logger.error("Failed to resend platform invite");
      throw new Error("Failed to resend platform invite");
    }
    return result;
  };

  ListPackagesForSubscriptionLogic = async (accountid) => {
    let defaultPkgs = await this.accountSvcI.GetDefaultAccountPkgs();
    if (!defaultPkgs) {
      defaultPkgs = [];
    }
    let customPkgs = await this.accountSvcI.GetCustomAccountPkgs(accountid);
    if (!customPkgs) {
      customPkgs = [];
    }

    // get active subscription info
    let subscription = await this.accountSvcI.GetSubscriptionInfo(accountid);
    let activepkgid = subscription?.pkgid;

    let pkgs = defaultPkgs.concat(customPkgs);
    pkgs = pkgs.filter((pkg) => pkg.modules.length > 0);
    for (let pkg of pkgs) {
      pkg.issubscribed = pkg.pkgid === activepkgid;
      let pkgcost = 0;
      for (let module of pkg.modules) {
        pkgcost += Number(module.creditspervehicleday);
      }
      pkg.pkgcost = pkgcost;
    }
    return { pkgs: pkgs };
  };

  CalculateSubscriptionCostLogic = async (
    accountid,
    pkgid,
    vehdays,
    discountpercent,
    startdate,
    enddate
  ) => {
    let pkg = await this.accountSvcI.GetPkgInfoWithModules(pkgid);
    if (!pkg) {
      this.logger.error("Package not found");
      throw new Error("Package not found");
    }

    let totalcredits = pkg.pkgcredits;
    let days = (enddate - startdate) / (1000 * 60 * 60 * 24);
    totalcredits = totalcredits * vehdays * days;
    let discountcredits = (totalcredits * discountpercent) / 100;
    let billablecredits = totalcredits - discountcredits;
    let costpercredit = 10;
    let billablecost = billablecredits * costpercredit;
    return {
      pkgid: pkgid,
      vehdays: vehdays,
      discountpercent: discountpercent,
      startdate: startdate,
      enddate: enddate,
      days: days,
      totalcredits: totalcredits,
      discountcredits: discountcredits,
      billablecredits: billablecredits,
      billablecost: billablecost,
    };
  };

  /**
   * @param {string} accountid
   * @param {string} pkgid
   * @param {string} createdby
   * @returns
   */
  CreateSubscriptionLogic = async (accountid, pkgid, createdby) => {
    let subscriptionmetadata = {
      startdate: Date.now(),
      enddate: Date.now() + 5 * 365 * 24 * 60 * 60 * 1000, // TODO: remove this hardcoded value
    };
    let res = await this.accountSvcI.CreateSubscription(
      accountid,
      pkgid,
      subscriptionmetadata,
      createdby
    );
    if (!res) {
      this.logger.error("Failed to create subscription");
      throw new Error("Failed to create subscription");
    }
    return {
      subscription: subscriptionmetadata,
    };
  };

  GetSubscriptionInfoLogic = async (accountid) => {
    let subscription = await this.accountSvcI.GetSubscriptionInfo(accountid);
    if (!subscription) {
      this.logger.error("Subscription not found");
      // throw new Error("Subscription not found");
    } else {
      subscription.issubscribed = true; // TODO: seems unnecessary
    }
    return { accountid: accountid, subscription: subscription };
  };

  GetAccountCreditsLogic = async (accountid) => {
    let credits = await this.accountSvcI.GetAccountCredits(accountid);
    if (!credits) {
      credits = 0;
    }
    return { accountid: accountid, totalcredits: credits };
  };

  UpdateAccountCreditsLogic = async (accountid, credits, updatedby) => {
    let res = await this.accountSvcI.UpdateAccountCredits(
      accountid,
      credits,
      updatedby
    );
    if (!res) {
      this.logger.error("Failed to update account credits");
      throw new Error("Failed to update account credits");
    }
    return { accountid: accountid, totalcredits: res };
  };

  GetAccountCreditsHistoryLogic = async (accountid) => {
    let history = await this.accountSvcI.GetAccountCreditsHistory(accountid);
    if (!history) {
      history = [];
    }
    // TODO: do we want to show credits delta
    return { accountid: accountid, history: history };
  };

  ListAccountVehiclesLogic = async (accountid, subscriptiontype) => {
    let vehicles = [];
    if (subscriptiontype === "all.all.all") {
      vehicles = await this.accountSvcI.GetAccountVehicles(accountid);
    } else if (subscriptiontype === "subscribed") {
      vehicles = await this.accountSvcI.GetSubscribedVehicles(accountid);
    } else if (subscriptiontype === "subscribeable") {
      vehicles = await this.accountSvcI.GetSubscribeableVehicles(accountid);
    } else {
      this.logger.error("Invalid subscription type");
      throw new Error("Invalid subscription type");
    }
    if (!vehicles) {
      vehicles = [];
    }
    return { accountid: accountid, vehicles: vehicles };
  };

  SubscribeVehiclesLogic = async (accountid, vinnos, updatedby) => {
    // i think we should either subscribe all vehicles at once or let the user know that they can't subscribe to all and hence, force them to select fewer
    let res = await this.accountSvcI.SubscribeVehicles(
      accountid,
      vinnos,
      updatedby
    );
    if (!res) {
      this.logger.error("Failed to subscribe vehicles");
      throw new Error("Failed to subscribe vehicles");
    }
    return { accountid: accountid, vinnos: vinnos };
  };

  UnsubscribeVehicleLogic = async (accountid, vinno, updatedby) => {
    let res = await this.accountSvcI.UnsubscribeVehicle(
      accountid,
      vinno,
      updatedby
    );
    if (!res) {
      this.logger.error("Failed to unsubscribe vehicle");
      throw new Error("Failed to unsubscribe vehicle");
    }
    return {
      accountid: accountid,
      vinno: vinno,
      useablecredits: res.useablecredits,
      lockedcredits: res.lockedcredits,
    };
  };

  CheckChangeSubscriptionPackageLogic = async (accountid, newpkgid) => {
    let res = await this.accountSvcI.CheckChangeSubscriptionPackage(
      accountid,
      newpkgid
    );
    if (!res) {
      this.logger.error("Failed to check change subscription package");
      throw new Error("Failed to check change subscription package");
    }
    return { accountid: accountid, pkgid: newpkgid, subscriptioninfo: res };
  };

  ChangeSubscriptionPackageLogic = async (accountid, newpkgid, updatedby) => {
    let subscriptioninfo = {
      startdate: Date.now(),
      enddate: Date.now() + 5 * 365 * 24 * 60 * 60 * 1000, // TODO: remove this hardcoded value
    };
    let res = await this.accountSvcI.ChangeSubscriptionPackage(
      accountid,
      newpkgid,
      subscriptioninfo,
      updatedby
    );
    if (!res) {
      this.logger.error("Failed to change subscription package");
      throw new Error("Failed to change subscription package");
    }

    const formattedSubscriptionInfo = {
      startdate: this.formatDateToDDMMMYYYY(subscriptioninfo.startdate),
      enddate: this.formatDateToDDMMMYYYY(subscriptioninfo.enddate),
    };

    return {
      accountid: accountid,
      pkgid: newpkgid,
      subscription: formattedSubscriptionInfo,
    };
  };

  GetSubscriptionHistoryLogic = async (accountid) => {
    let history = await this.accountSvcI.GetSubscriptionHistory(accountid);
    if (!history) {
      history = [];
    }
    return { accountid: accountid, history: history };
  };

  GetAllFleetsWithVinInfoLogic = async (accountid, recursive) => {
    try {
      let rootFleetId = await this.fmsAccountSvcI.GetRootFleetId(accountid);
      if (!rootFleetId) {
        throw new Error("Root fleet not found for account");
      }

      let rootFleetHierarchy = await this.buildFleetHierarchyWithVinInfo(
        accountid,
        rootFleetId,
        recursive
      );

      return rootFleetHierarchy;
    } catch (error) {
      this.logger.error("Error in GetAllFleetsWithVinInfo:", error);
      throw error;
    }
  };

  buildFleetHierarchyWithVinInfo = async (accountid, fleetid, recursive) => {
    try {
      let fleetInfo = await this.fmsAccountSvcI.GetFleetInfo(
        accountid,
        fleetid
      );
      if (!fleetInfo) {
        return null;
      }

      let vehicleCount = 0;
      let vehicles = [];
      if (recursive) {
        vehicles = await this.fmsAccountSvcI.GetVehicles(
          accountid,
          fleetid,
          true
        );
        vehicleCount = vehicles ? vehicles.length : 0;
      } else {
        vehicles = await this.fmsAccountSvcI.GetVehicles(
          accountid,
          fleetid,
          false
        );
        vehicleCount = vehicles ? vehicles.length : 0;
      }

      let subFleets = await this.fmsAccountSvcI.GetSubFleets(
        accountid,
        fleetid,
        false
      );

      let fleetHierarchy = {
        fleetid: fleetInfo.fleetid,
        fleetname: fleetInfo.fleetname,
        noofvehicle: vehicleCount,
        vehicles: vehicles,
        childfleets: [],
      };

      if (subFleets && subFleets.length > 0) {
        for (let subFleet of subFleets) {
          let childHierarchy = await this.buildFleetHierarchyWithVinInfo(
            accountid,
            subFleet.fleetid,
            recursive
          );
          if (childHierarchy) {
            fleetHierarchy.childfleets.push(childHierarchy);
          }
        }
      }

      return fleetHierarchy;
    } catch (error) {
      this.logger.error(
        `Error building hierarchy for fleet ${fleetid}:`,
        error
      );
      try {
        let fleetInfo = await this.fmsAccountSvcI.GetFleetInfo(
          accountid,
          fleetid
        );
        return {
          fleetid: fleetInfo.fleetid,
          fleetname: fleetInfo.fleetname,
          noofvehicle: 0,
          childfleets: [],
        };
      } catch (fallbackError) {
        this.logger.error(
          `Fallback error for fleet ${fleetid}:`,
          fallbackError
        );
        return null;
      }
    }
  };

  AddVehicleToAccountLogic = async (accountid, vehicleinfo, assignedby) => {
    let res = await this.accountSvcI.AddVehicleToAccount(
      accountid,
      vehicleinfo,
      assignedby
    );
    if (!res) {
      this.logger.error("Failed to add vehicle to account");
      throw new Error("Failed to add vehicle to account");
    }
    return { accountid: accountid, fleetid: res.fleetid, vehicle: res.vehicle };
  };

  RemoveVehicleFromAccountLogic = async (accountid, vinno, removedby) => {
    let res = await this.accountSvcI.RemoveVehicleFromAccount(
      accountid,
      vinno,
      removedby
    );
    if (!res) {
      this.logger.error("Failed to remove vehicle from account");
      throw new Error("Failed to remove vehicle from account");
    }
    return { accountid: accountid, vinno: vinno };
  };

  ListAssignableVehiclesLogic = async (accountid) => {
    let vehicles = await this.accountSvcI.GetAssignableVehicles(accountid);
    if (!vehicles) {
      vehicles = [];
    }
    return { vehicles: vehicles };
  };

  formatDateToDDMMMYYYY(date) {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, "0");
    const month = months[d.getMonth()];
    const year = d.getFullYear();

    return `${day} ${month} ${year}`;
  }
}
