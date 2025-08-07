import z from "zod";
import PublicApiAuditSvc from "../../services/auditsvc/publicsvc_audit.js";
import { bindAuditToMethods } from "../../utils/auditutil.js";
import {
  APIResponseBadRequest,
  APIResponseInternalErr,
  APIResponseOK,
} from "../../utils/responseutil.js";
import {
  validateAllInputs,
  ValidateCaptcha,
} from "../../utils/validationutil.js";
import PublicHdlrImpl from "./publichdlr_impl.js";
import PublicRateLimiter from "./publichdlr_ratelimit.js";

export default class PublicHdlr {
  constructor(userSvcI, authSvcI, fmsSvcI, platformSvcI, config, logger) {
    this.userSvcI = userSvcI;
    this.authSvcI = authSvcI;
    this.fmsSvcI = fmsSvcI;
    this.platformSvcI = platformSvcI;
    this.config = config;
    this.logger = logger;
    this.publicHdlrImpl = new PublicHdlrImpl(
      userSvcI,
      authSvcI,
      fmsSvcI,
      platformSvcI,
      logger
    );

    this.auditSvc = new PublicApiAuditSvc(userSvcI.pgPoolI, logger);
    const methodsToAudit = [
      "GetSuperAdminToken",
      "CheckContact",
      "SignupWithInvite",
      "ValidateInvite",
      "UserEmailSignIn",
      "MobileSignIn",
      "MobileSendOtp",
      "ForgotPassword",
      "ResetPassword",
      "ValidateResetToken",
      "DeleteSession",
      "ChangePassword",
    ];

    bindAuditToMethods(this, this.auditSvc, logger, methodsToAudit);

    this.rateLimiter = new PublicRateLimiter(logger);
    this.limiters = this.rateLimiter.getRateLimiters();
  }

  RegisterRoutes(router) {
    router.use(this.limiters.generalLimiter);

    router.post(
      "/superadmin/token",
      ...this.rateLimiter.getAdminLimiters(),
      this.GetSuperAdminToken
    );

    router.post(
      "/contact/check",
      this.limiters.contactCheckLimiter,
      this.CheckContact
    );

    router.post(
      "/invite/signup",
      this.limiters.signupLimiter,
      this.SignupWithInvite
    );

    router.post(
      "/invite/validate",
      this.limiters.signupLimiter,
      this.ValidateInvite
    );

    router.post(
      "/email/signin",
      ...this.rateLimiter.getSigninLimiters(),
      this.UserEmailSignIn
    );
    router.post(
      "/mobile/signin",
      ...this.rateLimiter.getSigninLimiters(),
      this.MobileSignIn
    );

    router.post(
      "/mobile/sendotp",
      ...this.rateLimiter.getOTPLimiters(),
      this.MobileSendOtp
    );

    router.post(
      "/mpin/signin",
      ...this.rateLimiter.getOTPLimiters(),
      this.MpinSignIn
    );

    router.post(
      "/user/forgotpassword",
      ...this.rateLimiter.getPasswordResetLimiters(),
      this.ForgotPassword
    );
    router.post(
      "/user/resetpassword",
      ...this.rateLimiter.getPasswordResetLimiters(),
      this.ResetPassword
    );
    router.post(
      "/user/resetpassword/validate",
      this.limiters.passwordResetMinuteLimiter,
      this.ValidateResetToken
    );

    router.delete("/user/session", this.DeleteSession);

    router.post("/user/password/change", this.ChangePassword);

    router.post(
      "/gettestusertoken",
      ...this.rateLimiter.getSigninLimiters(),
      this.GetTestUserToken
    );
  }

