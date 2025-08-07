import promiserouter from "express-promise-router";
import z from "zod";
import { validateAllInputs } from "../../../app/utils/validationutil.js";
import {
  APIResponseBadRequest,
  APIResponseInternalErr,
  APIResponseOK,
  APIResponseUnauthorized,
} from "../../utils/responseutil.js";
import { AuthenticateUserTokenFromCookie } from "../../utils/tokenutil.js";
import AccountHdlr from "./account/accounthdlr.js";
import ModelHdlr from "./model/modelhdlr.js";
import ModuleHdlr from "./module/modulehdlr.js";
import PackageHdlr from "./pacakge/packagehdlr.js";
import PlatformHdlrImpl from "./platformhdlr_impl.js";
import RoleHdlr from "./role/rolehdlr.js";
import PUserHdlr from "./user/puserhdlr.js";
export default class PlatformHdlr {
  constructor(platformSvcI, userSvcI, authSvcI, fmsAccountSvcI, logger) {
    this.platformSvcI = platformSvcI;
    this.userSvcI = userSvcI;
    this.authSvcI = authSvcI;
    this.fmsAccountSvcI = fmsAccountSvcI;
    this.logger = logger;
    this.platformHdlrImpl = new PlatformHdlrImpl(
      platformSvcI,
      userSvcI,
      authSvcI,
      fmsAccountSvcI,
      logger
    );
    this.moudleHdlr = new ModuleHdlr(
      platformSvcI.getModuleSvc(),
      userSvcI,
      logger
    );
    this.packageHdlr = new PackageHdlr(platformSvcI.getPackageSvc(), logger);
    this.pUserHdlr = new PUserHdlr(
      platformSvcI.getPUserSvc(),
      userSvcI,
      fmsAccountSvcI,
      authSvcI,
      logger
    );
    this.roleHdlr = new RoleHdlr(platformSvcI.getRoleSvc(), logger);
    this.accountHdlr = new AccountHdlr(
      platformSvcI.getAccountSvc(),
      userSvcI,
      authSvcI,
      fmsAccountSvcI,
      logger
    );
    this.modelHdlr = new ModelHdlr(
      platformSvcI.getModelSvc(),
      userSvcI,
      logger
    );
  }

  CheckConsolePermissions = async (req, res, next) => {
    try {
      const userid = req.userid;

      let consolePerms = await this.userSvcI.GetConsolePerms(userid);
      let showConsole = false;

      // check if user has console permission
      if (consolePerms && consolePerms.length > 0) {
        showConsole = true;
      }

      if (!showConsole) {
        APIResponseUnauthorized(
          req,
          res,
          "CONSOLE_ACCESS_DENIED",
          null,
          "User does not have console access permissions"
        );
        return;
      }

      next();
    } catch (error) {
      this.logger.error("Console permission check failed", error);
      APIResponseInternalErr(
        req,
        res,
        "CONSOLE_PERMISSION_CHECK_ERR",
        error.toString(),
        "Console permission check failed"
      );
    }
  };

  // TODO: add permission check for each route
  RegisterRoutes(router) {
    // models
    // added this in the top to avoid check console permission for model routes
    let modelRouter = promiserouter();
    modelRouter.use(AuthenticateUserTokenFromCookie);
    this.modelHdlr.RegisterRoutes(modelRouter);
    router.use("/model", modelRouter);

    const authRouter = promiserouter();
    authRouter.use(AuthenticateUserTokenFromCookie);
    authRouter.use(this.CheckConsolePermissions);
    router.use("/", authRouter);

    // console
    authRouter.get("/home", this.GetConsoleHomePage);
    authRouter.get("/modules", this.GetConsoleModules);

    // vehicles - only super admin and SOP APIs
    authRouter.post("/vehicle/create", this.CreateVehicle);
    authRouter.post("/vehicle/add", this.AddVehicleToCustomFleet);
    authRouter.put("/vehicle/:vinno/info", this.UpdateVehicleInfo);

    // module
    let moduleRouter = promiserouter();
    moduleRouter.use(AuthenticateUserTokenFromCookie);
    this.moudleHdlr.RegisterRoutes(moduleRouter);
    router.use("/module", moduleRouter);

    // packages
    let packageRouter = promiserouter();
    packageRouter.use(AuthenticateUserTokenFromCookie);
    this.packageHdlr.RegisterRoutes(packageRouter);
    router.use("/pkg", packageRouter);

    //roles
    let roleRouter = promiserouter();
    roleRouter.use(AuthenticateUserTokenFromCookie);
    this.roleHdlr.RegisterRoutes(roleRouter);
    router.use("/role", roleRouter);

    // users
    let pUserRouter = promiserouter();
    pUserRouter.use(AuthenticateUserTokenFromCookie);
    this.pUserHdlr.RegisterRoutes(pUserRouter);
    router.use("/user", pUserRouter);

    // accounts
    let accountRouter = promiserouter();
    accountRouter.use(AuthenticateUserTokenFromCookie);
    this.accountHdlr.RegisterRoutes(accountRouter);
    router.use("/account", accountRouter);
  }

