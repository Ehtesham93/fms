import { v4 as uuidv4 } from "uuid";
import { EncryptPassword, ComparePassword } from "../../utils/eccutil.js";
import { SendSms } from "../../utils/smsutil.js";
import { GetUnVerifiedClaims } from "../../utils/jwtutil.js";

export default class UserHdlrImpl {
  constructor(userSvcI, authSvcI, fmsSvcI, platformSvcI, logger) {
    this.userSvcI = userSvcI;
    this.authSvcI = authSvcI;
    this.fmsSvcI = fmsSvcI;
    this.logger = logger;
    this.platformSvcI = platformSvcI;
  }

  AcceptInviteLogic = async (inviteid, userid) => {
    let res = await this.userSvcI.AcceptInvite(inviteid, userid);
    if (!res) {
      throw new Error("Failed to accept invite");
    }
    return {
      userid: userid,
      accountid: res.accountid,
      fleetid: res.fleetid,
      accountname: res.accountname,
      fleetname: res.fleetname,
    };
  };

  RejectInviteLogic = async (inviteid, userid) => {
    let res = await this.userSvcI.RejectInvite(inviteid, userid);
    if (!res) {
      throw new Error("Failed to reject invite");
    }
    return {
      userid: userid,
      inviteid: inviteid,
    };
  };

  GetHomePageLogic = async (userid) => {
    // get roles for this userid
    let consolePerms = await this.userSvcI.GetConsolePerms(userid);
    let showConsole = false;
    let showImpersonate = false;
    let showFms = true;
    // check if user has impersonate permission
    if (consolePerms && consolePerms.length > 0) {
      showConsole = true;
      if (
        consolePerms.includes("console.impersonate") ||
        consolePerms.includes("all.all.all")
      ) {
        showImpersonate = true;
      }
    }

    return {
      userid: userid,
      permissions: {
        showConsole: showConsole,
        showImpersonate: showImpersonate,
        showFms: showFms,
      },
    };
  };

  GetUserAccountsLogic = async (userid) => {
    let accounts = await this.fmsSvcI.GetUserAccounts(userid);
    if (!accounts) {
      accounts = [];
    }
    return {
      userid: userid,
      selectedaccount: accounts[0],
      accounts: accounts,
    };
  };

  GetAccountTokenLogic = async (userid, accountid, expiresin) => {
    let tokenclaims = {
      claims: {
        userid: userid,
        accountid: accountid,
      },
      validity: expiresin,
    };
    let token = await this.authSvcI.GetToken(userid, tokenclaims);
    if (!token) {
      throw new Error("Failed to get account token");
    }
    return {
      userid: userid,
      accountid: accountid,
      accounttoken: token.token,
    };
  };

  LogoutLogic = async (userid) => {
    // TODO: invalidate token commented out for now
    // let result = await this.authSvcI.InvalidateToken(userid);
    // if (!result) {
    //   throw new Error("Failed to logout");
    // }
    return {
      userid: userid,
    };
  };

  UpdateDisplayNameLogic = async (userid, displayname) => {
    let result = await this.userSvcI.UpdateDisplayName(userid, displayname);
    if (!result) {
      throw new Error("Failed to update display name");
    }
    return result;
  };

  ListInvitesOfUserLogic = async (userid) => {
    let invites = await this.fmsSvcI.ListInvitesOfUser(userid);
    if (!invites) {
      invites = [];
    }
    const currentTime = new Date();

    for (let invite of invites) {
      if (invite.invitestatus === "PENDING" && invite.expiresat) {
        const expiresAt = new Date(invite.expiresat);
        if (currentTime > expiresAt) {
          invite.invitestatus = "EXPIRED";
        }
      }
    }
    return invites;
  };

  SetDefaultsLogic = async (
    userid,
    accountid,
    recursive,
    lat,
    lng,
    mapzoom
  ) => {
    let result = await this.userSvcI.SetUserDefaults(
      userid,
      accountid,
      recursive,
      lat,
      lng,
      mapzoom
    );
    if (!result) {
      throw new Error("Failed to set user defaults");
    }
    return {
      userid: userid,
      defaults: {
        accountid: accountid,
        recursive: recursive,
        mapzoom: mapzoom,
        mapcenter: {
          lat: lat,
          lng: lng,
        },
      },
    };
  };

  GetUserInfoLogic = async (userid) => {
    let userinfo = await this.userSvcI.GetUserDetails(userid);
    if (!userinfo) {
      throw new Error("Failed to get user info");
    }
    return userinfo;
  };

