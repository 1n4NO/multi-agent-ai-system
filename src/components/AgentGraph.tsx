"use client";

import ReactFlow, { Background, Controls, Node, Edge } from "reactflow";
import "reactflow/dist/style.css";
import { useMemo } from "react";
import dagre from "dagre";

type Props = {
  graphState: any;
};

const nodeWidth = 150;
const nodeHeight = 50;

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));

  // Top-down layout
  g.setGraph({ rankdir: "TB" });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);

    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

export default function AgentGraph({ graphState }: Props) {
  const { activeNode, completedNodes, failedNodes } = graphState;

  const getNodeStatus = (id: string) => {
    if (failedNodes.has(id)) return "failed";
    if (completedNodes.has(id)) return "completed";
    if (activeNode === id) return "active";
    return "idle";
  };

  const getNodeStyle = (status: string) => {
    switch (status) {
      case "active":
        return { background: "#2196f3", color: "white" };
      case "completed":
        return { background: "#4caf50", color: "white" };
      case "failed":
        return { background: "#f44336", color: "white" };
      default:
        return { background: "#eee" };
    }
  };

  // Static nodes
  const baseNodes: Node[] = [
    { id: "planner", data: { label: "Planner" }, position: { x: 0, y: 0 } },
    { id: "synthesizer", data: { label: "Synthesizer" }, position: { x: 0, y: 0 } },
    { id: "writer", data: { label: "Writer" }, position: { x: 0, y: 0 } },
    { id: "critic", data: { label: "Critic" }, position: { x: 0, y: 0 } },
  ];

  // Dynamic researcher nodes
  const researchItems =
    graphState?.plannerOutput?.researchers || [];

  const dynamicResearchNodes: Node[] = researchItems.map(
    (_: any, index: number) => ({
      id: `research_${index}`,
      data: { label: `Research ${index + 1}` },
      position: { x: 0, y: 0 },
    })
  );

  const nodes = [...baseNodes, ...dynamicResearchNodes];

  const edges: Edge[] = [
    { id: "e1", source: "planner", target: "synthesizer" },
    { id: "e2", source: "synthesizer", target: "writer" },
    { id: "e3", source: "writer", target: "critic" },
  ];

  researchItems.forEach((_: any, index: number) => {
    edges.push({
      id: `er_${index}`,
      source: "planner",
      target: `research_${index}`,
    });

    edges.push({
      id: `er2_${index}`,
      source: `research_${index}`,
      target: "synthesizer",
    });
  });

  // Apply layout
  const layouted = useMemo(() => {
    return getLayoutedElements(nodes, edges);
  }, [graphState.plannerOutput]);

  // Apply styles
  const styledNodes = layouted.nodes.map((node) => {
    const status = getNodeStatus(node.id);

    return {
      ...node,
      style: {
        ...getNodeStyle(status),
        borderRadius: 10,
        padding: 10,
      },
    };
  });

  return (
    <div style={{ height: 600 }}>
      <ReactFlow nodes={styledNodes} edges={layouted.edges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}