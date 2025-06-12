import { CrawlQueue } from '../crawler/queue.js';
import { CrawlOptions } from '../types.js';

export interface FetchMarkdownOptions {
    depth?: number;
    maxConcurrency?: number;
    respectRobots?: boolean;
    sameOriginOnly?: boolean;
    userAgent?: string;
    cacheDir?: string;
    timeout?: number;
}

export interface FetchMarkdownResult {
    markdown: string;
    title?: string;
    links?: string[];
    error?: string;
}

export async function fetchMarkdown(
    url: string,
    options: FetchMarkdownOptions = {}
): Promise<FetchMarkdownResult> {
    try {
        const crawlOptions: CrawlOptions = {
            depth: options.depth ?? 0,
            maxConcurrency: options.maxConcurrency ?? 3,
            respectRobots: options.respectRobots ?? true,
            sameOriginOnly: options.sameOriginOnly ?? true,
            userAgent: options.userAgent,
            cacheDir: options.cacheDir ?? '.cache',
            timeout: options.timeout ?? 30000,
        };

        const queue = new CrawlQueue(crawlOptions);
        await queue.init();

        const results = await queue.crawl(url);

        // Return the first result (main page)
        const mainResult = results[0];

        if (!mainResult) {
            return {
                markdown: '',
                error: 'No results returned',
            };
        }

        return {
            markdown: mainResult.markdown,
            title: mainResult.title,
            links: mainResult.links,
            error: mainResult.error,
        };
    } catch (error) {
        return {
            markdown: '',
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
