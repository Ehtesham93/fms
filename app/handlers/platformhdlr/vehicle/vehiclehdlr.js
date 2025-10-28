import { z } from "zod";
import { CheckUserPerms } from "../../../utils/permissionutil.js";
import {
  APIResponseBadRequest,
  APIResponseForbidden,
  APIResponseInternalErr,
  APIResponseOK,
} from "../../../utils/responseutil.js";
import { validateAllInputs } from "../../../utils/validationutil.js";
import VehicleHdlrImpl from "./vehiclehdlr_impl.js";

export default class VehicleHdlr {
  constructor(platformSvcI, historyDataSvcI, metaSvcI, logger) {
    this.platformSvcI = platformSvcI;
    this.historyDataSvcI = historyDataSvcI;
    this.metaSvcI = metaSvcI;
    this.vehicleHdlrImpl = new VehicleHdlrImpl(
      platformSvcI,
      historyDataSvcI,
      metaSvcI,
      logger
    );
    this.logger = logger;
  }

  RegisterRoutes(router) {
    router.post("/create", this.CreateVehicle);
    router.put("/:vinno/info", this.UpdateVehicleInfo);
    router.delete("/:vinno/delete", this.DeleteVehicle);
    router.get("/list", this.ListVehicles);
    router.get("/:vinno/info", this.GetVehicleInfo);
    router.get("/:vinno/accountinfo", this.GetVehicleAccountDetails);

    // vehicle-account
    router.post("/add", this.AddVehicleToCustomFleet);

    // vehicle-history
    router.get("/:vinno/getlatestdata", this.GetVehicleLatestData);
    router.post("/:vinno/getcangpsdata", this.GetVehicleCANGPSData);

    // dms-vehicle onboarding
    router.post("/onboardvehicle", this.OnboardVehicle);
    router.post("/reviewvehicleonboard", this.ReviewVehicleOnboard);
    router.get("/listpending", this.ListPendingVehicles);
    router.get("/listdone", this.ListDoneVehicles);
    router.post("/vehicleserviceonboarding", this.VehicleServiceOnboarding);
  }

  ValidateEpochTime = (timeStr, fieldName) => {
    if (!/^\d+$/.test(timeStr)) {
      throw {
        errcode: "INPUT_ERROR",
        message: `${fieldName} must be a valid epoch time (integer)`,
      };
    }

    const epochTime = parseInt(timeStr, 10);

    if (epochTime < 0 || epochTime > 4102444800000) {
      throw {
        errcode: "INPUT_ERROR",
        message: `${fieldName} must be a valid epoch time`,
      };
    }

    return epochTime;
  };

