export function parsePlanToTasks(plan: string): string[] {
  const lines = plan.split("\n");

  return lines
    .map((line) => line.trim())
    .filter(
      (line) =>
        /^\d+\./.test(line) ||     // 1. Task
        /^-\s/.test(line) ||       // - Task
        /^Step\s*\d+/i.test(line)  // Step 1: Task
    )
    .map((line) =>
      line
        .replace(/^\d+\.\s*/, "")
        .replace(/^-\s*/, "")
        .replace(/^Step\s*\d+:\s*/i, "")
        .trim()
    );
}