  RecoverUserLogic = async (userid, recoveredby) => {
    if (userid === "ffffffff-ffff-ffff-ffff-ffffffffffff") {
      const error = new Error("Cannot recover seed user (super admin)");
      error.errcode = "CANNOT_RECOVER_SEED_USER";
      throw error;
    }

    let userDetails = await this.userSvcI.GetUserDetails(userid);
    if (!userDetails) {
      const error = new Error("User not found");
      error.errcode = "USER_NOT_FOUND";
      throw error;
    }

    if (!userDetails.isdeleted) {
      const error = new Error("User is not deleted, cannot recover");
      error.errcode = "USER_NOT_DELETED";
      throw error;
    }

    if (!userDetails.displayname.includes("_deleted_")) {
      const error = new Error("User doesn't appear to be soft deleted");
      error.errcode = "USER_NOT_DELETED";
      throw error;
    }

    let result = await this.userSvcI.RecoverUser(userid, recoveredby);
    if (!result) {
      throw new Error("Failed to recover user");
    }

    try {
      await this.authSvcI.CreateConsumer(userid, recoveredby);
    } catch (error) {
      this.logger.error(
        `Failed to create consumer in auth service for user ${userid}`,
        error
      );
    }

    return result;
  };

  AddUserMobileLogic = async (userid, mobile) => {
    try {
      let existingUserId = await this.userSvcI.CheckMobileExists(mobile);
      if (existingUserId) {
        const error = new Error("Mobile number is already in use");
        error.errcode = "MOBILE_ALREADY_EXISTS";
        throw error;
      }

      let userHasMobile = await this.userSvcI.CheckUserHasMobile(userid);
      if (userHasMobile) {
        const error = new Error("User already has a mobile number");
        error.errcode = "USER_ALREADY_HAS_MOBILE";
        throw error;
      }

      let verifyid = uuidv4();
      let otpNumber = Math.floor(100000 + Math.random() * 900000);
      let otp = otpNumber.toString();
      let expiresat = new Date(Date.now() + 10 * 60 * 1000);

      await this.userSvcI.CreateMobileVerify(verifyid, userid, otp, expiresat, {
        operationtype: "CHANGE",
        mobile: mobile,
      });

      const message = `Verify_OTP_for_Mahindra_Nemo at ${otp} , please check - Intellicar`;
      await SendSms(mobile, message);

      return {
        message: "OTP sent to your mobile number",
        verifyid: verifyid,
      };
    } catch (err) {
      throw err;
    }
  };

  VerifyAddMobileOtpLogic = async (userid, otp, mobile) => {
    try {
      let result = await this.userSvcI.VerifyAndAddMobile(userid, otp, mobile);

      return {
        success: true,
        message: "Mobile number added successfully",
        userid: userid,
        result: result,
      };
    } catch (err) {
      throw err;
    }
  };

  AddUserEmailLogic = async (userid, email, headerReferer) => {
    try {
      const existingUserId = await this.userSvcI.CheckEmailExists(email);
      if (existingUserId) {
        const error = new Error(
          "Email is already associated with another account"
        );
        error.errcode = "EMAIL_ALREADY_EXISTS";
        throw error;
      }

      const existingEmail = await this.userSvcI.CheckUserHasEmail(userid);
      if (existingEmail) {
        const error = new Error("User already has an email address");
        error.errcode = "USER_ALREADY_HAS_EMAIL";
        throw error;
      }

      const verifyid = uuidv4();
      const expiresat = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await this.userSvcI.CreateEmailVerify(verifyid, userid, email, expiresat);

      const verificationLink = `${headerReferer}/auth/verify-email?verifyid=${verifyid}`;

      const user = await this.userSvcI.GetUserDetails(userid);

      const emailTemplate = await this.createEmailVerificationTemplate(
        user.displayname,
        email,
        verificationLink
      );

      await this.userSvcI.AddPendingEmail(emailTemplate, new Date(), 5);

      return {
        message: "Verification email sent successfully",
        verifyid: verifyid,
        email: email,
        expiresat: expiresat,
      };
    } catch (error) {
      throw error;
    }
  };

  VerifyAddEmailLogic = async (userid, verifyid, password) => {
    try {
      const result = await this.userSvcI.VerifyAndAddEmail(
        userid,
        verifyid,
        password
      );

      return {
        message: "Email added successfully",
        email: result.email,
      };
    } catch (error) {
      throw error;
    }
  };

