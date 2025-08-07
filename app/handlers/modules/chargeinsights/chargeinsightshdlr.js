import {
  APIResponseInternalErr,
  APIResponseOK,
  APIResponseBadRequest,
  APIResponseUnauthorized,
} from "../../../utils/responseutil.js";
import { validateAllInputs } from "../../../utils/validationutil.js";
import ChargeinsightshdlrImpl from "./chargeinsightshdlr_impl.js";
import z from "zod";
import promiserouter from "express-promise-router";
import { AuthenticateAccountTokenFromCookie } from "../../../utils/tokenutil.js";
import RedisSvc from "../../../utils/redissvc.js";
import config from "../../../config/config.js";
import crypto from "crypto";
export default class Chargeinsightshdlr {
  constructor(chargeinsightssvcI, fmsAccountSvcI, tripsinsightssvcI, logger) {
    this.chargeinsightssvcI = chargeinsightssvcI;
    this.fmsAccountSvcI = fmsAccountSvcI;
    this.logger = logger;
    this.chargeinsightssvcHdlrImpl = new ChargeinsightshdlrImpl(
      chargeinsightssvcI,
      fmsAccountSvcI,
      tripsinsightssvcI,
      logger
    );
  }

  // TODO: add permission check for each route
  RegisterRoutes(router) {
    const accountTokenGroup = promiserouter();
    accountTokenGroup.use(AuthenticateAccountTokenFromCookie);
    accountTokenGroup.use(this.VerifyUserAccountAccess);
    router.use("/", accountTokenGroup);

    accountTokenGroup.post(
      "/vehicle/:vinno/chargeinsights",
      this.GetChargeInsightsByVehicle
    );
    accountTokenGroup.post(
      "/fleet/:fleetid/chargeinsights",
      this.GetChargeInsightsByFleet
    );
    accountTokenGroup.get(
      "/vehicle/:vinno/chargedistribution",
      this.GetChargeDistributionByVehicle
    );
    accountTokenGroup.get(
      "/fleet/:fleetid/chargedistribution",
      this.GetChargeDistributionByFleet
    );

    accountTokenGroup.post(
      "/vehicle/vehiclechargeinsights",
      this.GetVehicleChargeInsights
    );
    accountTokenGroup.get(
      "/fleet/:fleetid/fleetchargeinsights",
      this.GetFleetChargeInsights
    );
    accountTokenGroup.get(
      "/fleet/:fleetid/chargeinsightsoverview",
      this.GetFleetChargeInsightsOverview
    );
  }

  VerifyUserAccountAccess = async (req, res, next) => {
    try {
      const { accountid, userid } = req;

      if (!accountid || !userid) {
        APIResponseUnauthorized(
          req,
          res,
          "MISSING_CREDENTIALS",
          "Account ID or User ID missing from token"
        );
        return;
      }

      const hasAccess = await this.fmsAccountSvcI.IsUserInAccount(
        accountid,
        userid
      );

      if (!hasAccess) {
        APIResponseUnauthorized(
          req,
          res,
          "ACCESS_DENIED",
          "User does not have access to this account"
        );
        return;
      }

      next();
    } catch (error) {
      this.logger.error("User account access verification failed", error);
      APIResponseInternalErr(
        req,
        res,
        error,
        "Failed to verify user account access"
      );
    }
  };

