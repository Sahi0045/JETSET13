// Lazy loader for the cruise lines dataset. The JSON is ~24KB and is consumed
// by several cruise-flow components; importing it statically would bake it into
// the cruise bundle even for visitors who never reach those views.
// loadCruiseLines() returns a cached Promise so all consumers share one fetch.

let cachedPromise = null;

export const loadCruiseLines = () => {
  if (!cachedPromise) {
    cachedPromise = import('./cruiselines.json').then(mod => mod.default);
  }
  return cachedPromise;
};
