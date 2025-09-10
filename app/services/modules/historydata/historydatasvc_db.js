import clhTimeBucketRange from "./historydatasvc_utils.js";

export default class HistoryDataSvcDB {
  constructor(pgPoolI, clickHouseClient, logger) {
    this.pgPoolI = pgPoolI;
    this.clickHouseClient = clickHouseClient;
    this.logger = logger;
    this.canmetrics = [
      "cycletime",
      "charger_sts_live",
      "bms_charger_plug_in_sts",
      "drive_enable",
      "bms_hvbatt_connect_sts",
      "bms_hvbatt_disconnect_sts",
      "bms_in_keyon",
      "bms_cyclenum",
      "charger_temp_live",
      "chargertemp",
      "soc",
      "soh",
      "bms_cell_avg_volt",
      "bms_cell_avg_temp",
      "motortemp",
      "bms_batt_pack_temp",
      "brake_switch_status",
      "odometer",
      "vehiclespeed",
      "motorpower",
      "e_motor_rpm",
      "inv_drivemode_shift",
      "v_mode",
      "battery_ttc",
      "percthrottle",
      "kwh",
      "batt_current",
      "aux_batt_volt",
      "bat_voltage",
      "dte",
      "can_throttle",
      "wakeup_command",
      "veh_immo_resp",
      "service_tt",
      "chargett",
      "connectionhealthtt",
      "tcu_speedmode",
      "Test Data",
      "aux_batt_volt",
    ];
  }

  async getGPSHistoryData(accountid, vinnumber, starttime, endtime) {
    // TODO: add accountid and fleetid check later
    const currtime = Date.now();

    // Validate time range
    if (
      starttime >= endtime ||
      endtime > currtime ||
      starttime < 0 ||
      endtime - starttime > 31 * 24 * 60 * 60 * 1000
    ) {
      return new Error("Invalid time range");
    }

    try {
      // Get the time buckets for the given time range
      const timeBuckets = clhTimeBucketRange(starttime, endtime);
      if (timeBuckets.length === 0) {
        return new Error("No valid time buckets found");
      }

      // Build the query for each time bucket
      const queries = timeBuckets.map((bucket) => {
        return `
          SELECT 
            vin, 
            utctime, 
            altitude, 
            gpstime, 
            intime, 
            latdir, 
            latitude, 
            longdir, 
            longitude, 
            speed, 
            valid, 
            proctime, 
            packettype 
          FROM lmmdata.gpsdata_${bucket} 
          WHERE vin = '${vinnumber}' 
            AND utctime >= ${starttime} 
            AND utctime <= ${endtime}
            AND longitude != 0
            AND latitude != 0`;
      });

      // Execute all queries in parallel
      const results = [];
      await Promise.all(
        queries.map((query) => {
          return this.clickHouseClient.queryWithCallback(
            query,
            (err, result) => {
              if (err) {
                console.error("Error executing query:", err);
                return [];
              }
              result.forEach((row) => {
                results.push(row);
              });
            }
          );
        })
      );

      // Sort results by utctime in ascending order
      results.sort((a, b) => a.utctime - b.utctime);

      const formattedResults = this.formatGPSData(results);

      return formattedResults;
    } catch (error) {
      this.logger.error("Error fetching GPS history data:", error);
      throw error;
    }
  }

  // helper function to convert type

  formatGPSData(data) {
    return data.map((row) => {
      const formatted = { ...row };

      // Convert UInt64 fields
      if (formatted.utctime !== undefined)
        formatted.utctime = parseInt(formatted.utctime) || 0;
      if (formatted.altitude !== undefined)
        formatted.altitude = parseInt(formatted.altitude) || 0;
      if (formatted.gpstime !== undefined)
        formatted.gpstime = parseInt(formatted.gpstime) || 0;
      if (formatted.intime !== undefined)
        formatted.intime = parseInt(formatted.intime) || 0;
      if (formatted.speed !== undefined)
        formatted.speed = parseInt(formatted.speed) || 0;
      if (formatted.proctime !== undefined)
        formatted.proctime = parseInt(formatted.proctime) || 0;

      // Convert Float64 fields
      if (formatted.latitude !== undefined)
        formatted.latitude = parseFloat(formatted.latitude) || 0;
      if (formatted.longitude !== undefined)
        formatted.longitude = parseFloat(formatted.longitude) || 0;

      return formatted;
    });
  }

