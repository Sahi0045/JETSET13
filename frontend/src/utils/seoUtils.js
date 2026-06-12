/**
 * SEO Utility Functions
 * Helper functions for SEO optimization
 */

/**
 * Generate SEO-friendly URL slug
 * @param {string} text - Text to convert to slug
 * @returns {string} - URL-friendly slug
 */
export const generateSlug = (text) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

/**
 * Truncate text for meta descriptions
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length (default: 160)
 * @returns {string} - Truncated text
 */
export const truncateDescription = (text, maxLength = 160) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3).trim() + '...';
};

/**
 * Generate dynamic page title
 * @param {string} pageTitle - Page-specific title
 * @param {boolean} includeSiteName - Include site name (default: true)
 * @returns {string} - Complete page title
 */
export const generatePageTitle = (pageTitle, includeSiteName = true) => {
  const siteName = 'Jetsetters';
  return includeSiteName ? `${pageTitle} | ${siteName}` : pageTitle;
};

/**
 * Format price for display and SEO
 * @param {number} price - Price amount
 * @param {string} currency - Currency code (default: 'USD')
 * @returns {string} - Formatted price
 */
export const formatPrice = (price, currency = 'USD') => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
  return formatter.format(price);
};

/**
 * Generate keywords from text
 * @param {string} text - Text to extract keywords from
 * @param {number} maxKeywords - Maximum number of keywords (default: 10)
 * @returns {string} - Comma-separated keywords
 */
export const generateKeywords = (text, maxKeywords = 10) => {
  // Remove common words
  const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'];
  
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3 && !commonWords.includes(word));
  
  // Count word frequency
  const wordCount = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });
  
  // Sort by frequency and take top keywords
  const keywords = Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
  
  return keywords.join(', ');
};

/**
 * Generate Open Graph image URL
 * @param {string} imagePath - Relative image path
 * @returns {string} - Full image URL
 */
export const generateOGImageURL = (imagePath) => {
  const baseURL = 'https://www.jetsetterss.com';
  return imagePath.startsWith('http') ? imagePath : `${baseURL}${imagePath}`;
};

/**
 * Get current page URL
 * @returns {string} - Current page URL
 */
export const getCurrentURL = () => {
  if (typeof window !== 'undefined') {
    return window.location.href;
  }
  return 'https://www.jetsetterss.com';
};

/**
 * Get canonical URL for current page
 * @param {string} path - Page path
 * @returns {string} - Canonical URL
 */
export const getCanonicalURL = (path) => {
  const baseURL = 'https://www.jetsetterss.com';
  return `${baseURL}${path}`;
};

/**
 * Generate breadcrumb items from path
 * @param {string} pathname - Current pathname
 * @returns {Array} - Breadcrumb items
 */
export const generateBreadcrumbs = (pathname) => {
  const paths = pathname.split('/').filter(Boolean);
  const breadcrumbs = [{ name: 'Home', path: '/' }];
  
  let currentPath = '';
  paths.forEach((path, index) => {
    currentPath += `/${path}`;
    const name = path
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    breadcrumbs.push({ name, path: currentPath });
  });
  
  return breadcrumbs;
};

/**
 * Check if page should be indexed
 * @param {string} pathname - Current pathname
 * @returns {boolean} - Whether page should be indexed
 */
export const shouldIndexPage = (pathname) => {
  const noIndexPaths = [
    '/login',
    '/signup',
    '/dashboard',
    '/profile',
    '/my-trips',
    '/manage-booking',
    '/admin',
    '/auth',
    '/payment',
    '/checkout'
  ];
  
  return !noIndexPaths.some(path => pathname.startsWith(path));
};

/**
 * Generate meta description from content
 * @param {string} content - Page content
 * @param {number} maxLength - Maximum length (default: 160)
 * @returns {string} - Meta description
 */
export const generateMetaDescription = (content, maxLength = 160) => {
  // Remove HTML tags
  const text = content.replace(/<[^>]*>/g, '');
  // Remove extra whitespace
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return truncateDescription(cleaned, maxLength);
};

/**
 * Format date for SEO
 * @param {Date|string} date - Date to format
 * @returns {string} - ISO formatted date
 */
export const formatDateForSEO = (date) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toISOString();
};

/**
 * Generate social sharing URLs
 * @param {string} url - URL to share
 * @param {string} title - Title to share
 * @returns {Object} - Social sharing URLs
 */
export const generateSocialShareURLs = (url, title) => {
  const encodedURL = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedURL}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodedURL}&text=${encodedTitle}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedURL}`,
    whatsapp: `https://wa.me/?text=${encodedTitle}%20${encodedURL}`,
    email: `mailto:?subject=${encodedTitle}&body=${encodedURL}`
  };
};

/**
 * Preload critical images
 * @param {Array<string>} imageURLs - Array of image URLs to preload
 */
export const preloadImages = (imageURLs) => {
  if (typeof window !== 'undefined') {
    imageURLs.forEach(url => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = url;
      document.head.appendChild(link);
    });
  }
};

/**
 * Add structured data to page
 * @param {Object} structuredData - JSON-LD structured data
 */
export const addStructuredData = (structuredData) => {
  if (typeof window !== 'undefined') {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(structuredData);
    document.head.appendChild(script);
    
    return () => {
      document.head.removeChild(script);
    };
  }
};

/**
 * Get page load time for performance tracking
 * @returns {number} - Page load time in milliseconds
 */
export const getPageLoadTime = () => {
  if (typeof window !== 'undefined' && window.performance) {
    const perfData = window.performance.timing;
    return perfData.loadEventEnd - perfData.navigationStart;
  }
  return 0;
};

/**
 * Track page view for analytics
 * @param {string} pagePath - Page path
 * @param {string} pageTitle - Page title
 */
export const trackPageView = (pagePath, pageTitle) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('config', 'GA_MEASUREMENT_ID', {
      page_path: pagePath,
      page_title: pageTitle
    });
  }
};
