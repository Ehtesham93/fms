import { DateTime } from "luxon";
import {
  formatEpochToDuration,
  formatEpochToDateTime,
  toFormattedString,
} from "../../../utils/epochconverter.js";

export default class TripsinsighthdlrImpl {
  constructor(tripsinsightssvcI, fmsAccountSvcI, logger) {
    this.tripsinsightssvcI = tripsinsightssvcI;
    this.fmsAccountSvcI = fmsAccountSvcI;
    this.logger = logger;
  }

  GetVehicleTripReportLogic = async (vinno, starttime, endtime) => {
    try {
      let vinNumbers;
      if (vinno) {
        vinNumbers = Array.isArray(vinno)
          ? vinno
          : vinno.includes(",")
          ? vinno.split(",")
          : [vinno];
      } else {
        throw new Error("VIN NO is required");
      }

      if (vinNumbers.length === 0) {
        return {
          totaltrips: "0",
          totaldistancetravelled: "0 km",
          totalenergyconsumed: "0 kWh",
          vehicles: {},
        };
      }

      const result = await this.ProcessTripData(vinNumbers, starttime, endtime);
      return result;
    } catch (error) {
      this.logger.error("Error in GetTripReportLogic:", error);
      throw error;
    }
  };

  GetFleetTripReportLogic = async (
    accountid,
    fleetid,
    starttime,
    endtime,
    recursive
  ) => {
    try {
      if (!fleetid) {
        throw new Error("Fleet ID is required");
      }
      let vinNumbers;
      const vehicles =
        (await this.fmsAccountSvcI.GetVehicles(
          accountid,
          fleetid,
          recursive
        )) || [];
      vinNumbers = vehicles.map((v) => v.vinno);

      if (vinNumbers.length === 0) {
        return {
          totaltrips: "0",
          totaldistancetravelled: "0 km",
          totalenergyconsumed: "0 kWh",
          vehicles: {},
        };
      }

      const result = await this.ProcessTripData(vinNumbers, starttime, endtime);
      return result;
    } catch (error) {
      this.logger.error("Error in GetTripReportLogic:", error);
      throw error;
    }
  };

  ProcessTripData = async (vinNumbers, starttime, endtime) => {
    try {
      const [tripData, regnodata] = await Promise.all([
        this.tripsinsightssvcI.GetTripsByFleet(vinNumbers, starttime, endtime),
        this.fmsAccountSvcI.GetRegno(vinNumbers),
      ]);

      if (!tripData || tripData.length === 0) {
        return {
          totaltrips: "0",
          totaldistancetravelled: "0 km",
          totalenergyconsumed: "0 kWh",
          vehicles: {},
        };
      }

      const vinToRegnoMap = {};
      regnodata.forEach(({ vinno, license_plate }) => {
        if (license_plate && license_plate.trim() !== "") {
          vinToRegnoMap[vinno] = license_plate;
        } else {
          vinToRegnoMap[vinno] = `${vinno}`;
        }
      });

      // --- Batch processing on fetched data ---
      const BATCH_SIZE = 500;
      const batches = [];
      for (let i = 0; i < tripData.length; i += BATCH_SIZE) {
        batches.push(tripData.slice(i, i + BATCH_SIZE));
      }

      const safeCoord = (val) =>
        typeof val === "number" && !isNaN(val)
          ? parseFloat(val.toFixed(6))
          : null;

      // Process each batch concurrently
      const batchResults = await Promise.all(
        batches.map(async (batch) => {
          let batchVehicles = {};
          let batchTotalTrips = 0;
          let batchTotalDistance = 0;
          let batchTotalEnergy = 0;

          batch.forEach((trip) => {
            const vin = trip.vin;
            if (!batchVehicles[vin]) {
              batchVehicles[vin] = { tripcount: 0, trips: [] };
            }
            batchVehicles[vin].tripcount += 1;

            const distance = (trip.endodo || 0) - (trip.startodo || 0);
            if (distance > 0) batchTotalDistance += distance;

            let startkwh =
              trip.startdata && typeof trip.startdata.kwh === "number"
                ? trip.startdata.kwh
                : null;
            let endkwh =
              trip.enddata && typeof trip.enddata.kwh === "number"
                ? trip.enddata.kwh
                : null;
            if (startkwh !== null && endkwh !== null) {
              batchTotalEnergy += Math.abs(endkwh - startkwh);
            }

            const duration = formatEpochToDuration(
              (trip.movingtime || 0) + (trip.idletime || 0)
            );
            const socconsumed = (trip.startsoc || 0) - (trip.endsoc || 0);
            const boostmode =
              distance > 0 ? (trip.boostdist || 0) / distance : 0;
            const ecomode = 100 - Math.round(boostmode * 100);
            const maxspeed =
              typeof trip.maxspeed === "number" ? trip.maxspeed : 0;

            batchVehicles[vin].trips.push({
              starttime: formatEpochToDateTime(trip.starttime),
              endtime: formatEpochToDateTime(trip.endtime),
              startlat: safeCoord(trip.startlat),
              endlat: safeCoord(trip.endlat),
              startlng: safeCoord(trip.startlng),
              endlng: safeCoord(trip.endlng),
              distance: `${parseFloat(distance.toFixed(2))} km`,
              maxspeed: `${parseFloat(maxspeed.toFixed(2))} km/h`,
              socconsumed: `${parseFloat(socconsumed.toFixed(2))}%`,
              duration,
              ecomode: `${ecomode}%`,
              boostmode: `${Math.round(boostmode * 100)}%`,
              // Add original epoch timestamp for sorting
              _startEpoch: trip.starttime,
            });
          });

          batchTotalTrips = batch.length;
          return {
            batchVehicles,
            batchTotalTrips,
            batchTotalDistance,
            batchTotalEnergy,
          };
        })
      );

      // Aggregate all batch results
      let totaltrips = 0;
      let totaldistancetravelled = 0;
      let totalenergyconsumed = 0;
      let vehicles = {};

      for (const result of batchResults) {
        totaltrips += result.batchTotalTrips;
        totaldistancetravelled += result.batchTotalDistance;
        totalenergyconsumed += result.batchTotalEnergy;
        // Merge vehicles
        for (const vin in result.batchVehicles) {
          const regno = vinToRegnoMap[vin];
          if (!vehicles[vin]) {
            vehicles[vin] = { regno: regno, tripcount: 0, trips: [] };
          }
          vehicles[vin].regno = regno;
          vehicles[vin].tripcount += result.batchVehicles[vin].tripcount;
          vehicles[vin].trips.push(...result.batchVehicles[vin].trips);
        }
      }

      for (const vin in vehicles) {
        vehicles[vin].trips.sort((a, b) => {
          // Use the original epoch timestamp for comparison
          return b._startEpoch - a._startEpoch; // Reverse order (newest first)
        });
        // Remove the temporary _startEpoch field after sorting
        vehicles[vin].trips.forEach((trip) => {
          delete trip._startEpoch;
        });
      }

      return {
        totaltrips: toFormattedString(totaltrips),
        totaldistancetravelled: `${toFormattedString(
          totaldistancetravelled
        )} km`,
        totalenergyconsumed: `${toFormattedString(totalenergyconsumed)} kWh`,
        vehicles,
      };
    } catch (error) {
      this.logger.error("Error in ProcessTripData:", error);
      throw error;
    }
  };