  createEmailVerificationTemplate = async (
    displayname,
    email,
    verificationLink
  ) => {
    const emailData = {
      from: {
        name: "Nemo FMS",
        email: "nemo3@intellicar.in",
      },
      to: [
        {
          name: displayname,
          email: email,
        },
      ],
      subject: "Add Email to Your Account - Nemo FMS",
      bodycontent: {
        content: [
          {
            type: "text/html",
            value: `<!DOCTYPE html>
              <html lang="en">
                <head>
                  <meta charset="UTF-8" />
                  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                  <title>Add Email Verification</title>
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
                    
                    .verify-button {
                      display: inline-block;
                      padding: 12px 24px;
                      background-color: #007bff;
                      color: #ffffff !important;
                      text-decoration: none;
                      border-radius: 5px;
                      font-weight: 600;
                      font-size: 16px;
                    }
                    
                    .verify-button:hover {
                      background-color: #0056b3;
                    }
                    
                    @media (max-width: 520px) {
                      .row-content {
                        width: 100% !important;
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
                                  Add Email to Account
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
                                You have requested to add this email address to your Nemo FMS account.
                              </p>
                            </td>
                          </tr>
                          
                          <tr>
                            <td style="padding: 10px; text-align: center;">
                              <a href="${verificationLink}" class="verify-button" style="color: #ffffff !important;">Verify Email Address</a>
                            </td>
                          </tr>
                          
                          <tr>
                            <td style="padding: 10px">
                              <p style="text-align: center; font-size: 14px">
                                If the button doesn't work, copy and paste this link into your browser:
                              </p>
                              <p style="text-align: center; font-size: 12px; word-break: break-all; color: #666;">
                                ${verificationLink}
                              </p>
                            </td>
                          </tr>
                          
                          <tr>
                            <td style="padding: 10px">
                              <p style="text-align: center; font-size: 14px">
                                This verification link will expire in 24 hours for security reasons.
                              </p>
                            </td>
                          </tr>
                          
                          <tr>
                            <td style="padding: 10px">
                              <p style="text-align: center; font-size: 13px">
                                If you didn't request this email addition, please ignore this email or contact support if you have concerns.
                              </p>
                            </td>
                          </tr>
                          
                          <tr>
                            <td style="padding: 18px">
                              <p style="text-align: center; font-size: 13px; color: #000000">
                                Best Regards,<br />
                                Nemo FMS Team<br />
                                <span style="color: #a0a0a0">Mahindra Last Mile Mobility Ltd.</span>
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
              </html>`,
          },
        ],
      },
    };

    return JSON.stringify(emailData);
  };

  ValidateAddEmailVerificationLogic = async (userid, verifyid) => {
    try {
      const result = await this.userSvcI.ValidateEmailVerification(
        userid,
        verifyid
      );

      return {
        verifyid: verifyid,
        isvalid: result.isvalid,
        status: result.status,
        message: result.message,
        email: result.email,
        expiresat: result.expiresat,
      };
    } catch (error) {
      throw error;
    }
  };

  GetAcceptedTermsLogic = async (userid) => {
    let result = await this.userSvcI.GetAcceptedTerms(userid);
    return result;
  };

  PutAcceptedTermsLogic = async (userid, acceptedterms) => {
    let result = await this.userSvcI.PutAcceptedTerms(userid, acceptedterms);
    return result;
  };

  GetSosContactsLogic = async () => {
    try {
      let sosContacts = await this.userSvcI.GetSosContacts();

      if (!sosContacts) {
        sosContacts = [];
      }

      return {
        soscontacts: sosContacts,
        count: sosContacts.length,
      };
    } catch (error) {
      throw error;
    }
  };

  GetDocumentsLogic = async () => {
    try {
      let documents = await this.userSvcI.GetDocuments();

      if (!documents) {
        documents = [];
      }

      return {
        documents: documents,
        count: documents.length,
      };
    } catch (error) {
      throw error;
    }
  };

  SetMpinLogic = async (userid, mpin, isenabled, isreset) => {
    try {
      let encryptedMpin = await EncryptPassword(mpin);

      let result = await this.userSvcI.SetMpin(
        userid,
        encryptedMpin,
        isenabled
      );

      if (isreset) {
        let logoutresult = await this.authSvcI.InvalidateToken(userid);
        if (!logoutresult) {
          throw new Error("Failed to logout, MPIN set successfully");
        }
      }

      let message = "";
      if (isreset) {
        message = "MPIN set successfully and user logged out from all devices";
      } else {
        message = "MPIN set successfully";
      }

      return {
        success: true,
        message: message,
        userid: userid,
      };
    } catch (error) {
      throw error;
    }
  };

  GetBannersLogic = async () => {
    try {
      let banners = await this.userSvcI.GetBanners();

      if (!banners) {
        banners = [];
      }

      return {
        banners: banners,
        count: banners.length,
      };
    } catch (error) {
      throw error;
    }
  };

