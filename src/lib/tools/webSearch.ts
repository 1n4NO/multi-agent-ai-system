import {
	formatWebResearchForAgent,
	realWebSearch,
	type SearchHit,
	type WebResearchResult,
} from "@/lib/tools/realWebSearch";

export type { SearchHit, WebResearchResult };

export async function webSearch(query: string): Promise<string> {
	const research = await realWebSearch(query);
	return formatWebResearchForAgent(research);
}

export async function webSearchWithSources(
	query: string
): Promise<WebResearchResult> {
	return realWebSearch(query);
}