  formatCANData(data) {
    return data.map((row) => {
      const formatted = { ...row };

      // Convert UInt64 fields
      if (formatted.utctime !== undefined)
        formatted.utctime = parseInt(formatted.utctime) || 0;
      if (formatted.intime !== undefined)
        formatted.intime = parseInt(formatted.intime) || 0;
      if (formatted.proctime !== undefined)
        formatted.proctime = parseInt(formatted.proctime) || 0;

      // Convert UInt32 fields
      const uint32Fields = [
        "bms_cyclenum",
        "can_soc",
        "soh",
        "brake_switch_status",
        "e_motor_rpm",
        "inv_drivemode_shift",
        "v_mode",
        "battery_ttc",
        "can_dte",
        "can_throttle",
        "veh_immo_resp",
        "service_tt",
        "chargett",
        "connectionhealthtt",
        "tcu_speedmode",
      ];
      uint32Fields.forEach((field) => {
        if (formatted[field] !== undefined) {
          formatted[field] = parseInt(formatted[field]) || 0;
        }
      });

      // Convert Float32 fields
      const float32Fields = [
        "charger_temp_live",
        "chargertemp",
        "soc",
        "bms_cell_avg_volt",
        "bms_cell_avg_temp",
        "motortemp",
        "bms_batt_pack_temp",
        "odometer",
        "odometer_new",
        "vehiclespeed",
        "motorpower",
        "percthrottle",
        "kwh",
        "batt_current",
        "aux_batt_volt",
        "bat_voltage",
        "dte",
        "wakeup_command",
      ];
      float32Fields.forEach((field) => {
        if (formatted[field] !== undefined) {
          formatted[field] = parseFloat(formatted[field]) || 0;
        }
      });

      return formatted;
    });
  }

  async getCANHistoryData(accountid, vinnumber, starttime, endtime, canparams) {
    const currtime = Date.now();
    if (
      starttime >= endtime ||
      endtime > currtime ||
      starttime < 0 ||
      endtime - starttime > 31 * 24 * 60 * 60 * 1000
    ) {
      return new Error("Invalid time range");
    }

    if (!Array.isArray(canparams) || canparams.length === 0) {
      return new Error("canparams must be a non-empty array");
    }

    if (
      !canparams.every(
        (param) => typeof param === "string" && this.canmetrics.includes(param)
      )
    ) {
      return new Error("canparams must contain only strings");
    }

    try {
      // Get the time buckets for the given time range
      const timeBuckets = clhTimeBucketRange(starttime, endtime);

      if (timeBuckets.length === 0) {
        return new Error("No valid time buckets found");
      }

      // Build the query for each time bucket
      const queries = timeBuckets.map((bucket) => {
        return `SELECT vin, utctime, intime, valid, proctime, packettype, ${canparams.join(
          ","
        )} FROM lmmdata.candata_${bucket} WHERE vin = '${vinnumber}' AND utctime >= ${starttime} AND utctime <= ${endtime} AND odometer > 1`;
      });

      // Execute all queries in parallel
      const results = [];
      await Promise.all(
        queries.map((query) => {
          return this.clickHouseClient.queryWithCallback(
            query,
            (err, result) => {
              if (err) {
                console.error("Error executing query:", err);
                return [];
              }
              result.forEach((row) => {
                results.push(row);
              });
            }
          );
        })
      );

      // Sort results by utctime in ascending order
      results.sort((a, b) => a.utctime - b.utctime);

      const formattedResults = this.formatCANData(results);

      return formattedResults;
    } catch (error) {
      this.logger.error("Error fetching GPS history data:", error);
      throw error;
    }
  }

