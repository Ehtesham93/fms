import crypto from "crypto";
import { UAParser } from "ua-parser-js";
import z from "zod";

import {
  ADMIN_ROLE_ID,
  INVITE_RATE_LIMIT_PER_HOUR,
} from "../../../utils/constant.js";
import { CheckUserPerms } from "../../../utils/permissionutil.js";
import {
  APIResponseBadRequest,
  APIResponseError,
  APIResponseForbidden,
  APIResponseInternalErr,
  APIResponseOK,
} from "../../../utils/responseutil.js";
import { validateAllInputs } from "../../../utils/validationutil.js";
import AccountHdlrImpl from "../account/accounthdlr_impl.js";
import SubscriptionHdlrImpl from "./subscriptionhdlr_impl.js";
// import { parseQueryInt } from "../../../utils/commonutil.js";

export default class SubscriptionHdlr {
  constructor(subscriptionSvcI, packageSvcI, accountSvcI, historyDataSvcI, pgPoolI, logger, accountHdlrI) {
    this.subscriptionSvcI = subscriptionSvcI;
    this.packageSvcI = packageSvcI;
    this.accountSvcI = accountSvcI;
    this.historyDataSvcI = historyDataSvcI;
    this.pgPoolI = pgPoolI;
    this.logger = logger;
    this.accountHdlr = accountHdlrI;
    this.subscriptionHdlrImpl = new SubscriptionHdlrImpl(
      subscriptionSvcI,
      packageSvcI,
      accountSvcI,
      historyDataSvcI,
      pgPoolI,
      logger,
      this.accountHdlr,
    );
  }
  