  GetConsoleHomePage = async (req, res, next) => {
    try {
      let schema = z.object({
        userid: z
          .string({ message: "User ID is required" })
          .uuid({ message: "Invalid User ID format" }),
      });

      let { userid } = validateAllInputs(schema, {
        userid: req.userid,
      });

      let result = await this.platformHdlrImpl.GetConsolePermissionsLogic(
        userid
      );
      APIResponseOK(req, res, result, "Console home page fetched successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "GET_CONSOLE_HOME_PAGE_ERR",
          e.toString(),
          "Get console home page failed"
        );
      }
    }
  };

  GetConsoleModules = async (req, res, next) => {
    try {
      let schema = z.object({
        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),
      });

      let { userid } = validateAllInputs(schema, {
        userid: req.userid,
      });

      let result = await this.platformHdlrImpl.GetConsoleModulesLogic(userid);

      APIResponseOK(
        req,
        res,
        result,
        "Console permissions fetched successfully"
      );
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "GET_CONSOLE_PERMISSIONS_ERR",
          e.toString(),
          "Get console permissions failed"
        );
      }
    }
  };

  CreateVehicle = async (req, res, next) => {
    try {
      let schema = z.object({
        vinno: z
          .string({ message: "Invalid VIN format" })
          .nonempty({ message: "VIN cannot be empty" })
          .max(128, { message: "VIN must not exceed 128 characters" }),

        modelcode: z
          .string({ message: "Invalid Model Code format" })
          .nonempty({ message: "Model Code cannot be empty" })
          .max(128, { message: "Model Code must not exceed 128 characters" }),

        vehicleinfo: z
          .record(z.any(), { message: "Vehicle Info must be an object" })
          .default({}),

        mobileno: z
          .string({ message: "Invalid Mobile Number format" })
          .regex(/^[6-9]\d{9}$/, {
            message:
              "Mobile number must be exactly 10 digits and start with 6 to 9",
          }),
      });
      let createdby = req.userid;

      let { vinno, modelcode, vehicleinfo, mobileno } = validateAllInputs(
        schema,
        {
          vinno: req.body.vinno,
          modelcode: req.body.modelcode,
          vehicleinfo: req.body.vehicleinfo,
          mobileno: req.body.mobileno,
        }
      );

      let result = await this.platformHdlrImpl.CreateVehicleLogic(
        vinno,
        modelcode,
        vehicleinfo,
        mobileno,
        createdby
      );

      APIResponseOK(req, res, result, "Vehicle created successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "CREATE_VEHICLE_ERR",
          e.toString(),
          "Create vehicle failed"
        );
      }
    }
  };

  AddVehicleToCustomFleet = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" }),
        vinno: z
          .string({ message: "Invalid VIN number" })
          .nonempty({ message: "VIN number cannot be empty" })
          .max(128, { message: "VIN number must not exceed 128 characters" }),
        assignedby: z
          .string({ message: "User ID is required" })
          .uuid({ message: "Invalid User ID format" }),
      });

      let { accountid, fleetid, vinno, assignedby } = validateAllInputs(
        schema,
        {
          ...req.body,
          assignedby: req.userid,
        }
      );

      let result = await this.platformHdlrImpl.AddVehicleToCustomFleetLogic(
        accountid,
        fleetid,
        vinno,
        assignedby
      );

      APIResponseOK(
        req,
        res,
        result,
        "Vehicle added to custom fleet successfully"
      );
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "ADD_VEHICLE_TO_CUSTOM_FLEET_ERR",
          e.toString(),
          "Add vehicle to custom fleet failed"
        );
      }
    }
  };

  UpdateVehicleInfo = async (req, res, next) => {
    try {
      let vinno = req.params.vinno;
      let updatedby = req.userid;

      const { vinno: bodyVinno, ...updateFields } = req.body;

      if (!updateFields || Object.keys(updateFields).length === 0) {
        APIResponseBadRequest(
          req,
          res,
          "NO_UPDATE_FIELDS",
          "No fields provided for update"
        );
        return;
      }

      let result = await this.platformHdlrImpl.UpdateVehicleInfoLogic(
        vinno,
        updateFields,
        updatedby
      );
      APIResponseOK(req, res, result, "Vehicle info updated successfully");
    } catch (e) {
      APIResponseInternalErr(
        req,
        res,
        "UPDATE_VEHICLE_INFO_ERR",
        e.toString(),
        "Update vehicle info failed"
      );
    }
  };
}
