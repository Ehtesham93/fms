// import { v4 as uuidv4 } from "uuid";
import {
  ACCOUNT_CREATION_CREDITS,
  ACCOUNT_VEHICLE_SUBSCRIPTION_STATE,
  ADMIN_ROLE_ID,
  FLEET_INVITE_EXPIRY_TIME,
  FLEET_INVITE_STATUS,
  FLEET_INVITE_TYPE,
  VEHICLE_ACTION,
  VIEW_ROLE_ID,
  ADMIN_PERMISSION,
  VIEW_PERMISSION,
  NEGATIVE_CREDIT_THRESHOLD,
} from "../../../utils/constant.js";
// import {
//   getInviteEmailTemplate,
//   isRedundantInvite,
//   markInviteAsExpired,
//   updateInviteExpiryAndSendEmail,
// } from "../../../utils/inviteUtil.js";
import { formatEpochToDateTime } from "../../../utils/epochconverter.js";
import ClickHouseClient from "../../../utils/clickhouse.js";

export default class SubscriptionSvcDB {
  constructor(pgPoolI, logger, config) {
    this.pgPoolI = pgPoolI;
    this.logger = logger;
    this.clickHouseClient = new ClickHouseClient();
    this.config = config;
  }

  async getLastestGpsDataForVehicles(vinnos) {
    if (!vinnos || vinnos.length === 0) {
      return {};
    }

    try {
      const vinList = vinnos.map((vin) => `'${vin}'`).join(",");
      const query = `
        SELECT vin, utctime
        FROM lmmdata_latest.gpsdatalatest
        WHERE vin IN (${vinList})
      `;

      const result = await this.clickHouseClient.query(query);

      if (!result.success) {
        this.logger.error(
          "Failed to query ClickHouse for GPS data:",
          result.error
        );
        return {};
      }

      const gpsDataMap = {};
      for (let row of result.data) {
        gpsDataMap[row.vin] = row.utctime;
      }

      return gpsDataMap;
    } catch (error) {
      this.logger.error("Error fetching latest GPS data:", error);
      return {};
    }
  }

  listSubscriptionFilterCounts = async () => {
    try {
      const query = `
                       SELECT 
                            COUNT(DISTINCT a.accountid) AS total,
                            COUNT(DISTINCT a.accountid) FILTER (
                                WHERE ass.isactive = true
                                AND ass.statusdescription = 'ACTIVE' 
                                AND s.enddate > NOW()
                            ) AS active,

                            COUNT(DISTINCT a.accountid) FILTER (
                                WHERE ass.accountid IS NULL
                                OR ass.statusdescription != 'ACTIVE' 
                                OR s.enddate < NOW()
                            ) AS inactive,

                            COUNT(DISTINCT a.accountid) FILTER (
                                WHERE ass.isactive = true
                                AND ass.statusdescription = 'ACTIVE' 
                                AND s.enddate < NOW()
                            ) AS expired,

                            COUNT(DISTINCT a.accountid) FILTER (
                                WHERE ass.isactive = true
                                AND ass.statusdescription = 'ACTIVE' 
                                AND s.enddate > NOW()
                                AND s.enddate <= NOW() + INTERVAL '2 weeks'
                            ) AS upforrenewal

                        FROM account a
                        LEFT JOIN account_subscription_status ass 
                            ON ass.accountid = a.accountid
                        LEFT JOIN subscription s 
                            ON s.subscriptionid = ass.subscriptionid
                        WHERE a.isdeleted = false
                        AND a.isenabled = true AND a.accountcategory != 'individual'
      `;
      const result = await this.pgPoolI.Query(query);
      return result.rows[0];
    } catch (e) {
      this.logger.error("listSubscriptionFilterCounts error: ", e);
      throw e;
    }
  };

