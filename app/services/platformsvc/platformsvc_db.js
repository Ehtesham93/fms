import ClickHouseClient from "../../utils/clickhouse.js";
export default class PlatformSvcDB {
  /**
   *
   * @param {PgPool} pgPoolI
   */
  constructor(pgPoolI, logger) {
    this.pgPoolI = pgPoolI;
    this.logger = logger;
    this.clickHouseClient = new ClickHouseClient();
  }

  async getUserName(userid) {
    try {
      let query = `
            SELECT displayname FROM users WHERE userid = $1 AND isdeleted = false
        `;
      let result = await this.pgPoolI.Query(query, [userid]);
      if (result.rowCount === 0) {
        return "Unknown User";
      }
      return result.rows[0].displayname;
    } catch (error) {
      throw new Error("Failed to fetch user name");
    }
  }

  async getAllPlatformModulesInfo() {
    try {
      let query = `
            SELECT moduleid, modulename, moduletype, modulecode, moduleinfo, creditspervehicleday, isenabled, priority, createdat, createdby, updatedat, updatedby FROM module 
            WHERE moduletype = 'platform' ORDER BY priority
        `;
      let result = await this.pgPoolI.Query(query);
      if (result.rowCount === 0) {
        return null;
      }
      result.rows.forEach(async (row) => {
        row.createdby = await this.getUserName(row.createdby);
        row.updatedby = await this.getUserName(row.updatedby);
      });
      return result.rows;
    } catch (error) {
      throw new Error("Failed to fetch all platform modules info");
    }
  }

  async createVehicle(vinno, modelcode, vehicleinfo, mobileno, assignedby) {
    try {
      let currtime = new Date();

      // check if vehicle already exists
      let query = `
            SELECT vinno FROM vehicle WHERE vinno = $1
        `;
      let result = await this.pgPoolI.Query(query, [vinno]);
      if (result.rowCount > 0) {
        throw new Error("Vehicle already exists");
      }

      // get model details
      query = `
            SELECT modeldisplayname, modelname, modelvariant FROM vehicle_model WHERE modelcode = $1
        `;
      result = await this.pgPoolI.Query(query, [modelcode]);
      if (result.rowCount === 0) {
        throw new Error("Model not found");
      }
      let modelname = result.rows[0].modelname;
      let modelvariant = result.rows[0].modelvariant;

      query = `
            INSERT INTO vehicle (vinno, modelcode, mobile, vehiclevariant, vehiclemodel, vehicleinfo, createdat, createdby, updatedat, updatedby) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `;
      result = await this.pgPoolI.Query(query, [
        vinno,
        modelcode,
        mobileno,
        modelvariant,
        modelname,
        vehicleinfo,
        currtime,
        assignedby,
        currtime,
        assignedby,
      ]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to create vehicle");
      }
      return true;
    } catch (error) {
      throw error;
    }
  }

  async getAccountByName(accountname) {
    try {
      let query = `
            SELECT a.accountid, af.fleetid as rootfleetid, a.accounttype, a.accountinfo, a.isenabled, a.isdeleted
            FROM account a
            JOIN account_fleet af ON a.accountid = af.accountid AND af.isroot = true
            WHERE a.accountname = $1 and a.isdeleted = false
        `;
      let result = await this.pgPoolI.Query(query, [accountname]);
      if (result.rowCount === 0) {
        return null;
      }
      return result.rows[0];
    } catch (error) {
      throw new Error("Failed to fetch account by name");
    }
  }

  async addVehicleToCustomFleet(accountid, fleetid, vinno, assignedby) {
    let currtime = new Date();

    let [txclient, err] = await this.pgPoolI.StartTransaction();
    if (err) {
      throw err;
    }

    try {
      // First, get the vehicle information from the vehicle table
      let query = `
        SELECT vinno, vehicleinfo 
        FROM vehicle 
        WHERE vinno = $1
      `;
      let result = await txclient.query(query, [vinno]);
      if (result.rowCount === 0) {
        throw new Error("Vehicle not found in vehicle table");
      }

      const vehicleData = result.rows[0];

      // Check if vehicle already belongs to any account/fleet
      query = `
        SELECT accountid, fleetid FROM fleet_vehicle 
        WHERE vinno = $1
      `;
      result = await txclient.query(query, [vinno]);
      if (result.rowCount > 0) {
        throw new Error("Vehicle already belongs to an account/fleet");
      }

      // Verify the target fleet exists and belongs to this account
      query = `
        SELECT fleetid FROM account_fleet 
        WHERE accountid = $1 AND fleetid = $2
      `;
      result = await txclient.query(query, [accountid, fleetid]);
      if (result.rowCount !== 1) {
        throw new Error("Target fleet not found or does not belong to account");
      }

      // Add vehicle to the custom fleet with vinno=regno
      query = `
        INSERT INTO fleet_vehicle (accountid, fleetid, vinno, isowner, accvininfo, assignedat, assignedby, updatedat, updatedby) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;
      result = await txclient.query(query, [
        accountid,
        fleetid,
        vinno,
        true,
        vehicleData.vehicleinfo,
        currtime,
        assignedby,
        currtime,
        assignedby,
      ]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to add vehicle to custom fleet");
      }

      // Add to fleet_vehicle_history
      query = `
        INSERT INTO fleet_vehicle_history (accountid, fleetid, vinno, isowner, accvininfo, assignedat, assignedby, updatedat, updatedby) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;
      result = await txclient.query(query, [
        accountid,
        fleetid,
        vinno,
        true,
        vehicleData.vehicleinfo,
        currtime,
        assignedby,
        currtime,
        assignedby,
      ]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to add vehicle to fleet history");
      }

      let commiterr = await this.pgPoolI.TxCommit(txclient);
      if (commiterr) {
        throw commiterr;
      }

      return { accountid: accountid, fleetid: fleetid, vinno: vinno };
    } catch (e) {
      let rollbackerr = await this.pgPoolI.TxRollback(txclient);
      if (rollbackerr) {
        throw rollbackerr;
      }
      throw e;
    }
  }

