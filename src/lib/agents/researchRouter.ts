import { callLLM } from "@/lib/llm/ollama";
import type { ResearchMode } from "@/lib/researchPlan";

function inferFallbackMode(task: string): ResearchMode {
	const normalizedTask = task.toLowerCase();
	const webSignals = [
		"latest",
		"current",
		"today",
		"recent",
		"market",
		"trend",
		"statistic",
		"statistics",
		"example",
		"examples",
		"competitor",
		"competitors",
		"price",
		"pricing",
		"regulation",
		"regulations",
		"law",
		"laws",
	];

	return webSignals.some((signal) => normalizedTask.includes(signal)) ? "web" : "llm";
}

export async function routeResearchTask(
	task: string,
	signal?: AbortSignal
): Promise<ResearchMode> {
	const prompt = `
You classify research tasks for an agent pipeline.

Task:
${task}

Decide whether this task should be handled primarily with:
- "web" when it depends on external sources, current facts, examples, market data, regulations, or citations
- "llm" when it is mainly conceptual, strategic, structural, or can be answered from general reasoning

Rules:
- Output exactly one word
- Allowed outputs only: web or llm
`;

	try {
		const response = (await callLLM(prompt, signal)).trim().toLowerCase();

		if (response === "web" || response === "llm") {
			return response;
		}
	} catch {
		// Fall back to a deterministic heuristic if routing fails.
	}

	return inferFallbackMode(task);
}
