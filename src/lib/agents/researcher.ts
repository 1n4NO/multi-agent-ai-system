import { callLLM } from "@/lib/llm/ollama";

export async function researcherAgent(task: string): Promise<string> {
	const prompt = `
You are a RESEARCH AGENT.

Task:
${task}

Perform deep research:
- Key insights
- Practical strategies
- Real-world considerations

Format:
- Bullet points
- Concise but useful
`;

	return await callLLM(prompt);
}