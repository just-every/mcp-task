import { JSDOM } from 'jsdom';

export function htmlToDom(html: string, url: string): JSDOM {
  try {
    return new JSDOM(html, {
      url,
      contentType: 'text/html',
      includeNodeLocations: false,
      runScripts: 'outside-only',
      resources: 'usable',
      pretendToBeVisual: true
    });
  } catch (error) {
    console.error('Error parsing HTML with JSDOM, trying with minimal options:', error);
    // Try again with minimal options
    try {
      return new JSDOM(html, {
        url,
        contentType: 'text/html'
      });
    } catch (fallbackError) {
      console.error('Fallback parsing also failed:', fallbackError);
      // Return a minimal DOM with the content
      return new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`, {
        url,
        contentType: 'text/html'
      });
    }
  }
}

export function extractLinks(dom: JSDOM): string[] {
  const document = dom.window.document;
  const links: string[] = [];
  const baseUrl = dom.window.location.href;
  
  const anchorElements = document.querySelectorAll('a[href]');
  
  anchorElements.forEach((element) => {
    try {
      const href = element.getAttribute('href');
      if (!href) return;
      
      // Skip non-http links
      if (href.startsWith('mailto:') || 
          href.startsWith('tel:') || 
          href.startsWith('javascript:') ||
          href.startsWith('#')) {
        return;
      }
      
      // Resolve relative URLs
      const absoluteUrl = new URL(href, baseUrl).href;
      links.push(absoluteUrl);
    } catch {
      // Invalid URL, skip
    }
  });
  
  return [...new Set(links)]; // Remove duplicates
}