export const bookingHandoffState = (flight, searchData, fareCheck = null) => ({
  flightData: flight,
  searchData,
  // The fare check BOOK just made, which the review page takes instead of
  // pricing the same offer again (utils/fareCheckHandoff.js).
  ...(fareCheck ? { fareCheck } : {}),
  // Identifies THIS booking attempt, so a half-typed traveller draft
  // cannot be restored into a different one. A refresh keeps it (React
  // Router holds state in history.state); a new BOOK click makes a new
  // one. See utils/flightTravellerDraft.js.
  attemptId: (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
});