  listSubscriptions = async (filter) => {
    try {
      const query = `
        WITH subscription_data AS (
                  SELECT 
                    a.accountid,
                    a.accountname,
                    s.subscriptionid,
                    COUNT(DISTINCT avs.vinno) AS noofvehicles,
                    s.enddate AS subscriptionvalidity,
                    p.pkgname AS subscriptionplan,
                    ac.credits AS credits,
                    ass.isactive AS account_status
                  FROM account a
                  LEFT JOIN account_vehicle_subscription avs 
                    ON avs.accountid = a.accountid
                  LEFT JOIN account_subscription_status ass 
                    ON ass.accountid = a.accountid
                  LEFT JOIN subscription s 
                    ON s.subscriptionid = ass.subscriptionid
                  LEFT JOIN account_package_subscription aps 
                    ON aps.accountid = a.accountid
                  LEFT JOIN package p 
                    ON p.pkgid = aps.pkgid
                  LEFT JOIN account_credits ac 
                    ON ac.accountid = a.accountid
                  WHERE a.isdeleted = false
                    AND a.isenabled = true 
                    AND a.accountcategory != 'individual'
                  GROUP BY a.accountid, a.accountname, s.subscriptionid, s.enddate, p.pkgname, ac.credits, ass.isactive
                )
                SELECT *,
                  CASE
                    WHEN account_status = true
                      AND subscriptionvalidity > NOW()
                      AND subscriptionvalidity <= NOW() + INTERVAL '2 weeks'
                      THEN 'UPFORRENEWAL'
                    WHEN account_status = true
                      AND subscriptionvalidity > NOW()
                      THEN 'ACTIVE'
                    WHEN account_status = true
                      AND subscriptionvalidity < NOW()
                      THEN 'EXPIRED'
                    ELSE 'INACTIVE'
                  END AS subscriptionstatus
                FROM subscription_data
                WHERE
                  ($1 = 'ALL')
                  OR (
                    CASE
                      WHEN account_status = true
                        AND subscriptionvalidity > NOW()
                        AND subscriptionvalidity <= NOW() + INTERVAL '2 weeks'
                        THEN 'UPFORRENEWAL'
                      WHEN account_status = true
                        AND subscriptionvalidity > NOW()
                        THEN 'ACTIVE'
                      WHEN account_status = true
                        AND subscriptionvalidity < NOW()
                        THEN 'EXPIRED'
                      ELSE 'INACTIVE'
                    END = $1
                  )
      `;

      const result = await this.pgPoolI.Query(query, [filter]);
      return result.rows;
    } catch (e) {
      this.logger.error("listSubscriptions error: ", e);
      throw e;
    }
  };

  oldListSubscriptions = async () => {
    try {
      const query = `SELECT 
                            a.accountid,
                            a.accountname,
                            COUNT(DISTINCT avs.vinno) AS noofvehicles,

                            gen_random_uuid() AS subscriptionid,  -- or uuid_generate_v4()

                            CASE 
                                WHEN avs.state = 1 AND avs.endsat > NOW() 
                                    AND avs.endsat <= NOW() + INTERVAL '2 weeks'
                                    THEN 'Upforrenewal'

                                WHEN avs.state = 1 AND avs.endsat > NOW() 
                                    THEN 'Active'

                                WHEN avs.state = 1 AND avs.endsat < NOW() 
                                    THEN 'Expired'

                                WHEN avs.accountid IS NULL 
                                    OR avs.state != 1 
                                    THEN 'Inactive'

                            END AS subscriptionstatus,

                            p.pkgname AS subscriptionplan,
                            avs.endsat AS subscriptionvalidity,
                            ac.credits AS credits

                        FROM account a
                        LEFT JOIN account_vehicle_subscription avs 
                            ON avs.accountid = a.accountid
                        LEFT JOIN account_package_subscription aps 
                            ON aps.accountid = a.accountid
                        LEFT JOIN package p 
                            ON p.pkgid = aps.pkgid
                        LEFT JOIN account_credits ac 
                            ON ac.accountid = a.accountid

                        WHERE a.isdeleted = false
                        AND a.isenabled = true AND a.accountcategory = 'corporate'

                        GROUP BY 
                            a.accountid, 
                            a.accountname,
                            avs.state,
                            avs.endsat, 
                            p.pkgname,
                            ac.credits,
                            avs.accountid

                   `;
      const result = await this.pgPoolI.Query(query);
      const filterCounts = await this.oldSubscriptionListFilterCounts();
      return {
        activesubscriptions: filterCounts.active,
        inactivesubscriptions: filterCounts.inactive,
        upforrenewal: filterCounts.upforrenewal,
        expiredsubscriptions: filterCounts.expired,
        subscriptions: result.rows,
      };
    } catch (e) {
      this.logger.error("listSubscriptions error: ", e);
      throw e;
    }
  };