  handleError = (error, req, res, defaultErrorCode, defaultMessage) => {
    this.logger.error(`API Error: ${error?.stack || error?.message || error}`);

    if (error.errcode === "INPUT_ERROR") {
      return APIResponseBadRequest(
        req,
        res,
        error.errcode,
        error.errdata,
        error.message
      );
    }

    if (error.errcode === "RATE_LIMIT_EXCEEDED") {
      return APIResponseBadRequest(
        req,
        res,
        error.errcode,
        null,
        error.message
      );
    }

    const userFriendlyErrors = {
      "User not found": {
        code: "USER_NOT_FOUND",
        message:
          "We couldn't find an account with the provided details. Please check and try again.",
      },
      "Invalid email or password": {
        code: "INVALID_CREDENTIALS",
        message:
          "The email or password you entered is incorrect. Please try again.",
      },
      "Invalid OTP": {
        code: "INVALID_OTP",
        message:
          "The OTP you entered is incorrect or has expired. Please try again.",
      },
      "Invalid MPIN": {
        code: "INVALID_MPIN",
        message: "The MPIN you entered is incorrect. Please try again.",
      },
      "User is not enabled": {
        code: "ACCOUNT_DISABLED",
        message:
          "Your account has been disabled. Please contact support for assistance.",
      },
      "User is deleted": {
        code: "ACCOUNT_DELETED",
        message:
          "This account is no longer active. Please contact support if you believe this is an error.",
      },
      "User is disabled": {
        code: "ACCOUNT_DISABLED",
        message:
          "Your account has been disabled. Please contact support for assistance.",
      },
      "User has been deleted": {
        code: "ACCOUNT_DELETED",
        message:
          "This account is no longer active. Please contact support if you believe this is an error.",
      },
      "User is not superadmin": {
        code: "INSUFFICIENT_PERMISSIONS",
        message:
          "You don't have the required permissions to access this resource.",
      },
      "MPIN not set for this user": {
        code: "MPIN_NOT_SET",
        message:
          "MPIN is not set for this account. Please set up your MPIN first.",
      },
      "MPIN is disabled for this user": {
        code: "MPIN_DISABLED",
        message:
          "MPIN authentication is disabled for this account. Please use alternative login method.",
      },
      "Invalid or expired reset token": {
        code: "INVALID_RESET_TOKEN",
        message:
          "This password reset link is invalid or has expired. Please request a new one.",
      },
      "Reset token has expired": {
        code: "RESET_TOKEN_EXPIRED",
        message:
          "This password reset link has expired. Please request a new one.",
      },
      "Reset token has already been used": {
        code: "RESET_TOKEN_USED",
        message:
          "This password reset link has already been used. Please request a new one if needed.",
      },
      "Failed to create account for mobile user": {
        code: "ACCOUNT_CREATION_FAILED",
        message:
          "We encountered an issue creating your account. Please try again later.",
      },
      "Failed to signup with invite": {
        code: "SIGNUP_FAILED",
        message:
          "We couldn't complete your signup. Please check your invite link and try again.",
      },
      "Failed to create user in auth service": {
        code: "AUTH_SERVICE_ERROR",
        message:
          "We encountered an issue setting up your account. Please try again later.",
      },
      "User not found with this email address": {
        code: "EMAIL_NOT_FOUND",
        message:
          "We couldn't find an account associated with this email address.",
      },
      "New password cannot be the same as the old password": {
        code: "PASSWORD_SAME_AS_OLD",
        message:
          "New password cannot be the same as your current password. Please choose a different password.",
      },
      "Password has expired": {
        code: "PASSWORD_EXPIRED",
        message:
          "Your password has expired. Please reset your password to continue.",
      },
    };

    const errorMessage = error.message || error.toString();
    const friendlyError = userFriendlyErrors[errorMessage];

    if (friendlyError) {
      return APIResponseBadRequest(
        req,
        res,
        friendlyError.code,
        null,
        friendlyError.message
      );
    }

    return APIResponseInternalErr(
      req,
      res,
      defaultErrorCode,
      error.toString(),
      defaultMessage
    );
  };

  CheckContact = async (req, res, next) => {
    try {
      const captchaToken = req.body["g-recaptcha-response"];
      const remoteIp = req.ip;

      // TODO: Remove this once we have a proper captcha implementation
      if (captchaToken) {
        if (!captchaToken) {
          return APIResponseBadRequest(
            req,
            res,
            "CAPTCHA_MISSING",
            null,
            "Please complete the security verification to continue."
          );
        }

        const isValidCaptcha = await ValidateCaptcha(
          captchaToken,
          remoteIp,
          this.config
        );

        if (!isValidCaptcha) {
          return APIResponseBadRequest(
            req,
            res,
            "CAPTCHA_FAILED",
            null,
            "Security verification failed. Please try again."
          );
        }
      }

      let schema = z.object({
        contact: z
          .string({
            message: "Please provide a valid contact (email or mobile number)",
          })
          .nonempty({ message: "Contact information is required" })
          .max(128, {
            message: "Contact must be at most 128 characters long",
          }),
      });

      let { contact } = validateAllInputs(schema, {
        contact: req.body.contact,
      });

      let result = await this.publicHdlrImpl.CheckContactLogic(contact);
      APIResponseOK(req, res, result, "Contact verified successfully");
    } catch (error) {
      return this.handleError(
        error,
        req,
        res,
        "CHECK_CONTACT_ERR",
        "We couldn't verify your contact information. Please try again."
      );
    }
  };

