export default class RoleSvcDB {
  constructor(pgPoolI, logger) {
    this.pgPoolI = pgPoolI;
    this.logger = logger;
  }

  async createRole(role) {
    try {
      let currtime = new Date();
      let checkQuery = `
        SELECT roleid FROM roles WHERE accountid = $1 AND rolename = $2
      `;
      let checkResult = await this.pgPoolI.Query(checkQuery, [
        role.accountid,
        role.rolename,
      ]);
      if (checkResult.rowCount > 0) {
        throw new Error("ROLE_NAME_ALREADY_EXISTS");
      }
      let query = `
            INSERT INTO roles (accountid, roleid, rolename, roletype, isenabled, createdat, createdby, updatedat, updatedby) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;
      let result = await this.pgPoolI.Query(query, [
        role.accountid,
        role.roleid,
        role.rolename,
        role.roletype,
        role.isenabled,
        currtime,
        role.createdby,
        currtime,
        role.createdby,
      ]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to create role");
      }
      return true;
    } catch (error) {
      if (error.message === "ROLE_NAME_ALREADY_EXISTS") {
        throw new Error("ROLE_NAME_ALREADY_EXISTS");
      }
      throw new Error("Failed to create role");
    }
  }

  async updateRole(roleid, accountid, updateFields, updatedby) {
    try {
      let currtime = new Date();
      updateFields.updatedat = currtime;
      updateFields.updatedby = updatedby;

      let keys = Object.keys(updateFields);
      let setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");
      let values = Object.values(updateFields);

      let query = `
            UPDATE roles
            SET ${setClause}
            WHERE accountid = $${keys.length + 1} AND roleid = $${
        keys.length + 2
      }
            `;
      let params = [...values, accountid, roleid];
      const result = await this.pgPoolI.Query(query, params);
      if (result.rowCount !== 1) {
        throw new Error("Failed to update role");
      }

      return true;
    } catch (error) {
      throw new Error(`Failed to update role: ${error.message}`);
    }
  }

  async getAllRoles(accountid) {
    try {
      let query = `
            SELECT r.roleid, r.rolename, r.roletype, r.isenabled, r.createdat, u1.displayname as createdby, r.updatedat, u2.displayname as updatedby 
            FROM roles r 
            JOIN users u1 ON r.createdby = u1.userid 
            JOIN users u2 ON r.updatedby = u2.userid
            WHERE r.accountid = $1 
            ORDER BY r.createdat
        `;
      let result = await this.pgPoolI.Query(query, [accountid]);
      if (result.rowCount === 0) {
        return null;
      }
      return result.rows;
    } catch (error) {
      throw new Error("Failed to retrieve roles");
    }
  }

  async getRoleInfo(accountid, roleid) {
    try {
      let query = `
            SELECT r.roleid, r.rolename, r.roletype, r.isenabled, r.createdat, u1.displayname as createdby, r.updatedat, u2.displayname as updatedby 
            FROM roles r 
            JOIN users u1 ON r.createdby = u1.userid 
            JOIN users u2 ON r.updatedby = u2.userid
            WHERE r.accountid = $1 AND r.roleid = $2
        `;
      let result = await this.pgPoolI.Query(query, [accountid, roleid]);
      if (result.rowCount === 0) {
        return null;
      }
      return result.rows[0];
    } catch (error) {
      throw new Error("Failed to retrieve role");
    }
  }

  // TODO: need to add indexes for this query
  async getAllPlatformModulePerms() {
    try {
      let query = `
            SELECT m.moduleid, m.modulename, mp.permid FROM module m JOIN module_perm mp ON m.moduleid = mp.moduleid
            WHERE m.moduletype = 'platform' AND m.isenabled = true AND mp.isenabled = true ORDER BY m.priority
        `;
      let result = await this.pgPoolI.Query(query);
      if (result.rowCount === 0) {
        return null;
      }
      return result.rows;
    } catch (error) {
      throw new Error("Failed to retrieve platform module Perms");
    }
  }

  async getRolePermsForAcc(accountid, roleid) {
    try {
      let query = `
            SELECT permid FROM role_perm WHERE accountid = $1 AND roleid = $2
        `;
      let result = await this.pgPoolI.Query(query, [accountid, roleid]);
      if (result.rowCount === 0) {
        return null;
      }
      return result.rows;
    } catch (error) {
      throw new Error("Failed to retrieve permissions for role");
    }
  }

  async updateRolePerms(
    accountid,
    roleid,
    permsToAdd,
    permsToRemove,
    updatedby
  ) {
    let currtime = new Date();
    let [txclient, err] = await this.pgPoolI.StartTransaction();
    if (err) {
      throw err;
    }
    try {
      if (permsToAdd.length > 0) {
        let values = [];
        const placeholders = permsToAdd
          .map((permid, index) => {
            // TODO: what if this is too long?
            const startIndex = index * 6 + 1;
            values.push(accountid, roleid, permid, true, currtime, updatedby);
            return `($${startIndex}, $${startIndex + 1}, $${startIndex + 2}, $${
              startIndex + 3
            }, $${startIndex + 4}, $${startIndex + 5})`;
          })
          .join(",");
        let query = `
                    INSERT INTO role_perm (accountid, roleid, permid, isenabled, createdat, createdby) VALUES ${placeholders}
                    ON CONFLICT (accountid, roleid, permid) DO NOTHING
                `;
        let result = await txclient.query(query, values);
        if (result.rowCount !== permsToAdd.length) {
          this.logger.error("Some permissions were not added", {
            accountid: accountid,
            roleid: roleid,
            permsToAdd: permsToAdd,
            permsToRemove: permsToRemove,
            updatedby: updatedby,
          });
        }
      }
      if (permsToRemove.length > 0) {
        let query = `
                    DELETE FROM role_perm WHERE accountid = $1 AND roleid = $2 AND permid = ANY($3)
                `;
        let result = await txclient.query(query, [
          accountid,
          roleid,
          permsToRemove,
        ]);
        if (result.rowCount !== permsToRemove.length) {
          this.logger.error("Some permissions were not removed", {
            accountid: accountid,
            roleid: roleid,
            permsToAdd: permsToAdd,
            permsToRemove: permsToRemove,
            updatedby: updatedby,
          });
        }
      }

      let commiterr = await this.pgPoolI.TxCommit(txclient);
      if (commiterr) {
        throw commiterr;
      }
      return true;
    } catch (e) {
      let rollbackerr = await this.pgPoolI.TxRollback(txclient);
      if (rollbackerr) {
        throw rollbackerr;
      }
      throw e;
    }
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
      throw new Error("Failed to retrieve username");
    }
  }

  async isRoleAssignedToUsers(roleid) {
    try {
      let query = `
        SELECT COUNT(*) as count FROM fleet_user_role WHERE roleid = $1
      `;
      let result = await this.pgPoolI.Query(query, [roleid]);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      throw new Error("Failed to check role user assignment");
    }
  }

  async doesRoleHavePermissions(roleid) {
    try {
      let query = `
        SELECT COUNT(*) as count FROM role_perm WHERE roleid = $1
      `;
      let result = await this.pgPoolI.Query(query, [roleid]);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      throw new Error("Failed to check role permissions");
    }
  }

  async deleteRole(roleid, deletedby) {
    let [txclient, err] = await this.pgPoolI.StartTransaction();
    if (err) {
      throw err;
    }
    try {
      let query = `
        SELECT roleid, rolename FROM roles WHERE roleid = $1
      `;
      let result = await txclient.query(query, [roleid]);
      if (result.rowCount === 0) {
        throw new Error("Role not found");
      }

      const role = result.rows[0];

      query = `
        SELECT COUNT(*) as count FROM fleet_user_role WHERE roleid = $1
      `;
      result = await txclient.query(query, [roleid]);
      if (parseInt(result.rows[0].count) > 0) {
        throw new Error("Role is assigned to one or more users");
      }

      query = `
        DELETE FROM role_perm WHERE roleid = $1
      `;
      await txclient.query(query, [roleid]);

      query = `
        DELETE FROM roles WHERE roleid = $1
      `;
      result = await txclient.query(query, [roleid]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to delete role");
      }

      await this.pgPoolI.TxCommit(txclient);
      return {
        roleid: roleid,
        rolename: role.rolename,
        deletedat: new Date(),
        deletedby: deletedby,
      };
    } catch (e) {
      await this.pgPoolI.TxRollback(txclient);
      throw e;
    }
  }
}