  GetTripsByVehicleLogic = async (accountid, vinno, starttime, endtime) => {
    let result = await this.tripsinsightssvcI.GetTripsByVehicle(
      accountid,
      vinno,
      starttime,
      endtime
    );

    if (!result) {
      this.logger.error("Failed to get vehicle trips data");
      throw new Error("Failed to get vehicle trips data");
    }

    let rootFleetId = await this.fmsAccountSvcI.GetRootFleetId(accountid);
    let vehicles = [];
    if (rootFleetId) {
      vehicles = await this.fmsAccountSvcI.GetVehicles(
        accountid,
        rootFleetId,
        true
      );
    }

    const vehicle = vehicles.find((v) => v.vinno === vinno);
    const modeldisplayname = vehicle?.modeldisplayname || "Unknown Model";

    const regnodata = await this.fmsAccountSvcI.GetRegno([vinno]);
    const vinToRegnoMap = {};
    regnodata.forEach(({ vinno, license_plate }) => {
      if (license_plate && license_plate.trim() !== "") {
        vinToRegnoMap[vinno] = license_plate;
      } else {
        vinToRegnoMap[vinno] = `${vinno}`;
      }
    });

    if (Array.isArray(result)) {
      result = result.map((trip) => {
        const distance = trip.endodo - trip.startodo;

        const duration = (trip.movingtime || 0) + (trip.idletime || 0);

        const socconsumed = trip.startsoc - trip.endsoc;

        const boostmode = distance > 0 ? (trip.boostdist || 0) / distance : 0;
        const ecomode = 100 - Math.round(boostmode * 100);

        const calcrange =
          typeof trip.calcrange === "number" ? trip.calcrange : 0;

        const maxspeed = typeof trip.maxspeed === "number" ? trip.maxspeed : 0;

        return {
          ...trip,
          regno: vinToRegnoMap[trip.vin] || `${trip.vin}`,
          modeldisplayname: modeldisplayname,
          distance: Math.round(distance * 100) / 100,
          duration: Math.round(duration * 100) / 100,
          socconsumed: Math.round(socconsumed * 100) / 100,
          calcrange: Math.round(calcrange * 100) / 100,
          boostmode: Math.round(boostmode * 100) / 100,
          ecomode: Math.round(ecomode * 100) / 100,
          maxspeed: Math.round(maxspeed * 100) / 100,
          distancekm: `${Math.round(distance * 100) / 100} km`,
          durationformatted: formatEpochToDuration(duration),
          socconsumedpercent: `${Math.round(socconsumed * 100) / 100}%`,
          calcrangekm: `${Math.round(calcrange * 100) / 100} km`,
          boostmodepercent: `${Math.round(boostmode * 100) / 100}%`,
          ecomodepercent: `${Math.round(ecomode * 100) / 100}%`,
          maxspeedkmh: `${Math.round(maxspeed * 100) / 100} km/h`,
        };
      });
    }

    return result;
  };

  GetTripsByFleetLogic = async (
    accountid,
    fleetid,
    starttime,
    endtime,
    recursive = false
  ) => {
    let vehicles = await this.fmsAccountSvcI.GetVehicles(
      accountid,
      fleetid,
      recursive
    );
    if (!vehicles || vehicles.length === 0) {
      return [];
    }

    const vinNumbers = vehicles.map((vehicle) => vehicle.vinno);

    let [result, regnodata] = await Promise.all([
      this.tripsinsightssvcI.GetTripsByFleet(vinNumbers, starttime, endtime),
      this.fmsAccountSvcI.GetRegno(vinNumbers),
    ]);

    if (!result) {
      this.logger.error("Failed to get fleet trips data");
      throw new Error("Failed to get fleet trips data");
    }

    const vinToRegnoMap = {};
    regnodata.forEach(({ vinno, license_plate }) => {
      if (license_plate && license_plate.trim() !== "") {
        vinToRegnoMap[vinno] = license_plate;
      } else {
        vinToRegnoMap[vinno] = `${vinno}`;
      }
    });

    const vinToModelDisplayNameMap = {};
    vehicles.forEach((vehicle) => {
      vinToModelDisplayNameMap[vehicle.vinno] =
        vehicle.modeldisplayname || "Unknown Model";
    });

    if (Array.isArray(result)) {
      result = result.map((trip) => {
        const distance = trip.endodo - trip.startodo;

        const duration = (trip.movingtime || 0) + (trip.idletime || 0);

        const socconsumed = trip.startsoc - trip.endsoc;

        const boostmode = distance > 0 ? (trip.boostdist || 0) / distance : 0;
        const ecomode = 100 - Math.round(boostmode * 100);

        const calcrange =
          typeof trip.calcrange === "number" ? trip.calcrange : 0;

        const maxspeed = typeof trip.maxspeed === "number" ? trip.maxspeed : 0;

        return {
          ...trip,
          regno: vinToRegnoMap[trip.vin] || `${trip.vin}`,
          modeldisplayname:
            vinToModelDisplayNameMap[trip.vin] || "Unknown Model",
          distance: Math.round(distance * 100) / 100,
          duration: Math.round(duration * 100) / 100,
          socconsumed: Math.round(socconsumed * 100) / 100,
          calcrange: Math.round(calcrange * 100) / 100,
          boostmode: Math.round(boostmode * 100) / 100,
          ecomode: Math.round(ecomode * 100) / 100,
          maxspeed: Math.round(maxspeed * 100) / 100,
          distancekm: `${Math.round(distance * 100) / 100} km`,
          durationformatted: formatEpochToDuration(duration),
          socconsumedpercent: `${Math.round(socconsumed * 100) / 100}%`,
          calcrangekm: `${Math.round(calcrange * 100) / 100} km`,
          boostmodepercent: `${Math.round(boostmode * 100) / 100}%`,
          ecomodepercent: `${Math.round(ecomode * 100) / 100}%`,
          maxspeedkmh: `${Math.round(maxspeed * 100) / 100} km/h`,
        };
      });
    }

    return result;
  };