  MobileSendOtp = async (req, res, next) => {
    try {
      const captchaToken = req.body["g-recaptcha-response"];
      const remoteIp = req.ip;

      // TODO: Remove this once we have a proper captcha implementation
      if (captchaToken) {
        if (!captchaToken) {
          return APIResponseBadRequest(
            req,
            res,
            "CAPTCHA_MISSING",
            null,
            "Please complete the security verification to continue."
          );
        }

        const isValidCaptcha = await ValidateCaptcha(
          captchaToken,
          remoteIp,
          this.config
        );

        if (!isValidCaptcha) {
          return APIResponseBadRequest(
            req,
            res,
            "CAPTCHA_FAILED",
            null,
            "Security verification failed. Please try again."
          );
        }
      }

      let schema = z.object({
        mobile: z
          .string({ message: "Please provide a valid mobile number" })
          .regex(/^[6-9]\d{9}$/, {
            message:
              "Mobile number must be exactly 10 digits and start with 6 to 9",
          }),
      });

      let { mobile } = validateAllInputs(schema, {
        mobile: req.body.mobile,
      });

      let result = await this.publicHdlrImpl.MobileSendOtpLogic(mobile, req);
      APIResponseOK(
        req,
        res,
        result,
        "OTP sent successfully to your mobile number"
      );
    } catch (error) {
      return this.handleError(
        error,
        req,
        res,
        "MOBILE_SEND_OTP_ERR",
        "We couldn't send the OTP to your mobile number. Please try again."
      );
    }
  };

  MobileSignIn = async (req, res, next) => {
    try {
      let schema = z.object({
        mobile: z
          .string({ message: "Please provide a valid mobile number" })
          .regex(/^[6-9]\d{9}$/, {
            message:
              "Mobile number must be exactly 10 digits and start with 6 to 9",
          }),

        // TODO: Uncomment OTP validation after new Android build
        // otp: z
        //   .string({ message: "Invalid OTP format" })
        //   .nonempty({ message: "OTP cannot be empty" }),
      });

      //TODO: uncomment this after new Android build
      // let { mobile, otp } = validateAllInputs(schema, {
      //   mobile: req.body.mobile,
      //   otp: req.body.otp,
      // });

      //TODO: remove this after new Android build
      let { mobile } = validateAllInputs(schema, {
        mobile: req.body.mobile,
      });

      let otp = req.body.otp;

      let validityMs = req.body.validity;
      let expiresin = 1 * 24 * 60 * 60;
      let refreshTokenMaxAge = 30 * 24 * 60 * 60;

      if (validityMs) {
        expiresin = Math.floor(validityMs / 1000);
      }

      let result = await this.publicHdlrImpl.MobileSignInLogic(
        mobile,
        otp,
        expiresin,
        refreshTokenMaxAge
      );
      res.cookie("token", result.usertoken, {
        httpOnly: true,
        secure: true,
        maxAge: 1000 * 60 * 60 * 24 * 31, // 31 day
        path: "/",
        sameSite: "None",
      });
      res.cookie("refreshtoken", result.refreshtoken, {
        httpOnly: true,
        secure: true,
        maxAge: 1000 * 60 * 60 * 24 * 31, // 31 days
        path: "/",
        sameSite: "None",
      });

      APIResponseOK(
        req,
        res,
        result,
        "Successfully signed in with your mobile number"
      );
    } catch (error) {
      return this.handleError(
        error,
        req,
        res,
        "MOBILE_SIGN_IN_ERR",
        "We couldn't sign you in. Invalid OTP."
      );
    }
  };

