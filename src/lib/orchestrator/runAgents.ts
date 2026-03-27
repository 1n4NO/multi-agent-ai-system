import { plannerAgent } from "@/lib/agents/planner";
import { researcherAgent } from "@/lib/agents/researcher";
import { writerAgent } from "@/lib/agents/writer";
import { criticAgent } from "@/lib/agents/critic";
import { saveToMemory } from "@/lib/memory/store";

export async function runAgents(goal: string) {
  // 1. Planning
  const plan = await plannerAgent(goal);

  // 2. Parallel research (future scalable)
  const researchPromise = researcherAgent(plan);

  const research = await researchPromise;

  // 3. Writing
  const draft = await writerAgent(plan, research);

  // 4. Critic
  const finalOutput = await criticAgent(draft);

  const result = {
    plan,
    research,
    draft,
    final: finalOutput,
  };

  // 5. Save memory
  saveToMemory(goal, result);

  return result;
}