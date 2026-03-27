type MemoryEntry = {
  goal: string;
  result: any;
  timestamp: number;
};

const memory: MemoryEntry[] = [];

export function saveToMemory(goal: string, result: any) {
  memory.push({
    goal,
    result,
    timestamp: Date.now(),
  });

  // keep only last 5 entries (simple memory control)
  if (memory.length > 5) {
    memory.shift();
  }
}

export function getRecentMemory(): MemoryEntry[] {
  return memory;
}