  GetSuperAdminToken = async (req, res, next) => {
    try {
      let schema = z.object({
        email: z
          .string({ message: "Please provide a valid email address" })
          .email({ message: "Please provide a valid email format" }),
        password: z
          .string({ message: "Password is required" })
          .nonempty({ message: "Password cannot be empty" })
          .min(8, { message: "Password must be at least 8 characters long" })
          .max(128, { message: "Password must not exceed 128 characters" }),
      });

      let { email, password } = validateAllInputs(schema, {
        email: req.body.email,
        password: req.body.password,
      });

      let validityMs = req.body.validity;
      let expiresin = 1 * 24 * 60 * 60;
      let refreshTokenMaxAge = 30 * 24 * 60 * 60;

      if (validityMs) {
        expiresin = Math.floor(validityMs / 1000);
      }

      let result = await this.publicHdlrImpl.GetSuperAdminTokenLogic(
        email,
        password,
        expiresin,
        refreshTokenMaxAge
      );
      res.cookie("token", result.token, {
        httpOnly: true,
        secure: true,
        maxAge: 1000 * 60 * 60 * 24 * 31, // 31 day
        path: "/",
        sameSite: "None",
      });
      res.cookie("refreshtoken", result.refreshtoken, {
        httpOnly: true,
        secure: true,
        maxAge: 1000 * 60 * 60 * 24 * 31, // 31 days
        path: "/",
        sameSite: "None",
      });

      APIResponseOK(req, res, result, "Admin access granted successfully");
    } catch (error) {
      return this.handleError(
        error,
        req,
        res,
        "GET_SUPER_ADMIN_TOKEN_ERR",
        "We couldn't verify your admin credentials. Please check your details and try again."
      );
    }
  };

  UserEmailSignIn = async (req, res, next) => {
    try {
      const captchaToken = req.body["g-recaptcha-response"];
      const remoteIp = req.ip;

      // TODO: Remove this once we have a proper captcha implementation
      // if (captchaToken) {
      if (!captchaToken) {
        return APIResponseBadRequest(
          req,
          res,
          "CAPTCHA_MISSING",
          null,
          "Please complete the security verification to continue."
        );
      }

      const isValidCaptcha = await ValidateCaptcha(
        captchaToken,
        remoteIp,
        this.config
      );

      if (!isValidCaptcha) {
        return APIResponseBadRequest(
          req,
          res,
          "CAPTCHA_FAILED",
          null,
          "Security verification failed. Please try again."
        );
      }
      // }

      let schema = z.object({
        email: z
          .string({ message: "Please provide a valid email address" })
          .email({ message: "Please provide a valid email format" }),
        password: z
          .string({ message: "Password is required" })
          .nonempty({ message: "Password cannot be empty" })
          .min(8, { message: "Password must be at least 8 characters long" })
          .max(128, { message: "Password must not exceed 128 characters" }),
      });

      let { email, password } = validateAllInputs(schema, {
        email: req.body.email,
        password: req.body.password,
      });

      let validity = req.body.validity;
      let expiresin = 1 * 60 * 60;
      let refreshTokenMaxAge = 30 * 24 * 60 * 60;

      if (validity && Array.isArray(validity) && validity.length >= 2) {
        expiresin = Math.floor(validity[0] / 1000);
        refreshTokenMaxAge = validity[1];
      } else if (validity && !Array.isArray(validity)) {
        expiresin = Math.floor(validity / 1000);
      }

      let result = await this.publicHdlrImpl.UserEmailSignInLogic(
        email,
        password,
        expiresin,
        refreshTokenMaxAge
      );
      res.cookie("token", result.token, {
        httpOnly: true,
        secure: true,
        maxAge: 1000 * 60 * 60 * 24 * 31, // 31 day
        path: "/",
        sameSite: "None",
      });
      res.cookie("refreshtoken", result.refreshtoken, {
        httpOnly: true,
        secure: true,
        maxAge: 1000 * 60 * 60 * 24 * 31, // 31 days
        path: "/",
        sameSite: "None",
      });

      APIResponseOK(req, res, result, "Successfully signed in with your email");
    } catch (error) {
      return this.handleError(
        error,
        req,
        res,
        "USER_EMAIL_SIGN_IN_ERR",
        "We couldn't sign you in. Invalid email or password."
      );
    }
  };

