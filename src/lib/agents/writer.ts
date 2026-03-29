import { callLLM } from "@/lib/llm/ollama";

export async function writerAgent(
	goal: string,
	plan: string,
	research: string
): Promise<string> {
	const prompt = `
You are a WRITER agent.

Goal:
${goal}

Plan:
${plan}

Research Insights:
${research}

Write a complete, structured, actionable solution.

Format:
- Headings
- Lists
- Clear sections
`;

	return await callLLM(prompt);
}