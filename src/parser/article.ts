import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { Article } from '../types.js';

export function extractArticle(dom: JSDOM): Article | null {
  const document = dom.window.document;
  
  // Clone document to avoid modifying the original
  const documentClone = document.cloneNode(true) as Document;
  
  const reader = new Readability(documentClone);
  const article = reader.parse();
  
  
  return article;
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