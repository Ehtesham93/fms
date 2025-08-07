import { v4 as uuidv4 } from "uuid";

export default class PlatformHdlrImpl {
  constructor(platformSvcI, userSvcI, authSvcI, fmsAccountSvcI, logger) {
    this.platformSvcI = platformSvcI;
    this.userSvcI = userSvcI;
    this.authSvcI = authSvcI;
    this.fmsAccountSvcI = fmsAccountSvcI;
    this.logger = logger;
  }

  GetConsoleModulesLogic = async (userid) => {
    // get platform module info
    let platformModulesInfo =
      await this.platformSvcI.GetAllPlatformModulesInfo();
    if (!platformModulesInfo || platformModulesInfo.length === 0) {
      this.logger.error("Platform modules info not found");
      throw new Error("Platform modules info not found");
    }
    let modules = [];
    for (let module of platformModulesInfo) {
      if (!module.moduleinfo) {
        module.moduleinfo = {};
      }
      modules.push({
        moduleid: module.moduleid,
        moduleinfo: module,
      });
    }

    return {
      userid: userid,
      modules: modules,
    };
  };

  GetConsolePermissionsLogic = async (userid) => {
    // get roles for this userid
    let consolePerms = await this.userSvcI.GetConsolePerms(userid);
    if (!consolePerms || consolePerms.length === 0) {
      this.logger.error("User does not have any console permissions");
      throw new Error("User does not have any console permissions");
    }

    // prepare permissions
    let permissions = this.prepareConsolePermissions(consolePerms);
    return {
      userid: userid,
      permissions: permissions,
    };
  };

  prepareConsolePermissions = (consolePerms) => {
    let showModules = false;
    let showPackages = false;
    let showSubscriptions = false; // TODO: there is no show subscriptions in the console
    let showRoles = false;
    let showAdministrators = false;
    let showUsers = false;
    let showAccounts = false;
    let showModels = false;

    for (let perm of consolePerms) {
      if (perm.startsWith("consolemgmt.module") || perm == "all.all.all") {
        showModules = true;
      }
      if (perm.startsWith("consolemgmt.package") || perm == "all.all.all") {
        showPackages = true;
      }
      if (
        perm.startsWith("consolemgmt.subscription") ||
        perm == "all.all.all"
      ) {
        showSubscriptions = true;
      }
      if (perm.startsWith("consolemgmt.role") || perm == "all.all.all") {
        showRoles = true;
      }
      if (
        perm.startsWith("consolemgmt.administrator") ||
        perm == "all.all.all"
      ) {
        showAdministrators = true;
      }
      if (perm.startsWith("consolemgmt.user") || perm == "all.all.all") {
        showUsers = true;
      }
      if (perm.startsWith("consolemgmt.account") || perm == "all.all.all") {
        showAccounts = true;
      }
      if (perm.startsWith("consolemgmt.model") || perm == "all.all.all") {
        showModels = true;
      }
    }

    return {
      showModules: showModules,
      showPackages: showPackages,
      showSubscriptions: showSubscriptions,
      showRoles: showRoles,
      showAdministrators: showAdministrators,
      showUsers: showUsers,
      showAccounts: showAccounts,
      showModels: showModels,
    };
  };

  CreateVehicleLogic = async (
    vinno,
    modelcode,
    vehicleinfo,
    mobileno,
    assignedby
  ) => {
    let res = await this.platformSvcI.CreateVehicle(
      vinno,
      modelcode,
      vehicleinfo,
      mobileno,
      assignedby
    );
    if (!res) {
      this.logger.error("Failed to seed vehicle");
      throw new Error("Failed to seed vehicle");
    }
    return {
      vinno: vinno,
      modelcode: modelcode,
      vehicleinfo: vehicleinfo,
    };
  };

  AddVehicleToCustomFleetLogic = async (
    accountid,
    fleetid,
    vinno,
    assignedby
  ) => {
    let res = await this.platformSvcI.AddVehicleToCustomFleet(
      accountid,
      fleetid,
      vinno,
      assignedby
    );
    if (!res) {
      this.logger.error("Failed to add vehicle to custom fleet");
      throw new Error("Failed to add vehicle to custom fleet");
    }
    return { accountid: accountid, fleetid: fleetid, vinno: vinno };
  };

  UpdateVehicleInfoLogic = async (vinno, updateFields, updatedby) => {
    const allowedFields = [
      "vehicleinfo",
      "mobile",
      "license_plate",
      "color",
      "vehicle_city",
      "dealer",
      "delivered",
      "delivered_date",
      "data_freq",
      "tgu_model",
      "tgu_sw_version",
      "tgu_phone_no",
      "tgu_imei_no",
    ];

    const fieldsToUpdate = {};
    for (const [key, value] of Object.entries(updateFields)) {
      if (allowedFields.includes(key)) {
        fieldsToUpdate[key] = value;
      }
    }

    if (Object.keys(fieldsToUpdate).length === 0) {
      throw new Error("No valid fields provided for update");
    }

    let res = await this.platformSvcI.UpdateVehicleInfo(
      vinno,
      fieldsToUpdate,
      updatedby
    );
    if (!res) {
      this.logger.error("Failed to update vehicle info");
      throw new Error("Failed to update vehicle info");
    }
    return {
      vinno: vinno,
      updatedFields: Object.keys(fieldsToUpdate),
    };
  };
}