  RegisterRoutes(router) {
    router.get("/listsubscriptions", this.ListSubscriptions);
    router.get("/filtercounts", this.ListSubscriptionFilterCounts);
    router.get("/pkg/list", this.SubscriptionPackageList);
    router.post("/createintent", this.CreateSubscriptionIntent);
    router.get("/paymentmodes", this.ListPaymentModes);
    router.post("/:accountid/pkg", this.CreatePackage);
    router.post("/:accountid/subscription", this.CreateSubscription);
    router.post("/validatevins", this.ValidateVins);
    router.get("/:accountid/vehicles", this.ListAccountVehicles);
  }
  ListSubscriptions = async (req, res, next) => {
    try {
      let schema = z.object({
        filter: z
          .string({ message: "Invalid Filter format" })
          .transform((val) => val.toLowerCase())
          .refine(
            (val) =>
              ["all", "active", "inactive", "upforrenewal", "expired"].includes(
                val
              ),
            { message: "Invalid Filter value" }
          )
          .default("all"),
      });

      let { filter } = validateAllInputs(schema, {
        filter: req.query.filter,
      });
      let result = await this.subscriptionHdlrImpl.ListSubscriptionsLogic(
        filter
      );
      APIResponseOK(req, res, result, "Subscriptions fetched successfully");
    } catch (e) {
      this.logger.error("ListSubscriptions error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "LIST_SUBSCRIPTIONS_ERR",
          e.toString(),
          "List subscriptions failed"
        );
      }
    }
  };
  ListSubscriptionFilterCounts = async (req, res, next) => {
    try {
      let result =
        await this.subscriptionHdlrImpl.ListSubscriptionFilterCountsLogic();
      APIResponseOK(
        req,
        res,
        result,
        "Subscription filter counts fetched successfully"
      );
    } catch (e) {
      this.logger.error("ListSubscriptionFilterCounts error: ", e);
      APIResponseInternalErr(
        req,
        res,
        "LIST_SUBSCRIPTION_FILTER_COUNTS_ERR",
        e.toString(),
        "List subscription filter counts failed"
      );
    }
  };

  CreateSubscriptionIntent = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Account ID is required" })
          .uuid({ message: "Invalid Account ID format" }),
        vinnos: z
          .array(z.string({ message: "VIN No must be a string" }))
          .min(1, { message: "VINs array must contain at least one VIN" }),
        userid: z
          .string({ message: "User ID is required" })
          .uuid({ message: "Invalid User ID format" }),
        starttime: z
          .number({ message: "Start Time must be a number" })
          .min(1000000000000, { message: "Start Time is invalid" })
          .max(9999999999999, {
            message: "Start Time is invalid",
          }),
        endtime: z
          .number({ message: "End Time must be a number" })
          .min(1000000000000, { message: "End Time is invalid" })
          .max(9999999999999, {
            message: "End Time is invalid",
          }),
        pkgid: z
          .string({ message: "Package ID is required" })
          .uuid({ message: "Invalid Package ID format" }),
      });

      let { accountid, vinnos, userid, starttime, endtime, pkgid } =
        validateAllInputs(schema, {
          accountid: req.body.accountid,
          vinnos: req.body.vinnos,
          userid: req.userid,
          starttime: req.body.starttime,
          endtime: req.body.endtime,
          pkgid: req.body.pkgid,
        });
      if (starttime >= endtime) {
        APIResponseBadRequest(
          req,
          res,
          "INVALID_TIME_RANGE",
          {},
          "Start time must be less than end time"
        );
        return;
      }
      let result =
        await this.subscriptionHdlrImpl.CreateSubscriptionIntentLogic(
          accountid,
          vinnos,
          userid,
          starttime,
          endtime,
          pkgid
        );
      APIResponseOK(
        req,
        res,
        result,
        "Subscription intent created successfully"
      );
    } catch (e) {
      this.logger.error("CreateSubscriptionIntent error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "CREATE_SUBSCRIPTION_INTENT_ERR",
          e.toString(),
          "Create subscription intent failed"
        );
      }
    }
  };
  ListPaymentModes = async (req, res, next) => {
    try {
      let result = await this.subscriptionHdlrImpl.ListPaymentModesLogic();
      APIResponseOK(req, res, result, "Payment modes fetched successfully");
    } catch (e) {
      this.logger.error("ListPaymentModes error: ", e);
      APIResponseInternalErr(
        req,
        res,
        "LIST_PAYMENT_MODES_ERR",
        e.toString(),
        "List payment modes failed"
      );
    }
  };

  CreatePackage = async (req, res, next) => {
    // if (!CheckUserPerms(req.userperms, ["consolemgmt.package.admin"])) {
    //   return APIResponseForbidden(
    //     req,
    //     res,
    //     "INSUFFICIENT_PERMISSIONS",
    //     null,
    //     "You don't have permission to create package."
    //   );
    // }
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Account ID is required" })
          .uuid({ message: "Invalid Account ID format" }),
        pkgname: z
          .string({ message: "Package Name must be a string" })
          .nonempty({ message: "Package Name cannot be empty" })
          .max(128, { message: "Package Name must be at most 128 characters" })
          .regex(/^[A-Za-z0-9](?:[A-Za-z0-9 _-]*[A-Za-z0-9])?$/, {
            message:
              "Package Name can only contain letters, numbers, spaces, hyphens, and underscores",
          }),
        pkgtype: z.enum(["custom"], {
          message: "Package type must be 'custom'",
        }).default("custom"),

        pkginfo: z
          .record(z.any(), { message: "Package info must be an object" })
          .optional(),

        selectedmodules: z
          .array(z.string().uuid({ message: "Invalid Module ID format" }).nonempty({ message: "Module ID cannot be empty" }))
          .min(1, { message: "At least one module is required" }),

        deselectedmodules: z
          .array(z.string().uuid({ message: "Invalid Module ID format" }).nonempty({ message: "Module ID cannot be empty" }))
          .min(1, { message: "At least one module is required" }),

        isenabled: z
          .boolean({ message: "isenabled must be a boolean" })
          .optional(),
        createdby: z
          .string({ message: "Createdby ID is required" })
          .uuid({ message: "Createdby ID is required" }),
      });

      const { accountid, pkgname, pkgtype, pkginfo, selectedmodules, deselectedmodules, isenabled, createdby } = validateAllInputs(
        schema,
        {
          accountid: req.params.accountid,
          pkgname: req.body.pkgname,
          pkgtype: req.body.pkgtype,
          pkginfo: req.body.pkginfo,
          selectedmodules: req.body.selectedmodules,
          deselectedmodules: req.body.deselectedmodules,
          isenabled: req.body.isenabled,
          createdby: req.userid,
        }
      );

      const result = await this.subscriptionHdlrImpl.CreatePackageLogic(
        accountid,
        pkgname,
        pkgtype,
        pkginfo || {},
        isenabled !== undefined ? isenabled : true,
        selectedmodules,
        deselectedmodules,
        createdby
      );

      APIResponseOK(req, res, result, "Package created successfully");
    } catch (e) {
      this.logger.error("CreatePackage error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, "INPUT_ERROR", e.errdata, e.message);
      } else if (e.errcode === "PACKAGE_NAME_ALREADY_EXISTS") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "CREATE_PACKAGE_ERR",
          e.toString(),
          "Create package failed"
        );
      }
    }
  };

  ValidateVins = async (req, res, next) => {
    try {
      // if (
      //   !CheckUserPerms(req.userperms, [
      //     "consolemgmt.vehicle.admin",
      //     "consolemgmt.vehicle.view",
      //   ])
      // ) {
      //   return APIResponseForbidden(
      //     req,
      //     res,
      //     "INSUFFICIENT_PERMISSIONS",
      //     null,
      //     "You don't have permission to get vehicle CAN+GPS data."
      //   );
      // }

      let baseSchema = z.object({
        type: z.enum(["vinno", "regno"], {
          message: "Type must be either vinno or regno",
        }),
        accountid: z
          .string({ message: "Account ID is required" })
          .uuid({ message: "Invalid Account ID format" }),
      });

      let schema = null;
      if(req.body.type === "vinno") {
        schema = z.object({
          value: z
            .array(
              z
                .string({ message: "Invalid Value format" })
                .nonempty({ message: "Value cannot be empty" })
                .regex(/^M[AB][A-HJ-NPR-Z0-9]{15}$/, {
                  message: "Please enter a valid Indian VIN number starting with MA",
                }),
            )
            .min(1, { message: "At least one value is required" }),
        }).merge(baseSchema);
      } else if(req.body.type === "regno") {
        schema = z.object({
          value: z
            .array(
              z
                .string({ message: "Invalid Value format" })
                .nonempty({ message: "Value cannot be empty" })
                .regex(/^[A-Za-z][A-Za-z0-9 ]*[A-Za-z0-9]$/, {
                  message: "Value must be a valid Registration number",
                })
                .max(18, { message: "Value must not exceed 18 characters" })
            )
            .min(1, { message: "At least one value is required" }),
        }).merge(baseSchema);
      } else {
        return APIResponseBadRequest(
          req,
          res,
          "INVALID_TYPE",
          null,
          "Type must be either vinno or regno"
        );
      }

      let { value, type, accountid } = validateAllInputs(schema, {
        value: req.body.value,
        type: req.body.type,
        accountid: req.body.accountid,
      });

      let result = await this.subscriptionHdlrImpl.ValidateVinsLogic(
        value,
        type,
        accountid
      );
      APIResponseOK(
        req,
        res,
        result,
        "Vehicle validation completed successfully"
      );
    } catch (e) {
      this.logger.error("ValidateVins error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "VEHICLE_VALIDATION_ERR",
          e.toString(),
          "Vehicle validation failed"
        );
      }
    }
  };

  CreateSubscription = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Account ID is required" })
          .uuid({ message: "Invalid Account ID format" }),
        vins: z
        .array(
          z
            .string({ message: "Invalid VIN format" })
            .nonempty({ message: "VIN cannot be empty" })
            .regex(/^M[AB][A-HJ-NPR-Z0-9]{15}$/, {
              message: "Please enter a valid Indian VIN number starting with MA",
            }),
        )
        .min(1, { message: "At least one VIN is required" }),
        pkgid: z
          .string({ message: "Package ID is required" })
          .uuid({ message: "Invalid Package ID format" }),
        startdate: z
          .number({ message: "Start date is required" })
          .min(1000000000000, { message: "Start date is invalid" })
          .max(9999999999999, {
            message: "Start date is invalid",
          }),
        enddate: z
          .number({ message: "End date is required" })
          .min(1000000000000, { message: "End date is invalid" })
          .max(9999999999999, {
            message: "End date is invalid",
          }),
        paymentmode: z
          .string({ message: "Payment mode is required" }),
        createdby: z
          .string({ message: "Createdby ID is required" })
          .uuid({ message: "Createdby ID is required" }),
      });

      let { accountid, vins, pkgid, startdate, enddate, paymentmode, createdby } = validateAllInputs(schema, {
        accountid: req.body.accountid,
        vins: req.body.vins,
        pkgid: req.body.pkgid,
        startdate: req.body.startdate,
        enddate: req.body.enddate,
        paymentmode: req.body.paymentmode,
        createdby: req.userid,
      });
      if (startdate >= enddate) {
        APIResponseBadRequest(
          req,
          res,
          "INVALID_TIME_RANGE",
          null,
          "Start date must be less than end date"
        );
      }
      let result = await this.subscriptionHdlrImpl.CreateSubscriptionLogic(accountid, vins, pkgid, startdate, enddate, paymentmode, createdby);
      APIResponseOK(req, res, result, "Subscription created successfully");
    } catch (e) {
      this.logger.error("CreateSubscription error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "CREATE_SUBSCRIPTION_ERR",
          e.toString(),
          "Create subscription failed"
        );
      }
    }
  };

  SubscriptionPackageList = async (req, res, next) => {
    try {
      const schema = z.object({
        type: z.enum(["account", "global"], {
          message: "Type must be either account or global",
        }),
        accountid: z
          .string()
          .uuid({ message: "Invalid Account ID format" })
          .optional(),
      });
  
      let { type, accountid } = validateAllInputs(schema, {
        type: req.query.type,
        accountid: req.query.accountid,
      });

      let result = await this.subscriptionHdlrImpl.SubscriptionPackageListLogic(
        type,
        accountid
      );
      APIResponseOK(
        req, 
        res, 
        result, 
        "Subscription package list fetched successfully"
      );
    } catch (e) {
      this.logger.error("SubscriptionPackageList error: ", e);
  
      APIResponseInternalErr(
        req,
        res,
        "SUBSCRIPTION_PACKAGE_LIST_ERR",
        e.toString(),
        "Subscription package list failed"
      );
    }
  };


  ListAccountVehicles = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Account ID is required" })
          .uuid({ message: "Invalid Account ID format" }),
        type: z.enum(["unsubscribed", "subscribed", "all"], {
          message: "Type must be either unsubscribed or subscribed or all",
        }).default("unsubscribed"),
      });
      let { accountid, type } = validateAllInputs(schema, {
        accountid: req.params.accountid,
        type: req.query.type,

      });
      let result = await this.subscriptionHdlrImpl.ListAccountVehiclesLogic(accountid, type);
      APIResponseOK(req, res, result, "Account vehicles fetched successfully");
    }
    catch (e) {
      this.logger.error("ListAccountVehicles error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(req, res, "LIST_UNSUBSCRIBED_VEHICLES_ERR", e.toString(), "List unsubscribed vehicles failed");
      }
    }
  }
}