  oldSubscriptionListFilterCounts = async () => {
    try {
      const query = ` SELECT 
                            COUNT(DISTINCT a.accountid) FILTER (
                                WHERE avs.state = 1 
                                AND avs.endsat > NOW()
                            ) AS active,

                            COUNT(DISTINCT a.accountid) FILTER (
                                WHERE avs.accountid IS NULL
                                OR avs.state != 1 
                                OR avs.endsat < NOW()
                            ) AS inactive,

                            COUNT(DISTINCT a.accountid) FILTER (
                                WHERE avs.state = 1 
                                AND avs.endsat < NOW()
                            ) AS expired,

                            COUNT(DISTINCT a.accountid) FILTER (
                                WHERE avs.state = 1 
                                AND avs.endsat > NOW()
                                AND avs.endsat <= NOW() + INTERVAL '2 weeks'
                            ) AS upforrenewal

                        FROM account a
                        LEFT JOIN account_vehicle_subscription avs 
                            ON avs.accountid = a.accountid
                        WHERE a.isdeleted = false
                        AND a.isenabled = true AND a.accountcategory = 'corporate'
                `;
      const result = await this.pgPoolI.Query(query);
      return result.rows[0];
    } catch (e) {
      this.logger.error("subscriptionListFilterCounts error: ", e);
      throw e;
    }
  };

