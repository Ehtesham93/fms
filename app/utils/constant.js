export const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export const NEGATIVE_CREDIT_THRESHOLD = 0;
export const ACCOUNT_CREATION_CREDITS = 1000;

// admin uuid
export const ADMIN_ROLE_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
export const ADMIN_USER_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
export const PLATFORM_ACCOUNT_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
export const PLATFORM_ROOT_FLEET_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
export const PLATFORM_ROOT_FLEET_PARENT_ID =
  "00000000-0000-0000-0000-000000000000";

// account types
export const PLATFORM_ACCOUNT_TYPE = "platform";
export const CUSTOMER_ACCOUNT_TYPE = "customer";
export const ROOT_FLEET_NAME = "Home";

// sso types
export const EMAIL_PWD_SSO = "EMAIL_PWD";
export const MOBILE_SSO = "MOBILE";

// fleet invite types
export const FLEET_INVITE_STATUS = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
};

export const FLEET_INVITE_TYPE = {
  EMAIL: "email",
  MOBILE: "mobile",
};

export const ACCOUNT_VEHICLE_SUBSCRIPTION_STATE = {
  PENDING: 0,
  ENABLED: 1,
  STAGED_FOR_DISABLE: 2,
  DISABLED: 3,
};

export const VEHICLE_ACTION = {
  ADDED: "ADDED",
  UPDATED: "UPDATED",
  REMOVED: "REMOVED",
};

export const PLATFORM_ROLE_TYPE = "platform";
export const ACCOUNT_ROLE_TYPE = "account";
export const CUSTOMER_TYPE_INDIVIDUAL = "individual";
export const CUSTOMER_TYPE_CORPORATE = "corporate";

// token related constants
export const COOKIE_MAX_AGE = 31 * 24 * 60 * 60 * 1000;
export const TOKEN_EXPIRY_TIME = 8 * 60 * 60;
export const REFRESH_TOKEN_EXPIRY_TIME = 30 * 24 * 60 * 60;
export const PASSWORD_EXPIRE_TIME = 90; // in days

export const INVITE_RATE_LIMIT_PER_HOUR = 3;

export const PARAM_FAMILY_CODE_REGULAR_DATA = "regulardata";
