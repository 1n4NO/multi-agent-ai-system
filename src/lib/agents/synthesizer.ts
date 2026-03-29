import { callLLM } from "@/lib/llm/ollama";

export async function synthesizerAgent(
	researchOutputs: string[]
): Promise<string> {
	const prompt = `
You are a SYNTHESIZER agent.

Combine the following research into a single cohesive insight:

${researchOutputs.join("\n\n")}

Rules:
- Remove redundancy
- Keep best insights
- Structure clearly
`;

	return await callLLM(prompt);
}