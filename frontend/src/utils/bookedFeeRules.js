export const bookedFeeRulesStaleTime = (query) => (query.state.data ? 30 * 60 * 1000 : 0);