  GetActiveVehicleDataByVinLogic = async (
    accountid,
    vinno,
    starttime,
    endtime
  ) => {
    try {
      let rootFleetId = await this.fmsAccountSvcI.GetRootFleetId(accountid);
      if (!rootFleetId) {
        this.logger.info("Root fleet not found for account");
        return {
          totaltrips: 0,
          vehiclemodel: "",
          vehiclevariant: "",
          activevehicles: {},
          activevehiclesmodelwise: {},
          kmdrivenandactivehours: {},
        };
      }

      let vehicles = await this.fmsAccountSvcI.GetVehicles(
        accountid,
        rootFleetId,
        true
      );
      if (!vehicles || vehicles.length === 0) {
        this.logger.info("No vehicles found in the account");
        return {
          totaltrips: 0,
          vehiclemodel: "",
          vehiclevariant: "",
          activevehicles: {},
          activevehiclesmodelwise: {},
          kmdrivenandactivehours: {},
        };
      }

      let vehicle = vehicles.find((v) => v.vinno === vinno);
      if (!vehicle) {
        this.logger.info("Vehicle not found");
        return {
          totaltrips: 0,
          vehiclemodel: "",
          vehiclevariant: "",
          activevehicles: {},
          activevehiclesmodelwise: {},
          kmdrivenandactivehours: {},
        };
      }

      let tripData = await this.tripsinsightssvcI.GetTripsByVehicle(
        accountid,
        vinno,
        starttime,
        endtime
      );
      if (!tripData) {
        this.logger.error("Failed to get vehicle trips data");
        throw new Error("Failed to get vehicle trips data");
      }

      const activevehiclecount = {};
      const activevehiclemodelwise = {};
      const kmdrivenandactivehours = {};

      if (tripData && tripData.length > 0) {
        tripData.forEach((trip) => {
          if (trip.starttime) {
            const tripDate = new Date(parseInt(trip.starttime));
            const dateKey = this.formatDateToIST(tripDate);

            if (!activevehiclecount[dateKey]) {
              activevehiclecount[dateKey] = 0;
            }
            activevehiclecount[dateKey] = 1;

            // Add model-wise tracking
            const modelKey = `${vehicle.vehiclemodel} ${vehicle.vehiclevariant}`;
            if (!activevehiclemodelwise[dateKey]) {
              activevehiclemodelwise[dateKey] = {};
            }
            if (!activevehiclemodelwise[dateKey][modelKey]) {
              activevehiclemodelwise[dateKey][modelKey] = 0;
            }
            activevehiclemodelwise[dateKey][modelKey] = 1;

            if (!kmdrivenandactivehours[dateKey]) {
              kmdrivenandactivehours[dateKey] = {
                kmdriven: 0,
                activehours: 0,
              };
            }

            const tripDistance = (trip.endodo || 0) - (trip.startodo || 0);
            kmdrivenandactivehours[dateKey].kmdriven += tripDistance;

            const movingTimeHours = (trip.movingtime || 0) / (1000 * 60 * 60);
            kmdrivenandactivehours[dateKey].activehours += movingTimeHours;
          }
        });
      }

      const processedKmdrivenandactivehours = {};
      Object.keys(kmdrivenandactivehours).forEach((date) => {
        processedKmdrivenandactivehours[date] = {
          kmdriven:
            Math.round(kmdrivenandactivehours[date].kmdriven * 100) / 100,
          activehours:
            Math.round(kmdrivenandactivehours[date].activehours * 100) / 100,
        };
      });

      return {
        totaltrips: tripData ? tripData.length : 0,
        vehiclemodel: vehicle.vehiclemodel || "",
        vehiclevariant: vehicle.vehiclevariant || "",
        activevehicles: activevehiclecount,
        activevehiclesmodelwise: activevehiclemodelwise,
        kmdrivenandactivehours: processedKmdrivenandactivehours,
      };
    } catch (error) {
      this.logger.error("Error in GetActiveVehicleDataByVinLogic:", error);
      throw error;
    }
  };

  GetActiveVehiclesByFleetLogic = async (
    accountid,
    fleetid,
    starttime,
    endtime,
    recursive = false
  ) => {
    try {
      let vehicles = await this.fmsAccountSvcI.GetVehicles(
        accountid,
        fleetid,
        recursive
      );
      if (!vehicles || vehicles.length === 0) {
        this.logger.info("No vehicles found in the fleet");
        return {
          totalvehiclecount: 0,
          totaltrips: 0,
          activevehicles: {},
          activevehiclesmodelwise: {},
          kmdrivenandactivehours: {},
        };
      }

      const vinNumbers = vehicles.map((vehicle) => vehicle.vinno);

      let tripData = await this.tripsinsightssvcI.GetTripsByFleet(
        vinNumbers,
        starttime,
        endtime
      );
      if (!tripData) {
        this.logger.error("Failed to get fleet trips data");
        throw new Error("Failed to get fleet trips data");
      }

      const vehicleMap = {};
      vehicles.forEach((vehicle) => {
        vehicleMap[vehicle.vinno] = vehicle;
      });

      const activevehiclecount = {};
      const activevehiclemodelwise = {};
      const kmdrivenandactivehours = {};

      if (tripData && tripData.length > 0) {
        tripData.forEach((trip) => {
          if (trip.starttime) {
            const tripDate = new Date(parseInt(trip.starttime));
            const dateKey = this.formatDateToIST(tripDate);
            const vehicle = vehicleMap[trip.vin];

            if (vehicle) {
              if (!activevehiclecount[dateKey]) {
                activevehiclecount[dateKey] = new Set();
              }
              activevehiclecount[dateKey].add(trip.vin);

              const modelKey = `${vehicle.vehiclemodel} ${vehicle.vehiclevariant}`;
              if (!activevehiclemodelwise[dateKey]) {
                activevehiclemodelwise[dateKey] = {};
              }
              if (!activevehiclemodelwise[dateKey][modelKey]) {
                activevehiclemodelwise[dateKey][modelKey] = new Set();
              }
              activevehiclemodelwise[dateKey][modelKey].add(trip.vin);

              if (!kmdrivenandactivehours[dateKey]) {
                kmdrivenandactivehours[dateKey] = {
                  kmdriven: 0,
                  activehours: 0,
                };
              }

              const tripDistance = (trip.endodo || 0) - (trip.startodo || 0);
              kmdrivenandactivehours[dateKey].kmdriven += tripDistance;

              const movingTimeHours = (trip.movingtime || 0) / (1000 * 60 * 60);
              kmdrivenandactivehours[dateKey].activehours += movingTimeHours;
            }
          }
        });
      }

      const processedActivevehiclecount = {};
      Object.keys(activevehiclecount).forEach((date) => {
        processedActivevehiclecount[date] = activevehiclecount[date].size;
      });

      const processedActivevehiclemodelwise = {};
      Object.keys(activevehiclemodelwise).forEach((date) => {
        processedActivevehiclemodelwise[date] = {};
        Object.keys(activevehiclemodelwise[date]).forEach((model) => {
          processedActivevehiclemodelwise[date][model] =
            activevehiclemodelwise[date][model].size;
        });
      });

      const processedKmdrivenandactivehours = {};
      Object.keys(kmdrivenandactivehours).forEach((date) => {
        processedKmdrivenandactivehours[date] = {
          kmdriven:
            Math.round(kmdrivenandactivehours[date].kmdriven * 100) / 100,
          activehours:
            Math.round(kmdrivenandactivehours[date].activehours * 100) / 100,
        };
      });

      return {
        totalvehiclecount: vehicles.length,
        totaltrips: tripData ? tripData.length : 0,
        activevehicles: processedActivevehiclecount,
        activevehiclesmodelwise: processedActivevehiclemodelwise,
        kmdrivenandactivehours: processedKmdrivenandactivehours,
      };
    } catch (error) {
      this.logger.error("Error in GetActiveVehiclesByFleetLogic:", error);
      throw error;
    }
  };

  GetFleetUtilizationLogic = async (
    accountid,
    fleetid,
    starttime,
    endtime,
    recursive = false
  ) => {
    try {
      // const weekstarttime = this.getWeekStarttime(starttime);
      // const weekendtime = this.getWeekEndtime(endtime);
      const weekstarttime = starttime;
      const weekendtime = endtime;

      let vehicles = await this.fmsAccountSvcI.GetVehicles(
        accountid,
        fleetid,
        recursive
      );
      if (!vehicles || vehicles.length === 0) {
        this.logger.info("No vehicles found in the fleet");
        return {
          totalvehiclecount: 0,
          totaltrips: 0,
          weekData: {},
        };
      }

      const vinNumbers = vehicles.map((vehicle) => vehicle.vinno);

      let tripData = await this.tripsinsightssvcI.GetTripsByFleet(
        vinNumbers,
        weekstarttime,
        weekendtime
      );
      if (!tripData) {
        this.logger.error("Failed to get fleet trips data");
        throw new Error("Failed to get fleet trips data");
      }

      const weekData = this.calculateWeekBuckets(
        weekstarttime,
        weekendtime,
        tripData
      );

      return {
        totalvehiclecount: vehicles.length,
        totaltrips: tripData ? tripData.length : 0,
        weekData,
      };
    } catch (error) {
      this.logger.error("Error in GetFleetUtilizationLogic:", error);
      throw error;
    }
  };