  async getMergedCANGPSHistoryData(
    accountid,
    vinnumber,
    starttime,
    endtime,
    canparams
  ) {
    if (
      starttime >= endtime ||
      starttime < 0 ||
      endtime - starttime > 31 * 24 * 60 * 60 * 1000
    ) {
      return new Error("Invalid time range");
    }

    if (!Array.isArray(canparams) || canparams.length === 0) {
      return new Error("canparams must be a non-empty array");
    }

    if (
      !canparams.every(
        (param) => typeof param === "string" && this.canmetrics.includes(param)
      )
    ) {
      return new Error("canparams must contain only strings");
    }

    try {
      const vehicleQuery = `SELECT modelcode FROM vehicle WHERE vinno = $1`;
      const vehicleResult = await this.pgPoolI.Query(vehicleQuery, [vinnumber]);

      if (vehicleResult.rows.length === 0) {
        return new Error("Vehicle not found");
      }

      const modelcode = vehicleResult.rows[0].modelcode;

      const timeBuckets = clhTimeBucketRange(starttime, endtime);
      if (timeBuckets.length === 0) {
        return new Error("No valid time buckets found");
      }

      const canQueries = timeBuckets.map((bucket) => {
        return `SELECT vin, utctime, intime, valid, proctime, packettype, ${canparams.join(
          ","
        )} FROM lmmdata.candata_${bucket} WHERE vin = '${vinnumber}' AND utctime >= ${starttime} AND utctime <= ${endtime} AND odometer > 1`;
      });

      const gpsQueries = timeBuckets.map((bucket) => {
        return `
          SELECT 
            vin, 
            utctime, 
            gpstime, 
            latdir, 
            latitude, 
            longdir, 
            longitude 
          FROM lmmdata.gpsdata_${bucket} 
          WHERE vin = '${vinnumber}' 
            AND utctime >= ${starttime} 
            AND utctime <= ${endtime}
            AND longitude != 0
            AND latitude != 0`;
      });

      const canResults = [];
      const gpsResults = [];

      await Promise.all([
        ...canQueries.map((query) => {
          return this.clickHouseClient.queryWithCallback(
            query,
            (err, result) => {
              if (err) {
                console.error("Error executing CAN query:", err);
                return;
              }
              result.forEach((row) => {
                canResults.push(row);
              });
            }
          );
        }),
        ...gpsQueries.map((query) => {
          return this.clickHouseClient.queryWithCallback(
            query,
            (err, result) => {
              if (err) {
                console.error("Error executing GPS query:", err);
                return;
              }
              result.forEach((row) => {
                gpsResults.push(row);
              });
            }
          );
        }),
      ]);

      canResults.sort((a, b) => a.utctime - b.utctime);
      gpsResults.sort((a, b) => a.utctime - b.utctime);

      const formattedCanData = this.formatCANData(canResults);
      const formattedGpsData = this.formatGPSData(gpsResults);

      const mergedData = this.mergeCANWithGPS(
        formattedCanData,
        formattedGpsData
      );

      const finalData = mergedData.map((record) => ({
        ...record,
        modelcode: modelcode,
      }));

      return finalData;
    } catch (error) {
      this.logger.error("Error fetching merged CAN+GPS history data:", error);
      throw error;
    }
  }

  mergeCANWithGPS(canData, gpsData) {
    const sortedCanData = canData.sort((a, b) => a.utctime - b.utctime);
    const sortedGpsData = gpsData.sort((a, b) => a.utctime - b.utctime);

    const mergedData = [];
    let gpsIndex = 0;
    let currentGpsRecord = null;

    if (sortedGpsData.length > 0) {
      currentGpsRecord = sortedGpsData[0];
    }

    for (let i = 0; i < sortedCanData.length; i++) {
      const canRecord = sortedCanData[i];
      const canUtcTime = canRecord.utctime;

      while (
        gpsIndex < sortedGpsData.length &&
        sortedGpsData[gpsIndex].utctime <= canUtcTime
      ) {
        currentGpsRecord = sortedGpsData[gpsIndex];
        gpsIndex++;
      }

      if (!currentGpsRecord && sortedGpsData.length > 0) {
        currentGpsRecord = sortedGpsData[0];
      }

      const mergedRecord = { ...canRecord };

      if (currentGpsRecord) {
        mergedRecord.gpstime = currentGpsRecord.gpstime;
        mergedRecord.latdir = currentGpsRecord.latdir;
        mergedRecord.latitude = currentGpsRecord.latitude;
        mergedRecord.longdir = currentGpsRecord.longdir;
        mergedRecord.longitude = currentGpsRecord.longitude;
      } else {
        mergedRecord.gpstime = null;
        mergedRecord.latdir = null;
        mergedRecord.latitude = null;
        mergedRecord.longdir = null;
        mergedRecord.longitude = null;
      }

      mergedData.push(mergedRecord);
    }

    return mergedData;
  }

