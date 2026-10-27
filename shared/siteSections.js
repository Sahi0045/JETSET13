/**
 * Sections of the site switched off for customers.
 *
 * Visa and document services are hidden (owner, 27 Oct 2026): no link to them
 * anywhere on the site, every customer visa page goes home, and none is in the
 * sitemap or the pre-rendered pages. The visa admin and agent panels still
 * work. To bring the section back: set this true, remove the /visa redirects
 * from vercel.json, and put the /visa document rewrites back
 * ("/(...|visa|...)" and "/visa/(documents|apply|booking|refund-policy|terms|privacy)").
 *
 * Dependency-free: the browser and the build scripts both load this file.
 */
export const VISA_SERVICES_VISIBLE = false;

/** A customer's visa page - not the visa admin or agent panels. */
export const isCustomerVisaPath = (pathname) => /^\/visa(\/|$)/.test(String(pathname || ''))
  && !/^\/visa\/(admin|agent)(\/|$)/.test(String(pathname || ''));

/** Whether a link or route to `pathname` is shown to customers. */
export const isShownToCustomers = (pathname) => VISA_SERVICES_VISIBLE || !isCustomerVisaPath(pathname);
