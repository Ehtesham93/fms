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
import TripsinsighthdlrImpl from "./tripsinsightshdlr_impl.js";
import RedisSvc from "../../../utils/redissvc.js";
import config from "../../../config/config.js";
import crypto from "crypto";

export default class Tripsinsighthdlr {
  constructor(tripsinsightssvcI, fmsAccountSvcI, logger) {
    this.tripsinsightssvcI = tripsinsightssvcI;
    this.fmsAccountSvcI = fmsAccountSvcI;
    this.logger = logger;
    this.tripsinsightssvcHdlrImpl = new TripsinsighthdlrImpl(
      tripsinsightssvcI,
      fmsAccountSvcI,
      logger
    );
  }

  // TODO: add permission check for each route
  // TODO: add request validation for each route
  RegisterRoutes(router) {
    const accountTokenGroup = promiserouter();
    accountTokenGroup.use(AuthenticateAccountTokenFromCookie);
    accountTokenGroup.use(this.VerifyUserAccountAccess);
    router.use("/", accountTokenGroup);

    accountTokenGroup.post("/vehicle/:vinno/trips", this.GetTripsByVehicle);
    accountTokenGroup.post("/fleet/:fleetid/trips", this.GetTripsByFleet);
    accountTokenGroup.get(
      "/fleet/:fleetid/activevehicles",
      this.GetActiveVehiclesByFleet
    );
    accountTokenGroup.get(
      "/vehicle/:vinno/activevehicledata",
      this.GetActiveVehicleDataByVin
    );
    accountTokenGroup.get(
      "/fleet/:fleetid/fleetutilizationheatmap",
      this.GetFleetUtilizationHeatMap
    );
    accountTokenGroup.get(
      "/vehicle/:vinno/fleetutilizationheatmap",
      this.GetFleetUtilizationHeatMapForVehicle
    );
    accountTokenGroup.get(
      "/fleet/:fleetid/fleetdrivingmode",
      this.GetFleetDrivingMode
    );
    accountTokenGroup.get(
      "/vehicle/:vinno/vehicledrivingmode",
      this.GetVehicleDrivingMode
    );

    accountTokenGroup.get(
      "/fleet/:fleetid/tripreport",
      this.GetFleetTripReport
    );

    accountTokenGroup.post("/vehicle/tripreport", this.GetVehicleTripReport);

    accountTokenGroup.get("/fleet/:fleetid/overview", this.GetFleetOverview);

    accountTokenGroup.get(
      "/fleet/:fleetid/distancereport",
      this.GetFleetDistanceReport
    );
    accountTokenGroup.get(
      "/vehicle/:vinno/distancereport",
      this.GetVehicleDistanceReport
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

  GetTripsByVehicle = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        vinno: z
          .string({ message: "Invalid VIN NO format" })
          .nonempty({ message: "VIN NO is required" })
          .max(128, { message: "VIN NO must be at most 128 characters long" }),
        starttime: z.number({ message: "Start Time must be a number" }),
        endtime: z.number({ message: "End Time must be a number" }),
      });

      const { accountid, vinno, starttime, endtime } = validateAllInputs(
        schema,
        {
          accountid: req.accountid,
          vinno: req.params.vinno,
          starttime: req.body.starttime,
          endtime: req.body.endtime,
        }
      );

      let result = await this.tripsinsightssvcHdlrImpl.GetTripsByVehicleLogic(
        accountid,
        vinno,
        starttime,
        endtime
      );

      if (result instanceof Error) {
        result = [];
      }

      APIResponseOK(req, res, result, "Vehicle trips listed successfully");
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

  GetTripsByFleet = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" }),

