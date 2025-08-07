import z from "zod";
import {
  APIResponseBadRequest,
  APIResponseInternalErr,
  APIResponseOK,
} from "../../../utils/responseutil.js";
import { validateAllInputs } from "../../../utils/validationutil.js";
import PUserHdlrImpl from "./puserhdlr_impl.js";
export default class PUserHdlr {
  constructor(pUserSvcI, userSvcI, fmsAccountSvcI, authSvcI, logger) {
    this.pUserSvcI = pUserSvcI;
    this.userSvcI = userSvcI;
    this.fmsAccountSvcI = fmsAccountSvcI;
    this.authSvcI = authSvcI;
    this.logger = logger;
    this.pUserHdlrImpl = new PUserHdlrImpl(
      pUserSvcI,
      userSvcI,
      fmsAccountSvcI,
      authSvcI,
      logger
    );
  }

  RegisterRoutes(router) {
    // router.post("/", this.CreateUser); // TODO: deprecated
    // router.post("/:userid", this.UpdateUser);
    // platform/user/
    router.get("/list", this.ListUsers);
    router.post("/invite", this.InvitePlatformUser);
    router.get("/invites", this.ListPlatformInvites);
    router.post("/invite/resend", this.ResendPlatformInvite);
    router.post("/invite/cancel", this.CancelPlatformInvite);
    router.get("/:userid", this.GetUser);
    router.post("/:userid/enable", this.EnableUser);
    router.post("/:userid/disable", this.DisableUser);
    router.get("/:userid/accounts", this.ListUserAccounts);
    router.get("/:userid/roles", this.ListUserRoles);
    router.post("/:userid/role", this.AddUserPlatformRole);
    router.delete("/:userid/role/:roleid", this.RemoveUserPlatformRole);

    router.post("/createadmin", this.CreateSuperAdmin);
    router.post("/createuser", this.CreateUserByPlatformAdmin);

    router.post("/account/adduser", this.AddUserToAccount);
    router.delete(
      "/account/:accountid/user/:contact",
      this.RemoveUserFromAccount
    );
    router.delete("/:userid", this.DeleteUser);

    router.put("/:userid/resetuserpassword", this.ResetUserPassword);
  }

