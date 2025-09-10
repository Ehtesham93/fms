export default {
  pgdb: {
    host: "mahindra-tunnel.intellicar.io",
    port: 22041,
    database: "lmmintellicar",
    schema: "devfmscoresch",
    user: "lmmintellicar_admin",
    password: "Z52DWfsAZIBtnOK",
  },
  redis: {
    host: "lmm-intellicar-cluster.t9kbdt.clustercfg.aps1.cache.amazonaws.com",
    port: 6379,
  },
  apiserver: {
    port: 10005,
  },
  authsvc: {
    // url: "https://stg-nemo.mahindraelectric.com:2083",
    url: "http://localhost:10004",
    createConsumerPath: "/api/v1/consumer",
    getUserTokenPath: "/api/v1/token",
    getAccountTokenPath: "/api/v1/account/token",
    invalidateTokenPath: "/api/v1/token/invalidate",
    getTokenPath: "/api/v1/token",
  },
  // emailsvc: {
  //   url: "https://email-service.intellicar.in",
  //   sendEmailPath: "/api/v1/email/send",
  //   accountid: "EA_F927E60B708F20D0F35AD667D34B3F3A8B28AB332A9F3FB384E631968867A48E",
  //   apikey: "EB_25F98EB56D926AFDEE768417F1A1CD712B40E632FCD9B91501BBD5C3571D66B4",
  // },
  emailsvc: {
    url: "https://stg-nemo.mahindraelectric.com:2083",
    sendEmailPath: "/api/v1/email/sendemail",
  },
  csrf: {
    maxAgeInSeconds: 1800,
  },
  mobileotpsvc: {
    rooturl: "https://stg-nemo.mahindraelectric.com:2083",
    requestotppath: "/api/v1/otp/requestotp",
    verifyotppath: "/api/v1/otp/verifyotp",
  },
  clickhouse: {
    urls: [
      "http://mahindra-tunnel.intellicar.io:22033",
      // "http://10.178.0.242:8123",
      "http://10.178.0.16:8123",
      "http://10.178.0.210:8123",
      "http://10.178.0.45:8123",
      "http://10.178.0.132:8123",
    ],
    username: "default",
    password: "",
    database: "lmmdata",
    maxBatchDataSize: 25000,
    maxParallelRequests: 100000,
    compression: {
      response: true,
      request: true,
    },
    keep_alive: {
      enabled: true,
    },
  },
  recaptcha: {
    sitekey: "6LfvoH8rAAAAAAIQoIm0yRc2lfEyzrwdh0RAMeH_",
    secretkey: "6LfvoH8rAAAAAHw1ivt1fmLTGViTQBrEtgPAsxwj",
    siteurl: "https://www.google.com/recaptcha/api/siteverify",
  },
  defaultuser: {
    password:
      "69f9f7c745883a32502dc7d9d67b16aaa09ea9d0b19de202555cf8e1b42be693",
  },
  logToConsole: true,
  seedConfig: {
    BASE_URL: "https://stg-nemo.mahindralastmilemobility.com",
    PORT: "2083",
  },
  fmsFeatures: {
    enableSubscribedVehiclesFilter: true,
  },
  serviceConfig: {
    url: "https://stg-nemo.mahindraelectric.com:2083/api/v1/fms/service/vehicle/onboarding",
    onboardingPath: "/api/v1/fms/service/vehicle/onboarding",
  },
  inMemCache: {
    stdTTL: 3600, // in seconds
  },
};
