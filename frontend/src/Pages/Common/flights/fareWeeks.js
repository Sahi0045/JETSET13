import apiConfig from '@/config/api';

// The server prices up to 10 dates per request and samples a longer list, so a
// month asked for at once came back with every third day priced. Both calendars
// cut a month into the same weeks, so the server's cache of one fills the other.
export const DAYS_PER_REQUEST = 7;

export const fareWeeks = (dates) => {
  const weeks = [];
  for (let i = 0; i < dates.length; i += DAYS_PER_REQUEST) weeks.push(dates.slice(i, i + DAYS_PER_REQUEST));
  return weeks;
};

export const monthDatesFrom = (year, month, firstIso) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dates = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (date >= firstIso) dates.push(date);
  }
  return dates;
};

export async function priceFareWeeks({ weeks, search, signal, onWeek }) {
  for (const dates of weeks) {
    if (signal.aborted) return;
    let found = {};
    let currency;
    try {
      const response = await fetch(apiConfig.endpoints.flights.datePrices, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...search, dates }),
        signal,
      });
      const data = await response.json();
      found = Object.fromEntries(Object.entries(data?.dateWisePrices || {})
        .filter(([date, amount]) => dates.includes(date) && Number(amount) > 0)
        .map(([date, amount]) => [date, Number(amount)]));
      currency = data?.currency;
    } catch {
      found = {};
    }
    if (signal.aborted) return;
    onWeek(dates, found, currency);
  }
}