  async getLastestLatLongDataForVins(vinnos) {
    if (!vinnos || vinnos.length === 0) {
      return {};
    }

    try {
      const vinList = vinnos.map((vin) => `'${vin}'`).join(",");
      const query = `
        SELECT vin, utctime, gpstime, latitude, longitude 
        FROM lmmdata_latest.gpsdatalatest
        WHERE vin IN (${vinList});
      `;

      const result = await this.clickHouseClient.query(query);

      if (!result.success) {
        this.logger.error(
          "Failed to query ClickHouse for GPS data:",
          result.error
        );
        throw new Error("Failed to fetch latest GPS data");
      }

      const gpsDataMap = {};
      for (let row of result.data) {
        gpsDataMap[row.vin] = {
          latitude: row.latitude,
          longitude: row.longitude,
          utctime: row.utctime,
          gpstime: row.gpstime,
        };
      }

      return gpsDataMap;
    } catch (error) {
      this.logger.error("Error fetching latest GPS data:", error);
      return error;
    }
  }

  async getLatestCanData(vinnos) {
    try {
      const vinList = vinnos.map((vin) => `'${vin}'`).join(",");
      const query = `
        SELECT * FROM lmmdata_latest.candatalatest
        WHERE vin IN (${vinList})
      `;

      const result = await this.clickHouseClient.query(query);

      if (!result.success) {
        this.logger.error(
          "Failed to query ClickHouse for GPS data:",
          result.error
        );
        throw new Error("Failed to fetch latest CAN data");
      }

      const canDataMap = {};
      for (let row of result.data) {
        const formatted = { ...row };

        if (formatted.utctime !== undefined)
          formatted.utctime = parseInt(formatted.utctime) || 0;
        if (formatted.intime !== undefined)
          formatted.intime = parseInt(formatted.intime) || 0;
        if (formatted.proctime !== undefined)
          formatted.proctime = parseInt(formatted.proctime) || 0;

        const uint32Fields = [
          "bms_cyclenum",
          "can_soc",
          "soh",
          "brake_switch_status",
          "e_motor_rpm",
          "inv_drivemode_shift",
          "v_mode",
          "battery_ttc",
          "can_dte",
          "can_throttle",
          "veh_immo_resp",
          "service_tt",
          "chargett",
          "connectionhealthtt",
          "tcu_speedmode",
        ];
        uint32Fields.forEach((field) => {
          if (formatted[field] !== undefined) {
            formatted[field] = parseInt(formatted[field]) || 0;
          }
        });

        const float32Fields = [
          "charger_temp_live",
          "chargertemp",
          "soc",
          "bms_cell_avg_volt",
          "bms_cell_avg_temp",
          "motortemp",
          "bms_batt_pack_temp",
          "odometer",
          "odometer_new",
          "vehiclespeed",
          "motorpower",
          "percthrottle",
          "kwh",
          "batt_current",
          "aux_batt_volt",
          "bat_voltage",
          "dte",
          "wakeup_command",
        ];
        float32Fields.forEach((field) => {
          if (formatted[field] !== undefined) {
            formatted[field] = parseFloat(formatted[field]) || 0;
          }
        });

        canDataMap[row.vin] = formatted;
      }

      return canDataMap;
    } catch (error) {
      this.logger.error("Error fetching latest vehicle data:", error);
      throw error;
    }
  }
}
