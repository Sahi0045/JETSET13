const arr = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);
const text = (value) => (value == null ? '' : String(value?._ ?? value).trim());

const KINDS = { 31: 'change', 33: 'refund' };
const SITUATIONS = { before: 'BD', noShowBefore: 'BN', after: 'AD', noShowAfter: 'AN' };
const MONTHS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

const isoDate = (ddmmmyy) => {
  const match = /^(\d{2})([A-Z]{3})(\d{2})$/.exec(text(ddmmmyy).toUpperCase());
  return match && MONTHS[match[2]] ? `20${match[3]}-${MONTHS[match[2]]}-${match[1]}` : null;
};

const flagsOf = (group) => new Map(arr(group?.mnrRestriAppInfoGrp)
  .flatMap((holder) => arr(holder?.mnrRestriAppInfo))
  .flatMap((info) => arr(info?.statusInformation))
  .map((status) => [text(status?.indicator), text(status?.action)])
  .filter(([code]) => code));

const amountsOf = (group) => arr(group?.mnrMonInfoGrp)
  .flatMap((holder) => arr(holder?.monetaryInfo))
  .flatMap((info) => arr(info?.monetaryDetails))
  .map((detail) => ({ qualifier: text(detail?.typeQualifier), amount: Number(text(detail?.amount)), currency: text(detail?.currency) || null }))
  .filter((entry) => entry.qualifier && Number.isFinite(entry.amount));

const lastDayOf = (group) => arr(group?.mnrDateInfoGrp)
  .flatMap((holder) => arr(holder?.dateInfo))
  .flatMap((info) => arr(info?.dateAndTimeDetails))
  .find((detail) => text(detail?.qualifier) === 'LTD');

/**
 * The airline's cancel and change-date rules by situation, from
 * MiniRule_GetFromRec. Only the adult's pricing record is read: a child's or
 * infant's fees differ and a mixed table would match nobody.
 *
 * A figure is kept only when every monetary variant for a situation, across
 * every fare component, agrees: what each qualifier letter after the
 * situation means is not in the schema, so disagreeing variants are shown as
 * "fee applies" rather than one of them guessed.
 */
export function mapMiniRules(reply) {
  const records = arr(reply?.mnrByPricingRecord);
  const isAdult = (record) => arr(record?.paxRef?.passengerReference).some((ref) => text(ref?.type) === 'PA');
  const adult = records.find(isAdult);
  if (!adult) return null;

  const cells = { change: {}, refund: {} };
  for (const kind of Object.keys(cells)) {
    for (const name of Object.keys(SITUATIONS)) cells[kind][name] = { allowed: null, amounts: new Set() };
  }
  let currency = null;
  let bookBy = null;

  for (const group of arr(adult.mnrRulesInfoGrp)) {
    const number = text(group?.mnrCatInfo?.descriptionInfo?.number);
    if (number === '5') {
      bookBy = bookBy ?? isoDate(lastDayOf(group)?.date);
      continue;
    }
    const kind = KINDS[number];
    if (!kind) continue;
    const flags = flagsOf(group);
    const amounts = amountsOf(group);
    for (const [name, prefix] of Object.entries(SITUATIONS)) {
      const cell = cells[kind][name];
      const flag = flags.get(`${prefix}A`);
      if (flag === '0') cell.allowed = false;
      else if (flag === '1' && cell.allowed !== false) cell.allowed = true;
      for (const entry of amounts.filter((a) => a.qualifier.startsWith(prefix))) {
        cell.amounts.add(entry.amount);
        currency = currency ?? entry.currency;
      }
    }
  }

  const finish = (situations) => Object.fromEntries(Object.entries(situations).map(([name, cell]) => [name, {
    allowed: cell.allowed,
    amount: cell.amounts.size === 1 ? [...cell.amounts][0] : null,
    varies: cell.amounts.size > 1,
  }]));

  return { currency, bookBy, change: finish(cells.change), refund: finish(cells.refund) };
}
