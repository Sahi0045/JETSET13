const NUMBER = String.raw`(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
const MONEY = new RegExp(
  String.raw`(?:(?<![A-Za-z])(?:US\$|USD|INR|Rs\.?)|\$|₹|€|£)\s?${NUMBER}|${NUMBER}\s?(?:USD|INR|dollars?|rupees?|euros?)\b`,
  'gi',
);

const cents = (value) => Math.round(Number(String(value).replace(/,/g, '')) * 100);

export function moneyAmounts(text) {
  return [...String(text ?? '').matchAll(MONEY)]
    .map((match) => Number((match[1] ?? match[2]).replace(/,/g, '')))
    .filter(Number.isFinite);
}

export function allowedAmounts({ cards = [], context = {}, customerTexts = [] } = {}) {
  const allowed = new Set();
  const add = (value) => {
    const amount = cents(value);
    if (Number.isFinite(amount)) allowed.add(amount);
  };
  cards.forEach((card) => {
    add(card?.price?.total);
    add(card?.price?.amount);
  });
  [...(context.bookings || []), ...(context.upcomingBookings || [])].forEach((booking) => add(booking?.totalAmount));
  (context.quotes || []).forEach((quote) => add(quote?.amount));
  customerTexts.forEach((text) => moneyAmounts(text).forEach(add));
  return allowed;
}

const isAllowed = (sentence, allowed) => moneyAmounts(sentence).every((amount) => allowed.has(cents(amount)));

export function guardPrices(text, allowed) {
  let removed = 0;
  const lines = String(text ?? '').split('\n').flatMap((line) => {
    if (isAllowed(line, allowed)) return [line];
    const before = removed;
    const kept = line.split(/(?<=[.!?])\s+(?=[A-Z"'(\[])/).filter((sentence) => {
      if (isAllowed(sentence, allowed)) return true;
      removed += 1;
      return false;
    });
    if (removed === before) {
      removed += 1;
      return [];
    }
    return kept.length ? [kept.join(' ')] : [];
  });
  return { text: lines.join('\n').trim(), removed };
}
