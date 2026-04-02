import { callLLM } from "@/lib/llm/ollama";
import { getRecentMemory } from "@/lib/memory/store";

export async function plannerAgent(userGoal: string): Promise<string> {
  const memory = getRecentMemory();

  const prompt = `
		You are a PLANNER agent.

		Break the goal into EXACTLY numbered steps.

		STRICT FORMAT:
		1. Step one
		2. Step two
		3. Step three

		No bullet points.
		No extra text.

		Previous context:
		${JSON.stringify(memory, null, 2)}

		Now plan the new goal.

		Goal:
		${userGoal}

		Rules:
		- Avoid repeating previous strategies
		- Be concise
		- Max 6 steps
		Do not repeat the topic. Provide only the plan in the specified format.
	`;

  return await callLLM(prompt);
}