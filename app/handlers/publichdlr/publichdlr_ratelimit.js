import rateLimit from "express-rate-limit";
import { APIResponseError } from "../../utils/responseutil.js";

export default class PublicRateLimiter {
  constructor(logger) {
    this.logger = logger;
    this.rateLimiters = this.#createRateLimiters();
  }

  getRateLimiters() {
    return this.rateLimiters;
  }

  #createRateLimiters() {
    const createLimiterHandler = (limitType) => {
      return (req, res) => {
        this.logger.warn(
          `${limitType} rate limit exceeded for IP: ${
            req.clientIp || req.ip
          } on route: ${req.path}`
        );
        APIResponseError(
          req,
          res,
          429,
          "RATE_LIMIT_EXCEEDED",
          `Too many requests. ${limitType} limit exceeded. Please try again later.`,
          "rate limit exceeded"
        );
      };
    };

    return {
      // ⏱️ Per-minute limiter for OTP and sensitive operations
      otpMinuteLimiter: rateLimit({
        windowMs: 60 * 1000,
        max: 500,
        message: "Too many OTP requests. Try again later.",
        handler: createLimiterHandler("OTP per-minute"),
        standardHeaders: true,
        legacyHeaders: false,
      }),

      // ⏱️ Per-hour limiter for OTP
      otpHourLimiter: rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 10000,
        message: "Too many OTP requests. Try again later.",
        handler: createLimiterHandler("OTP per-hour"),
        standardHeaders: true,
        legacyHeaders: false,
      }),

      // ⏱️ Per-day limiter for OTP
      otpDayLimiter: rateLimit({
        windowMs: 24 * 60 * 60 * 1000,
        max: 100000,
        message: "Too many OTP requests. Try again later.",
        handler: createLimiterHandler("OTP per-day"),
        standardHeaders: true,
        legacyHeaders: false,
      }),

      // Sign-in attempt limiters
      signinMinuteLimiter: rateLimit({
        windowMs: 60 * 1000,
        max: 500,
        message: "Too many sign-in attempts. Try again later.",
        handler: createLimiterHandler("Sign-in per-minute"),
        standardHeaders: true,
        legacyHeaders: false,
      }),

      signinHourLimiter: rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 10000,
        message: "Too many sign-in attempts. Try again later.",
        handler: createLimiterHandler("Sign-in per-hour"),
        standardHeaders: true,
        legacyHeaders: false,
      }),

      signinDayLimiter: rateLimit({
        windowMs: 24 * 60 * 60 * 1000,
        max: 100000,
        message: "Too many sign-in attempts. Try again later.",
        handler: createLimiterHandler("Sign-in per-day"),
        standardHeaders: true,
        legacyHeaders: false,
      }),

      // Password reset limiters
      passwordResetMinuteLimiter: rateLimit({
        windowMs: 60 * 1000,
        max: 500,
        message: "Too many password reset requests. Try again later.",
        handler: createLimiterHandler("Password reset per-minute"),
        standardHeaders: true,
        legacyHeaders: false,
      }),

      passwordResetHourLimiter: rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 10000,
        message: "Too many password reset requests. Try again later.",
        handler: createLimiterHandler("Password reset per-hour"),
        standardHeaders: true,
        legacyHeaders: false,
      }),

      passwordResetDayLimiter: rateLimit({
        windowMs: 24 * 60 * 60 * 1000,
        max: 100000,
        message: "Too many password reset requests. Try again later.",
        handler: createLimiterHandler("Password reset per-day"),
        standardHeaders: true,
        legacyHeaders: false,
      }),

      // Contact/validation limiters
      contactCheckLimiter: rateLimit({
        windowMs: 60 * 1000,
        max: 500,
        message: "Too many contact verification requests. Try again later.",
        handler: createLimiterHandler("Contact check per-minute"),
        standardHeaders: true,
        legacyHeaders: false,
      }),

      // Signup/invite limiters
      signupLimiter: rateLimit({
        windowMs: 60 * 1000,
        max: 500,
        message: "Too many signup attempts. Try again later.",
        handler: createLimiterHandler("Signup per-minute"),
        standardHeaders: true,
        legacyHeaders: false,
      }),

      // General public API limiter
      generalLimiter: rateLimit({
        windowMs: 60 * 1000,
        max: 1000,
        message: "Too many requests. Try again later.",
        handler: createLimiterHandler("General per-minute"),
        standardHeaders: true,
        legacyHeaders: false,
      }),

      // Admin/superadmin specific limiter
      adminLimiter: rateLimit({
        windowMs: 60 * 1000,
        max: 10000,
        message: "Too many admin requests. Try again later.",
        handler: createLimiterHandler("Admin per-minute"),
        standardHeaders: true,
        legacyHeaders: false,
      }),
    };
  }

  getOTPLimiters() {
    return [
      this.rateLimiters.otpMinuteLimiter,
      this.rateLimiters.otpHourLimiter,
      this.rateLimiters.otpDayLimiter,
    ];
  }

  getSigninLimiters() {
    return [
      this.rateLimiters.signinMinuteLimiter,
      this.rateLimiters.signinHourLimiter,
      this.rateLimiters.signinDayLimiter,
    ];
  }

  getPasswordResetLimiters() {
    return [
      this.rateLimiters.passwordResetMinuteLimiter,
      this.rateLimiters.passwordResetHourLimiter,
      this.rateLimiters.passwordResetDayLimiter,
    ];
  }

  getAdminLimiters() {
    return [
      this.rateLimiters.adminLimiter,
      this.rateLimiters.signinHourLimiter,
    ];
  }
}
