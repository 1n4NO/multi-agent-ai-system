import { plannerAgent } from "@/lib/agents/planner";
import { researcherAgent } from "@/lib/agents/researcher";
import { synthesizerAgent } from "@/lib/agents/synthesizer";
import { writerAgent } from "@/lib/agents/writer";
import { criticAgent } from "@/lib/agents/critic";
import { parsePlanToTasks } from "@/lib/utils/parsePlan";
import { webSearch } from "@/lib/tools/webSearch";
import { saveToMemory } from "@/lib/memory/store";

type StepCallback = (data: any) => void;

export async function runAgents(goal: string, onStep?: StepCallback) {
  // 1. Planner
  onStep?.({ step: "planner_start" });
  const plan = await plannerAgent(goal);
  onStep?.({ step: "planner_done", data: plan });

  // 2. Split tasks
  const tasks = parsePlanToTasks(plan);

  onStep?.({ step: "tasks_generated", data: tasks });

  // 3. Parallel researchers
  const researchResults = await Promise.all(
    tasks.map(async (task, index) => {
      onStep?.({ step: `research_${index}_start`, task });

      const webData = await webSearch(task);
      const research = await researcherAgent(task + "\n\n" + webData);

      onStep?.({ step: `research_${index}_done`, data: research });

      return research;
    })
  );

  // 4. Synthesize
  onStep?.({ step: "synthesizer_start" });
  const synthesized = await synthesizerAgent(researchResults);
  onStep?.({ step: "synthesizer_done", data: synthesized });

  // 5. Writer
  onStep?.({ step: "writer_start" });
  const draft = await writerAgent(goal, plan, synthesized);
  onStep?.({ step: "writer_done", data: draft });

  // 6. Critic
  onStep?.({ step: "critic_start" });
  const finalOutput = await criticAgent(goal, plan, draft);
  onStep?.({ step: "critic_done", data: finalOutput });

  const result = {
    plan,
    tasks,
    researchResults,
    synthesized,
    draft,
    final: finalOutput,
  };

  saveToMemory(goal, result);

  return result;
}