  CreateUser = async (req, res, next) => {
    try {
      let schema = z.object({
        createdby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User ID format" }),
        email: z
          .string({ message: "Invalid Email format" })
          .email({ message: "Invalid email format" }),
        password: z
          .string({ message: "Password is required" })
          .nonempty({ message: "Password cannot be empty" })
          .min(8, { message: "Password must be at least 6 characters long" })
          .max(128, { message: "Password must not exceed 128 characters" }),
        mobile: z
          .string({ message: "Invalid Mobile Number format" })
          .regex(/^[6-9]\d{9}$/, {
            message:
              "Mobile number must be exactly 10 digits and start with 6 to 9",
          }),
        displayname: z
          .string({ message: "Invalid Display Name format" })
          .nonempty({ message: "Display Name cannot be empty" })
          .max(128, {
            message: "Display Name must be at most 128 characters long",
          })
          .regex(/^[A-Za-z0-9 _-]+$/, {
            message:
              "Display Name can only contain letters, numbers, spaces, hyphens, and underscores",
          }),
      });

      let { createdby, password, displayname, email, mobile } =
        validateAllInputs(schema, {
          createdby: req.userid,
          password: req.body.password,
          displayname: req.body.displayname,
          email: req.body.email,
          mobile: req.body.mobile,
        });

      let result = await this.pUserHdlrImpl.CreateUserLogic(
        displayname,
        email,
        password,
        mobile,
        createdby
      );

      APIResponseOK(req, res, result, "User created successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "CREATE_USER_ERR",
          e.toString(),
          "Create user failed"
        );
      }
    }
  };

  InvitePlatformUser = async (req, res, next) => {
    try {
      const invitedby = req.userid;
      const schema = z.object({
        contact: z
          .string({ message: "Invalid Contact format" })
          .nonempty({ message: "Contact is required" })
          .refine(
            (val) =>
              /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(val) ||
              /^[6-9]\d{9}$/.test(val),
            {
              message:
                "Contact must be a valid email address or Indian mobile number (10 digits starting with 6-9)",
            }
          ),
        roleids: z
          .array(z.string({ message: "Invalid Role Ids format" }))
          .nonempty({ message: "At least one role ID is required" }),
      });

      let { contact, roleids } = validateAllInputs(schema, {
        contact: req.body.contact,
        roleids: req.body.roleids || [],
      });

      let headerReferer = req.headers.origin;

      let result;
      if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(contact)) {
        result = await this.pUserHdlrImpl.InvitePlatformUserLogic(
          contact,
          roleids,
          invitedby,
          headerReferer
        );
      } else {
        throw new Error("Not a valid email address");
      }
      // } else {
      //   result = await this.pUserHdlrImpl.SmsInvitePlatformUserLogic(
      //     contact,
      //     roleids,
      //     invitedby,
      //     headerReferer
      //   );
      // }

      APIResponseOK(req, res, result, "User invited successfully");
    } catch (e) {
      this.logger.error(`puserhdlr.InvitePlatformUser: error: ${e?.stack}`);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "INVITE_PLATFORM_USER_ERR",
          e.toString(),
          "Invite platform user failed"
        );
      }
    }
  };

  ListPlatformInvites = async (req, res, next) => {
    try {
      let schema = z.object({
        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User ID format" }),
      });

      let { userid } = validateAllInputs(schema, {
        userid: req.userid,
      });

      let result = await this.pUserHdlrImpl.ListPlatformInvitesLogic(userid);
      APIResponseOK(req, res, result, "Platform invites fetched successfully");
    } catch (e) {
      this.logger.error(`puserhdlr.ListPlatformInvites: error: ${e?.stack}`);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "LIST_PLATFORM_INVITES_ERR",
          e.toString(),
          "List platform invites failed"
        );
      }
    }
  };

  CancelPlatformInvite = async (req, res, next) => {
    try {
      const schema = z.object({
        inviteid: z
          .string({ message: "Invalid Invite ID format" })
          .uuid({ message: "Invite ID must be a valid UUID" }),
      });

      const { inviteid } = validateAllInputs(schema, {
        inviteid: req.body.inviteid,
      });

      let result = await this.pUserHdlrImpl.CancelPlatformInviteLogic(
        inviteid,
        req.userid
      );
      APIResponseOK(req, res, result, "Platform invite cancelled successfully");
    } catch (e) {
      this.logger.error(`puserhdlr.CancelPlatformInvite: error: ${e?.stack}`);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "CANCEL_PLATFORM_INVITE_ERR",
          e.toString(),
          "Cancel platform invite failed"
        );
      }
    }
  };

  ResendPlatformInvite = async (req, res, next) => {
    try {
      let schema = z.object({
        inviteid: z
          .string({ message: "Invalid Invite ID format" })
          .uuid({ message: "Invalid Invite ID format" }),
        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User ID format" }),
      });
      let { inviteid, userid } = validateAllInputs(schema, {
        inviteid: req.body.inviteid,
        userid: req.userid,
      });
      let headerReferer = req.headers.origin;
      let result = await this.pUserHdlrImpl.ResendPlatformInviteLogic(
        inviteid,
        userid,
        headerReferer
      );
      APIResponseOK(req, res, result, "Platform invite resent successfully");
    } catch (e) {
      this.logger.error(`puserhdlr.ResendPlatformInvite: error: ${e?.stack}`);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "RESEND_PLATFORM_INVITE_ERR",
          e.toString(),
          "Resend platform invite failed"
        );
      }
    }
  };

  ListUsers = async (req, res, next) => {
    try {
      const schema = z.object({
        roletype: z
          .enum(["platform", "account"], { message: "Invalid Role Type" })
          .optional()
          .or(z.literal("").transform(() => undefined)),
        offset: z.coerce.number().default(0),
        limit: z.coerce.number().default(10),
      });

      let { roletype, offset, limit } = validateAllInputs(schema, {
        roletype: req.query.roletype,
        offset: req.query.offset,
        limit: req.query.limit,
      });

      let result;
      if (roletype === "platform") {
        result = await this.pUserHdlrImpl.ListPlatformUsersLogic(offset, limit);
      } else if (roletype === "account") {
        result = await this.pUserHdlrImpl.ListAccountUsersLogic(offset, limit);
      } else {
        result = await this.pUserHdlrImpl.ListUsersLogic(offset, limit);
      }

      APIResponseOK(req, res, result, "Users fetched successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "LIST_USERS_ERR",
          e.toString(),
          "List users failed"
        );
      }
    }
  };

  GetUser = async (req, res, next) => {
    try {
      let schema = z.object({
        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User ID format" }),
      });
      let { userid } = validateAllInputs(schema, {
        userid: req.params.userid,
      });
      let result = await this.pUserHdlrImpl.GetUserLogic(userid);
      APIResponseOK(req, res, result, "User fetched successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "GET_USER_ERR",
          e.toString(),
          "Get user failed"
        );
      }
    }
  };

  ListUserRoles = async (req, res, next) => {
    try {
      let schema = z.object({
        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User ID format" }),
        roletype: z.enum(["platform"], { message: "Invalid Role Type format" }),
      });

      let { userid, roletype } = validateAllInputs(schema, {
        userid: req.params.userid,
        roletype: req.query.roletype,
      });

      let result = await this.pUserHdlrImpl.ListUnassignedUserRolesLogic(
        userid,
        roletype
      );

      APIResponseOK(
        req,
        res,
        result,
        "Unassigned user roles fetched successfully"
      );
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "LIST_UNASSIGNED_USER_ROLES_ERR",
          e.toString(),
          "List unassigned user roles failed"
        );
      }
    }
  };

  EnableUser = async (req, res, next) => {
    try {
      const schema = z.object({
        updatedby: z
          .string({ message: "Invalid Token format" })
          .uuid({ message: "Invalid Token ID format" }),
        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User ID format" }),
      });
      let { updatedby, userid } = validateAllInputs(schema, {
        updatedby: req.userid,
        userid: req.params.userid,
      });

      let result = await this.pUserHdlrImpl.EnableUserLogic(userid, updatedby);
      APIResponseOK(req, res, result, "User enabled successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "ENABLE_USER_ERR",
          e.toString(),
          "Enable user failed"
        );
      }
    }
  };

  DisableUser = async (req, res, next) => {
    try {
      const schema = z.object({
        updatedby: z
          .string({ message: "Invalid Token format" })
          .uuid({ message: "Invalid UUID format" }),
        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid UUID format" }),
      });

      let { updatedby, userid } = validateAllInputs(schema, {
        updatedby: req.userid,
        userid: req.params.userid,
      });
      let result = await this.pUserHdlrImpl.DisableUserLogic(userid, updatedby);
      APIResponseOK(req, res, result, "User disabled successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "DISABLE_USER_ERR",
          e.toString(),
          "Disable user failed"
        );
      }
    }
  };

  ListUserAccounts = async (req, res, next) => {
    try {
      let schema = z.object({
        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User UUID format" }),
      });

      let { userid } = validateAllInputs(schema, {
        userid: req.params.userid,
      });

      let result = await this.pUserHdlrImpl.ListUserAccountsLogic(userid);
      APIResponseOK(req, res, result, "User accounts fetched successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "LIST_USER_ACCOUNTS_ERR",
          e.toString(),
          "List user accounts failed"
        );
      }
    }
  };

  AddUserPlatformRole = async (req, res, next) => {
    try {
      const updatedby = req.userid;

      const schema = z.object({
        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),

        roleids: z
          .array(
            z
              .string({ message: "Each Role ID must be a valid string" })
              .max(120)
          )
          .nonempty({ message: "At least one role ID is required" }),

        roletype: z.literal("platform", {
          errorMap: () => ({
            message: "Invalid role type — only 'platform' is allowed",
          }),
        }),
      });

      const { userid, roleids, roletype } = validateAllInputs(schema, {
        userid: req.params.userid,
        roleids: req.body.roleids || [],
        roletype: req.body.roletype,
      });

      const result = await this.pUserHdlrImpl.AddUserPlatformRoleLogic(
        userid,
        roleids,
        updatedby
      );

      APIResponseOK(req, res, result, "User role added successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "ADD_USER_PLATFORM_ROLE_ERR",
          e.toString(),
          "Add user platform role failed"
        );
      }
    }
  };

  RemoveUserPlatformRole = async (req, res, next) => {
    try {
      let schema = z.object({
        updatedby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),

        userid: z
          .string({ message: "Invalid Target User ID format" })
          .uuid({ message: "Target User ID must be a valid UUID" }),

        roleid: z
          .string({ message: "Invalid Role ID format" })
          .nonempty({ message: "Role ID cannot be empty" })
          .max(128, { message: "Role ID must not exceed 128 characters" }),
      });

      let { updatedby, userid, roleid } = validateAllInputs(schema, {
        updatedby: req.userid,
        userid: req.params.userid,
        roleid: req.params.roleid,
      });

      let result = await this.pUserHdlrImpl.RemoveUserPlatformRoleLogic(
        userid,
        roleid,
        updatedby
      );

      APIResponseOK(req, res, result, "User role removed successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "REMOVE_USER_PLATFORM_ROLE_ERR",
          e.toString(),
          "Remove user platform role failed"
        );
      }
    }
  };

  CreateSuperAdmin = async (req, res, next) => {
    try {
      const seededUserId = req.userid || this.seededUserId;

      let schema = z.object({
        email: z
          .string({ message: "Invalid Email format" })
          .email({ message: "Invalid Email format" }),
        password: z
          .string({ message: "Password is required" })
          .nonempty({ message: "Password cannot be empty" })
          .min(8, { message: "Password must be at least 6 characters long" })
          .max(128, { message: "Password must not exceed 128 characters" }),
      });

      let { email, password } = validateAllInputs(schema, req.body);

      let result = await this.pUserHdlrImpl.CreateSuperAdminLogic(
        seededUserId,
        email,
        password
      );

      APIResponseOK(req, res, result, "Super Admin created successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "CREATE_SUPER_ADMIN_ERR",
          e.toString(),
          "Create Super Admin failed"
        );
      }
    }
  };

  CreateUserByPlatformAdmin = async (req, res, next) => {
    try {
      let baseSchema = z.object({
        forceuseridtypeverified: z.boolean({
          message: "forceuseridtypeverified must be a boolean",
        }),

        displayname: z
          .string({ message: "Invalid Display Name format" })
          .nonempty({ message: "Display Name cannot be empty" })
          .max(128, { message: "Display Name must be at most 128 characters" })
          .regex(/^[A-Za-z0-9 _-]+$/, {
            message:
              "Display Name can only contain letters, numbers, spaces, hyphens, and underscores",
          }),

        userinfo: z
          .record(z.any(), { message: "userinfo must be an object" })
          .default({}),

        createdby: z
          .string({ message: "Invalid creator ID format" })
          .uuid({ message: "Creator ID must be a valid UUID" }),
      });

      let schema = z.discriminatedUnion("useridtype", [
        baseSchema.extend({
          useridtype: z.literal("email"),
          contact: z
            .string({ message: "Invalid email format" })
            .email({ message: "Contact must be a valid email address" }),
        }),
        baseSchema.extend({
          useridtype: z.literal("mobile"),
          contact: z
            .string({ message: "Invalid mobile number format" })
            .regex(/^[6-9]\d{9}$/, {
              message:
                "Mobile must be a valid Indian mobile number (10 digits starting with 6-9)",
            }),
        }),
      ]);

      let {
        useridtype,
        forceuseridtypeverified,
        contact,
        displayname,
        userinfo,
        createdby,
      } = validateAllInputs(schema, {
        useridtype: req.body.useridtype,
        forceuseridtypeverified: req.body.forceuseridtypeverified,
        contact: req.body.contact,
        displayname: req.body.displayname,
        userinfo: req.body.userinfo,
        createdby: req.userid,
      });

      let result = await this.pUserHdlrImpl.CreateUserByPlatformAdminLogic(
        useridtype,
        forceuseridtypeverified,
        contact,
        displayname,
        userinfo,
        createdby
      );

      APIResponseOK(req, res, result, "User created successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "CREATE_USER_ERR",
          e.toString(),
          "Create user failed"
        );
      }
    }
  };

  AddUserToAccount = async (req, res, next) => {
    try {
      const addedby = req.userid;
      const contact = req.body.contact;
      const accountid = req.body.accountid;
      let result = await this.pUserHdlrImpl.AddUserToAccountLogic(
        addedby,
        contact,
        accountid
      );
      APIResponseOK(req, res, result, "User added to account successfully");
    } catch (e) {
      APIResponseInternalErr(
        req,
        res,
        "ADD_USER_TO_ACCOUNT_ERR",
        e.toString(),
        "Add user to account failed"
      );
    }
  };

  RemoveUserFromAccount = async (req, res, next) => {
    try {
      let schema = z.object({
        removedby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),
        contact: z
          .string({ message: "Contact must be a string" })
          .nonempty({ message: "Contact cannot be empty" })
          .refine(
            (val) =>
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) || /^[6-9]\d{9}$/.test(val),
            {
              message:
                "Invalid contact format. Please provide a valid email or mobile number.",
            }
          ),

        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Account ID must be a valid UUID" }),
      });

      let { removedby, contact, accountid } = validateAllInputs(schema, {
        removedby: req.userid,
        contact: req.params.contact,
        accountid: req.params.accountid,
      });

      let result = await this.pUserHdlrImpl.RemoveUserFromAccountLogic(
        removedby,
        contact,
        accountid
      );

      APIResponseOK(req, res, result, "User removed from account successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "REMOVE_USER_FROM_ACCOUNT_ERR",
          e.toString(),
          "Remove user from account failed"
        );
      }
    }
  };

  DeleteUser = async (req, res, next) => {
    try {
      let schema = z.object({
        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),

        deletedby: z
          .string({ message: "Invalid Deleted By User ID format" })
          .uuid({ message: "Deleted By User ID must be a valid UUID" }),
      });

      let { userid, deletedby } = validateAllInputs(schema, {
        userid: req.params.userid,
        deletedby: req.userid,
      });

      let result = await this.pUserHdlrImpl.DeleteUserLogic(userid, deletedby);

      APIResponseOK(req, res, result, "User deleted successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else if (
        e.errcode === "CANNOT_DELETE_SELF" ||
        e.errcode === "USER_NOT_FOUND" ||
        e.errcode === "USER_ALREADY_DELETED" ||
        e.errcode === "CANNOT_DELETE_SEED_USER"
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

  ResetUserPassword = async (req, res, next) => {
    try {
      let schema = z.object({
        resetby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),
        userid: z
          .string({ message: "Invalid Target User ID format" })
          .uuid({ message: "Target User ID must be a valid UUID" }),
      });

      let { resetby, userid } = validateAllInputs(schema, {
        resetby: req.userid,
        userid: req.params.userid,
      });

      let result = await this.pUserHdlrImpl.ResetUserPasswordLogic(
        userid,
        resetby
      );

      APIResponseOK(req, res, result, "User password reset successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "RESET_USER_PASSWORD_ERR",
          e.toString(),
          "Reset user password failed"
        );
      }
    }
  };
}
