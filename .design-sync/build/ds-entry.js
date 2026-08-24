// Design-system entry for design-sync.
//
// The app has no library build (private package, no exports field), so this
// barrel is the explicit component surface synced to claude.ai/design. Every
// component below is re-exported from its real source file — nothing here
// reimplements anything.

// UI primitives
export { default as Button } from '../../frontend/src/Components/UI/Button.jsx';
export { default as Card } from '../../frontend/src/Components/UI/Card.jsx';
export { CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../frontend/src/Components/UI/Card.jsx';
export { default as Input } from '../../frontend/src/Components/UI/Input.jsx';

// Feedback
export { default as LoadingSpinner } from '../../frontend/src/Components/LoadingSpinner.jsx';
export { default as ScrollFlightProgress } from '../../frontend/src/Components/ScrollFlightProgress.jsx';

// Navigation
export { default as Breadcrumbs } from '../../frontend/src/Components/Breadcrumbs.jsx';
export { default as ServiceTabs } from '../../frontend/src/Components/ServiceTabs.jsx';

// Marketing
export { default as ContactBanner } from '../../frontend/src/components/ContactBanner.jsx';
export { default as FullPageBanner } from '../../frontend/src/components/FullPageBanner.jsx';

// Commerce
export { default as Price } from '../../frontend/src/Components/Price.jsx';
export { default as CurrencySelector } from '../../frontend/src/Components/CurrencySelector.jsx';

// Preview-only: several components call react-router hooks, which throw
// outside a Router. cfg.provider wraps every preview card in this.
export { MemoryRouter } from 'react-router-dom';
