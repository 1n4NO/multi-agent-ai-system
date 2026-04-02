import { callLLM } from "@/lib/llm/ollama";

export async function researcherAgent(task: string): Promise<string> {
	const prompt = `
You are a RESEARCH AGENT.

Research the following topic and provide deep insights based on the provided data.

Topic: ${task}

Focus on:
- Key insights
- Practical strategies
- Real-world considerations

Do not repeat the topic or provide a plan. Provide research findings in bullet points.
Be concise but useful.
`;

	return await callLLM(prompt);
}