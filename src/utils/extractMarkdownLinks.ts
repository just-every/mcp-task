/**
 * Extract all HTTP/HTTPS links from markdown content
 * @param markdown The markdown content to extract links from
 * @param baseUrl The base URL to resolve relative links against
 * @returns Array of absolute URLs found in the markdown
 */
export function extractMarkdownLinks(markdown: string, baseUrl: string): string[] {
    const links: string[] = [];
    
    // Match markdown links: [text](url)
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    
    // Match bare URLs
    const bareUrlRegex = /https?:\/\/[^\s<>)\]]+/g;
    
    // Extract markdown links
    let match;
    while ((match = markdownLinkRegex.exec(markdown)) !== null) {
        const url = match[2];
        if (url && !url.startsWith('#') && !url.startsWith('mailto:') && !url.startsWith('tel:')) {
            links.push(url);
        }
    }
    
    // Extract bare URLs
    while ((match = bareUrlRegex.exec(markdown)) !== null) {
        links.push(match[0]);
    }
    
    // Convert relative URLs to absolute
    const absoluteLinks = links.map(link => {
        try {
            // If it's already absolute, return as-is
            if (link.startsWith('http://') || link.startsWith('https://')) {
                return link;
            }
            // Otherwise, resolve relative to base URL
            return new URL(link, baseUrl).href;
        } catch {
            // If URL parsing fails, skip this link
            return null;
        }
    }).filter(Boolean) as string[];
    
    // Remove duplicates and return
    return [...new Set(absoluteLinks)];
}

/**
 * Filter links to only include those from the same origin
 * @param links Array of URLs to filter
 * @param baseUrl The base URL to compare against
 * @returns Filtered array of URLs from the same origin
 */
export function filterSameOriginLinks(links: string[], baseUrl: string): string[] {
    try {
        const baseOrigin = new URL(baseUrl).origin;
        return links.filter(link => {
            try {
                return new URL(link).origin === baseOrigin;
            } catch {
                return false;
            }
        });
    } catch {
        return [];
    }
}