  async updateVehicleInfo(vinno, updateFields, updatedby) {
    try {
      if (!updateFields || Object.keys(updateFields).length === 0) {
        throw new Error("No fields provided for update");
      }

      let currtime = new Date();

      const fieldsToUpdate = { ...updateFields };
      fieldsToUpdate.updatedat = currtime;
      fieldsToUpdate.updatedby = updatedby;

      const setClause = Object.keys(fieldsToUpdate)
        .map((key, index) => `${key} = $${index + 2}`)
        .join(", ");

      const query = `
        UPDATE vehicle 
        SET ${setClause}
        WHERE vinno = $1
      `;

      const params = [vinno, ...Object.values(fieldsToUpdate)];

      let result = await this.pgPoolI.Query(query, params);

      if (result.rowCount === 0) {
        throw new Error("Vehicle not found");
      }

      if (result.rowCount !== 1) {
        throw new Error("Failed to update vehicle info");
      }

      return true;
    } catch (error) {
      throw new Error(`Vehicle info update failed: ${error.message}`);
    }
  }

  async checkVehicleExists(vinno) {
    try {
      let query = `SELECT * FROM vehicle WHERE vinno = $1`;
      let result = await this.pgPoolI.Query(query, [vinno]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to check vehicle existence: ${error.message}`);
    }
  }

  async checkModelExists(modelcode) {
    try {
      let query = `SELECT modelcode FROM vehicle_model WHERE modelcode = $1`;
      let result = await this.pgPoolI.Query(query, [modelcode]);
      return result.rowCount > 0;
    } catch (error) {
      throw new Error(`Failed to check model existence: ${error.message}`);
    }
  }

  async checkVehicleFleetAssociations(vinno) {
    try {
      let query = `SELECT accountid, fleetid FROM fleet_vehicle WHERE vinno = $1`;
      let result = await this.pgPoolI.Query(query, [vinno]);
      return result.rows;
    } catch (error) {
      throw new Error(
        `Failed to check vehicle fleet associations: ${error.message}`
      );
    }
  }

  async checkVehicleTaggedAssociations(vinno) {
    try {
      let query = `SELECT srcaccountid, dstaccountid FROM tagged_vehicle WHERE vinno = $1 AND isactive = true`;
      let result = await this.pgPoolI.Query(query, [vinno]);
      return result.rows;
    } catch (error) {
      throw new Error(
        `Failed to check vehicle tagged associations: ${error.message}`
      );
    }
  }

  async checkVehicleSubscriptionAssociations(vinno) {
    try {
      let query = `SELECT accountid FROM account_vehicle_subscription WHERE vinno = $1 AND state = 1`;
      let result = await this.pgPoolI.Query(query, [vinno]);
      return result.rows;
    } catch (error) {
      throw new Error(
        `Failed to check vehicle subscription associations: ${error.message}`
      );
    }
  }

  async checkVehicleGeofenceRuleAssociations(vinno) {
    try {
      let query = `SELECT accountid, fleetid, ruleid FROM geofencesch.geofencerulevehicle WHERE vinno = $1`;
      let result = await this.pgPoolI.Query(query, [vinno]);
      return result.rows;
    } catch (error) {
      throw new Error(
        `Failed to check vehicle geofence rule associations: ${error.message}`
      );
    }
  }

  async checkVehicleHistoricalData(vinno) {
    try {
      let query = `SELECT COUNT(*) as count FROM geofencesch.geofencevehruletrip WHERE vinno = $1`;
      let result = await this.pgPoolI.Query(query, [vinno]);
      if (result.rows[0].count > 0) {
        return true;
      }

      query = `SELECT COUNT(*) as count FROM geofencesch.geofencevehrulealert WHERE vinno = $1`;
      result = await this.pgPoolI.Query(query, [vinno]);
      if (result.rows[0].count > 0) {
        return true;
      }

      query = `SELECT COUNT(*) as count FROM account_credits_consumption_vehdetail WHERE vinno = $1`;
      result = await this.pgPoolI.Query(query, [vinno]);
      if (result.rows[0].count > 0) {
        return true;
      }

      return false;
    } catch (error) {
      throw new Error(
        `Failed to check vehicle historical data: ${error.message}`
      );
    }
  }

  async deleteVehicle(vinno, deletedby) {
    try {
      let query = `DELETE FROM vehicle WHERE vinno = $1`;
      let result = await this.pgPoolI.Query(query, [vinno]);

      if (result.rowCount !== 1) {
        throw new Error("Failed to delete vehicle");
      }

      return true;
    } catch (error) {
      throw new Error(`Vehicle deletion failed: ${error.message}`);
    }
  }

  async listVehicles() {
    try {
      let query = `SELECT vinno FROM vehicle`;
      let result = await this.pgPoolI.Query(query);
      if (result.rowCount === 0) {
        return [];
      }
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to list vehicles: ${error.message}`);
    }
  }

