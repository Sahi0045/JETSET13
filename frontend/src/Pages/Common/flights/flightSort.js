// Shared helpers for sorting / scoring flight results.

// "PT2H35M" -> minutes
export const parseDurationMin = (durationStr) => {
  if (!durationStr) return Number.MAX_SAFE_INTEGER;
  const h = durationStr.match(/(\d+)H/);
  const m = durationStr.match(/(\d+)M/);
  return (h ? parseInt(h[1], 10) : 0) * 60 + (m ? parseInt(m[1], 10) : 0);
};

export const priceOf = (f) =>
  typeof f?.price?.amount === 'number' ? f.price.amount : parseFloat(f?.price?.total) || Infinity;

// Min/max bounds for price and duration across a list (for normalization)
export const computeBounds = (flights = []) => {
  let minP = Infinity, maxP = -Infinity, minD = Infinity, maxD = -Infinity;
  flights.forEach((f) => {
    const p = priceOf(f);
    const d = parseDurationMin(f.duration);
    if (p < minP) minP = p;
    if (p > maxP) maxP = p;
    if (d < minD) minD = d;
    if (d > maxD) maxD = d;
  });
  return { minP, maxP, minD, maxD };
};

// Lower score = better "recommended" pick. Balances price, duration and stops —
// the same trade-off MakeMyTrip's "You may prefer" tab surfaces.
export const recommendScore = (f, b) => {
  const p = priceOf(f);
  const d = parseDurationMin(f.duration);
  const pn = b.maxP > b.minP ? (p - b.minP) / (b.maxP - b.minP) : 0;
  const dn = b.maxD > b.minD ? (d - b.minD) / (b.maxD - b.minD) : 0;
  const sn = Math.min(f.stops || 0, 3) / 3;
  return pn * 0.5 + dn * 0.35 + sn * 0.15;
};
