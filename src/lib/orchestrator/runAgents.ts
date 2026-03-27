import { plannerAgent } from "@/lib/agents/planner";
import { researcherAgent } from "@/lib/agents/researcher";
import { writerAgent } from "@/lib/agents/writer";
import { criticAgent } from "@/lib/agents/critic";

export async function runAgents(goal: string) {
  // 1. Planning
  const plan = await plannerAgent(goal);

  // 2. Research
  const research = await researcherAgent(plan);

  // 3. Writing
  const draft = await writerAgent(plan, research);

  // 4. Critique
  const finalOutput = await criticAgent(draft);

  return {
    plan,
    research,
    draft,
    final: finalOutput,
  };
}