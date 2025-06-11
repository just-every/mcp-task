import { JSDOM } from 'jsdom';

export function htmlToDom(html: string, url: string): JSDOM {
  return new JSDOM(html, {
    url,
    contentType: 'text/html',
    includeNodeLocations: false,
    runScripts: 'outside-only',
    resources: 'usable',
    pretendToBeVisual: true
  });
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