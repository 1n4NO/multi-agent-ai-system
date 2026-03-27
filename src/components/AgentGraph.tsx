"use client";

import ReactFlow, { Background, Controls } from "reactflow";
import "reactflow/dist/style.css";

export default function AgentGraph({ currentStep }: { currentStep: string }) {
  const nodes = [
    {
      id: "planner",
      data: { label: "Planner" },
      position: { x: 0, y: 50 },
      style: {
        background: currentStep.startsWith("planner")
          ? "#4caf50"
          : "#eee",
      },
    },
    {
      id: "research",
      data: { label: "Research" },
      position: { x: 200, y: 50 },
      style: {
        background: currentStep.startsWith("research")
          ? "#4caf50"
          : "#eee",
      },
    },
    {
      id: "writer",
      data: { label: "Writer" },
      position: { x: 400, y: 50 },
      style: {
        background: currentStep.startsWith("writer")
          ? "#4caf50"
          : "#eee",
      },
    },
    {
      id: "critic",
      data: { label: "Critic" },
      position: { x: 600, y: 50 },
      style: {
        background: currentStep.startsWith("critic")
          ? "#4caf50"
          : "#eee",
      },
    },
  ];

  const edges = [
    { id: "e1", source: "planner", target: "research" },
    { id: "e2", source: "research", target: "writer" },
    { id: "e3", source: "writer", target: "critic" },
  ];

  return (
    <div style={{ height: 200, marginTop: 20 }}>
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}