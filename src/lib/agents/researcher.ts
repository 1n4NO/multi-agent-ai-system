import { callLLM } from "@/lib/llm/ollama";

export async function researcherAgent(
	task: string,
	groundedResearch: string
): Promise<string> {
	const prompt = `
You are a RESEARCH AGENT.

Research the following topic and provide deep insights grounded in the supplied web findings.

Topic: ${task}

Web findings:
${groundedResearch}

Focus on:
- Key insights
- Practical strategies
- Real-world considerations
- Source-backed observations only

Rules:
- Prefer concrete claims that are supported by the supplied findings
- If the findings conflict, note the uncertainty briefly
- Do not invent sources or facts that are not present in the findings

Be concise but useful.

Output format:

## Researched on ${task}

### Research findings in bullet points
<number>. <insight 1>
`;

	return await callLLM(prompt);
}
