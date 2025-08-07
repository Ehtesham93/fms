import stagingConfig from "./stg_config.js";
import developmentConfig from "./dev_config.js";
import localConfig from "./local_config.js";

let config = {};

console.log("APP_ENV: ", process.env.APP_ENV);

if (process.env.APP_ENV === "STAGING") {
  console.log("Using staging config");
  config = stagingConfig;
} else if (process.env.APP_ENV === "DEVELOPMENT") {
  console.log("Using development config");
  config = developmentConfig;
} else {
  console.log("Using local config");
  config = localConfig;
}

export default config;
