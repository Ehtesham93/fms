export default class PlatformSvcDB {
  /**
   *
   * @param {PgPool} pgPoolI
   */
  constructor(pgPoolI, logger) {
    this.pgPoolI = pgPoolI;
    this.logger = logger;
  }

  ADDED_VEHICLE = "ADDED";
  UPDATED_VEHICLE = "UPDATED";
  REMOVED_VEHICLE = "REMOVED";

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
      let modeldisplayname = result.rows[0].modeldisplayname;
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
        modeldisplayname,
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
            SELECT a.accountid, af.fleetid as rootfleetid 
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
}
