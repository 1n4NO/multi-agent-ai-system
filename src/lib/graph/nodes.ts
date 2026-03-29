import { plannerAgent } from "@/lib/agents/planner";
import { researcherAgent } from "@/lib/agents/researcher";
import { synthesizerAgent } from "@/lib/agents/synthesizer";
import { writerAgent } from "@/lib/agents/writer";
import { criticAgent } from "@/lib/agents/critic";
import { parsePlanToTasks } from "@/lib/utils/parsePlan";
import { webSearch } from "@/lib/tools/webSearch";

export function createGraph(goal: string) {
  let tasks: string[] = [];

  return {
    nodes: {
      planner: {
        id: "planner",
        run: async (state : any) => {
          const plan = await plannerAgent(goal);
          tasks = parsePlanToTasks(plan);
          return plan;
        },
      },

      researchers: {
        id: "researchers",
        run: async () => {
          return await Promise.all(
            tasks.map(async (task) => {
              const webData = await webSearch(task);
              return await researcherAgent(task + "\n" + webData);
            })
          );
        },
      },

      synthesizer: {
        id: "synthesizer",
        run: async (state : any) => {
          return await synthesizerAgent(
            state.data.researchers
          );
        },
      },

      writer: {
        id: "writer",
        run: async (state : any) => {
          return await writerAgent(
            goal,
            state.data.planner,
            state.data.synthesizer
          );
        },
      },

      critic: {
        id: "critic",
        run: async (state : any) => {
          return await criticAgent(
            goal,
            state.data.planner,
            state.data.writer
          );
        },
      },
    },

    edges: [
      { from: "planner", to: "researchers" },
      { from: "researchers", to: "synthesizer" },
      { from: "synthesizer", to: "writer" },

      // 🔁 LOOP: writer → critic
      { from: "writer", to: "critic" },

      // 🔥 CONDITIONAL LOOP BACK
      {
        from: "critic",
        to: "writer",
        condition: (state : any) => {
          const output = state.data.critic || "";
          const match = output.match(/(\d+)%/);
          const score = match ? parseInt(match[1]) : 100;

          return score < 80 &&
            (state.meta.attempts["writer"] || 0) < 3;
        },
      },
    ],
  };
}