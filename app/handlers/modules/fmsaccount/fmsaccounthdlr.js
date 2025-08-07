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
import fmsAccountHdlrImpl from "./fmsaccounthdlr_impl.js";

export default class FmsAccountHdlr {
  constructor(fmsAccountSvcI, userSvcI, logger) {
    this.fmsAccountSvcI = fmsAccountSvcI;
    this.fmsAccountHdlrImpl = new fmsAccountHdlrImpl(
      fmsAccountSvcI,
      userSvcI,
      logger
    );
    this.logger = logger;
  }

  // TODO: add permission check for each route
  RegisterRoutes(router) {
    const accountTokenGroup = promiserouter();

    accountTokenGroup.use(AuthenticateAccountTokenFromCookie);
    accountTokenGroup.use(this.VerifyUserAccountAccess);

    router.use("/", accountTokenGroup);

    accountTokenGroup.get("/invites", this.ListInvitesOfAccount);
    accountTokenGroup.post("/invite/cancel", this.CancelEmailInvite);
    accountTokenGroup.post("/invite/send", this.SendUserInvite);
    accountTokenGroup.post("/invite/resend", this.ResendEmailInvite);
    accountTokenGroup.post("/invite/validate", this.ValidateInvite);

    accountTokenGroup.get("/fleets", this.GetAccountFleets);
    accountTokenGroup.get("/modules", this.GetAccountModules);
    accountTokenGroup.get("/chargestationtypes", this.GetChargeStationTypes);

    // fleet management
    accountTokenGroup.post("/fleet", this.CreateFleet);
    accountTokenGroup.get("/fleet/:fleetid", this.GetFleetInfo);
    accountTokenGroup.put("/fleet/:fleetid", this.EditFleet);
    accountTokenGroup.get("/fleet/:fleetid/subfleets", this.GetSubFleets);
    accountTokenGroup.delete("/fleet/:fleetid", this.DeleteFleet);

    // vehicle management
    accountTokenGroup.get("/fleet/:fleetid/vehicles", this.GetVehicles);
    accountTokenGroup.put("/fleet/vehicle/:vehicleid/move", this.MoveVehicle);
    accountTokenGroup.delete(
      "/fleet/:fleetid/vehicle/:vehicleid",
      this.RemoveVehicle
    );
    accountTokenGroup.get(
      "/vehicle/:vehicleid/listmoveablefleets",
      this.ListMoveableFleets
    );
    accountTokenGroup.get("/vehicles/subscribed", this.ListSubscribedVehicles);

    // role management
    accountTokenGroup.post("/role", this.CreateRole);
    accountTokenGroup.put("/role/:roleid", this.UpdateRole);
    accountTokenGroup.get("/roles", this.ListRoles);
    accountTokenGroup.get("/role/:roleid", this.GetRole);
    accountTokenGroup.put("/role/:roleid/perms", this.UpdateRolePerms);
    accountTokenGroup.delete("/role/:roleid", this.DeleteRole);

    // user management
    accountTokenGroup.get("/fleet/:fleetid/users", this.ListUsers);
    accountTokenGroup.get("/fleet/:fleetid/user/:userid", this.GetUserInfo);
    accountTokenGroup.get(
      "/fleet/:fleetid/user/:userid/assignableroles",
      this.GetAssignableRoles
    );
    accountTokenGroup.post("/fleet/:fleetid/assignrole", this.AssignUserRole);
    accountTokenGroup.post(
      "/fleet/:fleetid/deassignrole",
      this.DeassignUserRole
    );
    accountTokenGroup.delete("/user/:userid", this.DeleteUser); //TODO: remove this
    accountTokenGroup.delete("/user/:userid/remove", this.RemoveUser);

    // subscription management
    accountTokenGroup.get("/subscriptions", this.GetAccountSubscriptions);
    accountTokenGroup.post(
      "/subscription/checkchangepkg",
      this.CheckChangeSubscriptionPackage
    );
    accountTokenGroup.post("/subscription", this.UpdateAccountSubscription);
    accountTokenGroup.get("/subscription/history", this.GetSubscriptionHistory);

    // vehicle subscription management
    accountTokenGroup.get(
      "/subscription/vehicles",
      this.GetSubscriptionVehicles
    );
    accountTokenGroup.post(
      "/subscription/intent",
      this.CreateSubscriptionIntent
    );
    accountTokenGroup.post("/subscription/subscribe", this.SubscribeVehicle);
    accountTokenGroup.post(
      "/subscription/unsubscribe",
      this.UnsubscribeVehicle
    );

    accountTokenGroup.post("/tagvehicle", this.TagVehicle);
    accountTokenGroup.put("/untagvehicle", this.UntagVehicle);
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
      this.logger.error(
        `fmsaccounthdlr.VerifyUserAccountAccess: error: ${error}`
      );
      APIResponseInternalErr(
        req,
        res,
        error,
        "Failed to verify user account access"
      );
    }
  };

  ListInvitesOfAccount = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
      });

      let { accountid } = validateAllInputs(schema, {
        accountid: req.accountid,
      });

      let result = await this.fmsAccountHdlrImpl.ListInvitesOfAccountLogic(
        accountid
      );
      APIResponseOK(req, res, result, "Invites listed successfully");
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
          "Failed to list invites of account"
        );
      }
    }
  };

  CancelEmailInvite = async (req, res, next) => {
    try {
      let schema = z.object({
        cancelledby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID is missing in token" }),
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        inviteid: z
          .string({ message: "Invalid Invite ID format" })
          .nonempty({ message: "Invalid Invite ID format" })
          .max(128, {
            message: "Invite ID must be at most 128 characters long",
          }),
      });

      let { cancelledby, accountid, inviteid } = validateAllInputs(schema, {
        cancelledby: req.userid,
        accountid: req.accountid,
        inviteid: req.body.inviteid,
      });

      let result = await this.fmsAccountHdlrImpl.CancelEmailInviteLogic(
        accountid,
        inviteid,
        cancelledby
      );
      APIResponseOK(req, res, result, "Email invite cancelled successfully");
    } catch (error) {
      this.logger.error(
        `fmsaccounthdlr.CancelEmailInvite: error: ${error?.stack}`
      );
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
          "Failed to cancel email invite"
        );
      }
    }
  };

  SendUserInvite = async (req, res, next) => {
    try {
      let schema = z.object({
        invitedby: z
          .string({ message: "User ID is required" })
          .uuid({ message: "Invalid User ID format" }),
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        roleids: z
          .array(
            z
              .string({ message: "Invalid Role IDs format" })
              .nonempty({ message: "Invalid Role ID format" })
          )
          .nonempty({ message: "At least one Role ID is required" }),
        contact: z
          .string({ message: "Invalid Contact format" })
          .nonempty({ message: "Contact cannot be empty" })
          .refine(
            (val) =>
              /^[6-9]\d{9}$/.test(val) ||
              z.string().email().safeParse(val).success,
            {
              message:
                "Contact must be a valid email or Indian mobile number (10 digits starting with 6-9)",
            }
          ),
      });

      let { invitedby, accountid, fleetid, roleids, contact } =
        validateAllInputs(schema, {
          invitedby: req.userid,
          accountid: req.accountid,
          fleetid: req.body.fleetid,
          roleids: req.body.roleids,
          contact: req.body.contact,
        });

      let headerReferer = req.headers.origin;
      let result = await this.fmsAccountHdlrImpl.SendUserInviteLogic(
        accountid,
        fleetid,
        roleids,
        contact,
        invitedby,
        headerReferer
      );
      APIResponseOK(req, res, result, "Email invite sent successfully");
    } catch (error) {
      this.logger.error(
        `fmsaccounthdlr.SendUserInvite: error: ${error?.stack}`
      );
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
          "INVITE_ERR",
          error.errdata,
          error.message
        );
      }
    }
  };

  ResendEmailInvite = async (req, res, next) => {
    try {
      let schema = z.object({
        invitedby: z
          .string({ message: "User ID is required" })
          .uuid({ message: "Invalid User ID format" }),
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        inviteid: z
          .string({ message: "Invalid Invite ID format" })
          .nonempty({ message: "Invalid Invite ID format" })
          .max(128, {
            message: "Invite ID must be at most 128 characters long",
          }),
      });

      let { invitedby, accountid, inviteid } = validateAllInputs(schema, {
        invitedby: req.userid,
        accountid: req.accountid,
        inviteid: req.body.inviteid,
      });

      let headerReferer = req.headers.origin;
      let result = await this.fmsAccountHdlrImpl.ResendEmailInviteLogic(
        accountid,
        inviteid,
        invitedby,
        headerReferer
      );
      APIResponseOK(req, res, result, "Email invite resent successfully");
    } catch (error) {
      this.logger.error(
        `fmsaccounthdlr.ResendEmailInvite: error: ${error?.stack}`
      );
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
          "Failed to resend email invite"
        );
      }
    }
  };

  ValidateInvite = async (req, res, next) => {
    try {
      let schema = z.object({
        inviteid: z
          .string({ message: "Invalid Invite ID format" })
          .nonempty({ message: "Invalid Invite ID format" })
          .max(128, {
            message: "Invite ID must be at most 128 characters long",
          }),
      });

      let { inviteid } = validateAllInputs(schema, {
        inviteid: req.body.inviteid,
      });

      let result = await this.fmsAccountHdlrImpl.ValidateInviteLogic(inviteid);
      APIResponseOK(req, res, result, "Invite validated successfully");
    } catch (error) {
      this.logger.error(
        `fmsaccounthdlr.ValidateInvite: error: ${error?.stack}`
      );
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
          "VALIDATE_INVITE_ERR",
          error.toString(),
          "Validate invite failed"
        );
      }
    }
  };

  GetAccountFleets = async (req, res, next) => {
    try {
      let schema = z.object({
        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User ID format" }),
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
      });

      let { userid, accountid } = validateAllInputs(schema, {
        userid: req.userid,
        accountid: req.accountid,
      });

      let result = await this.fmsAccountHdlrImpl.GetAccountFleetsLogic(
        accountid,
        userid
      );
      APIResponseOK(req, res, result, "Fms Accounts fetched successfully");
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
          "GET_ACCOUNT_FLEETS_ERR",
          error.toString(),
          "Get account fleets failed"
        );
      }
    }
  };

  GetAccountModules = async (req, res, next) => {
    try {
      let schema = z.object({
        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User ID format" }),
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
      });

      let { userid, accountid } = validateAllInputs(schema, {
        userid: req.userid,
        accountid: req.accountid,
      });

      let result = await this.fmsAccountHdlrImpl.GetAccountModulesLogic(
        accountid,
        userid
      );
      APIResponseOK(req, res, result, "FMS permissions fetched successfully");
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
          "GET_FMS_PERMISSIONS_ERR",
          error.toString(),
          "Get fms permissions failed"
        );
      }
    }
  };

  GetChargeStationTypes = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
      });

      let { accountid } = validateAllInputs(schema, {
        accountid: req.accountid,
      });

      let result = await this.fmsAccountHdlrImpl.GetChargeStationTypesLogic(
        accountid
      );
      APIResponseOK(
        req,
        res,
        result,
        "Charge station types fetched successfully"
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
          "GET_CHARGER_STATION_TYPES_ERR",
          error.toString(),
          "Get charge station types failed"
        );
      }
    }
  };

  // fleet management
  CreateFleet = async (req, res, next) => {
    try {
      let schema = z.object({
        createdby: z
          .string({ message: "User ID is required" })
          .uuid({ message: "Invalid User ID format" }),
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        parentfleetid: z
          .string({ message: "Invalid Parent Fleet ID format" })
          .uuid({ message: "Invalid Parent Fleet ID format" }),
        fleetname: z
          .string({ message: "Fleet name is required" })
          .min(1, { message: "Fleet name is required" })
          .regex(/^[A-Za-z0-9 _-]+$/, {
            message:
              "Fleet name can only contain letters, numbers, spaces, hyphens, and underscores",
          })
          .max(128, {
            message: "Fleet name must be at most 128 characters long",
          })
          .regex(/^[^\/]*$/, { message: "Fleet name should not contain '/'" }),
      });

      let { createdby, accountid, parentfleetid, fleetname } =
        validateAllInputs(schema, {
          createdby: req.userid,
          accountid: req.accountid,
          parentfleetid: req.body.parentfleetid,
          fleetname: req.body.fleetname,
        });

      if (fleetname.includes("/")) {
        return APIResponseBadRequest(
          req,
          res,
          "INVALID_FLEET_NAME",
          null,
          "Fleet name should not have forward slash"
        );
      }

      let result = await this.fmsAccountHdlrImpl.CreateFleetLogic(
        accountid,
        parentfleetid,
        fleetname,
        createdby
      );

      APIResponseOK(req, res, result, "Fleet created successfully");
    } catch (error) {
      if (error.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(
          req,
          res,
          error.errcode,
          error.errdata,
          error.message
        );
      }

      APIResponseInternalErr(
        req,
        res,
        "CREATE_FLEET_ERR",
        error.toString(),
        "Failed to create fleet"
      );
    }
  };

  GetFleetInfo = async (req, res, next) => {
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
        fleetid: req.params.fleetid,
      });

      let result = await this.fmsAccountHdlrImpl.GetFleetInfoLogic(
        accountid,
        fleetid
      );
      APIResponseOK(req, res, result, "Fleet info fetched successfully");
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
          "GET_FLEET_INFO_ERR",
          error.toString(),
          "Get fleet info failed"
        );
      }
    }
  };

  EditFleet = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" }),

        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User ID format" }),

        fleetname: z
          .string({ message: "Fleet name is required" })
          .min(1, { message: "Fleet name is required" })
          .max(128, {
            message: "Fleet name must be at most 128 characters long",
          })
          .regex(/^[A-Za-z0-9 _-]+$/, {
            message:
              "Fleet Name can only contain letters, numbers, spaces, hyphens, and underscores",
          }),

        fleetinfo: z
          .record(z.any(), { message: "Fleet info must be an object" })
          .optional(),
      });

      let { accountid, fleetid, userid, fleetname, fleetinfo } =
        validateAllInputs(schema, {
          accountid: req.accountid,
          fleetid: req.params.fleetid,
          fleetname: req.body.fleetname,
          fleetinfo: req.body.fleetinfo,
          userid: req.userid,
        });

      const updateFields = {};
      if (fleetname !== undefined) updateFields.name = fleetname;
      if (fleetinfo !== undefined) updateFields.fleetinfo = fleetinfo;

      if (Object.keys(updateFields).length === 0) {
        APIResponseBadRequest(
          req,
          res,
          "NO_UPDATE_FIELDS",
          "No fields provided for update"
        );
        return;
      }

      let result = await this.fmsAccountHdlrImpl.EditFleetLogic(
        accountid,
        fleetid,
        updateFields,
        userid
      );

      APIResponseOK(req, res, result, "Fleet edited successfully");
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
          "EDIT_FLEET_ERR",
          error.toString(),
          "Edit fleet failed"
        );
      }
    }
  };

  GetSubFleets = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" }),
      });

      const recursive = req.query.recursive === "true";

      const { accountid, fleetid } = validateAllInputs(schema, {
        accountid: req.accountid,
        fleetid: req.params.fleetid,
      });

      const result = await this.fmsAccountHdlrImpl.GetSubFleetsLogic(
        accountid,
        fleetid,
        recursive
      );

      APIResponseOK(req, res, result, "Subfleets fetched successfully");
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
          "GET_SUBFLEETS_ERR",
          error.toString(),
          "Get subfleets failed"
        );
      }
    }
  };

  DeleteFleet = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Fleet ID must be a valid UUID" }),

        deletedby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),
      });

      const { accountid, fleetid, deletedby } = validateAllInputs(schema, {
        accountid: req.accountid,
        fleetid: req.params.fleetid,
        deletedby: req.userid,
      });

      let result = await this.fmsAccountHdlrImpl.DeleteFleetLogic(
        accountid,
        fleetid,
        deletedby
      );

      APIResponseOK(req, res, result, "Fleet deleted successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else if (
        e.errcode === "FLEET_HAS_VEHICLES" ||
        e.errcode === "ROOT_FLEET_PROTECTED" ||
        e.errcode === "FLEET_NOT_FOUND" ||
        e.errcode === "FLEET_HAS_SUBFLEETS" ||
        e.errcode === "FLEET_HAS_USERS"
      ) {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "DELETE_FLEET_ERR",
          e.toString(),
          "Delete fleet failed"
        );
      }
    }
  };

  // vehicle management
  ListSubscribedVehicles = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
      });

      let { accountid } = validateAllInputs(schema, {
        accountid: req.accountid,
      });

      let result = await this.fmsAccountHdlrImpl.ListSubscribedVehiclesLogic(
        accountid
      );
      APIResponseOK(
        req,
        res,
        result,
        "Subscribed vehicles fetched successfully"
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
          "Failed to get subscribed vehicles"
        );
      }
    }
  };

  // role management
  CreateRole = async (req, res, next) => {
    try {
      const accountid = req.accountid;
      const createdby = req.userid;

      const schema = z.object({
        rolename: z
          .string({ message: "Invalid Role Name format" })
          .nonempty({ message: "Role name cannot be empty" })
          .max(128, {
            message: "Role name must be at most 128 characters long",
          })
          .regex(/^[A-Za-z0-9 _-]+$/, {
            message:
              "Role name can only contain letters, numbers, spaces, hyphens, and underscores",
          }),
        roletype: z.literal("account", {
          errorMap: () => ({
            message: "Invalid role type, only account roles can be created",
          }),
        }),
        isenabled: z.boolean({ message: "isenabled must be a boolean" }),
      });

      const { rolename, roletype, isenabled } = validateAllInputs(schema, {
        rolename: req.body.rolename,
        roletype: req.body.roletype,
        isenabled: req.body.isenabled,
      });

      const result = await this.fmsAccountHdlrImpl.CreateRoleLogic(
        accountid,
        rolename,
        roletype,
        isenabled,
        createdby
      );

      APIResponseOK(req, res, result, "Role created successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "CREATE_ROLE_ERR",
          e.toString(),
          "Create role failed"
        );
      }
    }
  };

  UpdateRole = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

        roleid: z
          .string({ message: "Invalid Role ID format" })
          .nonempty({ message: "Role ID cannot be empty" })
          .max(128, { message: "Role ID must be at most 128 characters long" }),

        updatedby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User ID format" }),

        rolename: z
          .string({ message: "Invalid Role Name format" })
          .max(128, {
            message: "Role name must be at most 128 characters long",
          })
          .regex(/^[A-Za-z0-9 _-]+$/, {
            message:
              "Role name can only contain letters, numbers, spaces, hyphens, and underscores",
          })
          .optional(),

        roletype: z
          .enum(["account", "platform"], { message: "Invalid Role Type" })
          .optional(),

        isenabled: z
          .boolean({ message: "isenabled must be a boolean" })
          .optional(),
      });

      let { accountid, roleid, updatedby, rolename, roletype, isenabled } =
        validateAllInputs(schema, {
          accountid: req.accountid,
          roleid: req.params.roleid,
          updatedby: req.userid,
          ...req.body,
        });

      if (roletype && roletype !== "account") {
        APIResponseBadRequest(
          req,
          res,
          "INVALID_ROLE_TYPE",
          "Invalid role type, only 'account' role updates are allowed"
        );
        return;
      }

      const updateFields = {};
      if (rolename !== undefined) updateFields.rolename = rolename;
      if (roletype !== undefined) updateFields.roletype = roletype;
      if (isenabled !== undefined) updateFields.isenabled = isenabled;

      if (Object.keys(updateFields).length === 0) {
        APIResponseBadRequest(
          req,
          res,
          "NO_UPDATE_FIELDS",
          "No valid fields provided for update"
        );
        return;
      }

      let result = await this.fmsAccountHdlrImpl.UpdateRoleLogic(
        accountid,
        roleid,
        updateFields,
        updatedby
      );

      APIResponseOK(req, res, result, "Role updated successfully");
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
          "UPDATE_ROLE_ERR",
          error.toString(),
          "Update role failed"
        );
      }
    }
  };

  ListRoles = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
      });

      let { accountid } = validateAllInputs(schema, {
        accountid: req.accountid,
      });

      let result = await this.fmsAccountHdlrImpl.ListRolesLogic(accountid);
      APIResponseOK(req, res, result, "Roles fetched successfully");
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
          "LIST_ROLES_ERR",
          error.toString(),
          "List roles failed"
        );
      }
    }
  };

  GetRole = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        roleid: z
          .string({ message: "Invalid role ID format" })
          .max(128, {
            message: "Role ID must be at most 128 characters long",
          })
          .nonempty({ message: "Invalid role ID format" }),
      });

      let { accountid, roleid } = validateAllInputs(schema, {
        accountid: req.accountid,
        roleid: req.params.roleid,
      });

      let result = await this.fmsAccountHdlrImpl.GetRoleLogic(
        accountid,
        roleid
      );
      APIResponseOK(req, res, result, "Role fetched successfully");
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
          "GET_ROLE_ERR",
          error.toString(),
          "Get role failed"
        );
      }
    }
  };

  UpdateRolePerms = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

        roleid: z
          .string({ message: "Invalid Role ID format" })
          .max(128, { message: "Role ID must be at most 128 characters long" })
          .nonempty({ message: "Role ID is required" }),

        updatedperms: z.array(
          z
            .object({
              moduleid: z
                .string({ message: "Invalid Module ID format" })
                .uuid({ message: "Invalid Module ID format" }),

              selectedpermids: z
                .array(
                  z.string({
                    message: "Invalid Selected Permission ID format",
                  }),
                  { message: "SelectedPermids must be an array of strings" }
                )
                .optional(),

              deselectedpermids: z
                .array(
                  z.string({
                    message: "Invalid Deselected Permission ID format",
                  }),
                  { message: "DeselectedPermids must be an array of strings" }
                )
                .optional(),
            })
            .refine(
              (data) =>
                (data.selectedpermids && data.selectedpermids.length > 0) ||
                (data.deselectedpermids && data.deselectedpermids.length > 0),
              {
                message:
                  "At least one of Selectedpermids or Deselectedpermids must be provided",
              }
            )
        ),
      });

      let { accountid, roleid, updatedperms } = validateAllInputs(schema, {
        accountid: req.accountid,
        roleid: req.params.roleid,
        updatedperms: req.body.updatedperms,
      });

      const updatedby = req.userid;

      let result = await this.fmsAccountHdlrImpl.UpdateRolePermsLogic(
        accountid,
        roleid,
        updatedperms,
        updatedby
      );

      APIResponseOK(req, res, result, "Role permissions updated successfully");
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
          "UPDATE_ROLE_PERMS_ERR",
          error.toString(),
          "Update role permissions failed"
        );
      }
    }
  };

  DeleteRole = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

        roleid: z
          .string({ message: "Invalid Role ID format" })
          .uuid({ message: "Role ID must be a valid UUID" }),

        deletedby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),
      });

      const { accountid, roleid, deletedby } = validateAllInputs(schema, {
        accountid: req.accountid,
        roleid: req.params.roleid,
        deletedby: req.userid,
      });

      let result = await this.fmsAccountHdlrImpl.DeleteRoleLogic(
        accountid,
        roleid,
        deletedby
      );

      APIResponseOK(req, res, result, "Role deleted successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else if (
        e.errcode === "ROLE_IN_USE" ||
        e.errcode === "ROLE_HAS_PERMISSIONS" ||
        e.errcode === "ROLE_NOT_FOUND" ||
        e.errcode === "CANNOT_DELETE_ADMIN_ROLE" ||
        e.errcode === "INVALID_ROLE_TYPE"
      ) {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "DELETE_ROLE_ERR",
          e.toString(),
          "Delete role failed"
        );
      }
    }
  };

  // vehicle management
  GetVehicles = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

        fleetid: z
          .string({ message: "Fleet ID is required" })
          .uuid({ message: "Fleet ID must be a valid UUID" }),
      });

      const recursive = req.query.recursive === "true";

      const { accountid, fleetid } = validateAllInputs(schema, {
        accountid: req.accountid,
        fleetid: req.params.fleetid,
      });

      const result = await this.fmsAccountHdlrImpl.GetVehiclesLogic(
        accountid,
        fleetid,
        recursive
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

  MoveVehicle = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

        vehicleid: z
          .string({ message: "Invalid Vehicle ID format" })
          .nonempty({ message: "Invalid Vehicle ID format" })
          .max(128, {
            message: "Vehicle ID must be at most 128 characters long",
          }),
        fromfleetid: z
          .string({ message: "Invalid From Fleet ID format" })
          .uuid({ message: "Invalid From Fleet ID format" }),
        tofleetid: z
          .string({ message: "Invalid To Fleet ID format" })
          .uuid({ message: "Invalid To Fleet ID format" }),
      });

      let { accountid, vehicleid, fromfleetid, tofleetid } = validateAllInputs(
        schema,
        {
          accountid: req.accountid,
          vehicleid: req.params.vehicleid,
          fromfleetid: req.body.fromfleetid,
          tofleetid: req.body.tofleetid,
        }
      );

      let result = await this.fmsAccountHdlrImpl.MoveVehicleLogic(
        accountid,
        fromfleetid,
        tofleetid,
        vehicleid
      );
      APIResponseOK(req, res, result, "Vehicle moved from fleet successfully");
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
        APIResponseInternalErr(req, res, error, error.message);
      }
    }
  };

  RemoveVehicle = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" }),
        vehicleid: z
          .string({ message: "Invalid Vehicle ID format" })
          .nonempty({ message: "Invalid Vehicle ID format" })
          .max(128, {
            message: "Vehicle ID must be at most 128 characters long",
          }),
      });

      let { accountid, fleetid, vehicleid } = validateAllInputs(schema, {
        accountid: req.accountid,
        fleetid: req.params.fleetid,
        vehicleid: req.params.vehicleid,
      });

      let result = await this.fmsAccountHdlrImpl.RemoveVehicleLogic(
        accountid,
        fleetid,
        vehicleid
      );
      APIResponseOK(
        req,
        res,
        result,
        "Vehicle removed from fleet successfully"
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
          "Failed to remove vehicle from fleet"
        );
      }
    }
  };

  ListMoveableFleets = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

        vehicleid: z
          .string({ message: "Invalid Vehicle ID format" })
          .nonempty({ message: "Invalid Vehicle ID format" })
          .max(128, {
            message: "Vehicle ID must be at most 128 characters long",
          }),
        userid: z
          .string({ message: "User ID is required" })
          .uuid({ message: "Invalid User ID format" }),
      });

      let { accountid, vehicleid, userid } = validateAllInputs(schema, {
        accountid: req.accountid,
        vehicleid: req.params.vehicleid,
        userid: req.userid,
      });

      let result = await this.fmsAccountHdlrImpl.ListMoveableFleetsLogic(
        accountid,
        vehicleid,
        userid
      );
      APIResponseOK(req, res, result, "Moveable fleets fetched successfully");
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
          "Failed to list moveable fleets"
        );
      }
    }
  };

  // user management
  ListUsers = async (req, res, next) => {
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
        fleetid: req.params.fleetid,
      });

      let result = await this.fmsAccountHdlrImpl.ListUsersLogic(
        accountid,
        fleetid
      );
      APIResponseOK(req, res, result, "Users fetched successfully");
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
        APIResponseInternalErr(req, res, error, "Failed to list users");
      }
    }
  };

  GetAssignableRoles = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" }),
        userid: z
          .string({ message: "Invalid User ID format" })
          .nonempty({ message: "Invalid User ID format" })
          .max(128, {
            message: "User ID must be at most 128 characters long",
          }),

        assignedby: z
          .string({ message: "Invalid Assignedby ID format" })
          .uuid({ message: "Invalid Assignedby ID format" }),
      });

      let { accountid, fleetid, userid, assignedby } = validateAllInputs(
        schema,
        {
          accountid: req.accountid,
          fleetid: req.params.fleetid,
          userid: req.params.userid,
          assignedby: req.userid,
        }
      );

      let result = await this.fmsAccountHdlrImpl.GetAssignableRolesLogic(
        accountid,
        fleetid,
        userid,
        assignedby
      );
      APIResponseOK(req, res, result, "Assignable roles fetched successfully");
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
          "Failed to get assignable roles"
        );
      }
    }
  };

  AssignUserRole = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" }),
        userid: z
          .string({ message: "Invalid User ID format" })
          .nonempty({ message: "Invalid User ID format" })
          .max(128, {
            message: "User ID must be at most 128 characters long",
          }),
        roleids: z
          .array(
            z
              .string({ message: "Invalid Role ID format" })
              .nonempty({ message: "Invalid Role ID format" })
              .max(128, {
                message: "Role ID must be at most 128 characters long",
              })
          )
          .nonempty({ message: "At least one Role ID is required" }),
        assignedby: z
          .string({ message: "Invalid Assignedby ID format" })
          .uuid({ message: "Invalid Assignedby ID format" }),
      });

      let { accountid, fleetid, userid, roleids, assignedby } =
        validateAllInputs(schema, {
          accountid: req.accountid,
          fleetid: req.params.fleetid,
          userid: req.body.userid,
          roleids: req.body.roleids,
          assignedby: req.userid,
        });

      let result = await this.fmsAccountHdlrImpl.AssignUserRoleLogic(
        accountid,
        fleetid,
        userid,
        roleids,
        assignedby
      );
      APIResponseOK(req, res, result, "User role assigned successfully");
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
        APIResponseInternalErr(req, res, error, "Failed to assign user role");
      }
    }
  };

  DeassignUserRole = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" }),

        userid: z
          .string({ message: "Invalid User ID format" })
          .nonempty({ message: "Invalid User ID format" })
          .max(128, { message: "User ID must be at most 128 characters long" }),

        roleid: z
          .string({ message: "Invalid Role ID format" })
          .nonempty({ message: "Invalid Role ID format" })
          .max(128, { message: "Role ID must be at most 128 characters long" }),

        deassignedby: z
          .string({ message: "Invalid DeassignedBy ID format" })
          .uuid({ message: "Invalid DeassignedBy ID format" }),
      });

      let { accountid, fleetid, userid, roleid, deassignedby } =
        validateAllInputs(schema, {
          accountid: req.accountid,
          fleetid: req.params.fleetid,
          userid: req.body.userid,
          roleid: req.body.roleid,
          deassignedby: req.userid,
        });

      let result = await this.fmsAccountHdlrImpl.DeassignUserRoleLogic(
        accountid,
        fleetid,
        userid,
        roleid,
        deassignedby
      );
      APIResponseOK(req, res, result, "User role deassigned successfully");
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
        APIResponseInternalErr(req, res, error, "Failed to deassign user role");
      }
    }
  };

  GetUserInfo = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

        fleetid: z
          .string({ message: "Invalid Fleet ID format" })
          .uuid({ message: "Invalid Fleet ID format" }),
        userid: z
          .string({ message: "Invalid User ID format" })
          .nonempty({ message: "Invalid User ID format" })
          .max(128, {
            message: "User ID must be at most 128 characters long",
          }),
      });

      let { accountid, fleetid, userid } = validateAllInputs(schema, {
        accountid: req.accountid,
        fleetid: req.params.fleetid,
        userid: req.params.userid,
      });

      let result = await this.fmsAccountHdlrImpl.GetUserInfoLogic(
        accountid,
        fleetid,
        userid
      );
      APIResponseOK(req, res, result, "User info fetched successfully");
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
        APIResponseInternalErr(req, res, error, "Failed to get user info");
      }
    }
  };

  DeleteUser = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),

        deletedby: z
          .string({ message: "Invalid Deleted By User ID format" })
          .uuid({ message: "Deleted By User ID must be a valid UUID" }),
      });

      const { accountid, userid, deletedby } = validateAllInputs(schema, {
        accountid: req.accountid,
        userid: req.params.userid,
        deletedby: req.userid,
      });

      let result = await this.fmsAccountHdlrImpl.DeleteUserLogic(
        accountid,
        userid,
        deletedby
      );

      APIResponseOK(req, res, result, "User deleted successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else if (
        e.errcode === "CANNOT_DELETE_SELF" ||
        e.errcode === "USER_NOT_FOUND" ||
        e.errcode === "USER_ALREADY_DELETED" ||
        e.errcode === "CANNOT_DELETE_SEED_USER" ||
        e.errcode === "USER_NOT_IN_ACCOUNT"
      ) {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "DELETE_USER_ERR",
          e.toString(),
          "Delete user failed"
        );
      }
    }
  };

  RemoveUser = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),

        removedby: z
          .string({ message: "Invalid Removed By User ID format" })
          .uuid({ message: "Removed By User ID must be a valid UUID" }),
      });

      const { accountid, userid, removedby } = validateAllInputs(schema, {
        accountid: req.accountid,
        userid: req.params.userid,
        removedby: req.userid,
      });

      let result = await this.fmsAccountHdlrImpl.RemoveUserLogic(
        accountid,
        userid,
        removedby
      );

      APIResponseOK(req, res, result, "User removed from account successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else if (
        e.errcode === "CANNOT_REMOVE_SELF" ||
        e.errcode === "USER_NOT_FOUND" ||
        e.errcode === "USER_NOT_IN_ACCOUNT" ||
        e.errcode === "CANNOT_REMOVE_LAST_ADMIN" ||
        e.errcode === "CANNOT_REMOVE_SEED_USER"
      ) {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "REMOVE_USER_ERR",
          e.toString(),
          "Remove user failed"
        );
      }
    }
  };

  GetAccountSubscriptions = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
      });

      let { accountid } = validateAllInputs(schema, {
        accountid: req.accountid,
      });

      let result = await this.fmsAccountHdlrImpl.GetAccountSubscriptionsLogic(
        accountid
      );
      APIResponseOK(req, res, result, "Subscriptions fetched successfully");
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
          "GET_SUBSCRIPTIONS_ERR",
          error.toString(),
          "Get subscriptions failed"
        );
      }
    }
  };

  CheckChangeSubscriptionPackage = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        newpkgid: z
          .string({ message: "Invalid New Package ID  ID format" })
          .uuid({ message: "Invalid  New Package ID format" }),
      });

      let { accountid, newpkgid } = validateAllInputs(schema, {
        accountid: req.accountid,
        newpkgid: req.body.newpkgid,
      });

      let result =
        await this.fmsAccountHdlrImpl.CheckChangeSubscriptionPackageLogic(
          accountid,
          newpkgid
        );
      APIResponseOK(
        req,
        res,
        result,
        "Check change subscription package success"
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
          "CHECK_CHANGE_SUBSCRIPTION_PACKAGE_ERR",
          error.toString(),
          "Check change subscription package failed"
        );
      }
    }
  };

  UpdateAccountSubscription = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        updatedby: z
          .string({ message: "Invalid Updatedby ID format" })
          .uuid({ message: "Invalid Updatedby ID format" }),
        pkgid: z
          .string({ message: "Invalid Package ID  ID format" })
          .uuid({ message: "Invalid  Package ID format" }),
      });

      let { accountid, pkgid, updatedby } = validateAllInputs(schema, {
        updatedby: req.userid,
        accountid: req.accountid,
        pkgid: req.body.pkgid,
      });
      let result = await this.fmsAccountHdlrImpl.UpdateAccountSubscriptionLogic(
        accountid,
        pkgid,
        updatedby
      );
      APIResponseOK(req, res, result, "Subscription updated successfully");
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
          "Failed to update account subscription"
        );
      }
    }
  };

  GetSubscriptionHistory = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
      });

      let { accountid } = validateAllInputs(schema, {
        accountid: req.accountid,
      });

      let result = await this.fmsAccountHdlrImpl.GetSubscriptionHistoryLogic(
        accountid
      );
      APIResponseOK(
        req,
        res,
        result,
        "Subscription history fetched successfully"
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
          "Failed to get subscription history"
        );
      }
    }
  };

  GetSubscriptionVehicles = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
      });

      let { accountid } = validateAllInputs(schema, {
        accountid: req.accountid,
      });

      let result = await this.fmsAccountHdlrImpl.GetSubscriptionVehiclesLogic(
        accountid
      );
      APIResponseOK(
        req,
        res,
        result,
        "Subscription vehicles fetched successfully"
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
          "Failed to get subscription vehicles"
        );
      }
    }
  };

  CreateSubscriptionIntent = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

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

        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User ID format" }),
      });

      let { accountid, vinnos, userid } = validateAllInputs(schema, {
        accountid: req.accountid,
        vinnos: req.body.vinnos,
        userid: req.userid,
      });

      let result = await this.fmsAccountHdlrImpl.CreateSubscriptionIntentLogic(
        accountid,
        vinnos,
        userid
      );
      APIResponseOK(
        req,
        res,
        result,
        "Subscription intent created successfully"
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
          "Failed to create subscription intent"
        );
      }
    }
  };

  SubscribeVehicle = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

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

        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User ID format" }),
      });

      let { accountid, vinnos, userid } = validateAllInputs(schema, {
        accountid: req.accountid,
        vinnos: req.body.vinnos,
        userid: req.userid,
      });

      let result = await this.fmsAccountHdlrImpl.SubscribeVehicleLogic(
        accountid,
        vinnos,
        userid
      );

      if (result.status === "error") {
        APIResponseBadRequest(
          req,
          res,
          "SUBSCRIPTION_FAILED",
          result.message,
          result.details
        );
        return;
      }

      APIResponseOK(req, res, result, "Vehicles subscribed successfully");
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
        APIResponseInternalErr(req, res, error, "Failed to subscribe vehicles");
      }
    }
  };

  UnsubscribeVehicle = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

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

        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User ID format" }),
      });

      let { accountid, vinnos, userid } = validateAllInputs(schema, {
        accountid: req.accountid,
        vinnos: req.body.vinnos,
        userid: req.userid,
      });

      let result = await this.fmsAccountHdlrImpl.UnsubscribeVehicleLogic(
        accountid,
        vinnos,
        userid
      );

      // Check if the result has an error status
      if (result.status === "error") {
        // If there are vehicle-wise results, return them with the error
        if (result.vinresults && result.vinresults.length > 0) {
          APIResponseBadRequest(
            req,
            res,
            "UNSUBSCRIPTION_FAILED",
            result.message,
            {
              vinresults: result.vinresults,
              summary: result.summary || {},
            }
          );
          return;
        }

        // If no vehicle-wise results, return general error
        APIResponseBadRequest(
          req,
          res,
          "UNSUBSCRIPTION_FAILED",
          result.message,
          result.details || {}
        );
        return;
      }

      APIResponseOK(req, res, result, "Vehicles unsubscribed successfully");
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
          "Failed to unsubscribe vehicles"
        );
      }
    }
  };

  TagVehicle = async (req, res, next) => {
    try {
      let schema = z.object({
        taggedby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User ID format" }),
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        dstaccountid: z
          .string({ message: "Invalid Destination Account ID format" })
          .uuid({ message: "Invalid Destination Account ID format" }),
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
        allow_retag: z
          .boolean({ message: "allow_retag must be a boolean" })
          .default(false),
      });

      let { taggedby, accountid, dstaccountid, vinnos, allow_retag } =
        validateAllInputs(schema, {
          taggedby: req.userid,
          accountid: req.accountid,
          dstaccountid: req.body.dstaccountid,
          vinnos: req.body.vinnos,
          allow_retag: req.body.allow_retag,
        });

      // Validate that source and destination accounts are different
      if (accountid === dstaccountid) {
        return APIResponseBadRequest(
          req,
          res,
          "SAME_ACCOUNT_ERROR",
          null,
          "Source and destination accounts cannot be the same"
        );
      }

      let result = await this.fmsAccountHdlrImpl.TagVehicleLogic(
        accountid,
        dstaccountid,
        vinnos,
        allow_retag,
        taggedby
      );

      if (result.status === "error") {
        APIResponseBadRequest(
          req,
          res,
          "TAG_VEHICLE_FAILED",
          result.message,
          result
        );
        return;
      }

      APIResponseOK(req, res, result, "Vehicles tagged successfully");
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
        APIResponseInternalErr(req, res, error, "Failed to tag vehicles");
      }
    }
  };

  UntagVehicle = async (req, res, next) => {
    try {
      let schema = z.object({
        untaggedby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User ID format" }),
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        dstaccountid: z
          .string({ message: "Invalid Destination Account ID format" })
          .uuid({ message: "Invalid Destination Account ID format" }),
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

      let { untaggedby, accountid, dstaccountid, vinnos } = validateAllInputs(
        schema,
        {
          untaggedby: req.userid,
          accountid: req.accountid,
          dstaccountid: req.body.dstaccountid,
          vinnos: req.body.vinnos,
        }
      );

      let result = await this.fmsAccountHdlrImpl.UntagVehicleLogic(
        accountid,
        dstaccountid,
        vinnos,
        untaggedby
      );

      if (result.status === "error") {
        APIResponseBadRequest(
          req,
          res,
          "UNTAG_VEHICLE_FAILED",
          result.message,
          result
        );
        return;
      }

      APIResponseOK(req, res, result, "Vehicles untagged successfully");
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
        APIResponseInternalErr(req, res, error, "Failed to untag vehicles");
      }
    }
  };
}
