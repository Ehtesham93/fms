import promiserouter from "express-promise-router";
import z from "zod";
import {
  APIResponseBadRequest,
  APIResponseInternalErr,
  APIResponseOK,
  APIResponseUnauthorized,
} from "../../../utils/responseutil.js";
import { AuthenticateAccountTokenFromCookie } from "../../../utils/tokenutil.js";
import { validateAllInputs } from "../../../utils/validationutil.js";
import FleetInsightsHdlrImpl from "./fleetinsightshdlr_impl.js";
import RedisSvc from "../../../utils/redissvc.js";
import config from "../../../config/config.js";
import crypto from "crypto";
export default class FleetInsightsHdlr {
  constructor(fleetInsightsSvcI, fmsAccountSvcI, logger) {
    this.fmsAccountSvcI = fmsAccountSvcI;
    this.fleetInsightsHdlrImpl = new FleetInsightsHdlrImpl(
      fleetInsightsSvcI,
      fmsAccountSvcI,
      logger
    );
  }

  // TODO: add permission check for each route
  RegisterRoutes(router) {
    const accountTokenGroup = promiserouter();
    accountTokenGroup.use(AuthenticateAccountTokenFromCookie);
    accountTokenGroup.use(this.VerifyUserAccountAccess);
    router.use("/", accountTokenGroup);

    accountTokenGroup.get("/getallfleets", this.GetAllFleets);
    accountTokenGroup.get("/getaccountoverview", this.GetAccountOverview);
    accountTokenGroup.get("/getfleetage", this.GetFleetAge);
    accountTokenGroup.get("/getfleetanalytics", this.GetFleetAnalytics);
    accountTokenGroup.get("/getfleetutilization", this.GetFleetUtilization);
    accountTokenGroup.get(
      "/fleet/:fleetid/allinsights",
      this.GetAllFleetInsights
    );
    accountTokenGroup.post("/vehicle/allinsights", this.GetAllVehicleInsights);
    accountTokenGroup.post("/vehicle/ecocontribution", this.GetVehicleEcoContribution);
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

  GetAllFleets = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" })
          .optional(),
      });

      let recursive = req.query.recursive
        ? req.query.recursive === "true"
        : false;

      let { accountid, fleetid } = validateAllInputs(schema, {
        accountid: req.accountid,
        fleetid: req.query.fleetid,
      });

      let fleets = await this.fleetInsightsHdlrImpl.GetAllFleetsLogic(
        accountid,
        fleetid,
        recursive
      );

      APIResponseOK(req, res, fleets);
    } catch (err) {
      if (err.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, err.errcode, err.errdata, err.message);
      } else {
        APIResponseInternalErr(req, res, err);
      }
    }
  };

  GetAccountOverview = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" })
          .optional(),
      });
      const { accountid, fleetid } = validateAllInputs(schema, {
        accountid: req.accountid,
        fleetid: req.query.fleetid,
      });

      let recursive = req.query.recursive
        ? req.query.recursive === "true"
        : false;

      let overview = await this.fleetInsightsHdlrImpl.GetAccountOverviewLogic(
        accountid,
        fleetid,
        recursive
      );
      APIResponseOK(req, res, overview);
    } catch (err) {
      if (err.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, err.errcode, err.errdata, err.message);
      } else {
        APIResponseInternalErr(req, res, err);
      }
    }
  };

  GetFleetAge = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" })
          .optional(),
      });
      const { accountid, fleetid } = validateAllInputs(schema, {
        accountid: req.accountid,
        fleetid: req.query.fleetid,
      });

      let recursive = req.query.recursive
        ? req.query.recursive === "true"
        : false;

      let age = await this.fleetInsightsHdlrImpl.GetFleetAgeLogic(
        accountid,
        fleetid,
        recursive
      );
      APIResponseOK(req, res, age);
    } catch (err) {
      if (err.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, err.errcode, err.errdata, err.message);
      } else {
        APIResponseInternalErr(req, res, err);
      }
    }
  };

  GetAllFleetInsights = async (req, res, next) => {
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
      const filter = req.query.filter || "";

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

      result = await this.fleetInsightsHdlrImpl.GetFleetAllAnalytics(
        accountid,
        starttime,
        endtime,
        fleetid,
        recursive,
        filter
      );

      if (result instanceof Error) {
        result = [];
      }
      if (result && Object.keys(result).length > 0) {
        try {
          const [setResult, setError] = await redisSvc.set(redisKey, JSON.stringify(result), 1800);          
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

  GetAllVehicleInsights = async (req, res, next) => {
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
        filter: z.string({ message: "Filter is invalid" }).optional(),
      });

      const { accountid, vinnumbers, starttime, endtime, filter } =
        validateAllInputs(schema, {
          accountid: req.accountid,
          vinnumbers: req.body.vinnumbers,
          starttime: req.body.starttime,
          endtime: req.body.endtime,
          filter: req.body.filter,
        });

      if (starttime >= endtime) {
        APIResponseBadRequest(
          req,
          res,
          "INVALID_TIME_RANGE",
          "starttime must be less than endtime"
        );
        return;
      }

      const hash = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
      const url = req.protocol + "://" + req.get("host") + req.originalUrl;
      const fullUrl = `${url}.${hash}`;
      const redisKey = crypto.createHash('sha256').update(JSON.stringify(fullUrl)).digest('hex');
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

      result = await this.fleetInsightsHdlrImpl.GetVehicleAllAnalytics(
        accountid,
        starttime,
        endtime,
        vinnumbers,
        filter
      );

      if (result && Object.keys(result).length > 0) {
        try {
          const [setResult, setError] = await redisSvc.set(redisKey, JSON.stringify(result), 1800);          
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


  GetVehicleEcoContribution = async (req, res, next) => {
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
        vehiclematric: z
          .boolean({ message: "Vehicle Matric is invalid" })
          .optional(),
      });

      const { accountid, vinnumbers } = validateAllInputs(schema, {
        accountid: req.accountid,
        vinnumbers: req.body.vinnumbers,
        vehiclematric: req.body.vehiclematric,
      });

      const vehiclematric = req.body.vehiclematric || false;

      const analytics = await this.fleetInsightsHdlrImpl.GetVehicleEcoContributionLogic(
        accountid,
        vinnumbers,
        vehiclematric
      );

      APIResponseOK(req, res, analytics, "SUCCESS");
    } catch (err) {
      if (err.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, err.errcode, err.errdata, err.message);
      } else {
        APIResponseInternalErr(req, res, err);
      }
    }
  };

  GetFleetAnalytics = async (req, res, next) => {
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
          fleetid: req.query.fleetid,
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

      const analytics = await this.fleetInsightsHdlrImpl.GetFleetAnalyticsLogic(
        accountid,
        starttime,
        endtime,
        fleetid,
        recursive
      );

      APIResponseOK(req, res, analytics);
    } catch (err) {
      if (err.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, err.errcode, err.errdata, err.message);
      } else {
        APIResponseInternalErr(req, res, err);
      }
    }
  };

  GetFleetUtilization = async (req, res, next) => {
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
          fleetid: req.query.fleetid,
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

      const utilization =
        await this.fleetInsightsHdlrImpl.GetFleetUtilizationLogic(
          accountid,
          fleetid,
          starttime,
          endtime,
          recursive
        );

      APIResponseOK(req, res, utilization);
    } catch (err) {
      if (err.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, err.errcode, err.errdata, err.message);
      } else {
        APIResponseInternalErr(req, res, err);
      }
    }
  };
}