  GetFleetUtilizationForVehicleLogic = async (
    accountid,
    vinno,
    starttime,
    endtime
  ) => {
    try {
      // const weekstarttime = this.getWeekStarttime(starttime);
      // const weekendtime = this.getWeekEndtime(endtime);
      const weekstarttime = starttime;
      const weekendtime = endtime;

      let rootFleetId = await this.fmsAccountSvcI.GetRootFleetId(accountid);
      if (!rootFleetId) {
        this.logger.info("Root fleet not found for account");
        return {
          totalvehiclecount: 0,
          totaltrips: 0,
          weekData: {},
        };
      }

      let vehicles = await this.fmsAccountSvcI.GetVehicles(
        accountid,
        rootFleetId,
        true
      );
      if (!vehicles || vehicles.length === 0) {
        this.logger.info("No vehicles found in the account");
        return {
          totalvehiclecount: 0,
          totaltrips: 0,
          weekData: {},
        };
      }

      let vehicle = vehicles.find((v) => v.vinno === vinno);
      if (!vehicle) {
        this.logger.info("Vehicle not found");
        return {
          totalvehiclecount: 0,
          totaltrips: 0,
          weekData: {},
        };
      }

      let tripData = await this.tripsinsightssvcI.GetTripsByVehicle(
        accountid,
        vinno,
        weekstarttime,
        weekendtime
      );
      if (!tripData) {
        this.logger.error("Failed to get vehicle trips data");
        throw new Error("Failed to get vehicle trips data");
      }

      const weekData = this.calculateWeekBuckets(
        weekstarttime,
        weekendtime,
        tripData
      );

      return {
        totalvehiclecount: 1,
        totaltrips: tripData ? tripData.length : 0,
        weekData,
      };
    } catch (error) {
      this.logger.error("Error in GetFleetUtilizationForVehicleLogic:", error);
      throw error;
    }
  };

  GetFleetDrivingModeLogic = async (
    accountid,
    fleetid,
    starttime,
    endtime,
    recursive = false
  ) => {
    try {
      let vehicles = await this.fmsAccountSvcI.GetVehicles(
        accountid,
        fleetid,
        recursive
      );
      if (!vehicles || vehicles.length === 0) {
        this.logger.info("No vehicles found in the fleet");
        return {
          activevehicles: {},
          drivingmodeusage: {},
          rangecomparison: {},
        };
      }

      const vinNumbers = vehicles.map((vehicle) => vehicle.vinno);

      let tripData = await this.tripsinsightssvcI.GetTripsByFleet(
        vinNumbers,
        starttime,
        endtime
      );
      if (!tripData) {
        this.logger.error("Failed to get fleet trips data");
        throw new Error("Failed to get fleet trips data");
      }

      const activevehicles = this.calculateActiveVehiclesByDay(
        starttime,
        tripData
      );
      const drivingmodeusage = this.calculateDrivingModeUsage(
        starttime,
        tripData
      );
      // TODO: Implement range comparison
      const rangecomparison = {};

      return {
        activevehicles,
        drivingmodeusage,
        rangecomparison,
      };
    } catch (error) {
      this.logger.error("Error in GetFleetDrivingModeLogic:", error);
      throw error;
    }
  };

  GetVehicleDrivingModeLogic = async (accountid, vinno, starttime, endtime) => {
    try {
      let rootFleetId = await this.fmsAccountSvcI.GetRootFleetId(accountid);
      if (!rootFleetId) {
        this.logger.info("Root fleet not found for account");
        return {
          activevehicles: {},
          drivingmodeusage: {},
          rangecomparison: {},
        };
      }

      let vehicles = await this.fmsAccountSvcI.GetVehicles(
        accountid,
        rootFleetId,
        true
      );
      if (!vehicles || vehicles.length === 0) {
        this.logger.info("No vehicles found in the account");
        return {
          activevehicles: {},
          drivingmodeusage: {},
          rangecomparison: {},
        };
      }

      let vehicle = vehicles.find((v) => v.vinno === vinno);
      if (!vehicle) {
        this.logger.info("Vehicle not found");
        return {
          activevehicles: {},
          drivingmodeusage: {},
          rangecomparison: {},
        };
      }

      let tripData = await this.tripsinsightssvcI.GetTripsByVehicle(
        accountid,
        vinno,
        starttime,
        endtime
      );
      if (!tripData) {
        this.logger.error("Failed to get vehicle trips data");
        throw new Error("Failed to get vehicle trips data");
      }

      const activevehicles = this.calculateActiveVehiclesByDay(
        starttime,
        tripData
      );
      const drivingmodeusage = this.calculateDrivingModeUsage(
        starttime,
        tripData
      );
      // TODO: Implement range comparison
      const rangecomparison = {};

      return {
        activevehicles,
        drivingmodeusage,
        rangecomparison,
      };
    } catch (error) {
      this.logger.error("Error in GetVehicleDrivingModeLogic:", error);
      throw error;
    }
  };

  GetFleetOverviewLogic = async (
    accountid,
    fleetid,
    starttime,
    endtime,
    recursive = false
  ) => {
    try {
      let vehicles = await this.fmsAccountSvcI.GetVehicles(
        accountid,
        fleetid,
        recursive
      );
      if (!vehicles || vehicles.length === 0) {
        this.logger.info("No vehicles found in the fleet");
        return {
          insights: this.getDefaultInsights(),
          drilldowndata: this.getDefaultDrillDown(),
        };
      }

      const vinNumbers = vehicles.map((vehicle) => vehicle.vinno);

      let allTripData = await this.tripsinsightssvcI.GetAllTripsByFleet(
        vinNumbers,
        starttime,
        endtime
      );

      if (!allTripData) allTripData = [];

      if (allTripData.length === 0) {
        this.logger.info("No trip data found for the fleet");
        return {
          insights: this.getDefaultInsights(),
          drilldowndata: this.getDefaultDrillDown(),
        };
      }

      const tripData = allTripData.filter((trip) => {
        const distance = (trip.endodo || 0) - (trip.startodo || 0);
        return distance > 2;
      });

      const insights = this.calculateAllFleetInsights(tripData, allTripData);

      const drilldowndata = this.calculateMetricDrillDown(
        tripData,
        allTripData,
        starttime,
        endtime
      );

      return {
        insights,
        drilldowndata,
        totaltrips: allTripData.length,
        totalvehicles: vehicles.length,
        analysisperiod: {
          starttime: this.formatDateToIST(new Date(parseInt(starttime))),
          endtime: this.formatDateToIST(new Date(parseInt(endtime))),
        },
      };
    } catch (error) {
      this.logger.error("Error in GetFleetOverviewLogic:", error);
      throw error;
    }
  };