  GetTestUserToken = async (req, res, next) => {
    try {
      let schema = z.object({
        email: z
          .string({ message: "Please provide a valid email address" })
          .email({ message: "Please provide a valid email format" }),
        password: z
          .string({ message: "Password is required" })
          .nonempty({ message: "Password cannot be empty" })
          .min(8, { message: "Password must be at least 8 characters long" })
          .max(128, { message: "Password must not exceed 128 characters" }),
      });

      let { email, password } = validateAllInputs(schema, {
        email: req.body.email,
        password: req.body.password,
      });

      let expiresin = 24 * 60 * 60;
      let refreshTokenMaxAge = 30 * 24 * 60 * 60;

      let result = await this.publicHdlrImpl.GetTestUserTokenLogic(
        email,
        password,
        expiresin,
        refreshTokenMaxAge
      );
      res.cookie("token", result.token, {
        httpOnly: true,
        secure: true,
        maxAge: 1000 * 60 * 60 * 24 * 31, // 31 day
        path: "/",
        sameSite: "None",
      });
      res.cookie("refreshtoken", result.refreshtoken, {
        httpOnly: true,
        secure: true,
        maxAge: 1000 * 60 * 60 * 24 * 31, // 31 days
        path: "/",
        sameSite: "None",
      });

      APIResponseOK(req, res, result, "Successfully signed in with your email");
    } catch (error) {
      return this.handleError(
        error,
        req,
        res,
        "USER_EMAIL_SIGN_IN_ERR",
        "We couldn't sign you in. Invalid email or password."
      );
    }
  };

  SignupWithInvite = async (req, res, next) => {
    try {
      const captchaToken = req.body["g-recaptcha-response"];
      const remoteIp = req.ip;

      if (!captchaToken) {
        return APIResponseBadRequest(
          req,
          res,
          "CAPTCHA_MISSING",
          null,
          "Please complete the security verification to continue."
        );
      }

      const isValidCaptcha = await ValidateCaptcha(
        captchaToken,
        remoteIp,
        this.config
      );

      if (!isValidCaptcha) {
        return APIResponseBadRequest(
          req,
          res,
          "CAPTCHA_FAILED",
          null,
          "Security verification failed. Please try again."
        );
      }

      let schema = z.object({
        inviteid: z
          .string({ message: "Invite ID is required" })
          .uuid({ message: "Please provide a valid invite link" }),
        password: z
          .string({ message: "Password is required" })
          .nonempty({ message: "Password cannot be empty" })
          .min(8, { message: "Password must be at least 8 characters long" })
          .max(128, { message: "Password must not exceed 128 characters" }),
        displayname: z
          .string({ message: "Display name is required" })
          .nonempty({ message: "Display name cannot be empty" })
          .max(128, {
            message: "Display name must be at most 128 characters long",
          })
          .regex(/^[A-Za-z0-9 _-]+$/, {
            message:
              "Display name can only contain letters, numbers, spaces, hyphens, and underscores",
          }),
      });

      let { inviteid, password, displayname } = validateAllInputs(
        schema,
        req.body
      );

      let result = await this.publicHdlrImpl.SignupWithInviteLogic(
        inviteid,
        displayname,
        password
      );
      res.cookie("token", result.token, {
        httpOnly: true,
        secure: true,
        maxAge: 1000 * 60 * 60 * 24 * 31, // 31 day
        path: "/",
        sameSite: "None",
      });
      res.cookie("refreshtoken", result.refreshtoken, {
        httpOnly: true,
        secure: true,
        maxAge: 1000 * 60 * 60 * 24 * 31, // 31 days
        path: "/",
        sameSite: "None",
      });

      APIResponseOK(
        req,
        res,
        result,
        "Welcome! Your account has been created successfully"
      );
    } catch (error) {
      return this.handleError(
        error,
        req,
        res,
        "SIGNUP_WITH_INVITE_ERR",
        "We couldn't create your account. Please check your invite link and try again."
      );
    }
  };

  // Note: this is not used in frontend
  ValidateInvite = async (req, res, next) => {
    try {
      let schema = z.object({
        inviteid: z
          .string({ message: "Invite ID is required" })
          .uuid({ message: "Please provide a valid invite link" }),
      });

      let { inviteid } = validateAllInputs(schema, {
        inviteid: req.body.inviteid,
      });

      let result = await this.publicHdlrImpl.ValidateInviteLogic(inviteid);
      APIResponseOK(req, res, result, "Invite link is valid and ready to use");
    } catch (error) {
      return this.handleError(
        error,
        req,
        res,
        "VALIDATE_INVITE_ERR",
        "This invite link is invalid or has expired. Please request a new invitation."
      );
    }
  };