  async getVehicleInfo(vinno) {
    let query = `
      SELECT v.vinno, v.vehiclevariant as modelvariant, v.vehiclemodel as modelname, vm.modeldisplayname, v.modelcode, v.vehicleinfo, v.mobile, COALESCE(v.license_plate, v.vinno) as regno, v.color, v.vehicle_city, v.dealer, v.delivered, v.delivered_date, v.data_freq, v.tgu_model, v.tgu_sw_version, v.tgu_phone_no, v.tgu_imei_no, v.createdat, u1.displayname as createdby, v.updatedat, u2.displayname as updatedby
      FROM vehicle v
      JOIN users u1 ON v.createdby = u1.userid
      JOIN users u2 ON v.updatedby = u2.userid
      JOIN vehicle_model vm ON v.modelcode = vm.modelcode
      WHERE v.vinno = $1;
    `;
    let result = await this.pgPoolI.Query(query, [vinno]);
    if (result.rowCount === 0) {
      return null;
    }

    return result.rows[0];
  }

  async getVehicleAccountDetails(vinno) {
    let query = `
      SELECT 
        fv.accountid,
        a.accountname,
        fv.fleetid,
        ft.name as fleetname,
        fv.isowner,
        fv.assignedat,
        u1.displayname as assignedby
      FROM fleet_vehicle fv
      JOIN account a ON fv.accountid = a.accountid
      JOIN fleet_tree ft ON fv.accountid = ft.accountid AND fv.fleetid = ft.fleetid
      JOIN users u1 ON fv.assignedby = u1.userid
      WHERE fv.vinno = $1;
    `;
    let result = await this.pgPoolI.Query(query, [vinno]);
    if (result.rowCount === 0) {
      return [];
    }
    return result.rows;
  }

  convertDateFormat = (dateString) => {
    if (!dateString) return null;

    try {
      // Parse DD/MM/YY format and convert to YYYY-MM-DD
      const parts = dateString.split("/");
      if (parts.length === 3) {
        const day = parts[0];
        const month = parts[1];
        const year = parts[2];

        // Convert 2-digit year to 4-digit year
        const fullYear = year.length === 2 ? `20${year}` : year;

        // Return in ISO format YYYY-MM-DD
        return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }

      return dateString; // Return as-is if not in expected format
    } catch (error) {
      console.log("Date conversion error:", error);
      return null;
    }
  };

  async addToPendingReview(vinno, fields, createdBy) {
    try {
      let currtime = new Date();
      // Prepare all fields with proper defaults
      const insertFields = {
        vinno: vinno,
        modelcode: fields.modelcode || null,
        vehicleinfo: fields.vehicleinfo || {},
        vehiclevariant: fields.vehiclevariant || null,
        vehiclemodel: fields.vehiclemodel || null,
        mobile: fields.mobile || null,
        license_plate: fields.license_plate || null,
        color: fields.color || null,
        vehicle_city: fields.vehicle_city || null,
        dealer: fields.dealer || null,
        delivered: fields.delivered || false,
        delivered_date: fields.delivered_date || null,
        data_freq: fields.data_freq || null,
        tgu_model: fields.tgu_model || null,
        tgu_sw_version: fields.tgu_sw_version || null,
        tgu_phone_no: fields.tgu_phone_no || null,
        tgu_imei_no: fields.tgu_imei_no || null,
        engineno: fields.engineno || null,
        fueltype: fields.fueltype || null,
        retailssaledate: fields.retailssaledate || null,
        status: fields.status || null,
        reason: fields.reason || null,
        review_data: fields.review_data || {},
        original_input: fields.original_input || {},
        createdat: currtime,
        createdby: createdBy,
        updatedat: currtime,
        updatedby: createdBy,
      };

      const columns = Object.keys(insertFields);
      const placeholders = columns
        .map((_, index) => `$${index + 1}`)
        .join(", ");

      let query = `INSERT INTO reviewpendingvehicle (${columns.join(
        ", "
      )}) VALUES (${placeholders})`;
      let result = await this.pgPoolI.Query(query, Object.values(insertFields));

      return result.rowCount > 0;
    } catch (error) {
      this.logger.error("Failed to add vehicle to pending review:", error);
      throw new Error(
        `Failed to add vehicle to pending review: ${error.message}`
      );
    }
  }

  async moveToDoneReview(vinno, fields, createdBy) {
    try {
      let currtime = new Date();
      const insertFields = {
        vinno: vinno,
        modelcode: fields.modelcode,
        vehicleinfo: fields.vehicleinfo || {},
        vehiclevariant: fields.vehiclevariant || null,
        vehiclemodel: fields.vehiclemodel || null,
        mobile: fields.mobile || null,
        license_plate: fields.license_plate || null,
        color: fields.color || null,
        vehicle_city: fields.vehicle_city || null,
        dealer: fields.dealer || null,
        delivered: fields.delivered || false,
        delivered_date: fields.delivered_date || null,
        data_freq: fields.data_freq || null,
        tgu_model: fields.tgu_model || null,
        tgu_sw_version: fields.tgu_sw_version || null,
        tgu_phone_no: fields.tgu_phone_no || null,
        tgu_imei_no: fields.tgu_imei_no || null,
        engineno: fields.engineno || null,
        fueltype: fields.fueltype || null,
        retailssaledate: fields.retailssaledate || null,
        original_status: fields.original_status,
        resolution_reason: fields.resolution_reason,
        review_data: fields.review_data || {},
        entrytype: fields.entrytype || "onboarding",
        reviewed_at: currtime,
        reviewed_by: createdBy,
        createdat: currtime,
        createdby: createdBy,
        updatedat: currtime,
        updatedby: createdBy,
        original_input: fields.original_input || {},
      };

      const columns = Object.keys(insertFields);
      const placeholders = columns
        .map((_, index) => `$${index + 1}`)
        .join(", ");

      let query = `INSERT INTO reviewdonevehicle (${columns.join(
        ", "
      )}) VALUES (${placeholders})`;
      let result = await this.pgPoolI.Query(query, Object.values(insertFields));

      return result.rowCount > 0;
    } catch (error) {
      throw new Error(
        `Failed to move vehicle to done review: ${error.message}`
      );
    }
  }

