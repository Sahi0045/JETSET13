import axios from 'axios';
import {
  buildCreated,
  buildMessageId,
  buildNonce,
  buildPasswordDigest,
} from './security.js';

/**
 * Transport for Amadeus Enterprise Web Services (SOAP Header 4.0).
 *
 * Deliberately hand-rolled rather than driven by node-soap or strong-soap:
 * every operation on this WSAP requires an `AMA_SecurityHostedUser` header,
 * which neither library's WSSecurity implementation can emit. Building the
 * envelope directly is less code than fighting them, and keeps the security
 * header - the part that actually goes wrong - readable.
 *
 * Namespaces below are taken from the WSAP's own WSDL, not from documentation.
 */

const NS = Object.freeze({
  soap: 'http://schemas.xmlsoap.org/soap/envelope/',
  add: 'http://www.w3.org/2005/08/addressing',
  awsse: 'http://xml.amadeus.com/2010/06/Session_v3',
  amasec: 'http://xml.amadeus.com/2010/06/Security_v1',
  awsl: 'http://wsdl.amadeus.com/2010/06/ws/Link_v1',
  wsse: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd',
  wsu: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd',
});

const BASE64_ENCODING = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary';
const PASSWORD_DIGEST = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest';

export const readConfig = (env = process.env) => {
  const config = {
    endpoint: env.AMADEUS_WS_ENDPOINT,
    username: env.AMADEUS_WS_USERNAME,
    password: env.AMADEUS_WS_PASSWORD,
    officeId: env.AMADEUS_WS_OFFICE_ID,
    dutyCode: env.AMADEUS_WS_DUTY_CODE || 'SU',
    requestorType: env.AMADEUS_WS_REQUESTOR_TYPE || 'U',
  };

  const missing = ['endpoint', 'username', 'password', 'officeId']
    .filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Amadeus SOAP config missing: ${missing.map((k) => `AMADEUS_WS_${k.toUpperCase()}`).join(', ')}`);
  }

  return config;
};

export const buildEnvelope = ({ action, body, config, session = 'Start', now = new Date() }) => {
  const nonce = buildNonce();
  const created = buildCreated(now);
  const digest = buildPasswordDigest(config.password, nonce, created);

  const sessionHeader = session
    ? `    <awsse:Session TransactionStatusCode="${session}"/>\n`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="${NS.soap}" xmlns:add="${NS.add}" xmlns:awsse="${NS.awsse}" xmlns:amasec="${NS.amasec}" xmlns:awsl="${NS.awsl}" xmlns:wsse="${NS.wsse}" xmlns:wsu="${NS.wsu}">
  <soap:Header>
    <add:MessageID>${buildMessageId()}</add:MessageID>
    <add:Action>${action}</add:Action>
    <add:To>${config.endpoint}</add:To>
    <awsl:TransactionFlowLink/>
${sessionHeader}    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${config.username}</wsse:Username>
        <wsse:Nonce EncodingType="${BASE64_ENCODING}">${nonce.toString('base64')}</wsse:Nonce>
        <wsse:Password Type="${PASSWORD_DIGEST}">${digest}</wsse:Password>
        <wsu:Created>${created}</wsu:Created>
      </wsse:UsernameToken>
    </wsse:Security>
    <amasec:AMA_SecurityHostedUser>
      <amasec:UserID POS_Type="1" PseudoCityCode="${config.officeId}" AgentDutyCode="${config.dutyCode}" RequestorType="${config.requestorType}"/>
    </amasec:AMA_SecurityHostedUser>
  </soap:Header>
  <soap:Body>
${body}
  </soap:Body>
</soap:Envelope>`;
};

/** Amadeus returns faults with HTTP 500, so a non-2xx is still worth parsing. */
export const sendRequest = async ({ action, body, config = readConfig(), session, timeout = 30000 }) => {
  const envelope = buildEnvelope({ action, body, config, session });

  const response = await axios.post(config.endpoint, envelope, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: action },
    timeout,
    validateStatus: () => true,
  });

  const xml = typeof response.data === 'string' ? response.data : String(response.data);
  const fault = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/);

  return {
    status: response.status,
    xml,
    fault: fault ? fault[1].trim() : null,
    envelope,
  };
};
