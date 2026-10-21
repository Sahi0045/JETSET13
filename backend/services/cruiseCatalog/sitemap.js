const SITE = 'https://www.jetsetterss.com';

const escapeXml = (value) => String(value).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

export const renderSailingSitemap = (sailings) => [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...sailings.map((s) => `  <url><loc>${escapeXml(`${SITE}/cruise/${s.slug}`)}</loc>${s.updated_at ? `<lastmod>${String(s.updated_at).slice(0, 10)}</lastmod>` : ''}</url>`),
  '</urlset>',
  '',
].join('\n');
