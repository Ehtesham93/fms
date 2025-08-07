const EMAIL_PWD_SSO = "EMAIL_PWD"; // TODO: move these to constants util
const MOBILE_SSO = "MOBILE";

import { markInviteAsExpired } from "../../utils/inviteUtil.js";

const FLEET_INVITE_STATUS = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
};

const FLEET_INVITE_TYPE = {
  EMAIL: "email",
  MOBILE: "mobile",
};

export default class FmsSvcDB {
  constructor(pgPoolI, logger) {
    this.pgPoolI = pgPoolI;
    this.logger = logger;
  }

  async getUserAccounts(userid) {
    try {
      let query = `
            SELECT uf.accountid, a.accountname, a.accounttype, a.accountinfo, a.isenabled, a.createdat, a.createdby, a.updatedat, a.updatedby, af.fleetid as rootfleetid
            FROM user_fleet uf
            JOIN account a ON uf.accountid = a.accountid AND a.isenabled = true AND a.isdeleted = false
            LEFT JOIN account_fleet af ON uf.accountid = af.accountid AND af.isroot = true
            WHERE uf.userid = $1 AND uf.accountid != $2 ORDER BY a.accountname
        `;
      let result = await this.pgPoolI.Query(query, [
        userid,
        "ffffffff-ffff-ffff-ffff-ffffffffffff",
      ]);
      if (result.rowCount === 0) {
        return null;
      }
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to retrieve user accounts`);
    }
  }

  async getUserAccountFleets(accountid, userid) {
    try {
      let query = `
            select * from get_all_fleets_path_from_root($1, $2)
        `;

      let result = await this.pgPoolI.Query(query, [accountid, userid]);
      if (result.rowCount === 0) {
        return null;
      }
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to retrieve user accounts fleets`);
    }
  }

  async getAllWebModulesInfo(accountid) {
    try {
      let query = `
            select pm.moduleid, m.modulename, m.moduletype, m.modulecode, m.moduleinfo, m.isenabled, m.createdat, m.createdby, m.updatedat from account_package_subscription aps, package_module pm, module m where aps.pkgid=pm.pkgid and pm.moduleid=m.moduleid and aps.accountid=$1 ORDER BY m.createdat;
        `;
      let result = await this.pgPoolI.Query(query, [accountid]);
      if (result.rowCount === 0) {
        return null;
      }
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to retrieve web modules`);
    }
  }

  async listInvitesOfUser(userid) {
    try {
      let email = null;
      let mobile = null;

      let query = `
            SELECT ssoid FROM user_sso WHERE userid = $1 AND ssotype = $2
        `;
      let result = await this.pgPoolI.Query(query, [userid, EMAIL_PWD_SSO]);
      if (result.rowCount === 1) {
        email = result.rows[0].ssoid;
      } else {
        query = `
            SELECT ssoid FROM email_pwd_sso WHERE userid = $1
        `;
        result = await this.pgPoolI.Query(query, [userid]);
        if (result.rowCount === 1) {
          email = result.rows[0].ssoid;
        }
      }

      query = `
            SELECT ssoid FROM mobile_sso WHERE userid = $1
        `;
      result = await this.pgPoolI.Query(query, [userid]);
      if (result.rowCount === 1) {
        mobile = result.rows[0].ssoid;
      }

      if (!email && !mobile) {
        return null;
      }

      let invitesQuery = `
            SELECT 
                fip.inviteid, fip.accountid, fip.fleetid, 
                fip.info, fip.invitetype, fip.invitestatus, 
                fip.createdat, fip.createdby, fip.updatedat, fip.updatedby,
                NULL as isexternal,
                a.accountname, ft.name as fleetname,
                NULL as expiresat
            FROM fleet_invite_pending fip
            JOIN account a ON fip.accountid = a.accountid
            JOIN fleet_tree ft ON fip.accountid = ft.accountid AND fip.fleetid = ft.fleetid
            WHERE (fip.info->>'email' = $1 OR fip.info->>'mobile' = $2)
            
            UNION ALL
            
            SELECT 
                fid.inviteid, fid.accountid, fid.fleetid, 
                fid.info, fid.invitetype, fid.invitestatus, 
                fid.createdat, fid.createdby, fid.updatedat, fid.updatedby,
                fid.isexternal,
                a.accountname, ft.name as fleetname,
                NULL as expiresat
            FROM fleet_invite_done fid
            JOIN account a ON fid.accountid = a.accountid
            JOIN fleet_tree ft ON fid.accountid = ft.accountid AND fid.fleetid = ft.fleetid
            WHERE (fid.info->>'email' = $1 OR fid.info->>'mobile' = $2)
            
            ORDER BY createdat DESC
        `;

      result = await this.pgPoolI.Query(invitesQuery, [email, mobile]);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to retrieve invites`);
    }
  }

  async validateInvite(inviteid) {
    let currtime = new Date();
    let emailForInvalidReason = "Different email";

    let [txclient, err] = await this.pgPoolI.StartTransaction();
    if (err) {
      this.logger.error("Failed to start transaction", err);
      return {
        isvalid: false,
        email: emailForInvalidReason,
        invalidreason: "Something went wrong",
      };
    }

    try {
      // check if inviteid is valid
      let query = `
                SELECT accountid, fleetid, inviteid, info, invitetype, invitestatus, createdat, createdby, updatedat, updatedby FROM fleet_invite_pending WHERE inviteid = $1
            `;
      let result = await txclient.query(query, [inviteid]);
      if (result.rowCount !== 1) {
        this.logger.error("Invalid invite id", inviteid);
        let rollbackerr = await this.pgPoolI.TxRollback(txclient);
        if (rollbackerr) {
          this.logger.error("Failed to rollback transaction", rollbackerr);
        }
        return {
          isvalid: false,
          email: emailForInvalidReason,
          invalidreason: "Invalid invite id",
        };
      }

      let invite = result.rows[0];
      emailForInvalidReason = invite.info.email || emailForInvalidReason;

      if (invite.invitestatus !== FLEET_INVITE_STATUS.PENDING) {
        this.logger.error("Invite is not in sent state", inviteid);
        let rollbackerr = await this.pgPoolI.TxRollback(txclient);
        if (rollbackerr) {
          this.logger.error("Failed to rollback transaction", rollbackerr);
        }
        return {
          isvalid: false,
          email: emailForInvalidReason,
          invalidreason: "Invite is no longer valid state",
        };
      }

      // TODO: temporary condition
      if (invite.invitetype !== FLEET_INVITE_TYPE.EMAIL) {
        this.logger.error("Invite is not an email invite", inviteid);
        let rollbackerr = await this.pgPoolI.TxRollback(txclient);
        if (rollbackerr) {
          this.logger.error("Failed to rollback transaction", rollbackerr);
        }
        return {
          isvalid: false,
          email: emailForInvalidReason,
          invalidreason:
            "Invite is not an email invite. currently only email invites are supported",
        };
      }

      query = `
                SELECT email, expiresat FROM fleet_invite_email WHERE accountid = $1 AND fleetid = $2 AND inviteid = $3
            `;
      result = await txclient.query(query, [
        invite.accountid,
        invite.fleetid,
        invite.inviteid,
      ]);
      if (result.rowCount !== 1) {
        this.logger.error("Invite email not found", inviteid);
        let rollbackerr = await this.pgPoolI.TxRollback(txclient);
        if (rollbackerr) {
          this.logger.error("Failed to rollback transaction", rollbackerr);
        }
        return {
          isvalid: false,
          email: emailForInvalidReason,
          invalidreason: "Invite email not found",
        };
      }

      const inviteemail = result.rows[0].email;
      const inviteexpiresat = result.rows[0].expiresat;

      if (inviteexpiresat < currtime) {
        this.logger.info(
          `fmssvc_db.validateInvite: markInviteAsExpired: accountid: ${invite.accountid}, fleetid: ${invite.fleetid}, inviteid: ${invite.inviteid}`
        );
        await markInviteAsExpired(
          invite.accountid,
          invite.fleetid,
          invite.inviteid,
          currtime,
          FLEET_INVITE_STATUS.EXPIRED,
          txclient
        );

        let commiterr = await this.pgPoolI.TxCommit(txclient);
        if (commiterr) {
          this.logger.error("Failed to commit transaction", commiterr);
        }
        return {
          isvalid: false,
          email: emailForInvalidReason,
          invalidreason: "Invite has expired",
        };
      }

      // check if email already exists
      query = `
                SELECT userid FROM email_pwd_sso WHERE ssoid = $1
            `;
      result = await txclient.query(query, [inviteemail]);
      let isuseralreadyexists = false;
      if (result.rowCount !== 0) {
        isuseralreadyexists = true;
      }

      // get account name and fleet name for invite text
      query = `
                SELECT accountname FROM account WHERE accountid = $1 AND isdeleted = false AND isenabled = true
            `;
      result = await txclient.query(query, [invite.accountid]);
      if (result.rowCount !== 1) {
        this.logger.error("Account not found or not enabled", inviteid);
        let rollbackerr = await this.pgPoolI.TxRollback(txclient);
        if (rollbackerr) {
          this.logger.error("Failed to rollback transaction", rollbackerr);
        }
        return {
          isvalid: false,
          email: emailForInvalidReason,
          invalidreason: "Invited account not found",
        };
      }
      const accountname = result.rows[0].accountname;

      query = `
                SELECT name FROM fleet_tree WHERE accountid = $1 AND fleetid = $2
            `;
      result = await txclient.query(query, [invite.accountid, invite.fleetid]);
      if (result.rowCount !== 1) {
        this.logger.error("Fleet not found", inviteid);
        let rollbackerr = await this.pgPoolI.TxRollback(txclient);
        if (rollbackerr) {
          this.logger.error("Failed to rollback transaction", rollbackerr);
        }
        return {
          isvalid: false,
          email: emailForInvalidReason,
          invalidreason: "Invited fleet not found",
        };
      }
      const fleetname = result.rows[0].name;

      let commiterr = await this.pgPoolI.TxCommit(txclient);
      if (commiterr) {
        this.logger.error("Failed to commit transaction", commiterr);
        return {
          isvalid: false,
          email: emailForInvalidReason,
          invalidreason: "Something went wrong",
        };
      }

      return {
        inviteid: inviteid,
        accountid: invite.accountid,
        fleetid: invite.fleetid,
        accountname: accountname,
        fleetname: fleetname,
        inviteemail: inviteemail,
        inviteexpiresat: inviteexpiresat,
        inviteinfo: invite.info,
        isuseralreadyexists: isuseralreadyexists,
        isvalid: true,
      };
    } catch (e) {
      let rollbackerr = await this.pgPoolI.TxRollback(txclient);
      if (rollbackerr) {
        this.logger.error("Failed to rollback transaction", rollbackerr);
      }
      this.logger.error("Failed to validate invite", e);
      return {
        isvalid: false,
        email: emailForInvalidReason,
        invalidreason: "Unknown error",
      };
    }
  }
}
