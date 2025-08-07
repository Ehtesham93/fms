import {
  APIResponseInternalErr,
  APIResponseOK,
  APIResponseBadRequest,
} from "../../../utils/responseutil.js";
import AccountHdlrImpl from "./accounthdlr_impl.js";
import { validateAllInputs } from "../../../utils/validationutil.js";
import z from "zod";
const ADMIN_ROLEID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
export default class AccountHdlr {
  constructor(accountSvcI, userSvcI, authSvcI, fmsAccountSvcI, logger) {
    this.accountSvcI = accountSvcI;
    this.userSvcI = userSvcI;
    this.authSvcI = authSvcI;
    this.fmsAccountSvcI = fmsAccountSvcI;
    this.logger = logger;
    this.accountHdlrImpl = new AccountHdlrImpl(
      accountSvcI,
      userSvcI,
      authSvcI,
      fmsAccountSvcI,
      logger
    );
  }

  RegisterRoutes(router) {
    router.post("/", this.CreateAccount);
    router.get("/list", this.ListAccounts);
    router.get("/:accountid/overview", this.GetAccountOverview);
    router.put("/:accountid", this.UpdateAccount);
    router.delete("/:accountid", this.DeleteAccount);

    // account - users
    router.get("/:accountid/users", this.GetAccountUsers);
    router.post("/:accountid/user", this.AddUserToAccount);
    router.get("/:accountid/invites", this.ListAccountInvites);
    router.post("/:accountid/invite/cancel", this.CancelEmailInvite);
    router.post("/:accountid/invite", this.InviteContact);
    router.post("/:accountid/invite/resend", this.ResendInvite);
    router.delete("/:accountid/user/:userid", this.RemoveUserFromAccount);
    router.get("/:accountid/pkgs", this.GetAccountPkgs);
    router.post("/:accountid/pkg", this.AddCustomPkgToAccount);
    router.get("/:accountid/pkgs/unassigned", this.GetUnassignedCustomPkgs);
    router.delete("/:accountid/pkg/:pkgid", this.RemoveCustomPkgFromAccount);

    // subscriptions
    router.get(
      "/:accountid/subscription/pkgs",
      this.ListPackagesForSubscription
    );
    router.post(
      "/:accountid/subscription/cost",
      this.CalculateSubscriptionCost
    );
    router.post("/:accountid/subscription", this.CreateSubscription);
    router.get("/:accountid/subscription", this.GetSubscriptionInfo);
    router.get("/:accountid/credits", this.GetAccountCredits);
    router.put("/:accountid/credits", this.UpdateAccountCredits);
    router.get("/:accountid/credits/history", this.GetAccountCreditsHistory);
    router.get("/:accountid/vehicles", this.ListAccountVehicles);
    router.post("/:accountid/vehicles/subscribe", this.SubscribeVehicles);
    router.post("/:accountid/vehicle/unsubscribe", this.UnsubscribeVehicle);
    router.post(
      "/:accountid/subscription/checkchangepkg",
      this.CheckChangeSubscriptionPackage
    );
    router.post(
      "/:accountid/subscription/changepkg",
      this.ChangeSubscriptionPackage
    );
    router.get("/:accountid/subscription/history", this.GetSubscriptionHistory);

    router.get(
      "/:accountid/getallfleetswithvininfo",
      this.GetAllFleetsWithVinInfo
    );

    router.get("/:accountid/vehicles/assignable", this.ListAssignableVehicles);
    router.post("/:accountid/vehicle/:vinno", this.AddVehicleToAccount);
    router.delete("/:accountid/vehicle/:vinno", this.RemoveVehicleFromAccount);
  }

