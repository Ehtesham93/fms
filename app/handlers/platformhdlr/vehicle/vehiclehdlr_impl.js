import { formatEpochToDateTime } from "../../../utils/epochconverter.js";
import { publishVehicleUpdate } from "../../../utils/redisnotification.js";
import axios from "axios";
import config from "../../../config/config.js";
import { errors } from "cassandra-driver";

export default class VehicleHdlrImpl {
  constructor(platformSvcI, historyDataSvcI, metaSvcI, logger) {
    this.platformSvcI = platformSvcI;
    this.historyDataSvcI = historyDataSvcI;
    this.metaSvcI = metaSvcI;
    this.logger = logger;
    this.onboardingType = "onboarding";
  }

  CreateVehicleLogic = async (
    vinno,
    modelcode,
    vehicleinfo,
    mobileno,
    assignedby
  ) => {
    let vehicleExists = await this.platformSvcI.CheckVehicleExists(vinno);
    if (vehicleExists) {
      throw new Error("Vehicle already exists");
    }

    let modelExists = await this.platformSvcI.CheckModelExists(modelcode);
    if (!modelExists) {
      throw new Error("Model not found");
    }

    let res = await this.platformSvcI.CreateVehicle(
      vinno,
      modelcode,
      vehicleinfo,
      mobileno,
      assignedby
    );
    if (!res) {
      this.logger.error("Failed to create vehicle");
      throw new Error("Failed to create vehicle");
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
    // set and publish vehicle update
    await publishVehicleUpdate(accountid, "added", this.redisSvc, this.logger);

    return { accountid: accountid, fleetid: fleetid, vinno: vinno };
  };

  UpdateVehicleInfoLogic = async (vinno, updateFields, updatedby) => {
    const allowedFields = [
      "vehicleinfo",
      "modelcode",
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

    const lookupFieldsToValidate = {};
    if (fieldsToUpdate.vehicle_city)
      lookupFieldsToValidate.vehicle_city = fieldsToUpdate.vehicle_city;
    if (fieldsToUpdate.dealer)
      lookupFieldsToValidate.dealer = fieldsToUpdate.dealer;
    if (fieldsToUpdate.color)
      lookupFieldsToValidate.color = fieldsToUpdate.color;
    if (fieldsToUpdate.fueltype)
      lookupFieldsToValidate.fueltype = fieldsToUpdate.fueltype;
    if (fieldsToUpdate.modelcode)
      lookupFieldsToValidate.modelcode = fieldsToUpdate.modelcode;

    if (Object.keys(lookupFieldsToValidate).length > 0) {
      const validationErrors = await this.platformSvcI.ValidateVehicleFields(
        lookupFieldsToValidate
      );
      if (validationErrors.length > 0) {
        // Fields don't match - insert into meta options
        this.MetaOptions(validationErrors, lookupFieldsToValidate);
      }
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

  DeleteVehicleLogic = async (vinno, deletedby) => {
    let vehicleExists = await this.platformSvcI.CheckVehicleExists(vinno);
    if (!vehicleExists) {
      throw new Error("Vehicle not found");
    }

    let fleetAssociations =
      await this.platformSvcI.CheckVehicleFleetAssociations(vinno);
    if (fleetAssociations && fleetAssociations.length > 0) {
      const associations = fleetAssociations
        .map((row) => `Account: ${row.accountid}, Fleet: ${row.fleetid}`)
        .join("; ");
      throw new Error(`Vehicle is associated with fleets: ${associations}`);
    }

    let taggedAssociations =
      await this.platformSvcI.CheckVehicleTaggedAssociations(vinno);
    if (taggedAssociations && taggedAssociations.length > 0) {
      const taggedAccounts = taggedAssociations
        .map((row) => `From: ${row.srcaccountid}, To: ${row.dstaccountid}`)
        .join("; ");
      throw new Error(
        `Vehicle is associated with tagged accounts: ${taggedAccounts}`
      );
    }

    let subscriptionAssociations =
      await this.platformSvcI.CheckVehicleSubscriptionAssociations(vinno);
    if (subscriptionAssociations && subscriptionAssociations.length > 0) {
      const subscriptionAccounts = subscriptionAssociations
        .map((row) => row.accountid)
        .join(", ");
      throw new Error(
        `Vehicle is associated with active subscriptions in accounts: ${subscriptionAccounts}`
      );
    }

    let geofenceRuleAssociations =
      await this.platformSvcI.CheckVehicleGeofenceRuleAssociations(vinno);
    if (geofenceRuleAssociations && geofenceRuleAssociations.length > 0) {
      const ruleAssociations = geofenceRuleAssociations
        .map(
          (row) =>
            `Account: ${row.accountid}, Fleet: ${row.fleetid}, Rule: ${row.ruleid}`
        )
        .join("; ");
      throw new Error(
        `Vehicle is associated with geofence rules: ${ruleAssociations}`
      );
    }

    let hasHistoricalData = await this.platformSvcI.CheckVehicleHistoricalData(
      vinno
    );
    if (hasHistoricalData) {
      throw new Error(
        `Vehicle has historical data. Consider archiving instead of deleting.`
      );
    }

    let res = await this.platformSvcI.DeleteVehicle(vinno, deletedby);
    if (!res) {
      this.logger.error("Failed to delete vehicle");
      throw new Error("Failed to delete vehicle");
    }

    return {
      vinno: vinno,
      isdeleted: true,
    };
  };

  ListVehiclesLogic = async () => {
    let vehicles = await this.platformSvcI.ListVehicles();
    if (!vehicles) {
      vehicles = [];
    }
    return vehicles;
  };

  GetVehicleInfoLogic = async (vinno) => {
    let vehicle = await this.platformSvcI.GetVehicleInfo(vinno);
    if (!vehicle) {
      throw new Error("Vehicle not found");
    }
    return vehicle;
  };

  GetVehicleAccountDetailsLogic = async (vinno) => {
    let accountDetails = await this.platformSvcI.GetVehicleAccountDetails(
      vinno
    );
    if (!accountDetails) {
      throw new Error("Vehicle not found");
    }
    return accountDetails;
  };

  GetVehicleLatestDataLogic = async (vinno) => {
    if (!vinno) {
      throw new Error("VIN number is required");
    }

    try {
      const [gpsResult, canResult] = await Promise.allSettled([
        this.historyDataSvcI.GetVehicleLatestGpsData([vinno]),
        this.historyDataSvcI.GetVehicleLatestCanData([vinno]),
      ]);

      let gpsData = {};
      let canData = {};

      if (gpsResult.status === "fulfilled" && gpsResult.value) {
        const rawGpsData = gpsResult.value[vinno] || gpsResult.value;
        gpsData = this.addISTDateTimeKeys(rawGpsData);
      } else {
        this.logger.error("Error fetching GPS data:", gpsResult.reason);
      }

      if (canResult.status === "fulfilled" && canResult.value) {
        const rawCanData = canResult.value[vinno] || canResult.value;
        canData = this.addISTDateTimeKeys(rawCanData);
      } else {
        this.logger.error("Error fetching CAN data:", canResult.reason);
      }

      if (
        Object.keys(gpsData).length === 0 &&
        Object.keys(canData).length === 0
      ) {
        return {
          gpsdata: {
            latitude: 17.6867174,
            longitude: 77.5822892,
          },
          candata: {},
        };
      }

      return {
        gpsdata: gpsData,
        candata: canData,
      };
    } catch (error) {
      this.logger.error("Error in GetVehicleLatestDataLogic:", error);
      throw error;
    }
  };

  GetVehicleCANGPSDataLogic = async (vinno, starttime, endtime, canparams) => {
    let accountid = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    let result = await this.historyDataSvcI.GetMergedCANGPSHistoryData(
      accountid,
      vinno,
      starttime,
      endtime,
      canparams
    );
    if (!result) {
      throw new Error("Failed to get vehicle CAN+GPS data");
    }
    return result;
  };

  convertDateFormat = (dateString) => {
    if (!dateString) return null;

    try {
      // Handle YYYY-MM-DD format
      if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // For IST dates, we want to store them as-is without timezone conversion
        // Create a date at midnight IST and return it as a string in the format PostgreSQL expects
        const [year, month, day] = dateString.split("-");
        const date = new Date(year, month - 1, day); // month is 0-indexed in JavaScript
        return date.toISOString().split("T")[0] + "T00:00:00+05:30";
      }

      // Parse DD/MM/YY format and convert to YYYY-MM-DD
      const parts = dateString.split("/");
      if (parts.length === 3) {
        const day = parts[0];
        const month = parts[1];
        const year = parts[2];

        // Convert 2-digit year to 4-digit year
        const fullYear = year.length === 2 ? `20${year}` : year;

        // Create a date at midnight IST
        const date = new Date(fullYear, month - 1, day); // month is 0-indexed
        return date.toISOString().split("T")[0] + "T00:00:00+05:30";
      }

      return dateString; // Return as-is if not in expected format
    } catch (error) {
      console.log("Date conversion error:", error);
      return null;
    }
  };

  preprocessingText = (name) => {
    if (!name || typeof name !== "string") {
      return ""; // Return empty string for undefined, null, or non-string values
    }
    return name
      .toUpperCase() // Convert to uppercase
      .replace(/[^A-Z0-9\s]/g, " ") // Replace anything other than alphabets, numbers, and spaces with space
      .replace(/\s+/g, " ") // Replace multiple whitespaces with single space
      .trim(); // Trim leading and trailing whitespaces
  };

  preprocessingDealer = (name) => {
    if (!name || typeof name !== "string") {
      return ""; // Return empty string for undefined, null, or non-string values
    }
    return name
      .toUpperCase() // Convert to uppercase
      .replace(/\s+/g, " ") // Replace multiple whitespaces with single space
      .trim(); // Trim leading and trailing whitespaces
  };

  OnboardVehicleLogic = async (vehicleData, entrytype, createdOrUpdatedBy) => {
    this.onboardingType = entrytype;
    const { vin, vehicleModel, vehicleVariant, ...otherFields } = vehicleData;
    vehicleData.dealer = this.preprocessingDealer(vehicleData.dealer);
    vehicleData.deliveredDate = this.convertDateFormat(
      vehicleData.deliveredDate
    );
    vehicleData.retailsSaleDate = this.convertDateFormat(
      vehicleData.retailsSaleDate
    );
    const processedVehicleColour = this.preprocessingText(
      vehicleData.vehicleColour
    );
    if (processedVehicleColour !== "") {
      vehicleData.vehicleColour = processedVehicleColour;
    } else {
      vehicleData.vehicleColour = "NA";
    }
    vehicleData.vehicleCity = this.preprocessingText(vehicleData.vehicleCity);
    // Case 1: Vehicle already exists - just return
    let vehicleExists = await this.platformSvcI.CheckVehicleExists(vin);
    if (vehicleExists) {
      if (vehicleExists) {
        let error = new Error(`Vehicle with vinno: ${vin} already exists`);
        error.errcode = "VEHICLE_ALREADY_EXISTS";
        throw error;
      }
    }
    try {
      // Case 2: Check if pending table entry exists
      let pendingCheck = await this.platformSvcI.CheckVehicleInPending(vin);

      if (pendingCheck.exists) {
        // Update existing pending record
        return await this.handleExistingPendingVehicle(
          vehicleData,
          pendingCheck.pendingData,
          createdOrUpdatedBy
        );
      } else {
        // No pending entry - create new pending or vehicle
        return await this.handleNewVehicleOnboarding(
          vehicleData,
          createdOrUpdatedBy
        );
      }
    } catch (error) {
      this.logger.error("OnboardVehicleLogic failed:", error);

      const status = "PENDING_ERROR_REVIEW";
      const reason = `Unexpected error during processing: ${error.message}`;
      const reviewData = vehicleData;
      const originalInput = vehicleData;

      const updateFields = this.prepareAllPendingTableFields(
        vehicleData,
        status,
        reason,
        reviewData,
        originalInput
      );

      // Add to pending review for any unexpected errors
      await this.platformSvcI.AddToPendingReview(
        vin,
        updateFields,
        createdOrUpdatedBy
      );

      throw error;
    }
  };

  // Helper function to handle existing pending vehicle
  handleExistingPendingVehicle = async (
    vehicleData,
    pendingCheck,
    createdOrUpdatedBy
  ) => {
    const { vin, vehicleModel, vehicleVariant, ...otherFields } = vehicleData;
    // Validate vehicle fields
    const fieldsToValidate = this.prepareFieldsForValidation(otherFields);
    const validationErrors = await this.platformSvcI.ValidateVehicleFields(
      fieldsToValidate
    );

    if (validationErrors.length > 0) {
      // Fields don't match - insert into meta options
      this.MetaOptions(validationErrors, fieldsToValidate);
    }

    // Fields match - try to create vehicle
    try {
      let modelcode = await this.GetModelCodeByNameAndVariant(
        vehicleModel,
        vehicleVariant
      );

      if (!modelcode) {
        // Model not found - update pending record
        const status = "PENDING_MODEL_REVIEW";
        const reason = `Vehicle model '${vehicleModel}' with variant '${vehicleVariant}' not found in system`;
        const reviewData = vehicleData;
        const originalInput = vehicleData;

        const updateFields = this.prepareAllPendingTableFields(
          vehicleData,
          status,
          reason,
          reviewData,
          originalInput
        );

        await this.platformSvcI.UpdatePendingReview(
          vin,
          updateFields,
          createdOrUpdatedBy
        );

        return {
          action: "pending_review_updated",
          vinno: vin,
          status: status,
          reason: reason,
          message: "Vehicle pending review updated with model validation error",
        };
      }

      // Create vehicle with all fields
      const createResult = await this.createVehicleWithAllFields(
        vehicleData,
        modelcode,
        createdOrUpdatedBy
      );

      if (!createResult) {
        // Vehicle creation failed - update pending record
        const status = "VEHICLE_CREATION_PENDING";
        const reason = "Vehicle creation failed during processing";
        const reviewData = vehicleData;
        const originalInput = vehicleData;

        const updateFields = this.prepareAllPendingTableFields(
          vehicleData,
          status,
          reason,
          reviewData,
          originalInput,
          modelcode
        );

        await this.platformSvcI.UpdatePendingReview(
          vin,
          updateFields,
          createdOrUpdatedBy
        );

        return {
          action: "pending_review_updated",
          vinno: vin,
          status: status,
          reason: reason,
          message: "Vehicle pending review updated with creation error",
        };
      }

      // Vehicle created successfully - move to done table
      const fields = this.prepareAllDoneTableFields(
        vehicleData,
        "VEHICLE_CREATION_SUCCESS",
        "Vehicle created successfully",
        vehicleData,
        modelcode
      );
      await this.MoveToDoneReview(
        vin,
        fields,
        createdOrUpdatedBy,
        pendingCheck
      );

      // Remove from pending review
      await this.platformSvcI.RemoveFromPendingReview(vin);

      return {
        action: "reviewed_and_created",
        vinno: vin,
        modelcode: modelcode,
        vehicleinfo: createResult.vehicleinfo,
        message: "Vehicle successfully created after resolving pending issues",
        previousstatus: pendingCheck.status,
        reviewedat: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error("Vehicle creation failed:", error);

      // Update pending record with creation error
      const status = "VEHICLE_CREATION_PENDING";
      const reason = `Vehicle creation failed: ${error.message}`;
      const reviewData = vehicleData;
      const originalInput = vehicleData;

      const updateFields = this.prepareAllPendingTableFields(
        vehicleData,
        status,
        reason,
        reviewData,
        originalInput
      );

      await this.platformSvcI.UpdatePendingReview(
        vin,
        updateFields,
        createdOrUpdatedBy
      );

      throw error;
    }
  };

  // Helper function to handle new vehicle onboarding
  handleNewVehicleOnboarding = async (vehicleData, createdOrUpdatedBy) => {
    const { vin, vehicleModel, vehicleVariant, ...otherFields } = vehicleData;
    // Validate vehicle fields
    const fieldsToValidate = this.prepareFieldsForValidation(otherFields);

    const validationErrors = await this.platformSvcI.ValidateVehicleFields(
      fieldsToValidate
    );

    if (validationErrors.length > 0) {
      // Fields don't match - insert into meta options
      this.MetaOptions(validationErrors, fieldsToValidate);
    }

    // Fields match - try to create vehicle
    try {
      let modelcode = await this.GetModelCodeByNameAndVariant(
        vehicleModel,
        vehicleVariant
      );

      if (!modelcode) {
        // Model not found - insert into pending
        const status = "PENDING_MODEL_REVIEW";
        const reason = `Vehicle model '${vehicleModel}' with variant '${vehicleVariant}' not found in system`;
        const reviewData = vehicleData;
        const originalInput = vehicleData;

        const updateFields = this.prepareAllPendingTableFields(
          vehicleData,
          status,
          reason,
          reviewData,
          originalInput
        );

        await this.platformSvcI.AddToPendingReview(
          vin,
          updateFields,
          createdOrUpdatedBy
        );

        return {
          action: "pending_review",
          vinno: vin,
          status: status,
          reason: reason,
          message:
            "Vehicle added to pending review queue for model verification",
        };
      }

      // Create vehicle with all fields
      const createResult = await this.createVehicleWithAllFields(
        vehicleData,
        modelcode,
        createdOrUpdatedBy
      );

      if (!createResult) {
        // Vehicle creation failed - insert into pending
        const status = "VEHICLE_CREATION_PENDING";
        const reason = "Vehicle creation failed during processing";
        const reviewData = vehicleData;
        const originalInput = vehicleData;

        const updateFields = this.prepareAllPendingTableFields(
          vehicleData,
          status,
          reason,
          reviewData,
          originalInput,
          modelcode
        );

        await this.platformSvcI.AddToPendingReview(
          vin,
          updateFields,
          createdOrUpdatedBy
        );

        return {
          action: "pending_review",
          vinno: vin,
          status: status,
          reason: reason,
          message: "Vehicle added to pending review queue for creation error",
        };
      }

      // Vehicle created successfully - move to done table
      const fields = this.prepareAllDoneTableFields(
        vehicleData,
        "VEHICLE_CREATION_SUCCESS",
        "Vehicle created successfully",
        vehicleData,
        modelcode
      );
      await this.MoveToDoneReview(vin, fields, createdOrUpdatedBy);

      return {
        action: "created",
        vinno: vin,
        modelcode: modelcode,
        vehicleinfo: createResult.vehicleinfo,
        message: "Vehicle created successfully",
      };
    } catch (error) {
      this.logger.error("Vehicle creation failed:", error);

      // Insert into pending for creation error
      const status = "VEHICLE_CREATION_PENDING";
      const reason = `Vehicle creation failed: ${error.message}`;
      const reviewData = vehicleData;
      const originalInput = vehicleData;

      const updateFields = this.prepareAllPendingTableFields(
        vehicleData,
        status,
        reason,
        reviewData,
        originalInput
      );

      await this.platformSvcI.AddToPendingReview(
        vin,
        updateFields,
        createdOrUpdatedBy
      );

      throw error;
    }
  };

  // Helper function to create vehicle with all fields
  createVehicleWithAllFields = async (
    vehicleData,
    modelcode,
    createdOrUpdatedBy
  ) => {
    const { vin, vehicleModel, vehicleVariant, ...otherFields } = vehicleData;

    try {
      // Create vehicle with basic info first
      const createResult = await this.platformSvcI.CreateVehicle(
        vin,
        modelcode,
        {}, // vehicleInfo will be updated separately
        otherFields.mobileNo,
        createdOrUpdatedBy
      );

      if (!createResult) {
        return null;
      }

      // Update vehicle with all additional fields
      const updateFields = this.prepareAllVehicleFields(otherFields);
      await this.UpdateVehicleInfoLogic(vin, updateFields, createdOrUpdatedBy);

      return {
        vehicleinfo: updateFields,
        success: true,
      };
    } catch (error) {
      this.logger.error("Failed to create vehicle with all fields:", error);
      return null;
    }
  };

  // Helper function to prepare fields for validation
  prepareFieldsForValidation = (fields) => {
    const fieldsToValidate = {};
    if (fields.vehicleCity) fieldsToValidate.vehicle_city = fields.vehicleCity;
    if (fields.dealer) fieldsToValidate.dealer = fields.dealer;
    if (fields.vehicleColour) fieldsToValidate.color = fields.vehicleColour;
    if (fields.fuelType) fieldsToValidate.fueltype = fields.fuelType;

    return fieldsToValidate;
  };

  // Helper function to prepare all vehicle fields for insertion
  prepareAllVehicleFields = (fields) => {
    const allFields = {};

    // Map all fields to database column names
    allFields.delivered = false;
    if (fields.licensePlate) allFields.license_plate = fields.licensePlate;
    if (fields.vehicleCity) allFields.vehicle_city = fields.vehicleCity;
    if (fields.vehicleColour) allFields.color = fields.vehicleColour;
    if (fields.tgu_imei_no) allFields.tgu_imei_no = fields.tgu_imei_no;
    if (fields.dealer) allFields.dealer = fields.dealer;
    if (fields.deliveredDate) allFields.delivered_date = fields.deliveredDate;
    if (fields.deliveredDate) allFields.delivered = true;
    if (fields.engineNo) allFields.engineno = fields.engineNo;
    if (fields.fuelType) allFields.fueltype = fields.fuelType;
    if (fields.retailsSaleDate)
      allFields.retailssaledate = fields.retailsSaleDate;

    return allFields;
  };

  prepareAllPendingTableFields = (
    fields,
    status,
    reason,
    reviewData,
    originalInput,
    modelcode = null
  ) => {
    const allFields = {};
    if (fields.mobileNo) allFields.mobile = fields.mobileNo;
    allFields.modelcode = modelcode;
    if (fields.vehicleVariant) allFields.vehiclevariant = fields.vehicleVariant;
    if (fields.vehicleModel) allFields.vehiclemodel = fields.vehicleModel;
    if (fields.tgu_imei_no) allFields.tgu_imei_no = fields.tgu_imei_no;
    if (fields.licensePlate) allFields.license_plate = fields.licensePlate;
    if (fields.vehicleCity) allFields.vehicle_city = fields.vehicleCity;
    if (fields.vehicleColour) allFields.color = fields.vehicleColour;
    if (fields.dealer) allFields.dealer = fields.dealer;
    if (fields.deliveredDate) allFields.delivered_date = fields.deliveredDate;
    if (fields.engineNo) allFields.engineno = fields.engineNo;
    if (fields.fuelType) allFields.fueltype = fields.fuelType;
    if (fields.retailsSaleDate)
      allFields.retailssaledate = fields.retailsSaleDate;
    allFields.original_input = originalInput;
    allFields.status = status;
    allFields.reason = reason;
    allFields.review_data = reviewData;
    allFields.vehicleinfo = {};

    return allFields;
  };

  prepareAllDoneTableFields = (
    fields,
    status,
    reason,
    originalInput,
    modelcode = null
  ) => {
    const allFields = {};
    if (fields.mobileNo) allFields.mobile = fields.mobileNo;
    allFields.modelcode = modelcode;
    if (fields.vehicleVariant) allFields.vehiclevariant = fields.vehicleVariant;
    if (fields.vehicleModel) allFields.vehiclemodel = fields.vehicleModel;
    if (fields.tgu_imei_no) allFields.tgu_imei_no = fields.tgu_imei_no;
    if (fields.licensePlate) allFields.license_plate = fields.licensePlate;
    if (fields.vehicleCity) allFields.vehicle_city = fields.vehicleCity;
    if (fields.vehicleColour) allFields.color = fields.vehicleColour;
    if (fields.dealer) allFields.dealer = fields.dealer;
    if (fields.deliveredDate) allFields.delivered_date = fields.deliveredDate;
    if (fields.engineNo) allFields.engineno = fields.engineNo;
    if (fields.fuelType) allFields.fueltype = fields.fuelType;
    if (fields.retailsSaleDate)
      allFields.retailssaledate = fields.retailsSaleDate;
    allFields.original_input = originalInput;
    allFields.original_status = status;
    allFields.resolution_reason = reason;
    allFields.review_data = {};
    allFields.vehicleinfo = {};
    allFields.entrytype = this.onboardingType;
    return allFields;
  };

  ListPendingVehiclesLogic = async () => {
    let vehicles = await this.platformSvcI.ListPendingVehicles();
    if (!vehicles) {
      vehicles = [];
    }
    return vehicles;
  };

  ListDoneVehiclesLogic = async () => {
    let vehicles = await this.platformSvcI.ListDoneVehicles();
    if (!vehicles) {
      vehicles = [];
    }
    return vehicles;
  };

  GetModelCodeByNameAndVariant = async (modelName, modelVariant) => {
    try {
      let modelSvc = this.platformSvcI.getModelSvc();
      let result = await modelSvc.GetModelCodeByNameAndVariant(
        modelName,
        modelVariant
      );
      return result ? result.modelcode : null;
    } catch (error) {
      this.logger.error("Error getting model code:", error);
      return null;
    }
  };

  DetectUpdateConflicts = (existingVehicle, newData, newModelCode) => {
    const conflicts = [];

    if (existingVehicle.modelcode !== newModelCode) {
      conflicts.push(
        `Model code mismatch: existing '${existingVehicle.modelcode}' vs new '${newModelCode}'`
      );
    }

    if (
      newData.licensePlate &&
      existingVehicle.license_plate &&
      existingVehicle.license_plate !== newData.licensePlate
    ) {
      conflicts.push(
        `License plate mismatch: existing '${existingVehicle.license_plate}' vs new '${newData.licensePlate}'`
      );
    }

    return conflicts;
  };

  MoveToDoneReview = async (vin, fields, createdBy, pendingData = null) => {
    let reviewData = {};

    if (pendingData) {
      reviewData = {
        vinno: pendingData.vinno,
        mobile: pendingData.mobile,
        modelcode: pendingData.modelcode,
        vehicleinfo: pendingData.vehicleinfo,
        vehiclevariant: pendingData.vehiclevariant,
        vehiclemodel: pendingData.vehiclemodel,
        license_plate: pendingData.license_plate,
        color: pendingData.color,
        vehicle_city: pendingData.vehicle_city,
        dealer: pendingData.dealer,
        delivered: pendingData.delivered,
        delivered_date: pendingData.delivered_date,
        data_freq: pendingData.data_freq,
        tgu_model: pendingData.tgu_model,
        tgu_sw_version: pendingData.tgu_sw_version,
        tgu_phone_no: pendingData.tgu_phone_no,
        tgu_imei_no: pendingData.tgu_imei_no,
        engineno: pendingData.engineno,
        fueltype: pendingData.fueltype,
        retailssaledate: pendingData.retailssaledate,
        original_input: pendingData.original_input,
        status: pendingData.status,
        reason: pendingData.reason,
        review_data: pendingData.review_data,
        createdat: pendingData.createdat,
        createdby: pendingData.createdby,
        updatedat: pendingData.updatedat,
        updatedby: pendingData.updatedby,
      };
    }

    fields.review_data = reviewData;

    return await this.platformSvcI.MoveToDoneReview(vin, fields, createdBy);
  };

  ReviewVehicleOnboardLogic = async (userid, updatedfields) => {
    try {
      let pendingVehiclereview = await this.platformSvcI.CheckVehicleInPending(
        updatedfields.vin
      );
      let original_input = pendingVehiclereview.pendingData.original_input;
      let vehicleData = {};
      vehicleData.vin =
        updatedfields.vin !== original_input.vin
          ? updatedfields.vin
          : original_input.vin;
      vehicleData.vehicleModel =
        updatedfields.vehicleModel !== original_input.vehicleModel
          ? updatedfields.vehicleModel
          : original_input.vehicleModel;
      vehicleData.vehicleVariant =
        updatedfields.vehicleVariant !== original_input.vehicleVariant
          ? updatedfields.vehicleVariant
          : original_input.vehicleVariant;
      vehicleData.tgu_imei_no =
        updatedfields.tgu_imei_no !== original_input.tgu_imei_no
          ? updatedfields.tgu_imei_no
          : original_input.tgu_imei_no;
      vehicleData.mobileNo =
        updatedfields.mobileNo !== original_input.mobileNo
          ? updatedfields.mobileNo
          : original_input.mobileNo;
      vehicleData.dealer =
        updatedfields.dealer !== original_input.dealer
          ? updatedfields.dealer
          : original_input.dealer;
      vehicleData.deliveredDate =
        updatedfields.deliveredDate !== original_input.deliveredDate
          ? updatedfields.deliveredDate
          : original_input.deliveredDate;
      vehicleData.engineNo =
        updatedfields.engineNo !== original_input.engineNo
          ? updatedfields.engineNo
          : original_input.engineNo;
      vehicleData.fuelType =
        updatedfields.fuelType !== original_input.fuelType
          ? updatedfields.fuelType
          : original_input.fuelType;
      vehicleData.licensePlate =
        updatedfields.licensePlate !== original_input.licensePlate
          ? updatedfields.licensePlate
          : original_input.licensePlate;
      vehicleData.retailsSaleDate =
        updatedfields.retailsSaleDate !== original_input.retailsSaleDate
          ? updatedfields.retailsSaleDate
          : original_input.retailsSaleDate;
      vehicleData.vehicleCity =
        updatedfields.vehicleCity !== original_input.vehicleCity
          ? updatedfields.vehicleCity
          : original_input.vehicleCity;
      vehicleData.vehicleColour =
        updatedfields.vehicleColour !== original_input.vehicleColour
          ? updatedfields.vehicleColour
          : original_input.vehicleColour;
      await this.OnboardVehicleLogic(vehicleData, "review", userid);
    } catch (error) {
      this.logger.error("ReviewVehicleOnboardLogic failed", error);
      throw error;
    }
  };

  addISTDateTimeKeys = (data) => {
    if (!data || typeof data !== "object") return data;

    const result = { ...data };

    const epochKeys = ["utctime", "gpstime", "intime", "proctime"];

    epochKeys.forEach((key) => {
      if (result[key]) {
        const epochValue = parseInt(result[key]);
        if (!isNaN(epochValue)) {
          result[`${key}_ist`] = formatEpochToDateTime(epochValue);
        }
      }
    });

    return result;
  };

  VehicleServiceOnboardingLogic = async (vin, mobileno, userid) => {
    try {
      const payloaddata = {
        vinno: vin,
        mobileno: mobileno,
      };
      const url = `${config.serviceConfig.url}${config.serviceConfig.onboardingPath}`;
      const response = await axios.post(url, payloaddata, {
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (response.status !== 200) {
        return {
          errcode: "VEHICLE_SERVICE_ONBOARDING_FAILED",
          status: "PENDING_VEHICLE_SERVICE_ONBOARDING",
          message: "Vehicle service onboarding failed",
        };
      }
      return response.data;
    } catch (error) {
      this.logger.error("VehicleServiceOnboardingLogic failed", error);
      throw error;
    }
  };

  MetaOptions = async (validationErrors, fieldsToValidate) => {
    try {
      for (const validationError of validationErrors) {
        if (validationError.field === "vehicle_city") {
          await this.metaSvcI.CreateVehicleCity(fieldsToValidate.vehicle_city);
        }
        if (validationError.field === "dealer") {
          await this.metaSvcI.CreateVehicleDealer(fieldsToValidate.dealer);
        }
        if (validationError.field === "color") {
          await this.metaSvcI.CreateVehicleColor(fieldsToValidate.color);
        }
      }
    } catch (error) {
      this.logger.error("MetaOption db operation failed", error);
      throw error;
    }
  };

  RetryOnboardLogic = async ( userid, retrytype ) => {
    try {
      if (retrytype === "vehicle") {
        let pendingreviews = await this.platformSvcI.ListPendingVehicleReviews();
        for (const review of pendingreviews) {
          try {
            await this.OnboardVehicleLogic(review.original_input, "retry", userid);
          } catch (error) {
            this.logger.error("RetryVehicleOnboardLogic failed", error);
            continue;
          }
        }
        return true;
      }else {
        throw new Error("Invalid retry type");
      }
    } catch (error) {
      this.logger.error("RetryOnboardLogic failed", error);
      throw error;
    }
  };
}