  ForgotPassword = async (req, res, next) => {
    try {
      const captchaToken = req.body["g-recaptcha-response"];
      const remoteIp = req.ip;

      // TODO: Remove this once we have a proper captcha implementation
      if (captchaToken) {
        if (!captchaToken) {
          return APIResponseBadRequest(
            req,
            res,
            "CAPTCHA_MISSING",
            null,
            "Please complete the security verification to continue."
          );
        }

        const isValidCaptcha = await ValidateCaptcha(
          captchaToken,
          remoteIp,
          this.config
        );

        if (!isValidCaptcha) {
          return APIResponseBadRequest(
            req,
            res,
            "CAPTCHA_FAILED",
            null,
            "Security verification failed. Please try again."
          );
        }
      }

      let schema = z.object({
        email: z
          .string()
          .email({ message: "Please provide a valid email address" }),
      });

      let { email } = validateAllInputs(schema, {
        email: req.body.email,
      });

      const headerReferer = req.headers.origin;

      if (!headerReferer) {
        return APIResponseBadRequest(
          req,
          res,
          "HEADER_REFERER_MISSING",
          null,
          "Invalid request source. Please try again from the application."
        );
      }

      let result = await this.publicHdlrImpl.ForgotPasswordLogic(
        email,
        headerReferer
      );
      APIResponseOK(
        req,
        res,
        result,
        "Password reset instructions have been sent to your email"
      );
    } catch (error) {
      return this.handleError(
        error,
        req,
        res,
        "FORGOT_PASSWORD_ERR",
        "We couldn't process your password reset request. Please try again."
      );
    }
  };

  ResetPassword = async (req, res, next) => {
    try {
      const captchaToken = req.body["g-recaptcha-response"];
      const remoteIp = req.ip;

      // TODO: Remove this once we have a proper captcha implementation
      // if (captchaToken) {
      if (!captchaToken) {
        return APIResponseBadRequest(
          req,
          res,
          "CAPTCHA_MISSING",
          null,
          "Please complete the security verification to continue."
        );
      }

      const isValidCaptcha = await ValidateCaptcha(
        captchaToken,
        remoteIp,
        this.config
      );

      if (!isValidCaptcha) {
        return APIResponseBadRequest(
          req,
          res,
          "CAPTCHA_FAILED",
          null,
          "Security verification failed. Please try again."
        );
      }
      // }

      let schema = z.object({
        resetid: z
          .string({ message: "Reset token is required" })
          .uuid({ message: "Invalid password reset link" }),
        newpassword: z
          .string({ message: "New password is required" })
          .nonempty({ message: "New password cannot be empty" })
          .min(8, { message: "Password must be at least 8 characters long" })
          .max(128, { message: "Password must not exceed 128 characters" }),
      });

      let { resetid, newpassword } = validateAllInputs(schema, {
        resetid: req.body.resetid,
        newpassword: req.body.newpassword,
      });

      let result = await this.publicHdlrImpl.ResetPasswordLogic(
        resetid,
        newpassword
      );
      APIResponseOK(
        req,
        res,
        result,
        "Your password has been reset successfully"
      );
    } catch (error) {
      return this.handleError(
        error,
        req,
        res,
        "RESET_PASSWORD_ERR",
        "We couldn't reset your password. Please try requesting a new reset link."
      );
    }
  };

  ValidateResetToken = async (req, res, next) => {
    try {
      const captchaToken = req.body["g-recaptcha-response"];
      const remoteIp = req.ip;

      // TODO: Remove this once we have a proper captcha implementation
      if (captchaToken) {
        if (!captchaToken) {
          return APIResponseBadRequest(
            req,
            res,
            "CAPTCHA_MISSING",
            null,
            "Please complete the security verification to continue."
          );
        }

        const isValidCaptcha = await ValidateCaptcha(
          captchaToken,
          remoteIp,
          this.config
        );

        if (!isValidCaptcha) {
          return APIResponseBadRequest(
            req,
            res,
            "CAPTCHA_FAILED",
            null,
            "Security verification failed. Please try again."
          );
        }
      }

      let schema = z.object({
        resetid: z
          .string({ message: "Reset token is required" })
          .uuid({ message: "Invalid password reset link" }),
      });

      let { resetid } = validateAllInputs(schema, {
        resetid: req.body.resetid,
      });

      let result = await this.publicHdlrImpl.ValidateResetTokenLogic(resetid);
      APIResponseOK(req, res, result, "Password reset link is valid");
    } catch (error) {
      return this.handleError(
        error,
        req,
        res,
        "VALIDATE_RESET_TOKEN_ERR",
        "This password reset link is invalid or has expired. Please request a new one."
      );
    }
  };

