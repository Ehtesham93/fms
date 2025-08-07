import promiserouter from "express-promise-router";
import z from "zod";
import { AuthenticateAccountTokenFromCookie } from "../../../utils/tokenutil.js";
import {
  APIResponseBadRequest,
  APIResponseInternalErr,
  APIResponseOK,
  APIResponseUnauthorized,
} from "../../../utils/responseutil.js";
import { validateAllInputs } from "../../../utils/validationutil.js";
import LivetrackinghdlrImpl from "./livetrackinghdlr_impl.js";

export default class Livetrackinghdlr {
  constructor(livetrackingsvcI, fmsAccountSvcI, logger) {
    this.livetrackingsvcI = livetrackingsvcI;
    this.fmsAccountSvcI = fmsAccountSvcI;
    this.logger = logger;
    this.livetrackingsvcHdlrImpl = new LivetrackinghdlrImpl(
      livetrackingsvcI,
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

    accountTokenGroup.get("/vehicles", this.GetVehicles);
    accountTokenGroup.get("/vehicleinfo", this.GetVehicleInfo);
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

  GetVehicles = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" }),
      });

      let { accountid, fleetid } = validateAllInputs(schema, {
        accountid: req.accountid,
        fleetid: req.query.fleetid,
      });

      let recursiveBool = req.query.recursive === "true";

      let result = await this.livetrackingsvcHdlrImpl.GetVehiclesLogic(
        accountid,
        fleetid,
        recursiveBool
      );

      APIResponseOK(req, res, result, "Vehicles fetched successfully");
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
        APIResponseInternalErr(req, res, error, "Failed to get vehicles");
      }
    }
  };

  GetVehicleInfo = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        vinno: z
          .string({ message: "Invalid VIN format" })
          .nonempty({ message: "Invalid VIN format" })
          .max(128, { message: "Vin No must be at most 128 characters long" }),
      });

      const { accountid, vinno } = validateAllInputs(schema, {
        accountid: req.accountid,
        vinno: req.query.vinno,
      });
      if (!vinno) {
        APIResponseBadRequest(req, res, "VINNO_REQUIRED", "VINNO is required");
        return next(new Error("VINNO is required"));
      }
      let result = await this.livetrackingsvcHdlrImpl.GetVehicleInfoLogic(
        accountid,
        vinno
      );
      APIResponseOK(req, res, result, "Vehicle info fetched successfully");
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
        APIResponseInternalErr(req, res, error, "Failed to get vehicle info");
      }
    }
  };
}
