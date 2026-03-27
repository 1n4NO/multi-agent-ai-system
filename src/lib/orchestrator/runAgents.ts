import { plannerAgent } from "@/lib/agents/planner";
import { researcherAgent } from "@/lib/agents/researcher";
import { writerAgent } from "@/lib/agents/writer";
import { criticAgent } from "@/lib/agents/critic";
import { saveToMemory } from "@/lib/memory/store";

type StepCallback = (data: any) => void;

export async function runAgents(goal: string, onStep?: StepCallback) {
  onStep?.({ step: "planner_start" });

  const plan = await plannerAgent(goal);
  onStep?.({ step: "planner_done", data: plan });

  const research = await researcherAgent(plan);
  onStep?.({ step: "research_done", data: research });

  const draft = await writerAgent(plan, research);
  onStep?.({ step: "writer_done", data: draft });

  const finalOutput = await criticAgent(draft);
  onStep?.({ step: "critic_done", data: finalOutput });

  const result = { plan, research, draft, final: finalOutput };

  saveToMemory(goal, result);

  return result;
}