  CreateVehicle = async (req, res, next) => {
    try {
      if (!CheckUserPerms(req.userperms, ["consolemgmt.vehicle.admin"])) {
        return APIResponseForbidden(
          req,
          res,
          "INSUFFICIENT_PERMISSIONS",
          null,
          "You don't have permission to create vehicle."
        );
      }
      let schema = z.object({
        vinno: z
          .string({ message: "Invalid VIN format" })
          .nonempty({ message: "VIN cannot be empty" })
          .length(17, { message: "VIN must be exactly 17 characters" })
          .regex(/^M[AB][A-HJ-NPR-Z0-9]{15}$/, {
            message: "Please enter a valid Indian VIN number starting with MA",
          }),
        modelcode: z
          .string({ message: "Invalid Model Code format" })
          .nonempty({ message: "Model Code cannot be empty" })
          .max(128, { message: "Model Code must not exceed 128 characters" }),

        vehicleinfo: z
          .record(z.any(), { message: "Vehicle Info must be an object" })
          .default({}),

        mobileno: z
          .string({ message: "Invalid Mobile Number format" })
          .optional()
          .nullable(),
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

      let result = await this.vehicleHdlrImpl.CreateVehicleLogic(
        vinno,
        modelcode,
        vehicleinfo,
        mobileno,
        createdby
      );

      APIResponseOK(req, res, result, "Vehicle created successfully");
    } catch (e) {
      this.logger.error("CreateVehicle error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else if (e.message.includes("Vehicle already exists")) {
        APIResponseBadRequest(
          req,
          res,
          "VEHICLE_ALREADY_EXISTS",
          null,
          "Vehicle already exists"
        );
      } else if (e.message.includes("Model not found")) {
        APIResponseBadRequest(
          req,
          res,
          "MODEL_NOT_FOUND",
          null,
          "Model not found"
        );
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

  UpdateVehicleInfo = async (req, res, next) => {
    try {
      if (!CheckUserPerms(req.userperms, ["consolemgmt.vehicle.admin"])) {
        return APIResponseForbidden(
          req,
          res,
          "INSUFFICIENT_PERMISSIONS",
          null,
          "You don't have permission to update vehicle info."
        );
      }
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

      let result = await this.vehicleHdlrImpl.UpdateVehicleInfoLogic(
        vinno,
        updateFields,
        updatedby
      );
      APIResponseOK(req, res, result, "Vehicle info updated successfully");
    } catch (e) {
      this.logger.error("UpdateVehicleInfo error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else if (e.errcode === "VALIDATION_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "UPDATE_VEHICLE_INFO_ERR",
          e.toString(),
          "Update vehicle info failed"
        );
      }
    }
  };

  DeleteVehicle = async (req, res, next) => {
    try {
      if (!CheckUserPerms(req.userperms, ["consolemgmt.vehicle.admin"])) {
        return APIResponseForbidden(
          req,
          res,
          "INSUFFICIENT_PERMISSIONS",
          null,
          "You don't have permission to delete vehicle."
        );
      }

      let schema = z.object({
        vinno: z
          .string({ message: "Invalid VIN format" })
          .nonempty({ message: "VIN cannot be empty" })
          .regex(/^[A-Za-z0-9](?:[A-Za-z0-9 ]*[A-Za-z0-9])?$/, {
            message: "VIN must be a valid format",
          })
          .max(128, { message: "VIN must not exceed 128 characters" }),
      });

      let { vinno } = validateAllInputs(schema, {
        vinno: req.params.vinno,
      });

      let deletedby = req.userid;

      let result = await this.vehicleHdlrImpl.DeleteVehicleLogic(
        vinno,
        deletedby
      );

      APIResponseOK(req, res, result, "Vehicle deleted successfully");
    } catch (e) {
      this.logger.error("DeleteVehicle error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else if (e.message.includes("Vehicle not found")) {
        APIResponseBadRequest(
          req,
          res,
          "VEHICLE_NOT_FOUND",
          null,
          "Vehicle not found"
        );
      } else if (e.message.includes("Vehicle is associated")) {
        APIResponseBadRequest(req, res, "VEHICLE_ASSOCIATED", null, e.message);
      } else if (e.message.includes("historical data")) {
        APIResponseBadRequest(
          req,
          res,
          "VEHICLE_HAS_HISTORICAL_DATA",
          null,
          e.message
        );
      } else {
        APIResponseInternalErr(
          req,
          res,
          "DELETE_VEHICLE_ERR",
          e.toString(),
          "Delete vehicle failed"
        );
      }
    }
  };

  AddVehicleToCustomFleet = async (req, res, next) => {
    try {
      if (
        !CheckUserPerms(req.userperms, ["consolemgmt.accountvehicle.admin"])
      ) {
        return APIResponseForbidden(
          req,
          res,
          "INSUFFICIENT_PERMISSIONS",
          null,
          "You don't have permission to add vehicle to custom fleet."
        );
      }
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
          .regex(/^[A-Za-z0-9](?:[A-Za-z0-9 ]*[A-Za-z0-9])?$/, {
            message: "VIN must be a valid format",
          })
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

      let result = await this.vehicleHdlrImpl.AddVehicleToCustomFleetLogic(
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
      this.logger.error("AddVehicleToCustomFleet error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else if (e.message.includes("Vehicle not found")) {
        APIResponseBadRequest(
          req,
          res,
          "VEHICLE_NOT_FOUND",
          null,
          "Vehicle not found"
        );
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

  ListVehicles = async (req, res, next) => {
    try {
      // if (
      //   !CheckUserPerms(req.userperms, [
      //     "consolemgmt.vehicle.admin",
      //     "consolemgmt.vehicle.view",
      //   ])
      // ) {
      //   return APIResponseForbidden(
      //     req,
      //     res,
      //     "INSUFFICIENT_PERMISSIONS",
      //     null,
      //     "You don't have permission to list vehicles."
      //   );
      // }
      let result = await this.vehicleHdlrImpl.ListVehiclesLogic();
      APIResponseOK(req, res, result, "Vehicles listed successfully");
    } catch (e) {
      this.logger.error("ListVehicles error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "LIST_VEHICLES_ERR",
          e.toString(),
          "List vehicles failed"
        );
      }
    }
  };

  GetVehicleInfo = async (req, res, next) => {
    try {
      if (
        !CheckUserPerms(req.userperms, [
          "consolemgmt.vehicle.admin",
          "consolemgmt.vehicle.view",
        ])
      ) {
        return APIResponseForbidden(
          req,
          res,
          "INSUFFICIENT_PERMISSIONS",
          null,
          "You don't have permission to get vehicle info."
        );
      }
      let schema = z.object({
        vinno: z
          .string({ message: "Invalid VIN format" })
          .nonempty({ message: "VIN cannot be empty" })
          .regex(/^[A-Za-z0-9](?:[A-Za-z0-9 ]*[A-Za-z0-9])?$/, {
            message: "VIN must be a valid format",
          })
          .max(128, { message: "VIN must not exceed 128 characters" }),
      });

      let { vinno } = validateAllInputs(schema, {
        vinno: req.params.vinno,
      });

      let result = await this.vehicleHdlrImpl.GetVehicleInfoLogic(vinno);
      APIResponseOK(req, res, result, "Vehicle info fetched successfully");
    } catch (e) {
      this.logger.error("GetVehicleInfo error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "GET_VEHICLE_INFO_ERR",
          e.toString(),
          "Get vehicle info failed"
        );
      }
    }
  };

  GetVehicleAccountDetails = async (req, res, next) => {
    try {
      if (
        !CheckUserPerms(req.userperms, [
          "consolemgmt.vehicle.admin",
          "consolemgmt.vehicle.view",
        ])
      ) {
        return APIResponseForbidden(
          req,
          res,
          "INSUFFICIENT_PERMISSIONS",
          null,
          "You don't have permission to get vehicle account details."
        );
      }
      let schema = z.object({
        vinno: z
          .string({ message: "Invalid VIN format" })
          .nonempty({ message: "VIN cannot be empty" })
          .regex(/^[A-Za-z0-9](?:[A-Za-z0-9 ]*[A-Za-z0-9])?$/, {
            message: "VIN must be a valid format",
          })
          .max(128, { message: "VIN must not exceed 128 characters" }),
      });

      let { vinno } = validateAllInputs(schema, {
        vinno: req.params.vinno,
      });

      let result = await this.vehicleHdlrImpl.GetVehicleAccountDetailsLogic(
        vinno
      );
      APIResponseOK(
        req,
        res,
        result,
        "Vehicle account details fetched successfully"
      );
    } catch (e) {
      this.logger.error("GetVehicleAccountDetails error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "GET_VEHICLE_ACCOUNT_DETAILS_ERR",
          e.toString(),
          "Get vehicle account details failed"
        );
      }
    }
  };

  GetVehicleLatestData = async (req, res, next) => {
    try {
      if (
        !CheckUserPerms(req.userperms, [
          "consolemgmt.vehicle.admin",
          "consolemgmt.vehicle.view",
        ])
      ) {
        return APIResponseForbidden(
          req,
          res,
          "INSUFFICIENT_PERMISSIONS",
          null,
          "You don't have permission to get vehicle latest data."
        );
      }
      let schema = z.object({
        vinno: z
          .string({ message: "Invalid VIN format" })
          .nonempty({ message: "VIN cannot be empty" })
          .regex(/^[A-Za-z0-9](?:[A-Za-z0-9 ]*[A-Za-z0-9])?$/, {
            message: "VIN must be a valid format",
          })
          .max(128, { message: "VIN must not exceed 128 characters" }),
      });

      let { vinno } = validateAllInputs(schema, {
        vinno: req.params.vinno,
      });

      let result = await this.vehicleHdlrImpl.GetVehicleLatestDataLogic(vinno);
      APIResponseOK(
        req,
        res,
        result,
        "Vehicle latest data fetched successfully"
      );
    } catch (e) {
      this.logger.error("GetVehicleLatestData error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "GET_VEHICLE_LATEST_DATA_ERR",
          e.toString(),
          "Get vehicle latest data failed"
        );
      }
    }
  };

  GetVehicleCANGPSData = async (req, res, next) => {
    try {
      if (
        !CheckUserPerms(req.userperms, [
          "consolemgmt.vehicle.admin",
          "consolemgmt.vehicle.view",
        ])
      ) {
        return APIResponseForbidden(
          req,
          res,
          "INSUFFICIENT_PERMISSIONS",
          null,
          "You don't have permission to get vehicle CAN+GPS data."
        );
      }
      let schema = z.object({
        vinno: z
          .string({ message: "Invalid VIN format" })
          .nonempty({ message: "VIN cannot be empty" })
          .regex(/^[A-Za-z0-9](?:[A-Za-z0-9 ]*[A-Za-z0-9])?$/, {
            message: "VIN must be a valid format",
          })
          .max(128, { message: "VIN must not exceed 128 characters" }),
        starttime: z.number({ message: "Start Time must be a number" }),
        endtime: z.number({ message: "End Time must be a number" }),
        canparams: z
          .array(
            z
              .string({ message: "Each CAN param must be a string" })
              .min(1, { message: "CAN param cannot be empty" })
              .max(128, {
                message: "CAN param must be at most 128 characters long",
              })
          )
          .min(1, { message: "At least one CAN param is required" })
          .optional(),
      });

      let { vinno, starttime, endtime, canparams } = validateAllInputs(schema, {
        vinno: req.params.vinno,
        starttime: req.body.starttime,
        endtime: req.body.endtime,
        canparams: req.body.canparams,
      });
      if (starttime >= endtime) {
        APIResponseBadRequest(
          req,
          res,
          "INVALID_TIME_RANGE",
          {},
          "starttime must be less than endtime"
        );
        return;
      }

      let result = await this.vehicleHdlrImpl.GetVehicleCANGPSDataLogic(
        vinno,
        starttime,
        endtime,
        canparams
      );
      APIResponseOK(
        req,
        res,
        result,
        "Vehicle CAN+GPS data fetched successfully"
      );
    } catch (e) {
      this.logger.error("GetVehicleCANGPSData error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "GET_VEHICLE_CANGPS_DATA_ERR",
          e.toString(),
          "Get vehicle CAN+GPS data failed"
        );
      }
    }
  };

  OnboardVehicle = async (req, res, next) => {
    try {
      if (!CheckUserPerms(req.userperms, ["consolemgmt.vehicle.admin"])) {
        return APIResponseForbidden(
          req,
          res,
          "INSUFFICIENT_PERMISSIONS",
          null,
          "You don't have permission to create or update vehicle."
        );
      }

      let schema = z.object({
        vin: z
          .string({ message: "Invalid VIN format" })
          .nonempty({ message: "VIN cannot be empty" })
          .length(17, { message: "VIN must be exactly 17 characters" })
          .regex(/^M[AB][A-HJ-NPR-Z0-9]{15}$/, {
            message:
              "Please enter a valid Indian VIN number starting with MA or MB",
          }),
        vehicleModel: z
          .string({ message: "Invalid Vehicle Model format" })
          .nonempty({ message: "Vehicle Model cannot be empty" })
          .regex(/^[A-Za-z0-9 _.+-]+$/, {
            message: "Please enter a valid Vehicle Model",
          }),
        vehicleVariant: z
          .string({ message: "Invalid Vehicle Variant format" })
          .nonempty({ message: "Vehicle Variant cannot be empty" }),
        tgu_imei_no: z
          .string({ message: "Invalid TGU IMEI Number format" })
          .optional()
          .nullable(),
        mobileNo: z
          .string({ message: "Invalid Mobile Number format" })
          .regex(/^[6-9]\d{9}$/, {
            message:
              "Mobile number must be exactly 10 digits and start with 6 to 9",
          })
          .optional()
          .nullable(),

        dealer: z.string().optional().nullable(),
        deliveredDate: z.string().optional().nullable(),
        engineNo: z.string().optional().nullable(),
        fuelType: z.string().optional().nullable(),
        licensePlate: z.string().optional().nullable(),
        retailsSaleDate: z.string().optional().nullable(),
        vehicleCity: z.string().optional().nullable(),
        vehicleColour: z.string().optional().nullable(),
      });

      let createdOrUpdatedBy = req.userid;

      let validatedInput = validateAllInputs(schema, {
        vin: req.body.vin,
        vehicleModel: req.body.vehicleModel,
        vehicleVariant: req.body.vehicleVariant,
        tgu_imei_no: req.body.tgu_imei_no,
        mobileNo: req.body.mobileNo,
        dealer: req.body.dealer,
        deliveredDate: req.body.deliveredDate,
        engineNo: req.body.engineNo,
        fuelType: req.body.fuelType,
        licensePlate: req.body.licensePlate,
        retailsSaleDate: req.body.retailsSaleDate,
        vehicleCity: req.body.vehicleCity,
        vehicleColour: req.body.vehicleColour,
      });

      let result = await this.vehicleHdlrImpl.OnboardVehicleLogic(
        validatedInput,
        "onboarding",
        createdOrUpdatedBy
      );

      APIResponseOK(req, res, result, "Vehicle processed successfully");
    } catch (e) {
      this.logger.error("OnboardVehicle error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else if (e.errcode === "VEHICLE_ALREADY_EXISTS") {
        APIResponseBadRequest(req, res, e.errcode, {}, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "ONBOARD_VEHICLE_ERR",
          e.toString(),
          "Onboard vehicle failed"
        );
      }
    }
  };

  ReviewVehicleOnboard = async (req, res, next) => {
    try {
      if (!CheckUserPerms(req.userperms, ["consolemgmt.vehicle.admin"])) {
        return APIResponseForbidden(
          req,
          res,
          "INSUFFICIENT_PERMISSIONS",
          null,
          "You don't have permission to review vehicle onboard."
        );
      }
      let schema = z.object({
        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User ID format" }),
        updatedfields: z
          .object({
            vin: z.string(),
            vehicleModel: z.string(),
            vehicleVariant: z.string(),
            tgu_imei_no: z.string().optional().nullable(),
            mobileNo: z.string().optional().nullable(),
            dealer: z.string().optional(),
            deliveredDate: z.string().optional().nullable(),
            engineNo: z.string().optional().nullable(),
            fuelType: z.string().optional(),
            licensePlate: z.string().optional().nullable(),
            retailsSaleDate: z.string().optional().nullable(),
            vehicleCity: z.string().optional().nullable(),
            vehicleColour: z.string().optional().nullable(),
          })
          .refine(
            (val) => {
              // Ensure at least one field is provided
              return Object.keys(val).length > 0;
            },
            {
              message: "At least one field must be provided in updatedfields",
            }
          ),
      });
      let { userid, updatedfields } = validateAllInputs(schema, {
        userid: req.userid,
        updatedfields: req.body.updatedfields,
      });

      let result = await this.vehicleHdlrImpl.ReviewVehicleOnboardLogic(
        userid,
        updatedfields
      );
      APIResponseOK(req, res, result, "Vehicle reviewed successfully");
    } catch (e) {
      this.logger.error("ReviewVehicleOnboard error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else if (e.errcode === "VEHICLE_ALREADY_EXISTS") {
        APIResponseBadRequest(req, res, e.errcode, {}, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "ONBOARD_VEHICLE_ERR",
          e.toString(),
          "Onboard vehicle failed"
        );
      }
    }
  };

  ListPendingVehicles = async (req, res, next) => {
    try {
      if (
        !CheckUserPerms(req.userperms, [
          "consolemgmt.vehicle.admin",
          "consolemgmt.vehicle.view",
        ])
      ) {
        return APIResponseForbidden(
          req,
          res,
          "INSUFFICIENT_PERMISSIONS",
          null,
          "You don't have permission to list pending vehicles."
        );
      }
      let result = await this.vehicleHdlrImpl.ListPendingVehiclesLogic();
      APIResponseOK(req, res, result, "Pending vehicles listed successfully");
    } catch (e) {
      this.logger.error("ListPendingVehicles error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "LIST_PENDING_VEHICLES_ERR",
          e.toString(),
          "List pending vehicles failed"
        );
      }
    }
  };

  ListDoneVehicles = async (req, res, next) => {
    try {
      if (
        !CheckUserPerms(req.userperms, [
          "consolemgmt.vehicle.admin",
          "consolemgmt.vehicle.view",
        ])
      ) {
        return APIResponseForbidden(
          req,
          res,
          "INSUFFICIENT_PERMISSIONS",
          null,
          "You don't have permission to list done vehicles."
        );
      }
      let result = await this.vehicleHdlrImpl.ListDoneVehiclesLogic();
      APIResponseOK(req, res, result, "Done vehicles listed successfully");
    } catch (e) {
      this.logger.error("ListDoneVehicles error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "LIST_DONE_VEHICLES_ERR",
          e.toString(),
          "List done vehicles failed"
        );
      }
    }
  };

  VehicleServiceOnboarding = async (req, res, next) => {
    try {
      if (!CheckUserPerms(req.userperms, ["consolemgmt.vehicle.admin"])) {
        return APIResponseForbidden(
          req,
          res,
          "INSUFFICIENT_PERMISSIONS",
          null,
          "You don't have permission to onboard vehicle service."
        );
      }
      let schema = z.object({
        userid: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "Invalid User ID format" }),
        vin: z
          .string({ message: "Invalid VIN format" })
          .nonempty({ message: "VIN cannot be empty" })
          .length(17, { message: "VIN must be exactly 17 characters" })
          .regex(/^M[AB][A-HJ-NPR-Z0-9]{15}$/, {
            message:
              "Please enter a valid Indian VIN number starting with MA or MB",
          }),
        mobileno: z
          .string({ message: "Invalid Mobile Number format" })
          .regex(/^[6-9]\d{9}$/, {
            message:
              "Mobile number must be exactly 10 digits and start with 6 to 9",
          }),
      });
      let { userid, vin, mobileno } = validateAllInputs(schema, {
        userid: req.userid,
        vin: req.body.vin,
        mobileno: req.body.mobileno,
      });
      let result = await this.vehicleHdlrImpl.VehicleServiceOnboardingLogic(
        vin,
        mobileno,
        userid
      );
      APIResponseOK(req, res, result.data, result.msg);
    } catch (e) {
      this.logger.error("VehicleServiceOnboarding error: ", e);
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "VEHICLE_SERVICE_ONBOARDING_ERR",
          e.toString(),
          "Vehicle service onboarding failed"
        );
      }
      APIResponseInternalErr(req, res, e.errcode, e.errdata, e.message);
    }
  };
}