        starttime: z.number({ message: "Start Time must be a number" }),
        endtime: z.number({ message: "End Time must be a number" }),
      });

      const { accountid, fleetid, starttime, endtime } = validateAllInputs(
        schema,
        {
          accountid: req.accountid,
          fleetid: req.params.fleetid,
          starttime: req.body.starttime,
          endtime: req.body.endtime,
        }
      );

      let recursive = req.query.recursive
        ? req.query.recursive === "true"
        : false;

      let result = await this.tripsinsightssvcHdlrImpl.GetTripsByFleetLogic(
        accountid,
        fleetid,
        starttime,
        endtime,
        recursive
      );

      if (result instanceof Error) {
        result = [];
      }

      APIResponseOK(req, res, result, "Fleet trips listed successfully");
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
        APIResponseInternalErr(req, res, error, "Failed to get fleet trips");
      }
    }
  };

  GetActiveVehicleDataByVin = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        vinno: z
          .string({ message: "Invalid VIN number format" })
          .nonempty({ message: "VIN number cannot be empty" })
          .max(128, { message: "VIN NO must be at most 128 characters long" }),
        starttime: z
          .string({ message: "Start Time is required" })
          .nonempty({ message: "Start Time cannot be empty" }),
        endtime: z
          .string({ message: "End Time is required" })
          .nonempty({ message: "End Time cannot be empty" }),
      });

      let { accountid, vinno, starttime, endtime } = validateAllInputs(schema, {
        accountid: req.accountid,
        vinno: req.params.vinno,
        starttime: req.query.starttime,
        endtime: req.query.endtime,
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

      let result =
        await this.tripsinsightssvcHdlrImpl.GetActiveVehicleDataByVinLogic(
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
        "Active vehicle data listed successfully"
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
          "Failed to get active vehicle data"
        );
      }
    }
  };

  GetFleetUtilizationHeatMap = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" })
          .optional(),
        starttime: z
          .string({ message: "Start Time is required" })
          .nonempty({ message: "Start Time cannot be empty" }),
        endtime: z
          .string({ message: "End Time is required" })
          .nonempty({ message: "End Time cannot be empty" }),
      });

      let recursive = req.query.recursive
        ? req.query.recursive === "true"
        : false;

      let { accountid, fleetid, starttime, endtime } = validateAllInputs(
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

      let result = await this.tripsinsightssvcHdlrImpl.GetFleetUtilizationLogic(
        accountid,
        fleetid,
        starttime,
        endtime,
        recursive
      );
      if (result instanceof Error) {
        result = [];
      }
      APIResponseOK(req, res, result, "Fleet utilization listed successfully");
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
          "Failed to get fleet utilization"
        );
      }
    }
  };

  GetFleetUtilizationHeatMapForVehicle = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        vinno: z
          .string({ message: "Invalid VIN number format" })
          .nonempty({ message: "VIN number cannot be empty" })
          .max(128, { message: "VIN NO must be at most 128 characters long" }),
        starttime: z
          .string({ message: "Start Time is required" })
          .nonempty({ message: "Start Time cannot be empty" }),
        endtime: z
          .string({ message: "End Time is required" })
          .nonempty({ message: "End Time cannot be empty" }),
      });

      let { accountid, vinno, starttime, endtime } = validateAllInputs(schema, {
        accountid: req.accountid,
        vinno: req.params.vinno,
        starttime: req.query.starttime,
        endtime: req.query.endtime,
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

      let result =
        await this.tripsinsightssvcHdlrImpl.GetFleetUtilizationForVehicleLogic(
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
        "Vehicle utilization listed successfully"
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
          "Failed to get vehicle utilization"
        );
      }
    }
  };

  GetActiveVehiclesByFleet = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" }),
        starttime: z
          .string({ message: "Start Time is required" })
          .nonempty({ message: "Start Time cannot be empty" }),
        endtime: z
          .string({ message: "End Time is required" })
          .nonempty({ message: "End Time cannot be empty" }),
      });

      let recursive = req.query.recursive
        ? req.query.recursive === "true"
        : false;

      let { accountid, fleetid, starttime, endtime } = validateAllInputs(
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

      let result =
        await this.tripsinsightssvcHdlrImpl.GetActiveVehiclesByFleetLogic(
          accountid,
          fleetid,
          starttime,
          endtime,
          recursive
        );
      if (result instanceof Error) {
        result = [];
      }
      APIResponseOK(req, res, result, "Active vehicles listed successfully");
    } catch (error) {
      if (err.errcode === "INPUT_ERROR") {
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
          "Failed to get active vehicles"
        );
      }
    }
  };

  GetFleetDrivingMode = async (req, res, next) => {
    try {
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
        starttime: z
          .string({ message: "Start Time is required" })
          .nonempty({ message: "Start Time cannot be empty" }),
        endtime: z
          .string({ message: "End Time is required" })
          .nonempty({ message: "End Time cannot be empty" }),
      });

      let { accountid, fleetid, starttime, endtime } = validateAllInputs(
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

      let result = await this.tripsinsightssvcHdlrImpl.GetFleetDrivingModeLogic(
        accountid,
        fleetid,
        starttime,
        endtime,
        recursive
      );
      if (result instanceof Error) {
        result = {
          activeVehicles: {},
          drivingModeUsage: {},
          rangeComparison: {},
        };
      }
      APIResponseOK(
        req,
        res,
        result,
        "Fleet driving mode data listed successfully"
      );
    } catch (error) {
      if (err.errcode === "INPUT_ERROR") {
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
          "Failed to get fleet driving mode data"
        );
      }
    }
  };

  GetVehicleDrivingMode = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID" })
          .uuid({ message: "Account ID must be a valid UUID" }),

        vinno: z
          .string({ message: "VIN number is required" })
          .nonempty({ message: "VIN number cannot be empty" })
          .max(128, { message: "VIN number must be at most 128 characters" }),

        starttime: z
          .string({ message: "Start time is required" })
          .nonempty({ message: "Start time cannot be empty" }),

        endtime: z
          .string({ message: "End time is required" })
          .nonempty({ message: "End time cannot be empty" }),
      });

      let { accountid, vinno, starttime, endtime } = validateAllInputs(schema, {
        accountid: req.accountid,
        vinno: req.params.vinno,
        starttime: req.query.starttime,
        endtime: req.query.endtime,
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

      let result =
        await this.tripsinsightssvcHdlrImpl.GetVehicleDrivingModeLogic(
          accountid,
          vinno,
          starttime,
          endtime
        );
      if (result instanceof Error) {
        result = {
          activeVehicles: {},
          drivingModeUsage: {},
          rangeComparison: {},
        };
      }
      APIResponseOK(
        req,
        res,
        result,
        "Vehicle driving mode data listed successfully"
      );
    } catch (err) {
      if (err.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, err.errcode, err.errdata, err.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          err,
          "Failed to get vehicle driving mode data"
        );
      }
    }
  };

  GetVehicleTripReport = async (req, res, next) => {
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

      result =
        await this.tripsinsightssvcHdlrImpl.GetVehicleTripReportLogic(
          vinnumbers,
          starttime,
          endtime
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

  GetFleetTripReport = async (req, res, next) => {
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
      result = await this.tripsinsightssvcHdlrImpl.GetFleetTripReportLogic(
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

  GetFleetOverview = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" }),
        starttime: z.string({ message: "Start Time is invalid" }),
        endtime: z.string({ message: "End Time is invalid" }),
      });

      const { accountid, fleetid, starttime, endtime } = validateAllInputs(
        schema,
        {
          accountid: req.accountid,
          fleetid: req.params.fleetid,
          starttime: req.query.starttime,
          endtime: req.query.endtime,
        }
      );

      let recursive = req.query.recursive
        ? req.query.recursive === "true"
        : false;

      if (starttime >= endtime) {
        APIResponseBadRequest(
          req,
          res,
          "INVALID_TIME_RANGE",
          "starttime must be less than endtime"
        );
        return;
      }

      let result = await this.tripsinsightssvcHdlrImpl.GetFleetOverviewLogic(
        accountid,
        fleetid,
        starttime,
        endtime,
        recursive
      );

      if (result instanceof Error) {
        result = {
          insights: [],
        };
      }

      APIResponseOK(
        req,
        res,
        result,
        "Tripinsights overview retrieved successfully"
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
          "Failed to get tripinsights overview"
        );
      }
    }
  };

  GetFleetDistanceReport = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" }),
        starttime: z.string({ message: "Start Time is invalid" }),
        endtime: z.string({ message: "End Time is invalid" }),
      });

      const { accountid, fleetid, starttime, endtime } = validateAllInputs(
        schema,
        {
          accountid: req.accountid,
          fleetid: req.params.fleetid,
          starttime: req.query.starttime,
          endtime: req.query.endtime,
        }
      );

      let recursive = req.query.recursive
        ? req.query.recursive === "true"
        : false;

      if (starttime >= endtime) {
        APIResponseBadRequest(
          req,
          res,
          "INVALID_TIME_RANGE",
          "starttime must be less than endtime"
        );
        return;
      }

      let result =
        await this.tripsinsightssvcHdlrImpl.GetFleetDistanceReportLogic(
          accountid,
          fleetid,
          starttime,
          endtime,
          recursive
        );

      if (result instanceof Error) {
        result = {
          totalvehicles: 0,
          totaltrips: 0,
          daterange: {},
          dailydata: {},
        };
      }

      APIResponseOK(
        req,
        res,
        result,
        "Fleet distance report retrieved successfully"
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
          "Failed to get fleet distance report"
        );
      }
    }
  };

  GetVehicleDistanceReport = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        vinno: z
          .string({ message: "Invalid VIN number format" })
          .nonempty({ message: "VIN number cannot be empty" })
          .max(128, { message: "VIN NO must be at most 128 characters long" }),
        starttime: z.string({ message: "Start Time is invalid" }),
        endtime: z.string({ message: "End Time is invalid" }),
      });

      const { accountid, vinno, starttime, endtime } = validateAllInputs(
        schema,
        {
          accountid: req.accountid,
          vinno: req.params.vinno,
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

      let result =
        await this.tripsinsightssvcHdlrImpl.GetVehicleDistanceReportLogic(
          accountid,
          vinno,
          starttime,
          endtime
        );

      if (result instanceof Error) {
        result = {
          totalvehicles: 0,
          totaltrips: 0,
          daterange: {},
          dailydata: {},
        };
      }

      APIResponseOK(
        req,
        res,
        result,
        "Vehicle distance report retrieved successfully"
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
          "Failed to get vehicle distance report"
        );
      }
    }
  };
}
