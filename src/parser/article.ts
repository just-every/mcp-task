import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { Article } from '../types.js';

export function extractArticle(dom: JSDOM): Article | null {
  const document = dom.window.document;
  
  // Check if this looks like an article page
  const hasArticleIndicators = 
    document.querySelector('article') !== null ||
    document.querySelector('[itemtype*="Article"]') !== null ||
    document.querySelector('meta[property="article:published_time"]') !== null ||
    document.querySelector('.post-content, .entry-content, .article-content') !== null;
  
  // Only use Readability for actual article pages
  if (hasArticleIndicators) {
    // Clone document to avoid modifying the original
    const documentClone = document.cloneNode(true) as Document;
    
    // Try Readability
    const reader = new Readability(documentClone);
    const article = reader.parse();
    
    // If Readability returns content, check if it's substantial
    if (article && article.content && article.content.trim().length > 100) {
      return article;
    }
  }
  
  // For non-article pages or when Readability fails, extract content manually
  return extractContentManually(dom);
}

function extractContentManually(dom: JSDOM): Article | null {
  const document = dom.window.document;
  
  // Get title
  const title = document.querySelector('title')?.textContent || 
                document.querySelector('h1')?.textContent || 
                document.querySelector('meta[property="og:title"]')?.getAttribute('content') || 
                '';
  
  // Get author/byline
  const byline = document.querySelector('meta[name="author"]')?.getAttribute('content') || 
                 document.querySelector('[rel="author"]')?.textContent || 
                 null;
  
  // Remove script and style elements
  const contentClone = document.body.cloneNode(true) as HTMLElement;
  contentClone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
  
  // Remove only the most obvious non-content elements
  const selectorsToRemove = [
    'script', 'style', 'noscript',
    '.cookie-banner', '.cookie-notice', '#cookie-banner',
    '.advertisement', '.ads', '.ad-container',
    '[aria-hidden="true"]'
  ];
  
  selectorsToRemove.forEach(selector => {
    contentClone.querySelectorAll(selector).forEach(el => el.remove());
  });
  
  // Try to find main content areas - use the whole body if no specific content area
  const mainContent = contentClone.querySelector('main, article, [role="main"], #main, .main, .wrapper, .container') || contentClone;
  
  // Preserve structure and links
  const content = mainContent.innerHTML;
  
  return {
    title: title.trim(),
    content,
    byline,
    excerpt: '',
    dir: null,
    lang: document.documentElement.lang || null,
    length: content.length,
    siteName: null,
    textContent: mainContent.textContent || '',
    publishedTime: null
  };
}

export function hasContent(html: string): boolean {
  // Quick check for common no-content indicators
  const lowerHtml = html.toLowerCase();
  
  if (lowerHtml.includes('<noscript>') && 
      !lowerHtml.includes('<article') && 
      !lowerHtml.includes('<main')) {
    return false;
  }
  
  // Check if there's substantial text content
  const textContent = html.replace(/<[^>]*>/g, '').trim();
  return textContent.length > 100;
}