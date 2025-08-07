export default class ModuleSvcDB {
  /**
   *
   * @param {PgPool} pgPoolI
   */
  constructor(pgPoolI, logger) {
    this.pgPoolI = pgPoolI;
    this.logger = logger;
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
      throw new Error("Failed to fetch user data");
    }
  }

  async createModule(module) {
    try {
      let currtime = new Date();

      let maxPriorityQuery = `SELECT COALESCE(MAX(priority), 0) as max_priority FROM module`;
      let maxPriorityResult = await this.pgPoolI.Query(maxPriorityQuery);
      let newPriority = maxPriorityResult.rows[0].max_priority + 1;

      let query = `
            INSERT INTO module (moduleid, modulename, moduletype, modulecode, moduleinfo, creditspervehicleday, isenabled, priority, createdat, createdby, updatedat, updatedby) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `;
      let result = await this.pgPoolI.Query(query, [
        module.moduleid,
        module.modulename,
        module.moduletype,
        module.modulecode,
        module.moduleinfo,
        module.creditspervehicleday,
        module.isenabled,
        newPriority,
        currtime,
        module.createdby,
        currtime,
        module.createdby,
      ]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to create module");
      }

      let createdbyname = await this.getUserName(module.createdby);
      module.createdby = createdbyname;
      module.priority = newPriority;
      return module;
    } catch (error) {
      throw new Error("Failed to create module");
    }
  }

  async getAllModulesInfo() {
    try {
      let query = `
            SELECT moduleid, modulename, moduletype, modulecode, moduleinfo, creditspervehicleday, isenabled, priority, createdat, createdby, updatedat, updatedby FROM module ORDER BY priority
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
      throw new Error("Failed to retrieve all modules info");
    }
  }

  async getModuleInfo(moduleid) {
    try {
      let query = `
            SELECT moduleid, modulename, moduletype, modulecode, moduleinfo, creditspervehicleday, isenabled, priority, createdat, createdby, updatedat, updatedby FROM module
            WHERE moduleid = $1
        `;
      let result = await this.pgPoolI.Query(query, [moduleid]);
      if (result.rowCount === 0) {
        return null;
      }

      result.rows[0].createdby = await this.getUserName(
        result.rows[0].createdby
      );
      result.rows[0].updatedby = await this.getUserName(
        result.rows[0].updatedby
      );
      return result.rows[0];
    } catch (error) {
      throw new Error("Failed to retrieve module info");
    }
  }

  async updateModule(moduleid, updateFields, updatedby) {
    try {
      let currtime = new Date();
      let fields = {
        ...updateFields,
        updatedat: currtime,
        updatedby,
      };

      let allowedKeys = [
        "modulename",
        "moduletype",
        "moduleinfo",
        "creditspervehicleday",
        "isenabled",
        "priority",
        "updatedat",
        "updatedby",
      ];
      let keys = [];
      let values = [];

      for (const key of allowedKeys) {
        if (fields.hasOwnProperty(key)) {
          keys.push(`${key} = $${keys.length + 1}`);
          values.push(fields[key]);
        }
      }

      if (keys.length === 0) {
        throw new Error("No valid fields provided for update");
      }
      values.push(moduleid);

      let query = `
        UPDATE module
        SET ${keys.join(", ")}
        WHERE moduleid = $${values.length}
      `;

      let result = await this.pgPoolI.Query(query, values);
      if (result.rowCount !== 1) {
        throw new Error("Failed to update module");
      }
      return true;
    } catch (error) {
      throw new Error("Failed to update module info");
    }
  }

  async getModulePerms(moduleid) {
    try {
      let query = `
            SELECT permid, isenabled, modperminfo, createdat FROM module_perm WHERE moduleid = $1
            ORDER BY createdat DESC
        `;
      let result = await this.pgPoolI.Query(query, [moduleid]);
      if (result.rowCount === 0) {
        return null;
      }
      return result.rows;
    } catch (error) {
      throw new Error("Failed to fetch module permissions");
    }
  }

  async addModulePerm(moduleid, permid, isenabled, moduleperminfo, createdby) {
    let currtime = new Date();

    let [txclient, err] = await this.pgPoolI.StartTransaction();
    if (err) {
      throw err;
    }
    try {
      let query = `
                INSERT INTO perm (permid, createdat, createdby) VALUES ($1, $2, $3)
            `;
      let result = await txclient.query(query, [permid, currtime, createdby]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to insert permission");
      }

      query = `
                INSERT INTO module_perm (moduleid, permid, isenabled, modperminfo, createdat, createdby, updatedat, updatedby) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `;
      result = await txclient.query(query, [
        moduleid,
        permid,
        isenabled,
        moduleperminfo,
        currtime,
        createdby,
        currtime,
        createdby,
      ]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to add module permission");
      }

      await this.pgPoolI.TxCommit(txclient);
      return true;
    } catch (e) {
      await this.pgPoolI.TxRollback(txclient);
      throw e;
    }
  }

  async addModulePerms(moduleid, permids, createdby) {
    let currtime = new Date();

    let [txclient, err] = await this.pgPoolI.StartTransaction();
    if (err) {
      throw err;
    }
    try {
      if (permids.length === 0) {
        return true;
      }
      let values = [];
      let placeholders = permids
        .map((permid, index) => {
          const startIndex = index * 3 + 1;
          values.push(permid, currtime, createdby);
          return `($${startIndex}, $${startIndex + 1}, $${startIndex + 2})`;
        })
        .join(",");

      let query = `
                INSERT INTO perm (permid, createdat, createdby) VALUES ${placeholders} ON CONFLICT (permid) DO NOTHING
            `;
      let result = await txclient.query(query, values);
      if (result.rowCount !== permids.length) {
        this.logger.error("Failed to insert permissions", {
          moduleid: moduleid,
          permids: permids,
          createdby: createdby,
        });
      }

      values = [];
      placeholders = permids
        .map((permid, index) => {
          const startIndex = index * 8 + 1;
          values.push(
            moduleid,
            permid,
            true,
            {},
            currtime,
            createdby,
            currtime,
            createdby
          );
          return `($${startIndex}, $${startIndex + 1}, $${startIndex + 2}, $${
            startIndex + 3
          }, $${startIndex + 4}, $${startIndex + 5}, $${startIndex + 6}, $${
            startIndex + 7
          })`;
        })
        .join(",");

      query = `
                INSERT INTO module_perm (moduleid, permid, isenabled, modperminfo, createdat, createdby, updatedat, updatedby) VALUES ${placeholders}
            `;
      result = await txclient.query(query, values);
      if (result.rowCount !== permids.length) {
        this.logger.error("Failed to add module permissions", {
          moduleid: moduleid,
          permids: permids,
          createdby: createdby,
        });
      }

      await this.pgPoolI.TxCommit(txclient);
      return true;
    } catch (e) {
      await this.pgPoolI.TxRollback(txclient);
      throw e;
    }
  }

  async updateModulePerm(moduleid, permid, updateFields, updatedby) {
    try {
      let currtime = new Date();
      let fields = {
        ...updateFields,
        updatedat: currtime,
        updatedby,
      };

      let allowedKeys = ["isenabled", "modperminfo", "updatedat", "updatedby"];
      let keys = [];
      let values = [];

      for (const key of allowedKeys) {
        if (fields.hasOwnProperty(key)) {
          keys.push(`${key} = $${keys.length + 1}`);
          values.push(fields[key]);
        }
      }

      if (keys.length === 0) {
        throw new Error("No valid fields provided for update");
      }
      values.push(moduleid);
      values.push(permid);

      let query = `
      UPDATE module_perm
      SET ${keys.join(", ")}
      WHERE moduleid = $${values.length - 1} AND permid = $${values.length}
    `;

      let result = await this.pgPoolI.Query(query, values);
      if (result.rowCount !== 1) {
        throw new Error("Failed to update module permission");
      }

      return true;
    } catch (error) {
      throw new Error("Failed to update module permission");
    }
  }

  async deleteModulePerm(moduleid, permid) {
    let [txclient, err] = await this.pgPoolI.StartTransaction();
    if (err) {
      throw err;
    }
    try {
      let query = `
                DELETE FROM perm WHERE permid = $1
            `;
      let result = await txclient.query(query, [permid]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to delete permission");
      }

      query = `
                DELETE FROM module_perm WHERE moduleid = $1 AND permid = $2
            `;
      result = await txclient.query(query, [moduleid, permid]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to delete module permission");
      }

      await this.pgPoolI.TxCommit(txclient);
      return true;
    } catch (e) {
      await this.pgPoolI.TxRollback(txclient);
      throw e;
    }
  }

  async isModuleAssignedToPackage(moduleid) {
    try {
      let query = `
        SELECT COUNT(*) as count FROM package_module WHERE moduleid = $1
      `;
      let result = await this.pgPoolI.Query(query, [moduleid]);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      throw new Error("Failed to check module package assignment");
    }
  }

  async deleteModule(moduleid, deletedby) {
    let [txclient, err] = await this.pgPoolI.StartTransaction();
    if (err) {
      throw err;
    }
    try {
      let query = `
        SELECT moduleid, modulename FROM module WHERE moduleid = $1
      `;
      let result = await txclient.query(query, [moduleid]);
      if (result.rowCount === 0) {
        throw new Error("Module not found");
      }

      const module = result.rows[0];

      query = `
        SELECT COUNT(*) as count FROM package_module WHERE moduleid = $1
      `;
      result = await txclient.query(query, [moduleid]);
      if (parseInt(result.rows[0].count) > 0) {
        throw new Error(
          "Cannot delete module. It is assigned to one or more packages"
        );
      }

      query = `
        SELECT permid FROM module_perm WHERE moduleid = $1
      `;
      result = await txclient.query(query, [moduleid]);
      const permids = result.rows.map((row) => row.permid);

      if (permids.length > 0) {
        query = `
          DELETE FROM perm WHERE permid = ANY($1)
        `;
        await txclient.query(query, [permids]);

        query = `
          DELETE FROM module_perm WHERE moduleid = $1
        `;
        await txclient.query(query, [moduleid]);
      }

      query = `
        DELETE FROM module WHERE moduleid = $1
      `;
      result = await txclient.query(query, [moduleid]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to delete module");
      }

      await this.pgPoolI.TxCommit(txclient);
      return {
        moduleid: moduleid,
        modulename: module.modulename,
        deletedat: new Date(),
        deletedby: deletedby,
      };
    } catch (e) {
      await this.pgPoolI.TxRollback(txclient);
      throw e;
    }
  }
}