  RefreshTokenLogic = async (req) => {
    let token = req.headers["Cookie"] || req.headers["cookie"];
    if (!token) {
      let error = new Error("Token is required");
      error.errcode = "INVALID_TOKEN";
      throw error;
    }

    let mainToken = null;
    let refreshToken = null;

    if (token.includes(";")) {
      let cookies = token.split(";");
      for (let eachcookie of cookies) {
        eachcookie = eachcookie.trim();
        if (eachcookie.startsWith("token=")) {
          mainToken = eachcookie.substring(6);
        } else if (eachcookie.startsWith("refreshtoken=")) {
          refreshToken = eachcookie.substring(13);
        }
      }
    } else {
      if (token.startsWith("token=")) {
        mainToken = token.substring(6);
      } else if (token.startsWith("refreshtoken=")) {
        refreshToken = token.substring(13);
      }
    }

    if (!mainToken) {
      let error = new Error("Main token is required");
      error.errcode = "INVALID_TOKEN";
      throw error;
    }

    if (!refreshToken) {
      let error = new Error("Refresh token is required");
      error.errcode = "INVALID_TOKEN";
      throw error;
    }

    let mainClaims = await GetUnVerifiedClaims(mainToken);
    if (!mainClaims) {
      let error = new Error("Invalid main token");
      error.errcode = "INVALID_TOKEN";
      throw error;
    }

    let refreshClaims = await GetUnVerifiedClaims(refreshToken);
    if (!refreshClaims) {
      let error = new Error("Invalid refresh token");
      error.errcode = "INVALID_TOKEN";
      throw error;
    }

    if (!mainClaims.userid) {
      let error = new Error("User ID is missing in main token");
      error.errcode = "INVALID_TOKEN";
      throw error;
    }

    if (!refreshClaims.userid) {
      let error = new Error("User ID is missing in refresh token");
      error.errcode = "INVALID_TOKEN";
      throw error;
    }

    if (mainClaims.userid !== refreshClaims.userid) {
      let error = new Error(
        "Token userid and refresh token userid do not match"
      );
      error.errcode = "INVALID_TOKEN";
      throw error;
    }

    let user = await this.userSvcI.GetUserDetails(mainClaims.userid);
    if (!user) {
      let error = new Error("User not found");
      error.errcode = "USER_NOT_ACTIVE";
      throw error;
    }

    if (!user.isenabled || user.isdeleted) {
      let error = new Error("User is not active");
      error.errcode = "USER_NOT_ACTIVE";
      throw error;
    }

    let validity = 1 * 24 * 60 * 60;
    if (mainClaims.userid === "3e086a85-e93a-4ed8-bee0-b33e6e8718ce") {
      validity = 10;
    }
    let tokenclaims = {
      claims: {
        userid: mainClaims.userid,
      },
      validity: validity,
    };

    if (mainClaims.accountid) {
      let accounts = await this.fmsSvcI.GetUserAccounts(mainClaims.userid);
      let hasAccess =
        accounts &&
        accounts.some((account) => account.accountid === mainClaims.accountid);

      if (!hasAccess) {
        let error = new Error("User does not have access to this account");
        error.errcode = "USER_DOES_NOT_HAVE_ACCESS_TO_ACCOUNT";
        throw error;
      }
      tokenclaims.claims.accountid = mainClaims.accountid;
    }

    let newtoken = await this.authSvcI.GetToken(mainClaims.userid, tokenclaims);

    if (!newtoken) {
      throw new Error("Failed to refresh token");
    }

    return {
      userid: mainClaims.userid,
      token: newtoken.token,
      refreshtoken: newtoken.refreshtoken,
    };
  };

  UpdatePasswordLogic = async (userid, oldPassword, newPassword) => {
    try {
      if (oldPassword === newPassword) {
        const error = new Error(
          "New password cannot be the same as the old password"
        );
        error.errcode = "SAME_PASSWORD_ERROR";
        error.errdata = { oldpassword: oldPassword, newpassword: newPassword };
        throw error;
      }

      let user = await this.userSvcI.GetUserDetails(userid);
      if (!user) {
        throw new Error("User not found");
      }

      if (!user.isenabled) {
        throw new Error("User is not enabled");
      }

      if (user.isdeleted) {
        throw new Error("User is deleted");
      }

      if (!user.email) {
        throw new Error("User does not have an email address");
      }

      let useridpass = await this.userSvcI.GetUserIdPassByEmail(user.email);
      if (!useridpass) {
        const error = new Error("Invalid old password");
        error.errcode = "INVALID_OLD_PASSWORD";
        error.errdata = { userid: userid };
        throw error;
      }

      let isPasswordValid = await ComparePassword(
        oldPassword,
        useridpass.password
      );
      if (!isPasswordValid) {
        const error = new Error("Invalid old password");
        error.errcode = "INVALID_OLD_PASSWORD";
        error.errdata = { userid: userid };
        throw error;
      }

      const encryptedNewPassword = await EncryptPassword(newPassword);

      await this.userSvcI.UpdatePasswordWithExpiry(
        userid,
        encryptedNewPassword
      );

      let logoutresult = await this.authSvcI.InvalidateToken(userid);
      if (!logoutresult) {
        this.logger.warn(
          "Failed to invalidate existing tokens for user: " + userid
        );
      }

      return {
        message: "Password has been updated successfully",
        userid: userid,
      };
    } catch (err) {
      throw err;
    }
  };
}
