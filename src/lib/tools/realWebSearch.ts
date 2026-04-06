const DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html/";
const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_MAX_SCRAPED_PAGES = 3;
const DEFAULT_PAGE_TEXT_LIMIT = 4000;
const DEFAULT_TIMEOUT_MS = 15000;

export type SearchHit = {
	title: string;
	url: string;
	snippet: string;
	content?: string;
};

export type WebResearchResult = {
	query: string;
	results: SearchHit[];
};

type PuppeteerModule = {
	default: {
		launch: (options?: {
			headless?: boolean | "shell";
			args?: string[];
		}) => Promise<{
			newPage: () => Promise<{
				setUserAgent: (userAgent: string) => Promise<void>;
				goto: (
					url: string,
					options?: {
						waitUntil?: "domcontentloaded" | "load" | "networkidle0" | "networkidle2";
						timeout?: number;
					}
				) => Promise<void>;
				evaluate: <T>(pageFunction: () => T | Promise<T>) => Promise<T>;
				close: () => Promise<void>;
			}>;
			close: () => Promise<void>;
		}>;
	};
};

function decodeHtmlEntities(value: string) {
	return value
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&#x2F;/g, "/");
}

function stripHtml(value: string) {
	return decodeHtmlEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function getUserAgent() {
	return [
		"Mozilla/5.0",
		"(Macintosh; Intel Mac OS X 10_15_7)",
		"AppleWebKit/537.36",
		"(KHTML, like Gecko)",
		"Chrome/124.0.0.0",
		"Safari/537.36",
	].join(" ");
}

function extractDuckDuckGoResults(html: string, maxResults: number): SearchHit[] {
	const results: SearchHit[] = [];
	const blocks = html.split(/<div[^>]*class="[^"]*result[^"]*"[^>]*>/i);

	for (const block of blocks) {
		if (results.length >= maxResults) {
			break;
		}

		const titleMatch = block.match(
			/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
		);
		if (!titleMatch) {
			continue;
		}

		const snippetMatch =
			block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ??
			block.match(/<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

		results.push({
			url: decodeHtmlEntities(titleMatch[1]),
			title: stripHtml(titleMatch[2]),
			snippet: snippetMatch ? stripHtml(snippetMatch[1]) : "",
		});
	}

	return results;
}

export async function searchDuckDuckGo(
	query: string,
	maxResults = DEFAULT_MAX_RESULTS
): Promise<SearchHit[]> {
	const response = await fetch(DUCKDUCKGO_HTML_URL, {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
			"user-agent": getUserAgent(),
		},
		body: new URLSearchParams({
			q: query,
		}),
	});

	if (!response.ok) {
		throw new Error(`DuckDuckGo search failed with status ${response.status}`);
	}

	const html = await response.text();
	const results = extractDuckDuckGoResults(html, maxResults);

	if (results.length === 0) {
		throw new Error("DuckDuckGo returned no parseable search results");
	}

	return results;
}

async function loadPuppeteer(): Promise<PuppeteerModule["default"] | null> {
	try {
		const puppeteerModule = (await import("puppeteer")) as PuppeteerModule;
		return puppeteerModule.default;
	} catch {
		return null;
	}
}

async function createBrowser() {
	const puppeteer = await loadPuppeteer();
	if (!puppeteer) {
		return null;
	}

	return puppeteer.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
	});
}

async function scrapePageContent(
	browser: Awaited<ReturnType<typeof createBrowser>>,
	url: string,
	maxChars = DEFAULT_PAGE_TEXT_LIMIT
): Promise<string | null> {
	if (!browser) {
		return null;
	}

	const page = await browser.newPage();

	try {
		await page.setUserAgent(getUserAgent());
		await page.goto(url, {
			waitUntil: "domcontentloaded",
			timeout: DEFAULT_TIMEOUT_MS,
		});

		const content = await page.evaluate(() => {
			const selectors = ["main", "article", "[role='main']", "body"];

			for (const selector of selectors) {
				const root = document.querySelector(selector);
				if (!root) {
					continue;
				}

				const text = Array.from(root.querySelectorAll("h1, h2, h3, p, li"))
					.map((node) => node.textContent?.trim() ?? "")
					.filter(Boolean)
					.join("\n");

				if (text.trim()) {
					return text;
				}
			}

			return document.body?.innerText ?? "";
		});

		return content.replace(/\n{3,}/g, "\n\n").slice(0, maxChars).trim();
	} finally {
		await page.close();
	}
}

export async function scrapeSearchHits(
	results: SearchHit[],
	maxScrapedPages = DEFAULT_MAX_SCRAPED_PAGES
) {
	const enrichedResults = [...results];
	const browser = await createBrowser();

	if (!browser) {
		return enrichedResults;
	}

	try {
		for (let index = 0; index < Math.min(maxScrapedPages, enrichedResults.length); index += 1) {
			const result = enrichedResults[index];

			try {
				const content = await scrapePageContent(browser, result.url);
				if (content) {
					result.content = content;
				}
			} catch {
				// Keep the search hit even if scraping fails.
			}
		}
	} finally {
		await browser.close();
	}

	return enrichedResults;
}

export function formatWebResearchForAgent(research: WebResearchResult): string {
	return research.results
		.map((result, index) => {
			const sections = [`${index + 1}. ${result.title}`, `URL: ${result.url}`];

			if (result.snippet) {
				sections.push(`Snippet: ${result.snippet}`);
			}

			if (result.content) {
				sections.push(`Scraped Content:\n${result.content}`);
			}

			return sections.join("\n");
		})
		.join("\n\n");
}

export async function realWebSearch(query: string): Promise<WebResearchResult> {
	const results = await searchDuckDuckGo(query);
	const enrichedResults = await scrapeSearchHits(results);

	return {
		query,
		results: enrichedResults,
	};
}
