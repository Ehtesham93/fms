import { EncryptPassword, Sha256hash } from "../../../utils/eccutil.js";
import {
  isRedundantInvite,
  shouldUpdateExistingInvite,
  updateInviteExpiryAndSendEmail,
  markInviteAsExpired,
  getInviteEmailTemplate,
} from "../../../utils/inviteUtil.js";

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

export default class PUserSvcDB {
  /**
   *
   * @param {PgPool} pgPoolI
   */
  constructor(pgPoolI, logger) {
    this.pgPoolI = pgPoolI;
    this.logger = logger;
  }

  generateRandomPassword() {
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const specialChars = "@-_";
    const allChars = uppercase + lowercase + numbers + specialChars;

    let password = "";

    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += specialChars[Math.floor(Math.random() * specialChars.length)];

    for (let i = 4; i < 12; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    return password
      .split("")
      .sort(() => Math.random() - 0.5)
      .join("");
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

  // Note: this function is same as accountsvc_db.triggerEmailInviteToRootFleet
  async triggerEmailInviteToRootFleet(
    accountid,
    inviteid,
    email,
    invitedby,
    roleids,
    headerReferer
  ) {
    let currtime = new Date();

    let [txclient, err] = await this.pgPoolI.StartTransaction();
    if (err) {
      throw err;
    }

    try {
      // get root fleet id
      let query = `
                    SELECT fleetid FROM account_fleet WHERE accountid = $1 AND isroot = true
                `;
      let result = await txclient.query(query, [accountid]);
      if (result.rowCount !== 1) {
        throw new Error("Account root fleet not found");
      }
      const fleetid = result.rows[0].fleetid;

      // check if email already exists in user sso table
      let redundantInvite = await isRedundantInvite(
        accountid,
        fleetid,
        email,
        roleids,
        txclient
      );
      if (redundantInvite) {
        this.logger.info(
          `pusersvc_db.triggerEmailInviteToRootFleet: Redundant invite. accountid: ${accountid}, fleetid: ${fleetid}, inviteid: ${inviteid}, email: ${email}, roleids: ${roleids}, invitedby: ${invitedby}, headerReferer: ${headerReferer}`
        );
        throw new Error("Email already invited to fleet with same role");
      }

      query = `
                    SELECT fip.inviteid, fip.invitestatus, fip.info, fie.expiresat FROM fleet_invite_email fie 
                    JOIN fleet_invite_pending fip ON fie.accountid = fip.accountid AND fie.fleetid = fip.fleetid AND fie.inviteid = fip.inviteid
                    WHERE fie.accountid = $1 AND fie.fleetid = $2 AND fie.email = $3 AND fip.invitetype = $4 and (fip.invitestatus = $5 or fip.invitestatus = $6)
                `;
      result = await txclient.query(query, [
        accountid,
        fleetid,
        email,
        FLEET_INVITE_TYPE.EMAIL,
        FLEET_INVITE_STATUS.PENDING,
        FLEET_INVITE_STATUS.PENDING,
      ]);

      if (result?.rows?.length > 0) {
        let inviteToUpdate = null;

        for (const row of result.rows) {
          // mark the invite as expired
          if (new Date(row.expiresat) < currtime) {
            this.logger.info(
              `pusersvc_db.triggerEmailInviteToRootFleet: markInviteAsExpired: accountid: ${accountid}, fleetid: ${fleetid}, inviteid: ${row.inviteid}`
            );
            await markInviteAsExpired(
              accountid,
              fleetid,
              row.inviteid,
              currtime,
              FLEET_INVITE_STATUS.EXPIRED,
              txclient
            );
          } else {
            // check if invite is for same role
            // if it is, update the expiry and trigger email again
            // if not, send fresh invite
            if (inviteToUpdate) {
              // we only need to update one invite
              continue;
            }
            let updateExistingInvite = shouldUpdateExistingInvite(
              row.info.roleids,
              roleids
            );

            if (updateExistingInvite) {
              inviteToUpdate = row;
            }
          }
        }

        if (inviteToUpdate) {
          // update the expiry and trigger email again and exit
          this.logger.info(
            `pusersvc_db.triggerEmailInviteToRootFleet: updateInviteExpiry: accountid: ${accountid}, fleetid: ${fleetid}, inviteid: ${inviteToUpdate.inviteid}, info: ${inviteToUpdate.info}, currtime: ${currtime}`
          );
          let res = await updateInviteExpiryAndSendEmail(
            accountid,
            fleetid,
            inviteToUpdate.inviteid,
            inviteToUpdate.info,
            currtime,
            headerReferer,
            email,
            txclient
          );

          let commiterr = await this.pgPoolI.TxCommit(txclient);
          if (commiterr) {
            throw commiterr;
          }
          return {
            success: true,
            inviteid: inviteToUpdate.inviteid,
            isUpdated: true,
          };
        }
      }

      this.logger.info(
        `pusersvc_db.triggerEmailInviteToRootFleet: Sending new invite. accountid: ${accountid}, fleetid: ${fleetid}, inviteid: ${inviteid}, email: ${email}, roleids: ${roleids}, invitedby: ${invitedby}, headerReferer: ${headerReferer}`
      );

      let expiresat = new Date(currtime.getTime() + 7 * 24 * 60 * 60 * 1000);
      query = `
                    INSERT INTO fleet_invite_email (accountid, fleetid, inviteid, email, expiresat) VALUES ($1, $2, $3, $4, $5)
                `;
      result = await txclient.query(query, [
        accountid,
        fleetid,
        inviteid,
        email,
        expiresat,
      ]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to create invite email");
      }

      query = `
                    INSERT INTO fleet_invite_pending (accountid, fleetid, inviteid, info, invitetype, invitestatus, createdat, createdby, updatedat, updatedby) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                `;
      let invitemeta = {
        accountid: accountid,
        fleetid: fleetid,
        inviteid: inviteid,
        email: email,
        expiresat: expiresat,
        roleids: roleids,
        invitedby: invitedby,
      };
      result = await txclient.query(query, [
        accountid,
        fleetid,
        inviteid,
        invitemeta,
        FLEET_INVITE_TYPE.EMAIL,
        FLEET_INVITE_STATUS.PENDING,
        currtime,
        invitedby,
        currtime,
        invitedby,
      ]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to create invite email");
      }

      query = `
                    SELECT accountname FROM account WHERE accountid = $1 AND isdeleted = false
                `;
      result = await txclient.query(query, [accountid]);
      if (result.rowCount !== 1) {
        throw new Error("Account not found");
      }
      const accountname = result.rows[0].accountname;

      query = `
                    SELECT name FROM fleet_tree WHERE accountid = $1 AND fleetid = $2
                `;
      result = await txclient.query(query, [accountid, fleetid]);
      if (result.rowCount !== 1) {
        throw new Error("Fleet not found");
      }
      const fleetname = result.rows[0].name;

      // get email invite template
      let emailTemplate = await getInviteEmailTemplate(
        accountid,
        fleetid,
        inviteid,
        accountname,
        fleetname,
        headerReferer,
        email
      );

      query = `
                    INSERT INTO pending_email (email, nextattempt, nretriespending) VALUES ($1, $2, $3)
                `;
      result = await txclient.query(query, [emailTemplate, currtime, 5]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to create pending email");
      }

      let commiterr = await this.pgPoolI.TxCommit(txclient);
      if (commiterr) {
        throw commiterr;
      }
      return {
        accountid: accountid,
        fleetid: fleetid,
        success: true,
        inviteid: inviteid,
        isUpdated: false,
      };
    } catch (e) {
      let rollbackerr = await this.pgPoolI.TxRollback(txclient);
      if (rollbackerr) {
        throw rollbackerr;
      }
      throw e;
    }
  }

  async resendInvite(accountid, inviteid, invitedby, headerReferer) {
    let currtime = new Date();

    let [txclient, err] = await this.pgPoolI.StartTransaction();
    if (err) {
      throw err;
    }

    try {
      // check if inviteid is valid
      let query = `
                SELECT accountid, fleetid, inviteid, info, invitetype, invitestatus, createdat, createdby, updatedat, updatedby FROM fleet_invite_pending WHERE inviteid = $1
            `;
      let result = await txclient.query(query, [inviteid]);
      if (result.rowCount !== 1) {
        throw new Error("Invalid invite id");
      }

      let invite = result.rows[0];

      if (invite.invitestatus !== FLEET_INVITE_STATUS.PENDING) {
        throw new Error("Invite is not in sent state");
      }

      // TODO: temporary condition
      if (invite.invitetype !== FLEET_INVITE_TYPE.EMAIL) {
        throw new Error("Invite is not an email invite");
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
        throw new Error("Invite email not found");
      }

      const inviteemail = result.rows[0].email;
      const inviteexpiresat = result.rows[0].expiresat;

      if (inviteexpiresat < currtime) {
        this.logger.info(
          `pusersvc_db.resendInvite: markInviteAsExpired: accountid: ${invite.accountid}, fleetid: ${invite.fleetid}, inviteid: ${inviteid}`
        );
        await markInviteAsExpired(
          invite.accountid,
          invite.fleetid,
          inviteid,
          currtime,
          FLEET_INVITE_STATUS.EXPIRED,
          txclient
        );
        throw new Error("Cannot resend an expired invite");
      }

      let expiresat = new Date(currtime.getTime() + 7 * 24 * 60 * 60 * 1000);
      query = `
                UPDATE fleet_invite_email SET expiresat = $1 WHERE accountid = $2 AND fleetid = $3 AND inviteid = $4 AND email = $5
            `;
      result = await txclient.query(query, [
        expiresat,
        invite.accountid,
        invite.fleetid,
        inviteid,
        inviteemail,
      ]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to update invite expiry");
      }

      // get account name and fleet name for invite text
      query = `
                SELECT accountname FROM account WHERE accountid = $1 AND isdeleted = false
            `;
      result = await txclient.query(query, [invite.accountid]);
      if (result.rowCount !== 1) {
        throw new Error("Account not found");
      }
      const accountname = result.rows[0].accountname;

      query = `
                SELECT name FROM fleet_tree WHERE accountid = $1 AND fleetid = $2
            `;
      result = await txclient.query(query, [invite.accountid, invite.fleetid]);
      if (result.rowCount !== 1) {
        throw new Error("Fleet not found");
      }
      const fleetname = result.rows[0].name;

      // get email invite template
      let emailTemplate = await getInviteEmailTemplate(
        invite.accountid,
        invite.fleetid,
        inviteid,
        accountname,
        fleetname,
        headerReferer,
        inviteemail
      );

      query = `
                INSERT INTO pending_email (email, nextattempt, nretriespending) VALUES ($1, $2, $3)
            `;
      result = await txclient.query(query, [emailTemplate, currtime, 5]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to create pending email");
      }

      let commiterr = await this.pgPoolI.TxCommit(txclient);
      if (commiterr) {
        throw commiterr;
      }

      return {
        inviteid: inviteid,
        accountid: invite.accountid,
        fleetid: invite.fleetid,
        email: inviteemail,
        expiresat: expiresat,
      };
    } catch (e) {
      let rollbackerr = await this.pgPoolI.TxRollback(txclient);
      if (rollbackerr) {
        throw rollbackerr;
      }
      throw e;
    }
  }

  async getAllUserRoles(userid) {
    try {
      let query = ` select a.accountid, a.accountname, r.roleid, r.rolename, r.roletype from fleet_user_role fur, account a, roles r where fur.accountid = a.accountid and fur.accountid = r.accountid and fur.roleid = r.roleid and r.isenabled = $1 and fur.userid = $2`;
      let result = await this.pgPoolI.Query(query, [true, userid]);
      if (result.rowCount === 0) {
        return null;
      } // TODO: resume
      return result.rows;
    } catch (error) {
      throw new Error("Failed to retrieve user roles");
    }
  }

  async getAllRoles(accountid) {
    try {
      let query = `
            SELECT roleid, rolename, roletype, isenabled, createdat, createdby, updatedat, updatedby FROM roles
            WHERE accountid = $1
        `;
      let result = await this.pgPoolI.Query(query, [accountid]);
      if (result.rowCount === 0) {
        return null;
      }
      result.rows.sort((a, b) => a.createdat - b.createdat);
      for (let row of result.rows) {
        if (row.createdby === row.updatedby) {
          let user = await this.getUserName(row.createdby);
          row.createdby = user;
          row.updatedby = user;
        } else {
          row.createdby = await this.getUserName(row.createdby);
          row.updatedby = await this.getUserName(row.updatedby);
        }
      }
      return result.rows;
    } catch (error) {
      throw new Error("Failed to retrieve roles");
    }
  }

  async addUserRole(accountid, fleetid, userid, roleids) {
    try {
      let values = [];
      if (roleids.length > 0) {
        const placeholders = roleids
          .map((roleid, index) => {
            const startIndex = index * 4 + 1;
            values.push(userid, accountid, fleetid, roleid);
            return `($${startIndex}, $${startIndex + 1}, $${startIndex + 2}, $${
              startIndex + 3
            })`;
          })
          .join(",");

        let query = `
                INSERT INTO fleet_user_role (userid, accountid, fleetid, roleid) VALUES ${placeholders}
                ON CONFLICT (userid, accountid, fleetid, roleid) DO NOTHING
            `;
        let result = await this.pgPoolI.Query(query, values);
        if (result.rowCount !== roleids.length) {
          this.logger.error("Some roles were not added", {
            userid: userid,
            accountid: accountid,
            fleetid: fleetid,
            roleids: roleids,
          });
        }
      }

      return true;
    } catch (error) {
      throw new Error("Failed to add user role");
    }
  }

  async removeUserRole(accountid, fleetid, userid, roleid) {
    try {
      let query = `
            DELETE FROM fleet_user_role WHERE userid = $1 AND accountid = $2 AND fleetid = $3 AND roleid = $4
        `;
      let result = await this.pgPoolI.Query(query, [
        userid,
        accountid,
        fleetid,
        roleid,
      ]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to remove user role");
      }
      return true;
    } catch (error) {
      throw new Error("Failed to remove user role");
    }
  }

  async resetUserPassword(userid, resetby) {
    let currtime = new Date();

    let [txclient, err] = await this.pgPoolI.StartTransaction();
    if (err) {
      throw err;
    }

    try {
      let newPassword = this.generateRandomPassword();
      let hashedPassword = await this.hashPassword(newPassword);
      const encryptedPassword = await this.encryptPassword(hashedPassword);

      let query = `
        SELECT ssoid FROM email_pwd_sso WHERE userid = $1
      `;
      let result = await txclient.query(query, [userid]);
      if (result.rowCount === 0) {
        throw new Error("User email not found");
      }
      const userEmail = result.rows[0].ssoid;

      query = `
        UPDATE email_pwd_sso 
        SET password = $1, updatedat = $2 
        WHERE userid = $3
      `;
      result = await txclient.query(query, [
        encryptedPassword,
        currtime,
        userid,
      ]);

      if (result.rowCount !== 1) {
        throw new Error("Failed to update user password");
      }

      query = `
        SELECT displayname FROM users WHERE userid = $1 AND isdeleted = false
      `;
      result = await txclient.query(query, [userid]);
      if (result.rowCount !== 1) {
        throw new Error("User not found");
      }
      const displayname = result.rows[0].displayname;

      query = `
        SELECT displayname FROM users WHERE userid = $1 AND isdeleted = false
      `;
      result = await txclient.query(query, [resetby]);
      if (result.rowCount !== 1) {
        throw new Error("Reset by user not found");
      }
      const resetByDisplayname = result.rows[0].displayname;

      let emailTemplate = await this.getPasswordResetEmailTemplate(
        displayname,
        userEmail,
        newPassword,
        resetByDisplayname
      );

      query = `
        INSERT INTO pending_email (email, nextattempt, nretriespending) VALUES ($1, $2, $3)
      `;
      result = await txclient.query(query, [emailTemplate, currtime, 5]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to create pending email");
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

  async checkSuperAdminRole(userid) {
    try {
      const platformAccountId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
      const superAdminRoleId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
      let query = `
        SELECT COUNT(*) as count 
        FROM fleet_user_role 
        WHERE accountid = $1 AND roleid = $2 AND userid = $3
      `;

      let result = await this.pgPoolI.Query(query, [
        platformAccountId,
        superAdminRoleId,
        userid,
      ]);

      return result.rows[0].count > 0;
    } catch (error) {
      this.logger.error("Error checking super admin role", error);
      return false;
    }
  }

  async getPasswordResetEmailTemplate(
    displayname,
    email,
    password,
    resetByDisplayname
  ) {
    try {
      let subject = `Nemo Platform - Password Reset`;
      let body = `<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title></title>
          <link
            href="https://fonts.googleapis.com/css2?family=Georama:wght@400;600&display=swap"
            rel="stylesheet"
          />
          <style>
            body {
              margin: 0;
              padding: 0;
              font-family: "Georama", sans-serif;
              background-color: #ffffff;
            }
          
            a[x-apple-data-detectors],
            #MessageViewBody a {
              color: inherit !important;
              text-decoration: none !important;
            }
          
            p {
              margin: 0;
              line-height: 1.6;
            }
          
            @media (max-width: 520px) {
              .row-content {
                width: 100% !important;
              }
          
              .stack .column {
                display: block;
                width: 100%;
              }
            }
          </style>
        </head>
          
        <body>
          <table
            width="100%"
            cellpadding="0"
            cellspacing="0"
            style="background-color: #ffffff"
          >
            <tr>
              <td>
                <table
                  align="center"
                  cellpadding="0"
                  cellspacing="0"
                  width="500"
                  style="margin: auto"
                >
                  <tr>
                    <td style="padding: 30px 10px 10px">
                      <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
                        <img src="https://nemo.intellicar.io/nemo3/vehicle/model/img/mahindra_logo.png" alt="Nemo Logo" style="width: 100px;" />
                        <p
                          style="font-size: 29px; font-weight: 600; line-height: 35px"
                        >
                          Password Reset Notification
                        </p>
                      </div>
                    </td>
                  </tr>
          
                  <tr>
                    <td style="padding: 10px">
                      <p style="text-align: center; font-size: 14px">
                        Hello <strong>${displayname}</strong>,
                      </p>
                    </td>
                  </tr>
          
                  <tr>
                    <td style="padding: 10px">
                      <p style="text-align: center; font-size: 14px">
                        Your password for the NEMO Platform has been reset by <strong>${resetByDisplayname}</strong>.
                      </p>
                    </td>
                  </tr>
          
                  <tr>
                    <td style="padding: 10px">
                      <p style="text-align: center; font-size: 14px">
                        Your new password is: <strong style="background-color: #f0f0f0; padding: 5px 10px; border-radius: 3px; font-family: monospace;">${password}</strong>
                      </p>
                    </td>
                  </tr>
          
                  <tr>
                    <td style="padding: 10px">
                      <p style="text-align: center; font-size: 14px">
                        Please log in with this new password and change it immediately for security purposes.
                      </p>
                    </td>
                  </tr>
          
                  <tr>
                    <td style="padding: 10px">
                      <p style="text-align: center; font-size: 13px">
                        If you did not request this password reset, please contact your system administrator immediately.
                      </p>
                    </td>
                  </tr>
          
                  <tr>
                    <td style="padding: 18px">
                      <p style="text-align: center; font-size: 13px; color: #000000">
                        Best Regards,<br />
                        Nemo Platform Team<br />
                        <span style="color: #a0a0a0"
                          >Mahindra Last Mile Mobility Ltd.</span
                        >
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>`;

      let emailTemplate = {
        from: {
          name: "Nemo",
          email: "nemo3@intellicar.in",
        },
        to: [
          {
            name: displayname,
            email: email,
          },
        ],
        subject: subject,
        bodycontent: {
          content: [
            {
              type: "text/html",
              value: body,
            },
          ],
        },
      };

      let jsonTemplate = JSON.stringify(emailTemplate);

      return jsonTemplate;
    } catch (error) {
      throw new Error("Failed to generate password reset email template");
    }
  }

  async encryptPassword(password) {
    return await EncryptPassword(password);
  }

  async hashPassword(password) {
    return Sha256hash(password);
  }
}
