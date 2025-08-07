import axios from 'axios';
import config from "../config/config.js"; //used for request and verify otp


// const INFOBIP_API_URL = 'https://pkjxl.api.infobip.com/sms/1/text/single';
// const INFOBIP_AUTH_TOKEN = '4249dafe5661706783b2b2793e1c086e-e4ec9854-611c-49e1-814d-8aefff8671fe';
// const PRINCIPAL_ENTITY_ID = '1101484100000027422';
// const CONTENT_TEMPLATE_ID = '1107165518685429470';

// export const SendSms = async (mobile, message) => {
//     try {
//         const response = await axios.post(INFOBIP_API_URL, {
//             to: `+91${mobile}`,
//             text: message,
//             regional: {
//                 indiaDlt: {
//                     principalEntityId: PRINCIPAL_ENTITY_ID,
//                     contentTemplateId: CONTENT_TEMPLATE_ID
//                 }
//             }
//         }, {
//             headers: {
//                 'Authorization': `App ${INFOBIP_AUTH_TOKEN}`,
//                 'Content-Type': 'application/json'
//             }
//         });
//         return response.data;
//     } catch (error) {
//         throw new Error(`Failed to send SMS: ${error.message}`);
//     }
// };

// TODO: uncomment this after testing is done for mobile otp verification through fms-otp-svc
export const SendSms = async (mobile, message) => {
    try {
        const requestotpUrl = `${config.mobileotpsvc.rooturl}${config.mobileotpsvc.requestotppath}`;
        const requestotpHeaders = {
          "Content-Type": "application/json"
        };
        const requestotpBody = {
          mobilenumber: mobile,
          info: {message: message}
        };

        let requestotpres;
        try {
          requestotpres = await axios.post(requestotpUrl, requestotpBody, { headers: requestotpHeaders });
        } catch (err) {
          throw new Error("OTP request failed");
        }
        if (
          !requestotpres.data ||
          requestotpres.data.err !== null ||
          requestotpres.data.msg !== "OTP request sent successfully"
        ) {
          throw new Error("OTP request failed");
        }
        return requestotpres.data;
    } catch (error) {
        throw new Error(`Failed to send SMS: ${error.message}`);
    }
};