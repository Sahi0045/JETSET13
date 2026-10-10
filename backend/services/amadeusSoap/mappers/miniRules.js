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

// amount and currency are both optional in TMRXRR, and Number('') is 0: a
// detail missing either is not a figure, never a fee of nothing.
const amountsOf = (group) => arr(group?.mnrMonInfoGrp)
  .flatMap((holder) => arr(holder?.monetaryInfo))
  .flatMap((info) => arr(info?.monetaryDetails))
  .map((detail) => ({ qualifier: text(detail?.typeQualifier), amount: text(detail?.amount), currency: text(detail?.currency) }))
  .filter((entry) => entry.qualifier && entry.amount && entry.currency && Number.isFinite(Number(entry.amount)))
  .map((entry) => ({ ...entry, amount: Number(entry.amount) }));

const componentRefs = (holders, path) => new Set(arr(holders)
  .flatMap((holder) => arr(path(holder)))
  .flatMap((ref) => arr(ref?.referenceDetails))
  .filter((detail) => text(detail?.type) === 'FC')
  .map((detail) => text(detail?.value)));

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
    for (const name of Object.keys(SITUATIONS)) cells[kind][name] = { allowed: null, amounts: new Map(), unpriced: false };
  }
  const components = componentRefs(adult.fareComponentInfo, (info) => info?.fareComponentRef);
  const covered = { change: new Set(), refund: new Set() };
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
    const groupComponents = componentRefs(group?.mnrFCInfoGrp, (holder) => holder?.refInfo);
    for (const component of groupComponents.size > 0 ? groupComponents : components) covered[kind].add(component);
    const flags = flagsOf(group);
    const amounts = amountsOf(group);
    for (const [name, prefix] of Object.entries(SITUATIONS)) {
      const cell = cells[kind][name];
      const flag = flags.get(`${prefix}A`);
      if (flag === '0') cell.allowed = false;
      else if (flag === '1' && cell.allowed !== false) cell.allowed = true;
      const figures = amounts.filter((a) => a.qualifier.startsWith(prefix));
      // A component without its own figure would otherwise take another
      // component's: a 0 filed on one leg read as "No airline fee" for the trip.
      if (figures.length === 0) cell.unpriced = true;
      for (const entry of figures) {
        cell.amounts.set(`${entry.currency} ${entry.amount}`, entry.amount);
        currency = currency ?? entry.currency;
      }
    }
  }

  const finish = (kind) => Object.fromEntries(Object.entries(cells[kind]).map(([name, cell]) => {
    // A fare component with no rule for this kind says nothing about it, so
    // only a refusal elsewhere is still certain.
    const isPartial = [...components].some((component) => !covered[kind].has(component));
    if (isPartial && cell.allowed !== false) return [name, { allowed: null, amount: null, varies: false }];
    return [name, {
      allowed: cell.allowed,
      amount: cell.amounts.size === 1 && !cell.unpriced ? [...cell.amounts.values()][0] : null,
      varies: cell.amounts.size > 1,
    }];
  }));

  const change = finish('change');
  const refund = finish('refund');
  const isSilent = [...Object.values(change), ...Object.values(refund)].every((cell) => cell.allowed === null);
  return isSilent ? null : { currency, bookBy, change, refund };
}