  async createSubscriptionIntent(
    accountid,
    vinnos,
    userid,
    originalcount,
    starttime,
    endtime,
    pkgid
  ) {
    try {
      const vinResults = [];

      const start = new Date(starttime);
      const endOfPeriod = new Date(endtime);

      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(endOfPeriod.getTime()) ||
        endOfPeriod <= start
      ) {
        throw new Error("Invalid subscription period");
      }

      const MS_IN_DAY = 1000 * 60 * 60 * 24;
      const now = new Date();

      const newVehicleDays = Math.max(
        0,
        Math.ceil((endOfPeriod.getTime() - start.getTime()) / MS_IN_DAY)
      );

      let existingVehicleDays = 0;

      // 1) Validate VINs belong to account (parameterized array)
      let query = `
        SELECT vinno
        FROM fleet_vehicle
        WHERE accountid = $1 AND vinno = ANY($2::text[])
      `;
      let result = await this.pgPoolI.Query(query, [accountid, vinnos]);

      const foundVins = result.rows.map((row) => row.vinno);
      const foundSet = new Set(foundVins);

      const missingVins = vinnos.filter((vin) => !foundSet.has(vin));
      for (const vinno of missingVins) {
        vinResults.push({
          vinno,
          status: "error",
          statuscode: 3,
          reason: "vehicle_not_found_in_account",
          message: "Vehicle not found in account",
          details: {},
        });
      }

      // 2) Active subscription id
      query = `
        SELECT subscriptionid
        FROM account_subscription_status
        WHERE accountid = $1 AND isactive = true
      `;
      result = await this.pgPoolI.Query(query, [accountid]);

      let subscriptionid = result.rows.length
        ? result.rows[0].subscriptionid
        : null;

      // 3) Already subscribed VINs among requested VINs (parameterized array)
      let alreadySubscribedRequestedVins = [];
      const alreadySubscribedSet = new Set();

      if (subscriptionid) {
        query = `
          SELECT vinno
          FROM account_vehicle_subscription
          WHERE accountid = $1
            AND subscriptionid = $2
            AND status = 1
            AND vinno = ANY($3::text[])
        `;
        result = await this.pgPoolI.Query(query, [
          accountid,
          subscriptionid,
          vinnos,
        ]);

        alreadySubscribedRequestedVins = result.rows.map((row) => row.vinno);
        for (const v of alreadySubscribedRequestedVins)
          alreadySubscribedSet.add(v);

        existingVehicleDays = Math.max(
          0,
          Math.ceil((endOfPeriod.getTime() - now.getTime()) / MS_IN_DAY)
        );

        for (const vinno of alreadySubscribedRequestedVins) {
          vinResults.push({
            vinno,
            status: "error",
            statuscode: 3,
            reason: "vehicle_already_subscribed",
            message: "Vehicle already subscribed",
            details: {},
          });
        }
      }

      const validVins = vinnos.filter(
        (vin) => foundSet.has(vin) && !alreadySubscribedSet.has(vin)
      );

      // 4) Connectivity check (ONE ClickHouse call, reused later)
      const connectedVehicles = [];
      const disconnectedVehicles = [];
      const lastConnectedAtByVin = {};

      if (validVins.length > 0) {
        const gpsDataMap = await this.getLastestGpsDataForVehicles(validVins);
        const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;

        for (const vinno of validVins) {
          const lastConnectedAt = gpsDataMap[vinno]
            ? parseInt(gpsDataMap[vinno])
            : null;
          lastConnectedAtByVin[vinno] = lastConnectedAt;

          const isConnected = !!(
            lastConnectedAt && lastConnectedAt > twentyFourHoursAgo
          );
          if (isConnected) connectedVehicles.push(vinno);
          else disconnectedVehicles.push(vinno);
        }

        for (const vinno of disconnectedVehicles) {
          vinResults.push({
            vinno,
            status: "error",
            statuscode: 3,
            reason: "vehicle_not_connected",
            message: "Vehicle not connected in last 24 hours",
            details: {
              lastconnectedat: lastConnectedAtByVin[vinno] ?? null,
              isconnected: false,
            },
          });
        }
      }

      // 5) Package credits
      query = `
        SELECT sum(m.creditspervehicleday) as pkgcost, p.pkginfo
        FROM package p
        JOIN package_module pm ON p.pkgid = pm.pkgid
        JOIN module m ON pm.moduleid = m.moduleid
        WHERE p.pkgid = $1 AND m.isenabled = true AND p.isenabled = true
        GROUP BY p.pkgid, p.pkginfo
      `;
      result = await this.pgPoolI.Query(query, [pkgid]);
      if (result.rowCount !== 1) throw new Error("Package not found");

      const pkginfo = result.rows[0].pkginfo;
      const creditPerVehiclePerDay =
        Math.round(Number(result.rows[0].pkgcost) * 100) / 100;

      const creditFactor = pkginfo?.creditfactor || 0;
      const costpervehicleperday = creditPerVehiclePerDay * creditFactor;

      // 6) Existing subscribed VINs (for summary)
      let existingSubscribedVins = [];
      let existingSubscribedCount = 0;

      if (subscriptionid) {
        query = `
          SELECT vinno
          FROM account_vehicle_subscription
          WHERE accountid = $1 AND subscriptionid = $2 AND status = 1
        `;
        result = await this.pgPoolI.Query(query, [accountid, subscriptionid]);

        existingSubscribedVins = result.rows;
        existingSubscribedCount = existingSubscribedVins.length;
      }

      const creditsForAlreadySubscribed =
        Math.round(
          existingSubscribedCount *
            existingVehicleDays *
            creditPerVehiclePerDay *
            100
        ) / 100;

      const costForAlreadySubscribed =
        creditsForAlreadySubscribed * creditFactor;

      const newVehicleCount = connectedVehicles.length;

      const creditsForNewVehicles =
        Math.round(
          newVehicleDays * newVehicleCount * creditPerVehiclePerDay * 100
        ) / 100;

      const costForNewVehicles = creditsForNewVehicles * creditFactor;

      const totalRequiredCredits =
        Math.round(
          (creditsForAlreadySubscribed + creditsForNewVehicles) * 100
        ) / 100;

      const totalRequiredCost = costForAlreadySubscribed + costForNewVehicles;

      const activeSubscribedVins =
        existingVehicleDays > 0
          ? existingSubscribedVins.map((r) => r.vinno)
          : [];

      // 7) Available credits
      query = `SELECT credits FROM account_credits WHERE accountid = $1`;
      result = await this.pgPoolI.Query(query, [accountid]);
      if (result.rowCount !== 1) throw new Error("Account credits not found");

      const availableCredits =
        Math.round(Number(result.rows[0].credits) * 100) / 100;

      const remainingCredits =
        Math.round((availableCredits - creditsForAlreadySubscribed) * 100) /
        100;

      // 8) SUCCESS VIN entries (reuses lastConnectedAtByVin; NO second ClickHouse call)
      for (const vinno of connectedVehicles) {
        vinResults.push({
          vinno,
          status: "success",
          statuscode: 1,
          reason: "can_subscribe",
          message: "Vehicle can be subscribed",
          details: {
            isconnected: true,
            lastconnectedat: lastConnectedAtByVin[vinno] ?? null,
            availablecredits: availableCredits,
            remainingcredits: remainingCredits,
            creditpervehicleperday: creditPerVehiclePerDay,
            costpervehicleperday: costpervehicleperday,
            newvehicledays: newVehicleDays,
          },
        });
      }

      return {
        status: "success",
        statuscode: 1,
        message: "Subscription intent created successfully",
        vinresults: vinResults,
        summary: {
          totalvehicles: vinnos.length,
          maxsubscribablevehicles: newVehicleCount,
          successcount: connectedVehicles.length,
          errorcount: vinResults.filter((r) => r.status === "error").length,
          connectedvehicles: connectedVehicles,
          disconnectedvehicles: disconnectedVehicles,
          availablecredits: availableCredits,
          remainingcredits: remainingCredits,
          creditsforalreadysubscribed: creditsForAlreadySubscribed,
          costforalreadysubscribed: costForAlreadySubscribed,
          creditsfornewvehicles: creditsForNewVehicles,
          costfornewvehicles: costForNewVehicles,
          totalrequiredcredits: totalRequiredCredits,
          totalrequiredcreditscost: totalRequiredCost,
          existingsubscribedcount: existingSubscribedCount,
          activesubscribedcount: activeSubscribedVins.length,
          newvehiclecount: newVehicleCount,
          existingvehicledays: existingVehicleDays,
          newvehicledays: newVehicleDays,
          lastdate: endOfPeriod,
          creditpervehicleperday: creditPerVehiclePerDay,
          costpervehicleperday: costpervehicleperday,
        },
      };
    } catch (error) {
      this.logger.error("Error in createSubscriptionIntent:", error);
      throw error;
    }
  }

  async createSubscription(accountid, vins, pkgid, duration, paymentmode) {
    let currtime = new Date();

    let [txclient, err] = await this.pgPoolI.StartTransaction();
    if (err) {
      throw err;
    }

    try {
      // check if there is an active subscription for this account
      let query = `
                SELECT pkgid FROM account_package_subscription WHERE accountid = $1
            `;
      let result = await txclient.query(query, [accountid]);
      if (result.rowCount !== 0) {
        throw new Error("Account already has an active subscription");
      }

      // check if pkgid is valid custom package
      query = `
                SELECT p.pkgid FROM account_custom_package_options acpo
                JOIN package p ON acpo.pkgid = p.pkgid
                WHERE acpo.accountid = $1 AND acpo.pkgid = $2 AND p.isenabled = $3
            `;
      result = await txclient.query(query, [accountid, pkgid, true]);
      let iscustompkg = true;
      if (result.rowCount !== 1) {
        iscustompkg = false;
      }

      // check if pkgid is valid default package
      query = `
                SELECT p.pkgid FROM package p
                WHERE p.pkgid = $1 AND p.pkgtype = 'standard' AND p.isenabled = $2
            `;
      result = await txclient.query(query, [pkgid, true]);
      let isdefaultpkg = true;
      if (result.rowCount !== 1) {
        isdefaultpkg = false;
      }

      if (!iscustompkg && !isdefaultpkg) {
        throw new Error("Invalid package id");
      }

      // create subscription
      query = `
                INSERT INTO account_package_subscription (accountid, pkgid, subscriptioninfo, createdat, createdby) VALUES ($1, $2, $3, $4, $5)
            `;
      result = await txclient.query(query, [
        accountid,
        pkgid,
        subscriptioninfo,
        currtime,
        createdby,
      ]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to create subscription");
      }

      // add subscription to account_package_subscription_history
      query = `
                INSERT INTO account_package_subscription_history (accountid, pkgid, subscriptioninfo, createdat, createdby) VALUES ($1, $2, $3, $4, $5)
            `;
      result = await txclient.query(query, [
        accountid,
        pkgid,
        subscriptioninfo,
        currtime,
        createdby,
      ]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to create subscription history");
      }

      let commiterr = await this.pgPoolI.TxCommit(txclient);
      if (commiterr) {
        throw commiterr;
      }
      return true;
    } catch (e) {
      let rollbackerr = await this.pgPoolI.TxRollback(txclient);
      if (rollbackerr) {
        throw rollbackerr;
      }
      throw e;
    }
  }

  listAccountVehicles = async (accountid, type) => {
    try {
      let query = ``;
      if (type.toLowerCase() === "all") {
        query = `
          SELECT DISTINCT fv.vinno, COALESCE(v.license_plate, fv.vinno) as regno, vm.modeldisplayname, a.accountname as srcaccountname, a.accountid as srcaccountid
          FROM fleet_vehicle fv
          JOIN vehicle v ON fv.vinno = v.vinno
          JOIN vehicle_model vm ON v.modelcode = vm.modelcode
          LEFT JOIN fleet_vehicle fv1 ON fv.vinno = fv1.vinno AND fv1.isowner = true
          LEFT JOIN account a ON a.accountid = fv1.accountid
          LEFT JOIN account_vehicle_subscription avs ON fv.vinno = avs.vinno AND fv.accountid = avs.accountid
          LEFT JOIN account_subscription_status ass ON avs.accountid = ass.accountid AND avs.subscriptionid = ass.subscriptionid
          WHERE fv.accountid = $1
        `;
      } else if (type.toLowerCase() === "unsubscribed") {
        query = `
          SELECT
              fv.vinno,
              COALESCE(v.license_plate, fv.vinno) AS regno,
              vm.modeldisplayname,
              a.accountname AS srcaccountname,
              a.accountid AS srcaccountid
            FROM fleet_vehicle fv
            JOIN vehicle v
              ON fv.vinno = v.vinno
            JOIN vehicle_model vm
              ON v.modelcode = vm.modelcode
            LEFT JOIN fleet_vehicle fv1
              ON fv.vinno = fv1.vinno
            AND fv1.isowner = true
            LEFT JOIN account a
              ON a.accountid = fv1.accountid
            WHERE fv.accountid = $1
            AND fv.vinno NOT IN (
              SELECT avs.vinno
              FROM account_vehicle_subscription avs
              JOIN account_subscription_status ass
                ON ass.accountid = avs.accountid
              AND ass.subscriptionid = avs.subscriptionid
              WHERE avs.accountid = $1
                AND avs.status = 1
                AND ass.isactive = true
            )
        `;
      } else if (type.toLowerCase() === "subscribed") {
        query = `
          SELECT DISTINCT fv.vinno, COALESCE(v.license_plate, fv.vinno) as regno, vm.modeldisplayname, a.accountname as srcaccountname, a.accountid as srcaccountid
          FROM fleet_vehicle fv
          JOIN vehicle v ON fv.vinno = v.vinno
          JOIN vehicle_model vm ON v.modelcode = vm.modelcode
          LEFT JOIN fleet_vehicle fv1 ON fv.vinno = fv1.vinno AND fv1.isowner = true
          LEFT JOIN account a ON a.accountid = fv1.accountid
          LEFT JOIN account_vehicle_subscription avs ON fv.vinno = avs.vinno AND fv.accountid = avs.accountid
          LEFT JOIN account_subscription_status ass ON avs.accountid = ass.accountid AND avs.subscriptionid = ass.subscriptionid
          WHERE fv.accountid = $1 AND ass.isactive = true AND avs.status = 1
        `;
      }
      let result = await this.pgPoolI.Query(query, [accountid]);
      if (result.rowCount === 0) {
        return [];
      }
      const vins = result.rows.map((vehicle) => vehicle.vinno);
      const gpsDataMap = await this.getLastestGpsDataForVehicles(vins);
      for (const vehicle of result.rows) {
        vehicle.lastconnectedat = gpsDataMap[vehicle.vinno]
          ? formatEpochToDateTime(parseInt(gpsDataMap[vehicle.vinno]))
          : null;
      }
      return result.rows;
    } catch (e) {
      throw e;
    }
  };
}