  CreateAccount = async (req, res, next) => {
    try {
      const schema = z.object({
        accountname: z
          .string({ message: "Invalid Account Name format" })
          .nonempty({ message: "Account Name cannot be empty" })
          .max(128, {
            message: "Account Name must be at most 128 characters long",
          })
          .regex(/^[A-Za-z0-9 _-]+$/, {
            message:
              "Account name can only contain letters, numbers, spaces, hyphens, and underscores",
          }),
        isenabled: z
          .boolean({ message: "isenabled must be a boolean" })
          .optional(),
        mobile: z
          .string({ message: "Mobile must be a string" })
          .regex(/^[6-9]\d{9}$/, {
            message:
              "Mobile number must be exactly 10 digits and start with 6 to 9",
          })
          .optional(),
        accountinfo: z
          .record(z.any(), { message: "Account Info must be an object" })
          .default({})
          .optional(),
      });

      let createdby = req.userid;
      const { accountname, isenabled, mobile, accountinfo } = validateAllInputs(
        schema,
        {
          accountname: req.body.accountname,
          isenabled: req.body.isenabled,
          mobile: req.body.mobile,
          accountinfo: req.body.accountinfo,
        }
      );

      let result = await this.accountHdlrImpl.CreateAccountLogic(
        accountname,
        accountinfo,
        isenabled,
        createdby,
        mobile
      );
      APIResponseOK(req, res, result, "Account created successfully");
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
          "CREATE_ACCOUNT_ERR",
          error.toString(),
          "Create account failed"
        );
      }
    }
  };

  ListAccounts = async (req, res, next) => {
    try {
      let result = await this.accountHdlrImpl.ListAccountsLogic();
      APIResponseOK(req, res, result, "Accounts fetched successfully");
    } catch (e) {
      APIResponseInternalErr(
        req,
        res,
        "LIST_ACCOUNTS_ERR",
        e.toString(),
        "List accounts failed"
      );
    }
  };

  GetAccountOverview = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Account ID is required" })
          .uuid({ message: "Invalid Account ID format" }),
      });
      const { accountid } = validateAllInputs(schema, {
        accountid: req.params.accountid,
      });
      let result = await this.accountHdlrImpl.GetAccountOverviewLogic(
        accountid
      );
      APIResponseOK(req, res, result, "Account overview fetched successfully");
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
          "GET_ACCOUNT_OVERVIEW_ERR",
          error.toString(),
          "Get account overview failed"
        );
      }
    }
  };

  UpdateAccount = async (req, res, next) => {
    try {
      let schema = z
        .object({
          accountid: z
            .string({ message: "Account ID is required" })
            .uuid({ message: "Invalid Account ID" }),

          updatedby: z
            .string({ message: "User ID is required" })
            .uuid({ message: "Invalid User ID" }),

          accountname: z
            .string({ message: "Invalid Account Name format" })
            .max(128, {
              message: "Account Name must be at most 128 characters long",
            })
            .regex(/^[A-Za-z0-9 _-]+$/, {
              message:
                "Account name can only contain letters, numbers, spaces, hyphens, and underscores",
            })
            .optional(),

          isenabled: z
            .boolean({ message: "isenabled must be true or false" })
            .optional(),

          accountinfo: z
            .record(z.any(), { message: "Account Info must be an object" })
            .optional(),

          mobile: z
            .string({ message: "Mobile must be a string" })
            .regex(/^[6-9]\d{9}$/, {
              message:
                "Mobile number must be exactly 10 digits and start with 6 to 9",
            })
            .optional(),
        })
        .refine(
          (data) => {
            const updateKeys = Object.keys(data).filter(
              (key) => key !== "accountid" && key !== "updatedby"
            );
            return updateKeys.length > 0;
          },
          { message: "No fields provided for update" }
        );

      let input = {
        accountid: req.params.accountid,
        updatedby: req.userid,
        ...req.body,
      };

      let { accountid, updatedby, ...updateFields } = validateAllInputs(
        schema,
        input
      );
      let result = await this.accountHdlrImpl.UpdateAccountLogic(
        accountid,
        updateFields,
        updatedby
      );

      APIResponseOK(req, res, result, "Account updated successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "UPDATE_ACCOUNT_ERR",
          e.toString(),
          "Update account failed"
        );
      }
    }
  };

  DeleteAccount = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

        deletedby: z
          .string({ message: "User ID is required" })
          .uuid({ message: "User ID must be a valid UUID" }),
      });

      let { accountid, deletedby } = validateAllInputs(schema, {
        accountid: req.params.accountid,
        deletedby: req.userid,
      });
      let result = await this.accountHdlrImpl.DeleteAccountLogic(
        accountid,
        deletedby
      );
      APIResponseOK(req, res, result, "Account deleted successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "DELETE_ACCOUNT_ERR",
          e.toString(),
          "Delete account failed"
        );
      }
    }
  };

  AddUserToAccount = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Account ID is required" })
          .uuid({ message: "Account ID must be a valid UUID" }),

        updatedby: z
          .string({ message: "User ID is required" })
          .uuid({ message: "User ID must be a valid UUID" }),

        contact: z
          .string({ message: "Contact is required" })
          .email({ message: "Contact must be a valid email address" }),
      });

      const { accountid, updatedby, contact } = validateAllInputs(schema, {
        accountid: req.params.accountid,
        updatedby: req.userid,
        contact: req.body.email,
      });

      const result = await this.accountHdlrImpl.AddAdminToAccRootFleetLogic(
        accountid,
        contact,
        updatedby
      );

      APIResponseOK(req, res, result, "User added to account successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "ADD_USER_TO_ACCOUNT_ERR",
          e.toString(),
          "Add user to account failed"
        );
      }
    }
  };

  GetAccountUsers = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
      });
      let { accountid } = validateAllInputs(schema, {
        accountid: req.params.accountid,
      });
      let result = await this.accountHdlrImpl.GetAccountUsersLogic(accountid);
      APIResponseOK(req, res, result, "Account users fetched successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "GET_ACCOUNT_USERS_ERR",
          e.toString(),
          "Get account users failed"
        );
      }
    }
  };

  ListAccountInvites = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
      });

      let { accountid } = validateAllInputs(schema, {
        accountid: req.params.accountid,
      });

      let result = await this.accountHdlrImpl.ListInvitesOfAccountLogic(
        accountid
      );

      APIResponseOK(req, res, result, "Account invites fetched successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "LIST_INVITES_OF_ACCOUNT_ERR",
          e.toString(),
          "List invites of account failed"
        );
      }
    }
  };

  CancelEmailInvite = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

        cancelledby: z
          .string({ message: "User ID is required" })
          .uuid({ message: "User ID Invalid format" }),

        inviteid: z
          .string({ message: "Invite ID is required" })
          .uuid({ message: "Invalid Invite ID format" }),
      });

      let { accountid, inviteid, cancelledby } = validateAllInputs(schema, {
        accountid: req.params.accountid,
        cancelledby: req.userid,
        inviteid: req.body.inviteid,
      });
      let result = await this.accountHdlrImpl.CancelEmailInviteLogic(
        accountid,
        inviteid,
        cancelledby
      );

      APIResponseOK(req, res, result, "Email invite cancelled successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "CANCEL_EMAIL_INVITE_ERR",
          e.toString(),
          "Cancel email invite failed"
        );
      }
    }
  };

  RemoveUserFromAccount = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        userid: z
          .string({ message: "Invalid User ID format" })
          .nonempty({ message: "Invalid User ID format" })
          .max(128, { message: "Invalid User ID format" }),
        updatedby: z
          .string({ message: "UpdatedBy is required" })
          .uuid({ message: "UpdatedBy must be a valid UUID" }),
      });

      let { accountid, userid, updatedby } = validateAllInputs(schema, {
        accountid: req.params.accountid,
        userid: req.params.userid,
        updatedby: req.userid,
      });

      let result = await this.accountHdlrImpl.RemoveUserFromAccountLogic(
        accountid,
        userid,
        updatedby
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

  GetAccountPkgs = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
      });
      const { accountid } = validateAllInputs(schema, {
        accountid: req.params.accountid,
      });
      let result = await this.accountHdlrImpl.GetAccountPkgsLogic(accountid);
      APIResponseOK(req, res, result, "Account packages fetched successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "GET_ACCOUNT_PKGS_ERR",
          e.toString(),
          "Get account packages failed"
        );
      }
    }
  };

  GetUnassignedCustomPkgs = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
      });
      let { accountid } = validateAllInputs(schema, {
        accountid: req.params.accountid,
      });
      let result = await this.accountHdlrImpl.GetUnassignedCustomPkgsLogic(
        accountid
      );
      APIResponseOK(
        req,
        res,
        result,
        "Unassigned custom packages fetched successfully"
      );
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "GET_UNASSIGNED_CUSTOM_PKGS_ERR",
          e.toString(),
          "Get unassigned custom packages failed"
        );
      }
    }
  };

  AddCustomPkgToAccount = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
        updatedby: z
          .string({ message: "User ID is required" })
          .uuid({ message: "User ID must be a valid UUID" }),
        pkgids: z
          .array(
            z
              .string({ message: "Invalid Package ID format" })
              .nonempty({ message: "Invalid package IDs" })
          )
          .min(1, { message: "At least one Package ID is required" }),
      });

      let { accountid, updatedby, pkgids } = validateAllInputs(schema, {
        updatedby: req.userid,
        accountid: req.params.accountid,
        pkgids: req.body.pkgids,
      });

      if (!pkgids || !Array.isArray(pkgids) || pkgids.length === 0) {
        APIResponseBadRequest(
          req,
          res,
          "INVALID_PKGIDS",
          "Invalid package IDs"
        );
        return;
      }
      let result = await this.accountHdlrImpl.AddCustomPkgToAccountLogic(
        accountid,
        pkgids,
        updatedby
      );
      APIResponseOK(
        req,
        res,
        result,
        "Custom package added to account successfully"
      );
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "ADD_CUSTOM_PKG_TO_ACCOUNT_ERR",
          e.toString(),
          "Add custom package to account failed"
        );
      }
    }
  };

  RemoveCustomPkgFromAccount = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Account ID is required" })
          .uuid({ message: "Invalid Account ID format" }),

        updatedby: z
          .string({ message: "UpdatedBy is required" })
          .uuid({ message: "User ID must be a valid UUID" }),

        pkgid: z
          .string({ message: "Package ID is required" })
          .nonempty({ message: "Invalid Package ID format" }),
      });

      let { accountid, updatedby, pkgid } = validateAllInputs(schema, {
        accountid: req.params.accountid,
        updatedby: req.userid,
        pkgid: req.params.pkgid,
      });

      let result = await this.accountHdlrImpl.RemoveCustomPkgFromAccountLogic(
        accountid,
        pkgid,
        updatedby
      );

      APIResponseOK(
        req,
        res,
        result,
        "Custom package removed from account successfully"
      );
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "REMOVE_CUSTOM_PKG_FROM_ACCOUNT_ERR",
          e.toString(),
          "Remove custom package from account failed"
        );
      }
    }
  };

  InviteContact = async (req, res, next) => {
    try {
      let invitedby = req.userid;
      let accountid = req.params.accountid;
      let contact = req.body.contact;
      let roles = [ADMIN_ROLEID];
      let headerReferer = req.headers.origin;

      let contactSchema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

        invitedby: z
          .string({ message: "InvitedBy is required" })
          .uuid({ message: "InvitedBy ID is required" }),

        contact: z
          .string({ message: "Contact is required" })
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

      let { contact: validatedContact } = validateAllInputs(contactSchema, {
        accountid,
        invitedby,
        contact,
      });

      let isEmail = validatedContact.includes("@");

      let result = isEmail
        ? await this.accountHdlrImpl.EmailInviteToRootFleetLogic(
            accountid,
            validatedContact,
            invitedby,
            roles,
            headerReferer
          )
        : await this.accountHdlrImpl.MobileInviteToRootFleetLogic(
            accountid,
            validatedContact,
            invitedby,
            roles,
            headerReferer
          );
      return APIResponseOK(req, res, result, "Invite sent successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "CREATE_INVITE_ERR",
          e.toString(),
          "Create invite failed"
        );
      }
    }
  };

  ResendInvite = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

        invitedby: z
          .string({ message: "User ID is required" })
          .uuid({ message: "User ID must be a valid UUID" }),

        inviteid: z
          .string({ message: "Invite ID is required" })
          .nonempty({ message: "Invite ID cannot be empty" })
          .max(128, {
            message: "Invite ID must be at most 128 characters long",
          }),
      });

      let { accountid, invitedby, inviteid } = validateAllInputs(schema, {
        accountid: req.params.accountid,
        invitedby: req.userid,
        inviteid: req.body.inviteid,
      });

      let headerReferer = req.headers.origin;

      let result = await this.accountHdlrImpl.ResendInviteLogic(
        accountid,
        inviteid,
        invitedby,
        headerReferer
      );

      APIResponseOK(req, res, result, "Invite resent successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "RESEND_INVITE_ERR",
          e.toString(),
          "Resend invite failed"
        );
      }
    }
  };

  ListPackagesForSubscription = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
      });

      const { accountid } = validateAllInputs(schema, {
        accountid: req.params.accountid,
      });
      let result = await this.accountHdlrImpl.ListPackagesForSubscriptionLogic(
        accountid
      );
      APIResponseOK(
        req,
        res,
        result,
        "Packages for subscription fetched successfully"
      );
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "LIST_PACKAGES_FOR_SUBSCRIPTION_ERR",
          e.toString(),
          "List packages for subscription failed"
        );
      }
    }
  };

  CalculateSubscriptionCost = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Account ID is required" })
          .uuid({ message: "Account ID must be a valid UUID" }),

        pkgid: z
          .string({ message: "Package ID is required" })
          .nonempty({ message: "Package ID cannot be empty" })
          .max(128, {
            message: "Package ID must be at most 128 characters long",
          }),

        vehdays: z
          .number({ message: "Vehicle days is required" })
          .min(1, { message: "Vehicle days must be at least 1" }),

        discountpercent: z
          .number({ message: "Invalid Discount Percent format" })
          .default(0),

        startdatems: z.number({ message: "Start date (ms) is required" }),

        enddatems: z.number({ message: "End date (ms) is required" }),
      });
      let {
        accountid,
        pkgid,
        vehdays,
        discountpercent,
        startdatems,
        enddatems,
      } = validateAllInputs(schema, {
        accountid: req.params.accountid,
        pkgid: req.body.pkgid,
        vehdays: req.body.vehdays,
        discountpercent: req.body.discountpercent,
        startdatems: req.body.startdatems,
        enddatems: req.body.enddatems,
      });

      let result = await this.accountHdlrImpl.CalculateSubscriptionCostLogic(
        accountid,
        pkgid,
        vehdays,
        discountpercent,
        startdatems,
        enddatems
      );

      APIResponseOK(
        req,
        res,
        result,
        "Subscription cost calculated successfully"
      );
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "CALCULATE_SUBSCRIPTION_COST_ERR",
          e.toString(),
          "Calculate subscription cost failed"
        );
      }
    }
  };

  CreateSubscription = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Account ID is required" })
          .uuid({ message: "Invalid Account ID format" }),
        createdby: z
          .string({ message: "Createdby ID is required" })
          .uuid({ message: "Createdby ID is required" }),
        pkgid: z
          .string({ message: "Package ID is required" })
          .nonempty({ message: "Package ID cannot be empty" })
          .max(128, {
            message: "Package ID must be at most 128 characters long",
          }),
      });

      let { accountid, createdby, pkgid } = validateAllInputs(schema, {
        createdby: req.userid,
        accountid: req.params.accountid,
        pkgid: req.body.pkgid,
      });
      let result = await this.accountHdlrImpl.CreateSubscriptionLogic(
        accountid,
        pkgid,
        createdby
      );
      APIResponseOK(req, res, result, "Subscription created successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
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

  GetSubscriptionInfo = async (req, res, next) => {
    try {
      const schema = z.object({
        userid: z
          .string({ message: "User ID is required" })
          .uuid({ message: "Invalid User ID format" }),
        accountid: z
          .string({ message: "Account ID is required" })
          .uuid({ message: "Invalid Account ID format" }),
      });

      const { userid, accountid } = validateAllInputs(schema, {
        userid: req.userid,
        accountid: req.params.accountid,
      });

      let result = await this.accountHdlrImpl.GetSubscriptionInfoLogic(
        accountid,
        userid
      );
      APIResponseOK(req, res, result, "Subscription info fetched successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "GET_SUBSCRIPTION_INFO_ERR",
          e.toString(),
          "Get subscription info failed"
        );
      }
    }
  };

  GetAccountCredits = async (req, res, next) => {
    try {
      let schema = z.object({
        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User ID format" }),
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
      });
      const { userid, accountid } = validateAllInputs(schema, {
        userid: req.userid,
        accountid: req.params.accountid,
      });

      let result = await this.accountHdlrImpl.GetAccountCreditsLogic(
        accountid,
        userid
      );
      APIResponseOK(req, res, result, "Account credits fetched successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "GET_ACCOUNT_CREDITS_ERR",
          e.toString(),
          "Get account credits failed"
        );
      }
    }
  };

  UpdateAccountCredits = async (req, res, next) => {
    try {
      let schema = z.object({
        updatedby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User ID format" }),
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),

        credits: z.number({ message: "Invalid Credit format" }),
      });
      let { updatedby, accountid, credits } = validateAllInputs(schema, {
        updatedby: req.userid,
        accountid: req.params.accountid,
        credits: req.body.credits,
      });

      let result = await this.accountHdlrImpl.UpdateAccountCreditsLogic(
        accountid,
        credits,
        updatedby
      );

      APIResponseOK(req, res, result, "Account credits updated successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "UPDATE_ACCOUNT_CREDITS_ERR",
          e.toString(),
          "Update account credits failed"
        );
      }
    }
  };

  GetAccountCreditsHistory = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Invalid Account ID format" }),
      });
      let { accountid } = validateAllInputs(schema, {
        accountid: req.params.accountid,
      });
      let result = await this.accountHdlrImpl.GetAccountCreditsHistoryLogic(
        accountid
      );
      APIResponseOK(
        req,
        res,
        result,
        "Account credits history fetched successfully"
      );
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "GET_ACCOUNT_CREDITS_HISTORY_ERR",
          e.toString(),
          "Get account credits history failed"
        );
      }
    }
  };

  // TODO: add a handler to remove a vehicle from the fleet
  // TODO: add canunsubscribe vehicle field in the response
  ListAccountVehicles = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Account ID is required" })
          .uuid({ message: "Account ID must be a valid UUID" }),
        subscriptiontype: z
          .string({ message: "Invalid  Subscription Type" })
          .nonempty({ message: "Invalid  Subscription Type" }),
      });

      let { accountid, subscriptiontype } = validateAllInputs(schema, {
        accountid: req.params.accountid,
        subscriptiontype: req.query.subscriptiontype,
      });

      let result = await this.accountHdlrImpl.ListAccountVehiclesLogic(
        accountid,
        subscriptiontype
      );

      APIResponseOK(req, res, result, "Account vehicles fetched successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "GET_ACCOUNT_VEHICLES_ERR",
          e.toString(),
          "Get account vehicles failed"
        );
      }
    }
  };

  SubscribeVehicles = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Account ID is required" })
          .uuid({ message: "Account ID must be a valid UUID" }),

        updatedby: z
          .string({ message: "User ID is required" })
          .uuid({ message: "User ID must be a valid UUID" }),

        vinnos: z
          .array(
            z
              .string({ message: "Invalid VIN No format" })
              .nonempty({ message: "VIN NO cannot be empty" })
          )
          .min(1, { message: "At least one VIN is required" }),
      });

      let { accountid, updatedby, vinnos } = validateAllInputs(schema, {
        accountid: req.params.accountid,
        updatedby: req.userid,
        vinnos: req.body.vinnos,
      });
      if (!vinnos || !Array.isArray(vinnos) || vinnos.length === 0) {
        APIResponseBadRequest(
          req,
          res,
          "INVALID_VINNOS",
          "Invalid VIN numbers"
        );
        return;
      }
      const result = await this.accountHdlrImpl.SubscribeVehiclesLogic(
        accountid,
        vinnos,
        updatedby
      );

      APIResponseOK(req, res, result, "Vehicles subscribed successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "SUBSCRIBE_VEHICLES_ERR",
          e.toString(),
          "Subscribe vehicles failed"
        );
      }
    }
  };

  UnsubscribeVehicle = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Account ID is required" })
          .uuid({ message: "Account ID must be a valid UUID" }),

        updatedby: z
          .string({ message: "User ID is required" })
          .uuid({ message: "User ID must be a valid UUID" }),

        vinno: z
          .string({ message: "VIN number is required" })
          .nonempty({ message: "VIN number cannot be empty" })
          .max(128, { message: "VIN number must be at most 128 characters" }),
      });

      const { accountid, updatedby, vinno } = validateAllInputs(schema, {
        accountid: req.params.accountid,
        updatedby: req.userid,
        vinno: req.body.vinno,
      });

      const result = await this.accountHdlrImpl.UnsubscribeVehicleLogic(
        accountid,
        vinno,
        updatedby
      );

      APIResponseOK(req, res, result, "Vehicle unsubscribed successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "UNSUBSCRIBE_VEHICLE_ERR",
          e.toString(),
          "Unsubscribe vehicle failed"
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
          .string({ message: "Invalid New Package format" })
          .nonempty({ message: "Invalid New Package format" })
          .max(128, {
            message: "New Package ID must be at most 128 characters",
          }),
      });

      let { accountid, newpkgid } = validateAllInputs(schema, {
        accountid: req.params.accountid,
        newpkgid: req.body.newpkgid,
      });

      let result =
        await this.accountHdlrImpl.CheckChangeSubscriptionPackageLogic(
          accountid,
          newpkgid
        );

      APIResponseOK(
        req,
        res,
        result,
        "Check change subscription package success"
      );
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "CHECK_CHANGE_SUBSCRIPTION_PACKAGE_ERR",
          e.toString(),
          "Check change subscription package failed"
        );
      }
    }
  };

  ChangeSubscriptionPackage = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Account ID is required" })
          .uuid({ message: "Account ID must be a valid UUID" }),

        newpkgid: z
          .string({ message: "New package ID is required" })
          .nonempty({ message: "New package ID is required" })
          .max(128, {
            message: "New Package ID must be at most 128 characters",
          }),
        updatedby: z
          .string({ message: "User ID is required" })
          .uuid({ message: "User ID must be a valid UUID" }),
      });
      let { accountid, newpkgid, updatedby } = validateAllInputs(schema, {
        accountid: req.params.accountid,
        newpkgid: req.body.newpkgid,
        updatedby: req.userid,
      });

      let result = await this.accountHdlrImpl.ChangeSubscriptionPackageLogic(
        accountid,
        newpkgid,
        updatedby
      );

      APIResponseOK(
        req,
        res,
        result,
        "Subscription package changed successfully"
      );
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "CHANGE_SUBSCRIPTION_PACKAGE_ERR",
          e.toString(),
          "Change subscription package failed"
        );
      }
    }
  };

  GetSubscriptionHistory = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Account ID is required" })
          .uuid({ message: "Account ID must be a valid UUID" }),
      });
      let { accountid } = validateAllInputs(schema, {
        accountid: req.params.accountid,
      });
      let result = await this.accountHdlrImpl.GetSubscriptionHistoryLogic(
        accountid
      );

      APIResponseOK(
        req,
        res,
        result,
        "Subscription history fetched successfully"
      );
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "GET_SUBSCRIPTION_HISTORY_ERR",
          e.toString(),
          "Get subscription history failed"
        );
      }
    }
  };

  GetAllFleetsWithVinInfo = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Account ID must be a valid UUID" }),
      });
      let recursive = req.query.recursive
        ? req.query.recursive === "true"
        : false;
      let { accountid } = validateAllInputs(schema, {
        accountid: req.params.accountid,
      });
      let fleets = await this.accountHdlrImpl.GetAllFleetsWithVinInfoLogic(
        accountid,
        recursive
      );
      APIResponseOK(req, res, fleets);
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(req, res, e);
      }
    }
  };

  AddVehicleToAccount = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Account ID must be a valid UUID" }),

        assignedby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),

        vinno: z
          .string({ message: "Invalid VIN format" })
          .nonempty({ message: "VIN cannot be empty" })
          .max(128, { message: "VIN must not exceed 128 characters" }),

        regno: z
          .string({ message: "Invalid Registration Number format" })
          .nonempty({ message: "Registration Number cannot be empty" })
          .max(128, {
            message: "Registration Number must not exceed 128 characters",
          }),
        isowner: z.boolean({ message: "isowner must be a boolean" }),
        accvininfo: z
          .record(z.any(), { message: "accvininfo must be an object" })
          .default({}),
      });

      let { accountid, assignedby, vinno, regno, isowner, accvininfo } =
        validateAllInputs(schema, {
          accountid: req.params.accountid,
          vinno: req.params.vinno,
          assignedby: req.userid,
          regno: req.body.vehicleinfo?.regno,
          isowner: req.body.vehicleinfo?.isowner,
          accvininfo: req.body.vehicleinfo?.accvininfo,
        });

      let vehicleinfo = { vinno, regno, isowner, accvininfo };

      let result = await this.accountHdlrImpl.AddVehicleToAccountLogic(
        accountid,
        vehicleinfo,
        assignedby
      );

      APIResponseOK(req, res, result, "Vehicle added to account successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "ADD_VEHICLE_TO_ACCOUNT_ERR",
          e.toString(),
          "Add vehicle to account failed"
        );
      }
    }
  };

  RemoveVehicleFromAccount = async (req, res, next) => {
    try {
      let schema = z.object({
        accountid: z
          .string({ message: "Invalid Account ID format" })
          .uuid({ message: "Account ID must be a valid UUID" }),

        vinno: z
          .string({ message: "Invalid VIN format" })
          .nonempty({ message: "VIN cannot be empty" })
          .max(128, { message: "VIN must not exceed 128 characters" }),

        removedby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),
      });

      let { accountid, vinno, removedby } = validateAllInputs(schema, {
        accountid: req.params.accountid,
        vinno: req.params.vinno,
        removedby: req.userid,
      });

      let result = await this.accountHdlrImpl.RemoveVehicleFromAccountLogic(
        accountid,
        vinno,
        removedby
      );

      APIResponseOK(
        req,
        res,
        result,
        "Vehicle removed from account successfully"
      );
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "REMOVE_VEHICLE_FROM_ACCOUNT_ERR",
          e.toString(),
          "Remove vehicle from account failed"
        );
      }
    }
  };

  ListAssignableVehicles = async (req, res, next) => {
    try {
      const schema = z.object({
        accountid: z
          .string({ message: "Account ID is required" })
          .uuid({ message: "Account ID must be a valid UUID" }),
      });

      const { accountid } = validateAllInputs(schema, {
        accountid: req.params.accountid,
      });

      let result = await this.accountHdlrImpl.ListAssignableVehiclesLogic(
        accountid
      );
      APIResponseOK(
        req,
        res,
        result,
        "Assignable vehicles fetched successfully"
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
          "LIST_ASSIGNABLE_VEHICLES_ERR",
          error.toString(),
          "List assignable vehicles failed"
        );
      }
    }
  };
}
