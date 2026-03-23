// import { v4 as uuidv4 } from "uuid";
// import { EmailMobileValidation } from "../../../utils/commonutil.js";
// import {
//   CUSTOMER_ACCOUNT_TYPE,
//   PLATFORM_ACCOUNT_ID,
//   PLATFORM_ACCOUNT_TYPE,
//   PLATFORM_ROOT_FLEET_ID,
//   PLATFORM_ROOT_FLEET_PARENT_ID,
//   ROOT_FLEET_NAME,
// } from "../../../utils/constant.js";
// import { publishVehicleUpdate } from "../../../utils/redisnotification.js";

import { preprocessingText } from "../../../utils/commonutil.js";
import { v4 as uuidv4 } from "uuid";

export default class SubscriptionHdlrImpl {
  constructor(subscriptionSvcI, packageSvcI, accountSvcI, historyDataSvcI, pgPoolI, logger, accountHdlr) {
    this.subscriptionSvcI = subscriptionSvcI;
    this.packageSvcI = packageSvcI;
    this.accountSvcI = accountSvcI;
    this.historyDataSvcI = historyDataSvcI;
    this.pgPoolI = pgPoolI;
    this.logger = logger;
    this.accountHdlr = accountHdlr;
  }

  ListSubscriptionsLogic = async (filter) => {
    try {
      let processedfilter = preprocessingText(filter);
      let result = await this.subscriptionSvcI.ListSubscriptions(
        processedfilter
      );
      return result;
    } catch (e) {
      this.logger.error("ListSubscriptionsLogic error: ", e);
      throw e;
    }
  };
  ListSubscriptionFilterCountsLogic = async () => {
    try {
      let result = await this.subscriptionSvcI.ListSubscriptionFilterCounts();
      return result;
    } catch (e) {
      this.logger.error("ListSubscriptionFilterCountsLogic error: ", e);
      throw e;
    }
  };
  CreateSubscriptionIntentLogic = async (
    accountid,
    vinnos,
    userid,
    starttime,
    endtime,
    pkgid
  ) => {
    const originalcount = vinnos.length;
    const uniquevins = [...new Set(vinnos)];

    let result = await this.subscriptionSvcI.CreateSubscriptionIntent(
      accountid,
      uniquevins,
      userid,
      originalcount,
      starttime,
      endtime,
      pkgid
    );
    if (!result) {
      throw new Error("Failed to create subscription intent");
    }
    return result;
  };
  ListPaymentModesLogic = async () => {
    try {
      let result = [
        { name: "Online Payment", mode: "online_payment", isenabled: true },
        { name: "Offline Payment", mode: "offline_payment", isenabled: true },
        { name: "Payment Done", mode: "payment_done", isenabled: true },
      ];
      return result;
    } catch (e) {
      this.logger.error("ListPaymentModesLogic error: ", e);
      throw e;
    }
  };

  CreatePackageLogic = async (accountid, pkgname, pkgtype, pkginfo, isenabled, selectedmodules, deselectedmodules, createdby) => {
    let [txclient, err] = await this.pgPoolI.StartTransaction();
    if (err) {
      throw err;
    }
    try {
      let pkgid = uuidv4();
      let pkg = {
        pkgid: pkgid,
        pkgname: pkgname,
        pkgtype: pkgtype,
        pkginfo: pkginfo,
        isenabled: isenabled,
      };
      let res = await this.packageSvcI.CreatePackageWithTxn(pkg, createdby, txclient);

      if (!res) {
        throw new Error("Failed to create package");
      }

      const success = await this.packageSvcI.UpdatePkgModulesWithTxn(
        pkgid,
        selectedmodules,
        deselectedmodules,
        createdby,
        txclient
      );
      if (!success) {
        throw new Error("Failed to update package modules");
      }
      let addpkgtoaccount = null;

      if(pkgtype === 'custom') {
        addpkgtoaccount = await this.accountSvcI.AddCustomPkgToAccountWithTxn(
          accountid,
          [pkgid],
          createdby,
          txclient
        );
        if (!addpkgtoaccount) {
          throw new Error("Failed to add custom package to account");
        }
      }

      let commitResult = await this.pgPoolI.TxCommit(txclient);
      if (commitResult) {
        throw commitResult;
      }

      return {
        accountid: accountid,
        pkgid: pkgid,
        pkg: pkg,
        selectedmodules: selectedmodules,
        deselectedmodules: deselectedmodules,
        createdby: createdby,
      };
    } catch (e) {
      this.logger.error("CreatePackageLogic error: ", e);
      let rollbackResult = await this.pgPoolI.TxRollback(txclient);
      if (rollbackResult) {
        throw rollbackResult;
      }
      throw e;
    }
  };

  ValidateVinsLogic = async (value, type, accountid) => {
    if (!value || !type) {
      throw new Error("Value and type are required");
    }

    try {
      const result = await this.historyDataSvcI.ValidateVins(
        value,
        type,
        accountid
      );
      return result;
    } catch (error) {
      this.logger.error("Error in ValidateVinsLogic:", error);
      throw error;
    }
  };

  SubscriptionPackageListLogic = async (type, accountid) => {
    if (type === "global") {
      let defaultPkgs = await this.packageSvcI.GetDefaultPackagesWithModules();
      if (!defaultPkgs) {
        defaultPkgs = [];
      }
      let customPkgs = await this.packageSvcI.GetCustomPackagesWithModules();
      if (!customPkgs) {
        customPkgs = [];
      }

      for (let pkg of defaultPkgs) {
        let totalcredits = 0;
        if (pkg.modules && pkg.modules.length > 0) {
          for (let module of pkg.modules) {
            totalcredits += Number(module.creditspervehicleday);
          }
        }
        pkg.totalcredits = totalcredits;
      }

      for (let pkg of customPkgs) {
        let totalcredits = 0;
        if (pkg.modules && pkg.modules.length > 0) {
          for (let module of pkg.modules) {
            totalcredits += Number(module.creditspervehicleday);
          }
        }
        pkg.totalcredits = totalcredits;
      }

      return {
        defaultpkgs: defaultPkgs,
        custompkgs: customPkgs,
      };
    } else if (type === "account" && !accountid) {
      throw new Error("Account ID is required when type is account");
    } else {
      let result = await this.accountHdlr.accountHdlrImpl.GetAccountPkgsLogic(accountid);
      return result;
    } 
  };
  
  CreateSubscriptionLogic = async (accountid, vins, pkgid, startdate, enddate, paymentmode, createdby) => {
    try {
      const subscriptionid = uuidv4();
      const uniquevins = [...new Set(vins)];

      const subscriptioninfo = {
        discountpercent: 0,
        billablecredits: 0,
        billablecost: 0,
      }
      const subscription = {
        subscriptionid: subscriptionid,
        accountid: accountid,
        vins: uniquevins,
        pkgid: pkgid,
        startdate: startdate,
        enddate: enddate,
        paymentmode: paymentmode,
        createdat: Date.now(),
        createdby: createdby,
      }
      let result = await this.subscriptionSvcI.CreateSubscription(subscription);
      return result;
    } catch (e) {
      this.logger.error("CreateSubscriptionLogic error: ", e);
      throw e;
    }
  };

  ListAccountVehiclesLogic = async (accountid, type) => {
    try {
      let result = await this.subscriptionSvcI.ListAccountVehicles(accountid, type);
      return result;
    } catch (e) {
      this.logger.error("ListAccountVehiclesLogic error: ", e);
      throw e;
    }
  };
}