  GetChargeInsightsByVehicle = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        vinno: z
          .string({ message: "Invalid VIN No format" })
          .nonempty({ message: "Invalid VIN format" })
          .max(128, { message: "Vin NO must be at most 128 characters long" }),
        starttime: z.number({ message: "Start Time must be a number" }),
        endtime: z.number({ message: "End Time must be a number" }),
      });

      let { accountid, vinno, starttime, endtime } = validateAllInputs(schema, {
        accountid: req.accountid,
        vinno: req.params.vinno,
        starttime: req.body.starttime,
        endtime: req.body.endtime,
      });

      let result =
        await this.chargeinsightssvcHdlrImpl.GetChargeInsightsByVehicleLogic(
          accountid,
          vinno,
          starttime,
          endtime
        );
      if (result instanceof Error) {
        result = [];
      }
      APIResponseOK(
        req,
        res,
        result,
        "Vehicle charge insights listed successfully"
      );
    } catch (error) {
      if (error.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(
          req,
          res,
          error.errcode,
          error.errdata,
          error.message
        );
      } else {
        APIResponseInternalErr(
          req,
          res,
          error,
          "Failed to get vehicle charge insights"
        );
      }
    }
  };

  GetChargeInsightsByFleet = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" }),
        starttime: z.number({ message: "Start Time must be a number" }),
        endtime: z.number({ message: "End Time must be a number" }),
      });

      let recursive = req.query.recursive
        ? req.query.recursive === "true"
        : false;

      let { accountid, fleetid, starttime, endtime } = validateAllInputs(
        schema,
        {
          accountid: req.accountid,
          fleetid: req.params.fleetid,
          starttime: req.body.starttime,
          endtime: req.body.endtime,
        }
      );

      let result =
        await this.chargeinsightssvcHdlrImpl.GetChargeInsightsByFleetLogic(
          accountid,
          fleetid,
          starttime,
          endtime,
          recursive
        );

      if (result instanceof Error) {
        result = [];
      }

      APIResponseOK(
        req,
        res,
        result,
        "Fleet charge insights listed successfully"
      );
    } catch (error) {
      if (error.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(
          req,
          res,
          error.errcode,
          error.errdata,
          error.message
        );
      } else {
        APIResponseInternalErr(
          req,
          res,
          error,
          "Failed to get fleet charge insights"
        );
      }
    }
  };

  GetChargeDistributionByVehicle = async (req, res, next) => {
    try {
      let timestamp = req.query.timestamp;
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Account ID must be a valid UUID" }),

        vinno: z
          .string({ message: "Invalid VIN number format" })
          .nonempty({ message: "VIN number is required" })
          .max(128, { message: "VIN number must be at most 128 characters" }),
      });

      let { accountid, vinno } = validateAllInputs(schema, {
        accountid: req.accountid,
        vinno: req.params.vinno,
      });
      if (!timestamp) {
        APIResponseBadRequest(
          req,
          res,
          "MISSING_PARAMETERS",
          "timestamp is required"
        );
        return;
      }

      if (isNaN(Number(timestamp)) || !Number.isInteger(Number(timestamp))) {
        APIResponseBadRequest(
          req,
          res,
          "INVALID_TIMESTAMP",
          "timestamp must be a valid integer"
        );
        return;
      }

      let distribution =
        await this.chargeinsightssvcHdlrImpl.GetChargeDistributionByVehicleLogic(
          accountid,
          vinno,
          timestamp
        );
      APIResponseOK(req, res, distribution);
    } catch (err) {
      if (err.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, err.errcode, err.errdata, err.message);
      } else {
        APIResponseInternalErr(req, res, err);
      }
    }
  };

  GetChargeDistributionByFleet = async (req, res, next) => {
    try {
      let timestamp = req.query.timestamp;
      let recursive = req.query.recursive
        ? req.query.recursive === "true"
        : false;

      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Account ID must be a valid UUID" }),

        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Fleet ID must be a valid UUID" }),
      });

      let { accountid, fleetid } = validateAllInputs(schema, {
        accountid: req.accountid,
        fleetid: req.params.fleetid,
      });
      if (!timestamp) {
        APIResponseBadRequest(
          req,
          res,
          "MISSING_PARAMETERS",
          "timestamp is required"
        );
        return;
      }

      if (isNaN(Number(timestamp)) || !Number.isInteger(Number(timestamp))) {
        APIResponseBadRequest(
          req,
          res,
          "INVALID_TIMESTAMP",
          "timestamp must be a valid integer"
        );
        return;
      }

      let distribution =
        await this.chargeinsightssvcHdlrImpl.GetChargeDistributionByFleetLogic(
          accountid,
          fleetid,
          timestamp,
          recursive
        );
      APIResponseOK(req, res, distribution);
    } catch (err) {
      if (err.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, err.errcode, err.errdata, err.message);
      } else {
        APIResponseInternalErr(req, res, err);
      }
    }
  };

  GetVehicleChargeInsights = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        vinnumbers: z.union([
          z
            .string({ message: "Invalid VIN NO format" })
            .nonempty({ message: "VIN NO is required" })
            .max(128, {
              message: "VIN NO must be at most 128 characters long",
            }),
          z
            .array(
              z
                .string({ message: "Invalid VIN NO format" })
                .nonempty({ message: "VIN NO is required" })
                .max(128, {
                  message: "VIN NO must be at most 128 characters long",
                })
            )
            .nonempty({ message: "At least one VIN NO must be provided" }),
        ]),
        starttime: z.number({ message: "Start Time is invalid" }),
        endtime: z.number({ message: "End Time is invalid" }),
      });

      const { accountid, vinnumbers, starttime, endtime } = validateAllInputs(
        schema,
        {
          accountid: req.accountid,
          vinnumbers: req.body.vinnumbers,
          starttime: req.body.starttime,
          endtime: req.body.endtime,
        }
      );

      if (starttime >= endtime) {
        APIResponseBadRequest(
          req,
          res,
          "INVALID_TIME_RANGE",
          "starttime must be less than endtime"
        );
        return;
      }

      const hash = crypto
        .createHash("sha256")
        .update(JSON.stringify(req.body))
        .digest("hex");
      const url = req.protocol + "://" + req.get("host") + req.originalUrl;
      const fullUrl = `${url}.${hash}`;
      const redisKey = crypto
        .createHash("sha256")
        .update(JSON.stringify(fullUrl))
        .digest("hex");
      const redisSvc = new RedisSvc(config.redis, this.logger);
      let result;

      try {
        const [cachedData, redisError] = await redisSvc.get(redisKey);
        if (redisError) {
          this.logger.error("Redis error:", redisError);
        } else if (cachedData !== null) {
          result = JSON.parse(cachedData);
          APIResponseOK(req, res, result, "SUCCESS");
          return;
        }
      } catch (redisErr) {
        this.logger.error("Redis connection error:", redisErr);
      }

      result =
        await this.chargeinsightssvcHdlrImpl.GetVehicleChargeInsightsLogic(
          accountid,
          vinnumbers,
          starttime,
          endtime
        );

      if (result instanceof Error) {
        result = [];
      }

      if (result && Object.keys(result).length > 0) {
        try {
          const [setResult, setError] = await redisSvc.set(
            redisKey,
            JSON.stringify(result),
            1800
          );
          if (setError) {
            this.logger.error("Failed to cache data:", setError);
          } else {
            console.log("Data cached successfully");
          }
        } catch (cacheErr) {
          this.logger.error("Failed to cache data:", cacheErr);
        }
      }

      APIResponseOK(req, res, result, "SUCCESS");
    } catch (error) {
      if (error.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(
          req,
          res,
          error.errcode,
          error.errdata,
          error.message
        );
      } else {
        APIResponseInternalErr(req, res, error, "Failed to get vehicle trips");
      }
    }
  };

  GetFleetChargeInsights = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" })
          .optional(),
        starttime: z.string({ message: "Start Time is invalid" }),
        endtime: z.string({ message: "End Time is invalid" }),
      });

      const recursive = req.query.recursive
        ? req.query.recursive === "true"
        : false;

      const { accountid, fleetid, starttime, endtime } = validateAllInputs(
        schema,
        {
          accountid: req.accountid,
          fleetid: req.params.fleetid,
          starttime: req.query.starttime,
          endtime: req.query.endtime,
        }
      );

      if (starttime >= endtime) {
        APIResponseBadRequest(
          req,
          res,
          "INVALID_TIME_RANGE",
          "starttime must be less than endtime"
        );
        return;
      }
      let result;
      const fullUrl = req.protocol + "://" + req.get("host") + req.originalUrl;
      const redisKey = `${fullUrl}.${starttime}.${endtime}`;
      const redisSvc = new RedisSvc(config.redis, this.logger);
      try {
        const [cachedData, redisError] = await redisSvc.get(redisKey);
        if (redisError) {
          this.logger.error("Redis error:", redisError);
        } else if (cachedData !== null) {
          result = JSON.parse(cachedData);
          APIResponseOK(req, res, result, "SUCCESS");
          return;
        }
      } catch (redisErr) {
        this.logger.error("Redis connection error:", redisErr);
      }

      result = await this.chargeinsightssvcHdlrImpl.GetFleetChargeInsightsLogic(
        accountid,
        fleetid,
        starttime,
        endtime,
        recursive
      );

      if (result instanceof Error) {
        result = [];
      }
      if (result && Object.keys(result).length > 0) {
        try {
          const [setResult, setError] = await redisSvc.set(
            redisKey,
            JSON.stringify(result),
            1800
          );
          if (setError) {
            this.logger.error("Failed to cache data:", setError);
          } else {
            console.log("Data cached successfully");
          }
        } catch (cacheErr) {
          this.logger.error("Failed to cache data:", cacheErr);
        }
      }

      APIResponseOK(req, res, result, "SUCCESS");
    } catch (err) {
      if (err.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, err.errcode, err.errdata, err.message);
      } else {
        APIResponseInternalErr(req, res, err);
      }
    }
  };

  GetFleetChargeInsightsOverview = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" })
          .optional(),
        starttime: z.string({ message: "Start Time is invalid" }),
        endtime: z.string({ message: "End Time is invalid" }),
      });

      const recursive = req.query.recursive
        ? req.query.recursive === "true"
        : false;

      const { accountid, fleetid, starttime, endtime } = validateAllInputs(
        schema,
        {
          accountid: req.accountid,
          fleetid: req.params.fleetid,
          starttime: req.query.starttime,
          endtime: req.query.endtime,
        }
      );

      if (starttime >= endtime) {
        APIResponseBadRequest(
          req,
          res,
          "INVALID_TIME_RANGE",
          "starttime must be less than endtime"
        );
        return;
      }

      const analytics =
        await this.chargeinsightssvcHdlrImpl.GetFleetChargeInsightsOverviewLogic(
          accountid,
          fleetid,
          starttime,
          endtime,
          recursive
        );

      APIResponseOK(
        req,
        res,
        analytics,
        "charge insights overview retrieved successfully"
      );
    } catch (err) {
      if (err.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, err.errcode, err.errdata, err.message);
      } else {
        APIResponseInternalErr(req, res, err);
      }
    }
  };
}
