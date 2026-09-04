import { buildCreated, buildMessageId, buildNonce, buildPasswordDigest } from './security.js';
import { esc } from './xml.js';

/**
 * SOAP Header 4.0 envelope builder.
 *
 * Hand-rolled rather than driven by node-soap or strong-soap: every operation
 * on this WSAP requires an AMA_SecurityHostedUser header, which neither
 * library's WSSecurity implementation can emit. Building the envelope directly
 * is less code than fighting them and keeps the security header - the part that
 * actually goes wrong - readable.
 *
 * Namespaces are copied from the WSAP's own WSDL, not from documentation.
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

/**
 * Render the Session header.
 *
 * `null` omits the element entirely, which is what a stateless call must do.
 * The previous client always sent `TransactionStatusCode="Start"` with no body,
 * so every search opened a stateful session server-side and abandoned it -
 * those sessions count against the WSAP's max-simultaneous-sessions quota until
 * they expire. Omitting the header is the fix, and `session.js` asserts the
 * reply carries no session back.
 */
const renderSession = (session) => {
  if (!session) return '';

  const { status, sessionId, sequenceNumber, securityToken } = session;
  // Order is fixed by AMA_WS_Session.xsd: SessionId, SequenceNumber, SecurityToken.
  const body = sessionId
    ? `<awsse:SessionId>${esc(sessionId)}</awsse:SessionId>`
      + `<awsse:SequenceNumber>${esc(sequenceNumber)}</awsse:SequenceNumber>`
      + `<awsse:SecurityToken>${esc(securityToken)}</awsse:SecurityToken>`
    : '';

  return `    <awsse:Session TransactionStatusCode="${esc(status)}">${body}</awsse:Session>\n`;
};

/**
 * @param {object} args
 * @param {string} args.action   SOAPAction, e.g. .../FMPTBQ_24_6_1A
 * @param {string} args.bodyXml  the operation element, already namespaced
 * @param {object} args.config   from config.js
 * @param {?object} args.session null for stateless; {status,…} for a chain
 * @param {Date}   [args.now]    injectable for deterministic tests
 */
export const buildEnvelope = ({ action, bodyXml, config, session = null, now = new Date() }) => {
  // A continuation authenticates with the SecurityToken Amadeus issued in the
  // Session header, and that is the ONLY credential it will accept: sending the
  // UsernameToken again - or the hosted-user header - is rejected outright with
  // "12|Presentation|soap message header incorrect", which names neither header
  // nor reason. Every stateful call after the first, sign-out included, must
  // therefore carry the session and nothing else.
  const isContinuation = Boolean(session?.sessionId);

  const security = isContinuation ? '' : renderSecurity(config, now);

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="${NS.soap}" xmlns:add="${NS.add}" xmlns:awsse="${NS.awsse}" xmlns:amasec="${NS.amasec}" xmlns:awsl="${NS.awsl}" xmlns:wsse="${NS.wsse}" xmlns:wsu="${NS.wsu}">
  <soap:Header>
    <add:MessageID>${buildMessageId()}</add:MessageID>
    <add:Action>${esc(action)}</add:Action>
    <add:To>${esc(config.endpoint)}</add:To>
    <awsl:TransactionFlowLink/>
${renderSession(session)}${security}  </soap:Header>
  <soap:Body>
${bodyXml}
  </soap:Body>
</soap:Envelope>`;
};

/** WS-Security UsernameToken plus the hosted-user header, for an authenticating call. */
const renderSecurity = (config, now) => {
  const nonce = buildNonce();
  const created = buildCreated(now);
  const digest = buildPasswordDigest(config.password, nonce, created);

  return `    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${esc(config.username)}</wsse:Username>
        <wsse:Nonce EncodingType="${BASE64_ENCODING}">${nonce.toString('base64')}</wsse:Nonce>
        <wsse:Password Type="${PASSWORD_DIGEST}">${digest}</wsse:Password>
        <wsu:Created>${created}</wsu:Created>
      </wsse:UsernameToken>
    </wsse:Security>
    <amasec:AMA_SecurityHostedUser>
      <amasec:UserID POS_Type="1" PseudoCityCode="${esc(config.officeId)}" AgentDutyCode="${esc(config.dutyCode)}" RequestorType="${esc(config.requestorType)}"/>
    </amasec:AMA_SecurityHostedUser>
`;
};

export { NS };
