import { callLLM } from "@/lib/llm/ollama";

export async function criticAgent(
	goal: string,
	plan: string,
	content: string
): Promise<string> {
	const prompt = `
You are a CRITIC agent.

Evaluate the solution:

Goal:
${goal}

Plan:
${plan}

Solution:
${content}

Tasks:
1. Improve the solution if needed
2. Give a confidence score (0–100%)
3. Justify the score briefly

Output format:

## Final Answer
<improved solution>

## Confidence Score
<number>%

## Reason
<short explanation>
`;

	return await callLLM(prompt);
}