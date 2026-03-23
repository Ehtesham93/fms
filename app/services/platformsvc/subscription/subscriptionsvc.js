import SubscriptionSvcDB from "./subscriptionsvc_db.js";

export default class SubscriptionSvc {
  constructor(pgPoolI, logger, config) {
    this.pgPoolI = pgPoolI;
    this.logger = logger;
    this.config = config;
    this.subscriptionSvcDB = new SubscriptionSvcDB(pgPoolI, logger, config);
  }

  ListSubscriptionFilterCounts = async () => {
    try {
      let result = await this.subscriptionSvcDB.listSubscriptionFilterCounts();
      return [
        { title: "Total", value: result.total, filter: "all" },
        { title: "Active", value: result.active, filter: "active" },
        { title: "Inactive", value: result.inactive, filter: "inactive" },
        {
          title: "Up for Renewal",
          value: result.upforrenewal,
          filter: "upforrenewal",
        },
        { title: "Expired", value: result.expired, filter: "expired" },
      ];
    } catch (e) {
      this.logger.error("ListSubscriptionFilterCounts error: ", e);
      throw e;
    }
  };

  ListSubscriptions = async (filter) => {
    try {
      let result = await this.subscriptionSvcDB.listSubscriptions(filter);
      return result;
    } catch (e) {
      this.logger.error("ListSubscriptions error: ", e);
      throw e;
    }
  };

  CreateSubscriptionIntent = async (accountid, vinnos, userid, originalcount, starttime, endtime, pkgid) => {
    try {
      let result = await this.subscriptionSvcDB.createSubscriptionIntent(
        accountid,
        vinnos,
        userid,
        originalcount,
        starttime,
        endtime,
        pkgid
      );
      return result;
    } catch (e) {
      this.logger.error("CreateSubscriptionIntent error: ", e);
      throw e;
    }
  };

  CreateSubscription = async (accountid, vins, pkgid, duration, paymentmode) => {
    try {
      let result = await this.subscriptionSvcDB.createSubscription(accountid, vins, pkgid, duration, paymentmode);
      return result;
    } catch (e) {
      this.logger.error("CreateSubscription error: ", e);
      throw e;
    }
  };

  ListAccountVehicles = async (accountid, type) => {
    try {
      let result = await this.subscriptionSvcDB.listAccountVehicles(accountid, type);
      return result;
    } catch (e) {
      throw e;
    }
  };
}