  GetFleetDistanceReportLogic = async (
    accountid,
    fleetid,
    starttime,
    endtime,
    recursive = false
  ) => {
    try {
      let vehicles = await this.fmsAccountSvcI.GetVehicles(
        accountid,
        fleetid,
        recursive
      );
      if (!vehicles || vehicles.length === 0) {
        this.logger.info("No vehicles found in the fleet");
        return {
          totalvehicles: 0,
          totaltrips: 0,
          daterange: {
            starttime: this.formatDateToIST(new Date(parseInt(starttime))),
            endtime: this.formatDateToIST(new Date(parseInt(endtime))),
          },
          dailydata: {},
        };
      }

      const vinNumbers = vehicles.map((vehicle) => vehicle.vinno);

      const [tripData, regnodata] = await Promise.all([
        this.tripsinsightssvcI.GetTripsByFleet(vinNumbers, starttime, endtime),
        this.fmsAccountSvcI.GetRegno(vinNumbers),
      ]);

      if (!tripData) {
        this.logger.error("Failed to get fleet trips data");
        throw new Error("Failed to get fleet trips data");
      }

      const vinToRegnoMap = {};
      regnodata.forEach(({ vinno, license_plate }) => {
        if (license_plate && license_plate.trim() !== "") {
          vinToRegnoMap[vinno] = license_plate;
        } else {
          vinToRegnoMap[vinno] = `${vinno}`;
        }
      });

      const vehicleInfoMap = {};
      vehicles.forEach((vehicle) => {
        vehicleInfoMap[vehicle.vinno] = vehicle;
      });

      const dailyData = {};

      if (tripData && tripData.length > 0) {
        tripData.forEach((trip) => {
          if (trip.starttime && trip.vin) {
            const tripDate = new Date(parseInt(trip.starttime));
            const dateKey = this.formatDateToIST(tripDate);
            const vehicle = vehicleInfoMap[trip.vin];

            if (vehicle) {
              if (!dailyData[dateKey]) {
                dailyData[dateKey] = {
                  date: dateKey,
                  vehicles: {},
                };
              }

              if (!dailyData[dateKey].vehicles[trip.vin]) {
                dailyData[dateKey].vehicles[trip.vin] = {
                  vinno: trip.vin,
                  regno: vinToRegnoMap[trip.vin] || `${trip.vin}`,
                  vehiclemodel: vehicle.vehiclemodel || "",
                  vehiclevariant: vehicle.vehiclevariant || "",
                  totaldistance: 0,
                  tripcount: 0,
                  trips: [],
                };
              }

              const tripDistance = (trip.endodo || 0) - (trip.startodo || 0);
              if (tripDistance > 0) {
                dailyData[dateKey].vehicles[trip.vin].totaldistance +=
                  tripDistance;
              }

              dailyData[dateKey].vehicles[trip.vin].tripcount += 1;

              dailyData[dateKey].vehicles[trip.vin].trips.push({
                starttime: trip.starttime,
                endtime: trip.endtime,
                distance: Math.round(tripDistance * 100) / 100,
                startodo: trip.startodo || 0,
                endodo: trip.endodo || 0,
              });
            }
          }
        });
      }

      Object.keys(dailyData).forEach((dateKey) => {
        Object.keys(dailyData[dateKey].vehicles).forEach((vinno) => {
          const vehicleData = dailyData[dateKey].vehicles[vinno];
          vehicleData.totaldistance =
            Math.round(vehicleData.totaldistance * 100) / 100;
        });
      });

      return {
        totalvehicles: vehicles.length,
        totaltrips: tripData ? tripData.length : 0,
        daterange: {
          starttime: this.formatDateToIST(new Date(parseInt(starttime))),
          endtime: this.formatDateToIST(new Date(parseInt(endtime))),
        },
        dailydata: dailyData,
      };
    } catch (error) {
      this.logger.error("Error in GetFleetDistanceReportLogic:", error);
      throw error;
    }
  };

  GetVehicleDistanceReportLogic = async (
    accountid,
    vinno,
    starttime,
    endtime
  ) => {
    try {
      let rootFleetId = await this.fmsAccountSvcI.GetRootFleetId(accountid);
      if (!rootFleetId) {
        this.logger.info("Root fleet not found for account");
        return {
          totalvehicles: 0,
          totaltrips: 0,
          daterange: {
            starttime: this.formatDateToIST(new Date(parseInt(starttime))),
            endtime: this.formatDateToIST(new Date(parseInt(endtime))),
          },
          dailydata: {},
        };
      }

      let vehicles = await this.fmsAccountSvcI.GetVehicles(
        accountid,
        rootFleetId,
        true
      );
      if (!vehicles || vehicles.length === 0) {
        this.logger.info("No vehicles found in the account");
        return {
          totalvehicles: 0,
          totaltrips: 0,
          daterange: {
            starttime: this.formatDateToIST(new Date(parseInt(starttime))),
            endtime: this.formatDateToIST(new Date(parseInt(endtime))),
          },
          dailydata: {},
        };
      }

      let vehicle = vehicles.find((v) => v.vinno === vinno);
      if (!vehicle) {
        this.logger.info("Vehicle not found");
        return {
          totalvehicles: 0,
          totaltrips: 0,
          daterange: {
            starttime: this.formatDateToIST(new Date(parseInt(starttime))),
            endtime: this.formatDateToIST(new Date(parseInt(endtime))),
          },
          dailydata: {},
        };
      }

      const [tripData, regnodata] = await Promise.all([
        this.tripsinsightssvcI.GetTripsByVehicle(
          accountid,
          vinno,
          starttime,
          endtime
        ),
        this.fmsAccountSvcI.GetRegno([vinno]),
      ]);

      if (!tripData) {
        this.logger.error("Failed to get vehicle trips data");
        throw new Error("Failed to get vehicle trips data");
      }

      const vinToRegnoMap = {};
      regnodata.forEach(({ vinno, license_plate }) => {
        if (license_plate && license_plate.trim() !== "") {
          vinToRegnoMap[vinno] = license_plate;
        } else {
          vinToRegnoMap[vinno] = `${vinno}`;
        }
      });

      const dailyData = {};

      if (tripData && tripData.length > 0) {
        tripData.forEach((trip) => {
          if (trip.starttime && trip.vin) {
            const tripDate = new Date(parseInt(trip.starttime));
            const dateKey = this.formatDateToIST(tripDate);

            if (!dailyData[dateKey]) {
              dailyData[dateKey] = {
                date: dateKey,
                vehicles: {},
              };
            }

            if (!dailyData[dateKey].vehicles[trip.vin]) {
              dailyData[dateKey].vehicles[trip.vin] = {
                vinno: trip.vin,
                regno: vinToRegnoMap[trip.vin] || `${trip.vin}`,
                vehiclemodel: vehicle.vehiclemodel || "",
                vehiclevariant: vehicle.vehiclevariant || "",
                totaldistance: 0,
                tripcount: 0,
                trips: [],
              };
            }

            const tripDistance = (trip.endodo || 0) - (trip.startodo || 0);
            if (tripDistance > 0) {
              dailyData[dateKey].vehicles[trip.vin].totaldistance +=
                tripDistance;
            }

            dailyData[dateKey].vehicles[trip.vin].tripcount += 1;

            dailyData[dateKey].vehicles[trip.vin].trips.push({
              starttime: trip.starttime,
              endtime: trip.endtime,
              distance: Math.round(tripDistance * 100) / 100,
              startodo: trip.startodo || 0,
              endodo: trip.endodo || 0,
            });
          }
        });
      }

      Object.keys(dailyData).forEach((dateKey) => {
        Object.keys(dailyData[dateKey].vehicles).forEach((vinno) => {
          const vehicleData = dailyData[dateKey].vehicles[vinno];
          vehicleData.totaldistance =
            Math.round(vehicleData.totaldistance * 100) / 100;
        });
      });

      return {
        totalvehicles: 1,
        totaltrips: tripData ? tripData.length : 0,
        daterange: {
          starttime: this.formatDateToIST(new Date(parseInt(starttime))),
          endtime: this.formatDateToIST(new Date(parseInt(endtime))),
        },
        dailydata: dailyData,
      };
    } catch (error) {
      this.logger.error("Error in GetVehicleDistanceReportLogic:", error);
      throw error;
    }
  };