  DeleteSession = async (req, res, next) => {
    try {
      res.clearCookie("token");
      APIResponseOK(req, res, {}, "You have been signed out successfully");
    } catch (error) {
      return this.handleError(
        error,
        req,
        res,
        "DELETE_SESSION_ERR",
        "We couldn't sign you out properly. Please try again."
      );
    }
  };

  MpinSignIn = async (req, res, next) => {
    try {
      let schema = z.object({
        mobile: z
          .string({ message: "Please provide a valid mobile number" })
          .regex(/^[6-9]\d{9}$/, {
            message:
              "Mobile number must be exactly 10 digits and start with 6 to 9",
          }),
        mpin: z
          .string({ message: "MPIN is required" })
          .nonempty({ message: "Please enter your MPIN" }),
      });

      let { mobile, mpin } = validateAllInputs(schema, {
        mobile: req.body.mobile,
        mpin: req.body.mpin,
      });

      let validityMs = req.body.validity;
      let expiresin = 1 * 24 * 60 * 60;
      let refreshTokenMaxAge = 30 * 24 * 60 * 60;

      if (validityMs) {
        expiresin = Math.floor(validityMs / 1000);
      }

      let result = await this.publicHdlrImpl.MpinSignInLogic(
        mobile,
        mpin,
        expiresin,
        refreshTokenMaxAge
      );
      res.cookie("token", result.usertoken, {
        httpOnly: true,
        secure: true,
        maxAge: 1000 * 60 * 60 * 24 * 31, // 31 day
        path: "/",
        sameSite: "None",
      });
      res.cookie("refreshtoken", result.refreshtoken, {
        httpOnly: true,
        secure: true,
        maxAge: 1000 * 60 * 60 * 24 * 31, // 31 days
        path: "/",
        sameSite: "None",
      });

      APIResponseOK(req, res, result, "Successfully signed in with your MPIN");
    } catch (error) {
      return this.handleError(
        error,
        req,
        res,
        "MPIN_SIGN_IN_ERR",
        "We couldn't sign you in. Invalid MPIN."
      );
    }
  };

  ChangePassword = async (req, res, next) => {
    try {
      const captchaToken = req.body["g-recaptcha-response"];
      const remoteIp = req.ip;

      if (!captchaToken) {
        return APIResponseBadRequest(
          req,
          res,
          "CAPTCHA_MISSING",
          null,
          "Please complete the security verification to continue."
        );
      }

      const isValidCaptcha = await ValidateCaptcha(
        captchaToken,
        remoteIp,
        this.config
      );

      if (!isValidCaptcha) {
        return APIResponseBadRequest(
          req,
          res,
          "CAPTCHA_FAILED",
          null,
          "Security verification failed. Please try again."
        );
      }

      let schema = z.object({
        email: z
          .string({ message: "Please provide a valid email address" })
          .email({ message: "Please provide a valid email format" }),
        oldpassword: z
          .string({ message: "Current password is required" })
          .nonempty({ message: "Current password cannot be empty" }),
        newpassword: z
          .string({ message: "New password is required" })
          .nonempty({ message: "New password cannot be empty" }),
      });

      let { email, oldpassword, newpassword } = validateAllInputs(schema, {
        email: req.body.email,
        oldpassword: req.body.oldpassword,
        newpassword: req.body.newpassword,
      });

      let result = await this.publicHdlrImpl.ChangePasswordLogic(
        email,
        oldpassword,
        newpassword
      );
      APIResponseOK(
        req,
        res,
        result,
        "Your password has been changed successfully"
      );
    } catch (error) {
      return this.handleError(
        error,
        req,
        res,
        "CHANGE_PASSWORD_ERR",
        "We couldn't change your password."
      );
    }
  };
}
