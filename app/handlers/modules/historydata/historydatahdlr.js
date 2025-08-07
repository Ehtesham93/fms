import {
  APIResponseInternalErr,
  APIResponseOK,
  APIResponseBadRequest,
  APIResponseUnauthorized,
} from "../../../utils/responseutil.js";
import HistoryDataHdlrImpl from "./historydatahdlr_impl.js";
import { validateAllInputs } from "../../../utils/validationutil.js";
import z from "zod";
import promiserouter from "express-promise-router";
import { AuthenticateAccountTokenFromCookie } from "../../../utils/tokenutil.js";
export default class HistoryDataHdlr {
  constructor(historyDataSvcI, fmsAccountSvcI, logger) {
    this.historyDataHdlrImpl = new HistoryDataHdlrImpl(historyDataSvcI, logger);
    this.fmsAccountSvcI = fmsAccountSvcI;
  }

  // TODO: add permission check for each route
  // TODO: add request validation for each route
  RegisterRoutes(router) {
    const accountTokenGroup = promiserouter();
    accountTokenGroup.use(AuthenticateAccountTokenFromCookie);
    accountTokenGroup.use(this.VerifyUserAccountAccess);

    router.use("/", accountTokenGroup);

    accountTokenGroup.post("/vehicle/:vinno/gps", this.GetGPSHistoryData);
    accountTokenGroup.post("/vehicle/:vinno/can", this.GetCANHistoryData);

    accountTokenGroup.post(
      "/vehicle/:vinno/cangps",
      this.GetMergedCANGPSHistoryData
    );

    accountTokenGroup.post("/vehicle/latestdata", this.GetVehicleLatestData);
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

  GetGPSHistoryData = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        vinno: z
          .string({ message: "Invalid VIN No format" })
          .nonempty({ message: "VIN No is required" })
          .max(128, { message: "VIN No must be at most 128 characters long" }),
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

      let result = await this.historyDataHdlrImpl.GetGPSHistoryDataLogic(
        accountid,
        vinno,
        starttime,
        endtime
      );

      APIResponseOK(req, res, result, "GPS history data listed successfully");
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
          "Failed to get GPS history data"
        );
      }
    }
  };

  GetCANHistoryData = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Acccount ID format" }),
        vinno: z
          .string({ message: "Invalid VIN No format" })
          .nonempty({ message: "Invalid VIN No format" })
          .max(128, { message: "Vin No must be at most 128 characters long" }),
        starttime: z.number({ message: "Start Time must be a number" }),
        endtime: z.number({ message: "End Time must be a number" }),
        canparams: z
          .array(
            z
              .string({ message: "Invalid CAN param format" })
              .min(1, { message: "CAN param cannot be empty" })
              .max(128, {
                message: "CAN param must be at most 128 characters long",
              })
          )
          .min(1, { message: "At least one CAN param is required" })
          .optional(),
      });

      const { accountid, vinno, starttime, endtime, canparams } =
        validateAllInputs(schema, {
          accountid: req.accountid,
          vinno: req.params.vinno,
          starttime: req.body.starttime,
          endtime: req.body.endtime,
          canparams: req.body.canparams,
        });
      let result = await this.historyDataHdlrImpl.GetCANHistoryDataLogic(
        accountid,
        vinno,
        starttime,
        endtime,
        canparams
      );
      APIResponseOK(req, res, result, "CAN history data listed successfully");
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
          "Failed to get CAN history data"
        );
      }
    }
  };

  GetMergedCANGPSHistoryData = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        vinno: z
          .string({ message: "Invalid VIN No format" })
          .nonempty({ message: "VIN No is required" })
          .max(128, { message: "VIN No must be at most 128 characters long" }),
        starttime: z.number({ message: "Start Time must be a number" }),
        endtime: z.number({ message: "End Time must be a number" }),
        canparams: z
          .array(
            z
              .string({ message: "Each CAN param must be a string" })
              .min(1, { message: "CAN param cannot be empty" })
              .max(128, {
                message: "CAN param must be at most 128 characters long",
              })
          )
          .min(1, { message: "At least one CAN param is required" })
          .optional(),
      });

      const { accountid, vinno, starttime, endtime, canparams } =
        validateAllInputs(schema, {
          accountid: req.accountid,
          vinno: req.params.vinno,
          starttime: req.body.starttime,
          endtime: req.body.endtime,
          canparams: req.body.canparams,
        });

      let result =
        await this.historyDataHdlrImpl.GetMergedCANGPSHistoryDataLogic(
          accountid,
          vinno,
          starttime,
          endtime,
          canparams
        );

      if (result instanceof Error) {
        result = [];
      }

      APIResponseOK(
        req,
        res,
        result,
        "Merged CAN+GPS history data listed successfully"
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
          "Failed to get merged CAN+GPS history data"
        );
      }
    }
  };

  GetVehicleLatestData = async (req, res, next) => {
    try {
      let schema = z.object({
        vinnos: z
          .array(
            z
              .string({ message: "VIN No must be a string" })
              .min(1, { message: "VIN No cannot be empty" })
              .max(128, {
                message: "VIN No must be at most 128 characters long",
              })
          )
          .min(1, { message: "VINs array must contain at least one VIN" }),
      });
      let { vinnos } = validateAllInputs(schema, {
        vinnos: req.body.vinnos,
      });

      if (!vinnos || vinnos.length === 0 || !Array.isArray(vinnos)) {
        APIResponseBadRequest(
          req,
          res,
          "VIN_REQUIRED",
          "VINs are required to get latest data"
        );
        return;
      }
      let result = await this.historyDataHdlrImpl.GetVehicleLatestDataLogic(
        vinnos
      );
      APIResponseOK(
        req,
        res,
        result,
        "Vehicle latest data fetched successfully"
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
          "Failed to get vehicle latest data"
        );
      }
    }
  };
}