  calculateMetricDrillDown = (tripData, allTripData, starttime, endtime) => {
    const BOOST_MODE_THRESHOLD = 30;
    const ECO_MODE_THRESHOLD = 70;
    const IDLE_TIME_THRESHOLD = 5;
    const SHORT_TRIP_DISTANCE = 2;
    const SHORT_TRIP_PERCENTAGE_THRESHOLD = 50;

    const dayWiseData = {};
    const start = new Date(parseInt(starttime));
    const end = new Date(parseInt(endtime));

    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateKey = this.formatDateToIST(currentDate);
      dayWiseData[dateKey] = {
        date: dateKey,
        tripData: [],
        allTripData: [],
      };
      currentDate.setDate(currentDate.getDate() + 1);
    }

    tripData.forEach((trip) => {
      if (trip.starttime) {
        const tripDate = new Date(parseInt(trip.starttime));
        const dateKey = this.formatDateToIST(tripDate);
        if (dayWiseData[dateKey]) {
          dayWiseData[dateKey].tripData.push(trip);
        }
      }
    });

    allTripData.forEach((trip) => {
      if (trip.starttime) {
        const tripDate = new Date(parseInt(trip.starttime));
        const dateKey = this.formatDateToIST(tripDate);
        if (dayWiseData[dateKey]) {
          dayWiseData[dateKey].allTripData.push(trip);
        }
      }
    });

    const drillDown = {
      boost_mode: {
        category: "boost_mode",
        title: "Boost Mode Usage - Daily Breakdown",
        threshold: `${BOOST_MODE_THRESHOLD}%`,
        unit: "%",
        dailydata: [],
      },
      eco_mode: {
        category: "eco_mode",
        title: "Eco Mode Usage - Daily Breakdown",
        threshold: `${ECO_MODE_THRESHOLD}%`,
        unit: "%",
        dailydata: [],
      },
      idle_time: {
        category: "idle_time",
        title: "Idle Time - Daily Breakdown",
        threshold: `${IDLE_TIME_THRESHOLD} min`,
        unit: "time",
        dailydata: [],
      },
      short_trips: {
        category: "short_trips",
        title: "Short Trips - Daily Breakdown",
        threshold: `${SHORT_TRIP_PERCENTAGE_THRESHOLD}%`,
        unit: "%",
        dailydata: [],
      },
    };

    const sortedDateKeys = Object.keys(dayWiseData).sort((a, b) => {
      const dateA = DateTime.fromFormat(a, "dd LLL yyyy", {
        zone: "Asia/Kolkata",
      });
      const dateB = DateTime.fromFormat(b, "dd LLL yyyy", {
        zone: "Asia/Kolkata",
      });
      return dateA.toMillis() - dateB.toMillis();
    });

    sortedDateKeys.forEach((dateKey) => {
      const dayData = dayWiseData[dateKey];

      let totalBoostDistance = 0;
      let totalDistance = 0;
      let totalIdleTime = 0;

      dayData.tripData.forEach((trip) => {
        const distance = (trip.endodo || 0) - (trip.startodo || 0);
        const boostDistance = trip.boostdist || 0;
        const idleTime = trip.idletime || 0;

        if (distance > 0) {
          totalDistance += distance;
          totalBoostDistance += Math.min(boostDistance, distance);
        }
        totalIdleTime += idleTime;
      });

      let shortTrips = 0;
      let totalAllDistance = 0;
      dayData.allTripData.forEach((trip) => {
        const distance = (trip.endodo || 0) - (trip.startodo || 0);
        if (distance > 0) {
          totalAllDistance += distance;
          if (distance < SHORT_TRIP_DISTANCE) {
            shortTrips++;
          }
        }
      });

      const boostModePercentage =
        totalDistance > 0 ? (totalBoostDistance / totalDistance) * 100 : 0;
      const ecoModePercentage = 100 - boostModePercentage;
      const averageIdleTimePerTrip =
        dayData.tripData.length > 0
          ? totalIdleTime / dayData.tripData.length / (1000 * 60)
          : 0;
      const shortTripPercentage =
        dayData.allTripData.length > 0
          ? (shortTrips / dayData.allTripData.length) * 100
          : 0;

      drillDown.boost_mode.dailydata.push({
        date: dateKey,
        value: `${Math.round(boostModePercentage)}%`,
        rawvalue: Math.round(boostModePercentage),
        status:
          boostModePercentage > BOOST_MODE_THRESHOLD
            ? "above_threshold"
            : "within_threshold",
        trips: dayData.tripData.length,
        details: `${Math.round(boostModePercentage)}% boost mode usage`,
      });

      drillDown.eco_mode.dailydata.push({
        date: dateKey,
        value: `${Math.round(ecoModePercentage)}%`,
        rawvalue: Math.round(ecoModePercentage),
        status:
          ecoModePercentage >= ECO_MODE_THRESHOLD
            ? "above_threshold"
            : "below_threshold",
        trips: dayData.tripData.length,
        details: `${Math.round(ecoModePercentage)}% eco mode usage`,
      });

      const formattedIdleTime = formatEpochToDuration(
        averageIdleTimePerTrip * 60 * 1000
      );
      drillDown.idle_time.dailydata.push({
        date: dateKey,
        value: formattedIdleTime || "0 min",
        rawvalue: Math.round(averageIdleTimePerTrip),
        status:
          averageIdleTimePerTrip > IDLE_TIME_THRESHOLD
            ? "above_threshold"
            : "within_threshold",
        trips: dayData.tripData.length,
        details: `${formattedIdleTime || "0 min"} average idle time`,
      });

      drillDown.short_trips.dailydata.push({
        date: dateKey,
        value: `${Math.round(shortTripPercentage)}%`,
        rawvalue: Math.round(shortTripPercentage),
        status:
          shortTripPercentage > SHORT_TRIP_PERCENTAGE_THRESHOLD
            ? "above_threshold"
            : "within_threshold",
        trips: dayData.allTripData.length,
        details: `${Math.round(
          shortTripPercentage
        )}% short trips (<${SHORT_TRIP_DISTANCE}km)`,
      });
    });