  async checkVehicleInPending(vinno) {
    try {
      let query = `SELECT * FROM reviewpendingvehicle WHERE vinno = $1`;
      let result = await this.pgPoolI.Query(query, [vinno]);
      if (result.rowCount > 0) {
        return {
          exists: true,
          pendingData: result.rows[0],
        };
      }
      return { exists: false };
    } catch (error) {
      throw new Error(
        `Failed to check vehicle in pending review: ${error.message}`
      );
    }
  }

  async removeFromPendingReview(vinno) {
    try {
      let query = `DELETE FROM reviewpendingvehicle WHERE vinno = $1`;
      let result = await this.pgPoolI.Query(query, [vinno]);
      return result.rowCount > 0;
    } catch (error) {
      throw new Error(
        `Failed to remove vehicle from pending review: ${error.message}`
      );
    }
  }

  async listPendingVehicles() {
    try {
      let query = `
        SELECT 
          rpv.vinno, 
          rpv.modelcode, 
          rpv.vehicleinfo, 
          rpv.vehiclevariant, 
          rpv.vehiclemodel, 
          rpv.mobile, 
          rpv.license_plate, 
          rpv.color, 
          rpv.vehicle_city, 
          rpv.dealer, 
          rpv.delivered, 
          rpv.delivered_date, 
          rpv.data_freq, 
          rpv.tgu_model, 
          rpv.tgu_sw_version, 
          rpv.tgu_phone_no, 
          rpv.tgu_imei_no, 
          rpv.engineno, 
          rpv.fueltype, 
          rpv.retailssaledate, 
          rpv.status, 
          rpv.reason, 
          rpv.review_data, 
          rpv.createdat, 
          u1.displayname as createdby, 
          rpv.updatedat, 
          u2.displayname as updatedby
        FROM reviewpendingvehicle rpv
        JOIN users u1 ON rpv.createdby = u1.userid
        JOIN users u2 ON rpv.updatedby = u2.userid
        ORDER BY rpv.createdat DESC
      `;
      let result = await this.pgPoolI.Query(query);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to list pending vehicles: ${error.message}`);
    }
  }

  async listDoneVehicles() {
    try {
      let query = `
        SELECT 
          rdv.vinno,
          rdv.modelcode, 
          rdv.vehicleinfo, 
          rdv.vehiclevariant, 
          rdv.vehiclemodel, 
          rdv.mobile, 
          rdv.license_plate, 
          rdv.color, 
          rdv.vehicle_city, 
          rdv.dealer, 
          rdv.delivered, 
          rdv.delivered_date, 
          rdv.data_freq, 
          rdv.tgu_model, 
          rdv.tgu_sw_version, 
          rdv.tgu_phone_no, 
          rdv.tgu_imei_no, 
          rdv.engineno, 
          rdv.fueltype, 
          rdv.retailssaledate, 
          rdv.original_status as status, 
          rdv.resolution_reason as reason, 
          jsonb_set(  
          jsonb_set(
            rdv.review_data, 
            '{createdby}', 
            to_jsonb(u4.displayname)
          ),
          '{updatedby}',
          to_jsonb(u5.displayname)
        ) as review_data, 
          rdv.reviewed_at, 
          u1.displayname as reviewed_by, 
          rdv.createdat, 
          u2.displayname as createdby, 
          rdv.updatedat, 
          u3.displayname as updatedby
        FROM reviewdonevehicle rdv
        JOIN users u1 ON rdv.reviewed_by = u1.userid
        JOIN users u2 ON rdv.createdby = u2.userid
        JOIN users u3 ON rdv.updatedby = u3.userid
        LEFT JOIN users u4 ON (rdv.review_data->>'createdby')::uuid = u4.userid
        LEFT JOIN users u5 ON (rdv.review_data->>'updatedby')::uuid = u5.userid
        ORDER BY rdv.reviewed_at DESC
      `;
      let result = await this.pgPoolI.Query(query);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to list done vehicles: ${error.message}`);
    }
  }

  async getAPIKey(platform, environment) {
    try {
      let query = `SELECT platform, environment, keyname, value FROM api_keys WHERE platform = $1 AND environment = $2 AND isenabled = true`;
      let result = await this.pgPoolI.Query(query, [platform, environment]);
      if (result.rowCount === 0) {
        return null;
      }
      const row1 = result.rows[0];
      const row2 = result.rows[1];
      return {
        [row1.keyname]: row1.value,
        [row2.keyname]: row2.value,
      };
    } catch (error) {
      throw new Error(`Failed to get API key: ${error.message}`);
    }
  }

  async updateVehicleMobile(vinno, mobileno, userid) {
    try {
      let currtime = new Date();
      let alreadyExists = await this.pgPoolI.Query(
        `SELECT vinno, mobile FROM vehicle WHERE vinno = $1`,
        [vinno]
      );
      if (alreadyExists.rowCount === 0) {
        throw new Error("Vehicle not found");
      }

      if (alreadyExists.rows[0].mobile === mobileno) {
        return true;
      }

      let query = `UPDATE vehicle SET mobile = $1, updatedat = $2, updatedby = $3 WHERE vinno = $4`;
      let result = await this.pgPoolI.Query(query, [
        mobileno,
        currtime,
        userid,
        vinno,
      ]);
      return result.rowCount > 0;
    } catch (error) {
      throw new Error(`Failed to update vehicle mobile: ${error.message}`);
    }
  }

  async updateReviewPendingUser(userid, updateFields, updatedby) {
    try {
      if (!updateFields || Object.keys(updateFields).length === 0) {
        throw new Error("No update fields provided");
      }
      let currtime = new Date();

      // Build dynamic query based on updateFields
      const setClause = Object.keys(updateFields)
        .map((field, index) => `${field} = $${index + 1}`)
        .join(", ");

      const values = Object.values(updateFields);
      values.push(userid);
      values.push(updatedby);
      values.push(currtime);

      let query = `UPDATE reviewpendinguser SET ${setClause}, updatedby = $${
        values.length
      }, updatedat = $${values.length + 1} WHERE userid = $${
        values.length + 2
      }`;

      let result = await this.pgPoolI.Query(query, values);
      return result.rowCount > 0;
    } catch (error) {
      throw new Error(`Failed to update review pending user: ${error.message}`);
    }
  }

  async validateVehicleFields(fieldsToValidate) {
    const validationErrors = [];

    try {
      const validationPromises = [];

      if (fieldsToValidate.vehicle_city) {
        validationPromises.push(
          this.pgPoolI
            .Query(
              "SELECT cityname FROM city WHERE UPPER(cityname) = UPPER($1)",
              [fieldsToValidate.vehicle_city]
            )
            .then((result) => ({
              field: "vehicle_city",
              exists: result.rowCount > 0,
              value: fieldsToValidate.vehicle_city,
            }))
        );
      }

      if (fieldsToValidate.dealer) {
        validationPromises.push(
          this.pgPoolI
            .Query(
              "SELECT dealername FROM dealer WHERE UPPER(dealername) = UPPER($1)",
              [fieldsToValidate.dealer]
            )
            .then((result) => ({
              field: "dealer",
              exists: result.rowCount > 0,
              value: fieldsToValidate.dealer,
            }))
        );
      }

      if (fieldsToValidate.color) {
        validationPromises.push(
          this.pgPoolI
            .Query(
              "SELECT colorname FROM color WHERE UPPER(colorname) = UPPER($1)",
              [fieldsToValidate.color]
            )
            .then((result) => ({
              field: "color",
              exists: result.rowCount > 0,
              value: fieldsToValidate.color,
            }))
        );
      }

      if (fieldsToValidate.fueltype) {
        validationPromises.push(
          this.pgPoolI
            .Query(
              "SELECT fueltypename FROM fueltype WHERE UPPER(fueltypename) = UPPER($1)",
              [fieldsToValidate.fueltype]
            )
            .then((result) => ({
              field: "fueltype",
              exists: result.rowCount > 0,
              value: fieldsToValidate.fueltype,
            }))
        );
      }

      if (fieldsToValidate.modelcode) {
        validationPromises.push(
          this.pgPoolI
            .Query("SELECT modelcode FROM vehicle_model WHERE modelcode = $1", [
              fieldsToValidate.modelcode,
            ])
            .then((result) => ({
              field: "modelcode",
              exists: result.rowCount > 0,
              value: fieldsToValidate.modelcode,
            }))
        );
      }

      const validationResults = await Promise.all(validationPromises);

      validationResults.forEach((result) => {
        if (!result.exists) {
          let fieldDisplayName;
          switch (result.field) {
            case "vehicle_city":
              fieldDisplayName = "City";
              break;
            case "dealer":
              fieldDisplayName = "Dealer";
              break;
            case "color":
              fieldDisplayName = "Color";
              break;
            case "fueltype":
              fieldDisplayName = "Fuel Type";
              break;
            case "modelcode":
              fieldDisplayName = "ModelCode";
              break;
            default:
              fieldDisplayName = result.field;
          }
          validationErrors.push({
            field: result.field,
            message: `${fieldDisplayName} '${result.value}' is not valid`,
          });
        }
      });

      return validationErrors;
    } catch (error) {
      throw new Error(`Vehicle validation failed: ${error.message}`);
    }
  }

  async updatePendingReview(vinno, updateFields, createdBy) {
    try {
      let currtime = new Date();
      updateFields.updatedat = currtime;
      updateFields.updatedby = createdBy;

      const setClause = Object.keys(updateFields)
        .map((key, index) => `${key} = $${index + 1}`)
        .join(", ");

      const values = [...Object.values(updateFields), vinno];
      let query = `UPDATE reviewpendingvehicle SET ${setClause} WHERE vinno = $${values.length}`;
      let result = await this.pgPoolI.Query(query, values);
      return result.rowCount > 0;
    } catch (error) {
      throw new Error(`Failed to update pending review: ${error.message}`);
    }
  }

  async getConsolePlatformOverview() {
    try {
      const [
        totalvehicles,
        totalassignedvehicles,
        totalsubscribedvehicles,
        totalmodels,
        totalaccounts,
        totalactiveaccounts,
        totaldeletedaccounts,
        totalusers,
        totalactiveusers,
        totalusersloggedintoday,
        totalmodules,
        totalpackages,
        totalplatformadmins,
        totalaccountsreviewspending,
        totalusersreviewspending,
        totalvehiclesreviewspending,
        totalaccountsreviewsdone,
        totalusersreviewsdone,
        totalvehiclesreviewsdone,
        totalaccountsonboarded,
        totalusersonboarded,
        totalvehiclesonboarded,
      ] = await Promise.all([
        this.pgPoolI.Query("SELECT COUNT(*) FROM vehicle"),
        this.pgPoolI.Query("SELECT COUNT(distinct vinno) FROM fleet_vehicle"),
        this.pgPoolI.Query(
          "SELECT COUNT(distinct vinno) FROM account_vehicle_subscription"
        ),
        this.pgPoolI.Query("SELECT COUNT(*) FROM vehicle_model"),
        this.pgPoolI.Query("SELECT COUNT(*) FROM account"),
        this.pgPoolI.Query(
          "SELECT COUNT(*) FROM account WHERE isdeleted=false"
        ),
        this.pgPoolI.Query("SELECT COUNT(*) FROM account WHERE isdeleted=true"),
        this.pgPoolI.Query("SELECT COUNT(*) FROM users"),
        this.pgPoolI.Query("SELECT COUNT(*) FROM users WHERE isdeleted=false"),
        this.pgPoolI.Query(
          "SELECT COUNT(distinct userid) FROM user_login_audit WHERE createdat >= CURRENT_DATE"
        ),
        this.pgPoolI.Query("SELECT COUNT(*) FROM module WHERE isenabled=true"),
        this.pgPoolI.Query("SELECT COUNT(*) FROM package WHERE isenabled=true"),
        this.pgPoolI.Query(
          "SELECT COUNT(distinct accountid) FROM roles WHERE roletype='platform'"
        ),
        this.pgPoolI.Query(
          "SELECT COUNT(distinct accountid) FROM reviewpendingaccount"
        ),
        this.pgPoolI.Query("SELECT COUNT(*) FROM reviewpendinguser"),
        this.pgPoolI.Query("SELECT COUNT(*) FROM reviewpendingvehicle"),
        this.pgPoolI.Query(
          "SELECT COUNT(distinct accountid) FROM reviewdoneaccount WHERE entrytype = 'review'"
        ),
        this.pgPoolI.Query(
          "SELECT COUNT(*) FROM reviewdoneuser WHERE entrytype = 'review'"
        ),
        this.pgPoolI.Query(
          "SELECT COUNT(*) FROM reviewdonevehicle WHERE entrytype = 'review'"
        ),
        this.pgPoolI.Query(
          "SELECT COUNT(DISTINCT accountid) FROM reviewdoneaccount WHERE entrytype = 'onboarding' AND original_status='ACCOUNT_CREATION_SUCCESS'"
        ),
        this.pgPoolI.Query(
          "SELECT COUNT(*) FROM reviewdoneuser WHERE entrytype = 'onboarding'"
        ),
        this.pgPoolI.Query(
          "SELECT COUNT(*) FROM reviewdonevehicle WHERE entrytype = 'onboarding'"
        ),
      ]);

      const result = {
        metrics: [
          [
            { title: "Total Vehicles", value: totalvehicles.rows[0].count },
            {
              title: "Assigned Vehicles",
              value: totalassignedvehicles.rows[0].count,
            },
            {
              title: "Subscribed Vehicles",
              value: totalsubscribedvehicles.rows[0].count,
            },
            { title: "Vehicle Models", value: totalmodels.rows[0].count },
          ],
          [
            { title: "Total Accounts", value: totalaccounts.rows[0].count },
            {
              title: "Active Accounts",
              value: totalactiveaccounts.rows[0].count,
            },
            {
              title: "Deleted Accounts",
              value: totaldeletedaccounts.rows[0].count,
            },
          ],
          [
            { title: "Total Users", value: totalusers.rows[0].count },
            { title: "Active Users", value: totalactiveusers.rows[0].count },
            {
              title: "Users Logged in Today",
              value: totalusersloggedintoday.rows[0].count,
            },
          ],
          [
            {
              title: "Vehicle Reviews Pending",
              value: totalvehiclesreviewspending.rows[0].count,
            },
            {
              title: "Vehicle Reviews Done",
              value: totalvehiclesreviewsdone.rows[0].count,
            },
            {
              title: "Vehicles Onboarded",
              value: totalvehiclesonboarded.rows[0].count,
            },
          ],
          [
            {
              title: "Account Reviews Pending",
              value: totalaccountsreviewspending.rows[0].count,
            },
            {
              title: "Account Reviews Done",
              value: totalaccountsreviewsdone.rows[0].count,
            },
            {
              title: "Accounts Onboarded",
              value: totalaccountsonboarded.rows[0].count,
            },
          ],
          [
            {
              title: "User Reviews Pending",
              value: totalusersreviewspending.rows[0].count,
            },
            {
              title: "User Reviews Done",
              value: totalusersreviewsdone.rows[0].count,
            },
            {
              title: "Users Onboarded",
              value: totalusersonboarded.rows[0].count,
            },
          ],
          [
            { title: "Modules", value: totalmodules.rows[0].count },
            { title: "Packages", value: totalpackages.rows[0].count },
            {
              title: "Platform Admins",
              value: totalplatformadmins.rows[0].count,
            },
          ],
        ],
      };

      return result;
    } catch (error) {
      throw new Error(
        `Failed to get console platform overview: ${error.message}`
      );
    }
  }

  async getConnnectedVehiclesCount(vinnos, starttime, endtime) {
    if (
      starttime >= endtime ||
      starttime < 0 ||
      endtime - starttime > 35 * 24 * 60 * 60 * 1000
    ) {
      return { connected: 0, totalgps: 0, totalcan: 0 };
    }

    try {
      const batchSize = 1000;
      const vinBatches = [];
      for (let i = 0; i < vinnos.length; i += batchSize) {
        vinBatches.push(vinnos.slice(i, i + batchSize));
      }

      let totalConnected = 0;
      let totalGps = 0;
      let totalCan = 0;

      const batchPromises = vinBatches.map(async (vinBatch) => {
        const vinPlaceholders = vinBatch
          .map((_, index) => `{vin${index}:String}`)
          .join(",");

        const query = `
          SELECT 
            COUNT(DISTINCT vin) as connected_vehicles,
            SUM(gps_cnt) as total_gps,
            SUM(can_cnt) as total_can
          FROM lmmdata_latest.livenessdata
          WHERE vin IN (${vinPlaceholders})
          AND utc_day_b >= {starttime:UInt64} 
          AND utc_day_b < {endtime:UInt64}
          AND gps_cnt > 0 
          AND can_cnt > 0`;

        const params = {
          starttime: starttime,
          endtime: endtime,
        };

        vinBatch.forEach((vin, index) => {
          params[`vin${index}`] = vin;
        });

        try {
          const result = await this.clickHouseClient.query(query, params);
          if (!result.success) {
            this.logger.error("Error executing query:", result.error);
            return { connected: 0, totalgps: 0, totalcan: 0 };
          }

          const data = result.data || [];
          if (data.length > 0) {
            return {
              connected: parseInt(data[0].connected_vehicles) || 0,
              totalgps: parseInt(data[0].total_gps) || 0,
              totalcan: parseInt(data[0].total_can) || 0,
            };
          }
          return { connected: 0, totalgps: 0, totalcan: 0 };
        } catch (error) {
          this.logger.error("Error executing batch query:", error);
          return { connected: 0, totalgps: 0, totalcan: 0 };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      batchResults.forEach(({ status, value }) => {
        if (status === "fulfilled" && value) {
          totalConnected += value.connected;
          totalGps += value.totalgps;
          totalCan += value.totalcan;
        } else if (status === "rejected") {
          this.logger.error("Batch query failed:", value);
        }
      });

      return {
        connected: totalConnected,
        totalgps: totalGps,
        totalcan: totalCan,
      };
    } catch (error) {
      this.logger.error("Error fetching connected vehicles count:", error);
      return { connected: 0, totalgps: 0, totalcan: 0 };
    }
  }

  async getConsolePlatformOverviewAnalytics() {
    try {
      const total_models = await this.pgPoolI.Query(
        "SELECT vm.modeldisplayname, COUNT(v.vinno) AS vehicle_count, array_agg(v.vinno) AS vinnos FROM vehicle_model vm JOIN vehicle v ON v.modelcode = vm.modelcode GROUP BY vm.modeldisplayname ORDER BY vehicle_count DESC"
      );

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const dayBeforeYesterday = new Date(today);
      dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);

      const getUtcDayBucket = (date) => {
        const epoch = new Date("1970-01-01");
        const diffTime = date.getTime() - epoch.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
      };

      const timeRanges = [
        {
          name: "today",
          start: getUtcDayBucket(today),
          end: getUtcDayBucket(today) + 1,
        },
        {
          name: "yesterday",
          start: getUtcDayBucket(yesterday),
          end: getUtcDayBucket(yesterday) + 1,
        },
        {
          name: "dayBeforeYesterday",
          start: getUtcDayBucket(dayBeforeYesterday),
          end: getUtcDayBucket(dayBeforeYesterday) + 1,
        },
      ];

      const enhancedResults = await Promise.all(
        total_models.rows.map(async (model) => {
          const vinnos = model.vinnos;
          const connectedVehiclesData = {
            today: { total: 0, connected: 0, totalcan: 0, totalgps: 0 },
            yesterday: { total: 0, connected: 0, totalcan: 0, totalgps: 0 },
            dayBeforeYesterday: {
              total: 0,
              connected: 0,
              totalcan: 0,
              totalgps: 0,
            },
          };

          for (const timeRange of timeRanges) {
            try {
              const counts = await this.getConnnectedVehiclesCount(
                vinnos,
                timeRange.start,
                timeRange.end
              );

              connectedVehiclesData[timeRange.name] = {
                total: vinnos.length,
                connected: counts.connected,
                totalcan: counts.totalcan,
                totalgps: counts.totalgps,
              };
            } catch (error) {
              this.logger.error(
                `Error fetching connected data for model ${model.modeldisplayname}:`,
                error
              );
              connectedVehiclesData[timeRange.name] = {
                total: vinnos.length,
                connected: 0,
                totalcan: 0,
                totalgps: 0,
              };
            }
          }

          return {
            ...model,
            connectedVehicles: connectedVehiclesData,
          };
        })
      );

      const result = {
        table1: enhancedResults.map((item) => ({
          model: item.modeldisplayname,
          vehicle_count: item.vehicle_count,
          connected_vehicles_today: item.connectedVehicles.today.connected,
          connected_vehicles_yesterday:
            item.connectedVehicles.yesterday.connected,
          connected_vehicles_day_before_yesterday:
            item.connectedVehicles.dayBeforeYesterday.connected,
        })),
        table2: enhancedResults.map((item) => ({
          model: item.modeldisplayname,
          vehicle_count: item.vehicle_count,
          gps_beacons_yesterday: item.connectedVehicles.yesterday.totalgps,
          gps_beacons_day_before_yesterday:
            item.connectedVehicles.dayBeforeYesterday.totalgps,
          can_beacons_yesterday: item.connectedVehicles.yesterday.totalcan,
          can_beacons_day_before_yesterday:
            item.connectedVehicles.dayBeforeYesterday.totalcan,
        })),
      };

      return result;
    } catch (error) {
      throw new Error(
        `Failed to get console platform overview analytics: ${error.message}`
      );
    }
  }

  async getConsoleAccountAssignmentHistory(accountid, starttime, endtime) {
    try {
      const result = await this.pgPoolI.Query(
        "SELECT fvh.vinno, COALESCE(NULLIF(v.license_plate, ''), fvh.vinno) AS regno, v.vehiclemodel, fvh.isowner, fvh.accvininfo, fvh.assignedat, u2.displayname as assignedby, fvh.updatedat, u1.displayname as updatedby, fvh.action FROM fleet_vehicle_history as fvh JOIN users u1 ON fvh.updatedby = u1.userid JOIN users u2 ON fvh.assignedby = u2.userid JOIN vehicle v ON fvh.vinno = v.vinno WHERE fvh.accountid = $1 AND fvh.updatedat >= ($2) AND fvh.updatedat <= ($3)",
        [accountid, new Date(starttime), new Date(endtime)]
      );
      return result.rows;
    } catch (error) {
      throw new Error(
        `Failed to get console account assignment history: ${error.message}`
      );
    }
  }

  async getConsoleVehicleAssignmentHistory(vinno, starttime, endtime) {
    try {
      const result = await this.pgPoolI.Query(
        "SELECT a.accountname as accountname, ft.name as fleetname, fvh.vinno, fvh.isowner, fvh.accvininfo, fvh.assignedat, u2.displayname as assignedby, fvh.updatedat, u1.displayname as updatedby, fvh.action FROM fleet_vehicle_history as fvh JOIN users u1 ON fvh.updatedby = u1.userid JOIN users u2 ON fvh.assignedby = u2.userid JOIN account a ON fvh.accountid = a.accountid JOIN fleet_tree ft ON fvh.accountid = ft.accountid AND fvh.fleetid = ft.fleetid WHERE fvh.vinno = $1 AND fvh.updatedat >= ($2) AND fvh.updatedat <= ($3)",
        [vinno, new Date(starttime), new Date(endtime)]
      );
      return result.rows;
    } catch (error) {
      throw new Error(
        `Failed to get console vehicle assignment history: ${error.message}`
      );
    }
  }

  async discardVehicleReview(createdBy, vin) {
    try {
      let existingVehicle = await this.pgPoolI.Query(
        "SELECT * FROM reviewpendingvehicle WHERE vinno = $1",
        [vin]
      );
      if (!existingVehicle.rows.length) {
        throw new Error("Vehicle review not found");
      }
      let currtime = new Date();

      const insertFields = {
        vinno: vin,
        modelcode: existingVehicle.rows[0].modelcode,
        vehicleinfo: existingVehicle.rows[0].vehicleinfo || {},
        vehiclevariant: existingVehicle.rows[0].vehiclevariant || null,
        vehiclemodel: existingVehicle.rows[0].vehiclemodel || null,
        mobile: existingVehicle.rows[0].mobile || null,
        license_plate: existingVehicle.rows[0].license_plate || null,
        color: existingVehicle.rows[0].color || null,
        vehicle_city: existingVehicle.rows[0].vehicle_city || null,
        dealer: existingVehicle.rows[0].dealer || null,
        delivered: existingVehicle.rows[0].delivered || false,
        delivered_date: existingVehicle.rows[0].delivered_date || null,
        data_freq: existingVehicle.rows[0].data_freq || null,
        tgu_model: existingVehicle.rows[0].tgu_model || null,
        tgu_sw_version: existingVehicle.rows[0].tgu_sw_version || null,
        tgu_phone_no: existingVehicle.rows[0].tgu_phone_no || null,
        tgu_imei_no: existingVehicle.rows[0].tgu_imei_no || null,
        engineno: existingVehicle.rows[0].engineno || null,
        fueltype: existingVehicle.rows[0].fueltype || null,
        retailssaledate: existingVehicle.rows[0].retailssaledate || null,
        original_status: "REVIEW_DISCARDED_BY_ADMIN",
        resolution_reason: "Review discarded by admin",
        review_data: existingVehicle.rows[0] || {},
        entrytype: "review",
        reviewed_at: currtime,
        reviewed_by: createdBy,
        createdat: currtime,
        createdby: createdBy,
        updatedat: currtime,
        updatedby: createdBy,
        original_input: existingVehicle.rows[0].original_input || {},
      };

      const columns = Object.keys(insertFields);
      const placeholders = columns
        .map((_, index) => `$${index + 1}`)
        .join(", ");

      let query = `INSERT INTO reviewdonevehicle (${columns.join(
        ", "
      )}) VALUES (${placeholders})`;
      let result = await this.pgPoolI.Query(query, Object.values(insertFields));
      if (result.rowCount > 0) {
        query = `DELETE FROM reviewpendingvehicle WHERE vinno = $1`;
        result = await this.pgPoolI.Query(query, [vin]);
        if (result.rowCount > 0) {
          return true;
        }
      }
      return false;
    } catch (error) {
      throw new Error(`Failed to discard vehicle review: ${error.message}`);
    }
  }
}
