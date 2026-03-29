import { callLLM } from "@/lib/llm/ollama";

export async function webSearch(query: string): Promise<string> {
	const prompt = `
		Simulate a web search for the following query:

		"${query}"

		Return:
		- Key findings
		- Trends
		- Useful data points
	`;

	return await callLLM(prompt);
}