    return drillDown;
  };

  calculateAllFleetInsights = (tripData, allTripData) => {
    const BOOST_MODE_THRESHOLD = 30;
    const ECO_MODE_THRESHOLD = 70;
    const ECO_MODE_THRESHOLD_LOW = 50;
    const IDLE_TIME_THRESHOLD = 5;
    const SHORT_TRIP_DISTANCE = 2;
    const SHORT_TRIP_PERCENTAGE_THRESHOLD = 30;

    let totalBoostDistance = 0;
    let totalDistance = 0;
    let totalIdleTime = 0;

    tripData.forEach((trip) => {
      const distance = (trip.endodo || 0) - (trip.startodo || 0);
      const boostDistance = trip.boostdist || 0;
      const idleTime = trip.idletime || 0;

      if (distance > 0) {
        totalDistance += distance;
        totalBoostDistance += Math.min(boostDistance, distance);
      }

      totalIdleTime += idleTime;
    });

    let shortTrips = 0;
    let totalAllTrips = allTripData.length;
    let totalAllDistance = 0;

    allTripData.forEach((trip) => {
      const distance = (trip.endodo || 0) - (trip.startodo || 0);

      if (distance > 0) {
        totalAllDistance += distance;

        if (distance < SHORT_TRIP_DISTANCE) {
          shortTrips++;
        }
      }
    });

    const boostModePercentage =
      totalDistance > 0 ? (totalBoostDistance / totalDistance) * 100 : 0;
    const ecoModePercentage = 100 - boostModePercentage;
    const averageIdleTimePerTrip =
      tripData.length > 0 ? totalIdleTime / tripData.length / (1000 * 60) : 0;
    const shortTripPercentage =
      totalAllTrips > 0 ? (shortTrips / totalAllTrips) * 100 : 0;

    const insights = [];

    // 1. Boost Mode Insight
    const isBoostModeHigh = boostModePercentage > BOOST_MODE_THRESHOLD;
    insights.push({
      displayname: "Boost Mode Usage",
      type: isBoostModeHigh ? "warning" : "success",
      category: "boost_mode",
      title: isBoostModeHigh
        ? "High Boost Mode Usage"
        : "Optimal Boost Mode Usage",
      message: isBoostModeHigh
        ? "Hey! Too much boost mode could impact realised range!"
        : "Great! Boost mode usage is within optimal range",
      details: `${Math.round(
        boostModePercentage
      )}% boost mode usage (ideal is ${BOOST_MODE_THRESHOLD}%)`,
      value: `${Math.round(boostModePercentage)}%`,
      threshold: `Ideal is ${BOOST_MODE_THRESHOLD}%`,
      rawvalue: Math.round(boostModePercentage),
      status: isBoostModeHigh ? "above_threshold" : "within_threshold",
      priority: isBoostModeHigh ? "high" : "low",
    });

    // 2. Eco Mode Insight
    if (ecoModePercentage > ECO_MODE_THRESHOLD_LOW) {
      const isEcoModeGood = ecoModePercentage >= ECO_MODE_THRESHOLD;
      insights.push({
        displayname: "Eco Mode Usage",
        type: isEcoModeGood ? "success" : "info",
        category: "eco_mode",
        title: isEcoModeGood
          ? "Excellent Eco Driving"
          : "Eco mode shows promise, a bit more refinement is needed",
        message: isEcoModeGood
          ? `Hey! Well done - more than ${Math.round(
              ecoModePercentage
            )}% of your drives are Eco`
          : "Consider using eco mode more frequently for better efficiency",
        details: `${Math.round(
          ecoModePercentage
        )}% eco mode usage (ideal is ${ECO_MODE_THRESHOLD}%)`,
        value: `${Math.round(ecoModePercentage)}%`,
        threshold: `Ideal is ${ECO_MODE_THRESHOLD}%`,
        rawvalue: Math.round(ecoModePercentage),
        status: isEcoModeGood ? "above_threshold" : "below_threshold",
        priority: isEcoModeGood ? "low" : "medium",
      });
    } else {
      insights.push({
        displayname: "Eco Mode Usage",
        type: "warning",
        category: "eco_mode",
        title:
          "Insufficient use of Eco mode, could be undermining overall efficiency.",
        message: `Hey! Your ECO mode usage is low - Only ${Math.round(
          ecoModePercentage
        )}% of your drives are Eco`,
        details: `${Math.round(
          ecoModePercentage
        )}% eco mode usage (ideal is ${ECO_MODE_THRESHOLD}%)`,
        value: `${Math.round(ecoModePercentage)}%`,
        threshold: `Ideal is ${ECO_MODE_THRESHOLD}%`,
        rawvalue: Math.round(ecoModePercentage),
        status: "below_threshold",
        priority: "high",
      });
    }

    // 3. Idle Time Insight
    const isIdleTimeHigh = averageIdleTimePerTrip > IDLE_TIME_THRESHOLD;
    const formattedIdleTime = formatEpochToDuration(
      averageIdleTimePerTrip * 60 * 1000
    );
    insights.push({
      displayname: "Idle Time",
      type: isIdleTimeHigh ? "warning" : "success",
      category: "idle_time",
      title: isIdleTimeHigh ? "High Idling Time" : "Optimal Idling Time",
      message: isIdleTimeHigh
        ? "Hey! Idling time is high – this impacts energy efficiency!"
        : "Great! Idling time is within optimal range",
      details: `${
        formattedIdleTime || "0 min"
      } average idle time per trip (ideal is ${IDLE_TIME_THRESHOLD} min)`,
      value: formattedIdleTime || "0 min",
      threshold: `Ideal is ${IDLE_TIME_THRESHOLD} min`,
      rawvalue: Math.round(averageIdleTimePerTrip),
      status: isIdleTimeHigh ? "above_threshold" : "within_threshold",
      priority: isIdleTimeHigh ? "medium" : "low",
    });

    // 4. Short Trips Insight - Now using ALL trip data
    const isShortTripsHigh =
      shortTripPercentage > SHORT_TRIP_PERCENTAGE_THRESHOLD;
    const averageTripDistance =
      totalAllTrips > 0 ? totalAllDistance / totalAllTrips : 0;
    insights.push({
      displayname: "Short Trips",
      type: isShortTripsHigh ? "warning" : "success",
      category: "short_trips",
      title: isShortTripsHigh
        ? "Frequent Short Trips"
        : "Good Average Trip Distance",
      message: isShortTripsHigh
        ? "Hey! Frequent short trips detected – these affect efficiency and battery health."
        : "Trip Distance are well distributed for optimal efficiency",
      details: `${Math.round(
        shortTripPercentage
      )}% short trips (<${SHORT_TRIP_DISTANCE}km), average: ${
        Math.round(averageTripDistance * 100) / 100
      }km (ideal is ${SHORT_TRIP_PERCENTAGE_THRESHOLD}%)`,
      value: `${Math.round(shortTripPercentage)}%`,
      threshold: `Ideal is ${SHORT_TRIP_PERCENTAGE_THRESHOLD}%`,
      rawvalue: Math.round(shortTripPercentage),
      status: isShortTripsHigh ? "above_threshold" : "within_threshold",
      priority: isShortTripsHigh ? "medium" : "low",
    });

    return insights;
  };

  getDefaultInsights = () => {
    return [
      {
        type: "info",
        category: "boost_mode",
        title: "Boost Mode Usage",
        message: "No data available for boost mode analysis",
        details: "Insufficient trip data to analyze boost mode usage",
        value: "0%",
        threshold: "30%",
        rawvalue: 0,
        status: "no_data",
        priority: "low",
      },
      {
        type: "info",
        category: "eco_mode",
        title: "Eco Mode Usage",
        message: "No data available for eco mode analysis",
        details: "Insufficient trip data to analyze eco mode usage",
        value: "0%",
        threshold: "70%",
        rawvalue: 0,
        status: "no_data",
        priority: "low",
      },
      {
        type: "info",
        category: "idle_time",
        title: "Idling Time",
        message: "No data available for idle time analysis",
        details: "Insufficient trip data to analyze idling patterns",
        value: "0 min",
        threshold: "5 min",
        rawvalue: 0,
        status: "no_data",
        priority: "low",
      },
      {
        type: "info",
        category: "short_trips",
        title: "Trip Length Distribution",
        message: "No data available for trip length analysis",
        details: "Insufficient trip data to analyze trip patterns",
        value: "0%",
        threshold: "50%",
        rawvalue: 0,
        status: "no_data",
        priority: "low",
      },
    ];
  };

  getDefaultDrillDown = () => {
    return {
      boost_mode: {
        category: "boost_mode",
        title: "Boost Mode Usage - Daily Breakdown",
        threshold: "30%",
        unit: "%",
        dailydata: [],
      },
      eco_mode: {
        category: "eco_mode",
        title: "Eco Mode Usage - Daily Breakdown",
        threshold: "70%",
        unit: "%",
        dailydata: [],
      },
      idle_time: {
        category: "idle_time",
        title: "Idle Time - Daily Breakdown",
        threshold: "5 min",
        unit: "time",
        dailydata: [],
      },
      short_trips: {
        category: "short_trips",
        title: "Short Trips - Daily Breakdown",
        threshold: "50%",
        unit: "%",
        dailydata: [],
      },
    };
  };

  // helper functions
  calculateActiveVehiclesByDay = (starttime, tripData) => {
    const activeVehicles = {};

    if (tripData && tripData.length > 0) {
      tripData.forEach((trip) => {
        if (trip.starttime) {
          const tripDate = new Date(parseInt(trip.starttime));
          const dateKey = this.formatDateToIST(tripDate);

          if (!activeVehicles[dateKey]) {
            activeVehicles[dateKey] = new Set();
          }
          activeVehicles[dateKey].add(trip.vin);
        }
      });
    }

    const processedActiveVehicles = {};
    Object.keys(activeVehicles).forEach((dateKey) => {
      processedActiveVehicles[dateKey] = activeVehicles[dateKey].size;
    });

    return processedActiveVehicles;
  };

  calculateDrivingModeUsage = (starttime, tripData) => {
    const drivingModeUsage = {};

    if (tripData && tripData.length > 0) {
      tripData.forEach((trip) => {
        if (trip.starttime) {
          const tripDate = new Date(parseInt(trip.starttime));
          const dateKey = this.formatDateToIST(tripDate);

          if (!drivingModeUsage[dateKey]) {
            drivingModeUsage[dateKey] = {
              totaldistance: 0,
              boostdistance: 0,
              ecodistance: 0,
              boostpercentage: 0,
              ecopercentage: 0,
            };
          }

          const tripDistance = (trip.endodo || 0) - (trip.startodo || 0);
          const boostDistance = trip.boostdist || 0;

          const actualBoostDistance = Math.min(boostDistance, tripDistance);
          const ecoDistance = Math.max(0, tripDistance - actualBoostDistance);

          if (tripDistance > 0) {
            drivingModeUsage[dateKey].totaldistance += tripDistance;
            drivingModeUsage[dateKey].boostdistance += actualBoostDistance;
            drivingModeUsage[dateKey].ecodistance += ecoDistance;
          }
        }
      });
    }

    Object.keys(drivingModeUsage).forEach((dateKey) => {
      const dayData = drivingModeUsage[dateKey];
      if (dayData.totaldistance > 0) {
        const boostPercentage = Math.min(
          100,
          Math.round((dayData.boostdistance / dayData.totaldistance) * 100)
        );
        const ecoPercentage = Math.min(
          100,
          Math.round((dayData.ecodistance / dayData.totaldistance) * 100)
        );

        dayData.boostpercentage = boostPercentage;
        dayData.ecopercentage = Math.min(100 - boostPercentage, ecoPercentage);
      }

      dayData.totaldistance = Math.round(dayData.totaldistance * 100) / 100;
      dayData.boostdistance = Math.round(dayData.boostdistance * 100) / 100;
      dayData.ecodistance = Math.round(dayData.ecodistance * 100) / 100;
    });

    return drivingModeUsage;
  };

  calculateWeekBuckets = (starttime, endtime, tripData) => {
    const weekData = {};
    const startDate = new Date(parseInt(starttime));
    const endDate = new Date(parseInt(endtime));

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dayKey = this.formatDateToIST(currentDate);
      weekData[dayKey] = {
        date: dayKey,
        dayofweek: this.getDayOfWeek(currentDate),
        hourBuckets: this.initializeHourBuckets(),
      };
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (tripData && tripData.length > 0) {
      tripData.forEach((trip) => {
        if (trip.starttime) {
          const tripStartTime = parseInt(trip.starttime);

          if (
            tripStartTime >= parseInt(starttime) &&
            tripStartTime <= parseInt(endtime)
          ) {
            const tripDate = new Date(tripStartTime);
            const dayKey = this.formatDateToIST(tripDate);

            if (weekData[dayKey]) {
              const hour = tripDate.getHours();
              const hourBucketIndex = Math.floor(hour / 2);
              const hourBucketKey = `${hourBucketIndex * 2}-${
                (hourBucketIndex + 1) * 2
              }`;

              const bucket = weekData[dayKey].hourBuckets[hourBucketKey];

              if (!bucket.activeVehicles) {
                bucket.activeVehicles = new Set();
              }
              bucket.activeVehicles.add(trip.vin);
            }
          }
        }
      });
    }

    Object.keys(weekData).forEach((dayKey) => {
      Object.keys(weekData[dayKey].hourBuckets).forEach((hourKey) => {
        const bucket = weekData[dayKey].hourBuckets[hourKey];
        if (bucket.activeVehicles) {
          bucket.activeVehicleCount = bucket.activeVehicles.size;
          delete bucket.activeVehicles;
        } else {
          bucket.activeVehicleCount = 0;
        }
      });
    });

    return weekData;
  };

  initializeHourBuckets = () => {
    const buckets = {};
    for (let i = 0; i < 12; i++) {
      const startHour = i * 2;
      const endHour = (i + 1) * 2;
      const key = `${startHour}-${endHour}`;
      buckets[key] = {
        hourRange: key,
        activeVehicleCount: 0,
      };
    }
    return buckets;
  };

  getDayOfWeek = (gmtDate) => {
    return DateTime.fromJSDate(gmtDate, { zone: "utc" })
      .setZone("Asia/Kolkata")
      .toFormat("cccc");
  };

  getWeekStarttime = (timestamp) => {
    return DateTime.fromMillis(Number(timestamp), {
      zone: "Asia/Kolkata",
      locale: "en-GB",
    })
      .startOf("week")
      .startOf("day")
      .toMillis();
  };

  getWeekEndtime = (timestamp) => {
    return DateTime.fromMillis(Number(timestamp), {
      zone: "Asia/Kolkata",
      locale: "en-GB",
    })
      .endOf("week")
      .endOf("day")
      .toMillis();
  };

  formatDateToIST = (date) => {
    return DateTime.fromJSDate(date, { zone: "utc" })
      .setZone("Asia/Kolkata")
      .toFormat("dd LLL yyyy");
  };
}
