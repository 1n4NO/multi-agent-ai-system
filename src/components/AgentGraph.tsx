"use client";

import ReactFlow, { Background, Controls, Node, Edge, useNodesState, useEdgesState } from "reactflow";
import { useEffect, useState } from "react";
import "reactflow/dist/style.css";
import { useMemo } from "react";
import dagre from "dagre";
import isEqual from "lodash/isEqual";

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
	const [rfInstance, setRfInstance] = useState<any>(null);
	const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
	const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);

	const isResearchNode = (id: string) => id.startsWith("research_");

	const getNodeStatus = (id: string) => {
		if (failedNodes.has(id) || (failedNodes.has("researchers") && isResearchNode(id))) return "failed";
		if (completedNodes.has(id) || (completedNodes.has("researchers") && isResearchNode(id))) return "completed";

		if (activeNode === id) return "active";
		if (activeNode === "researchers" && isResearchNode(id)) return "active";

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
	const researchItems = graphState?.plannerOutput?.researchers || [];

	const dynamicResearchNodes: Node[] = researchItems.map(
		(topic: string, index: number) => ({
			id: `research_${index}`,
			data: {
				label: `Researcher ${index + 1}`,
				topic,
			},
			position: { x: 0, y: 0 },
		})
	);

	const nodes = [...baseNodes, ...dynamicResearchNodes];

	const edges: Edge[] = [
		{ id: "e1", source: "synthesizer", target: "writer" },
		{ id: "e2", source: "writer", target: "critic" },
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
	const styledNodes = useMemo(() => {
  return layouted.nodes.map((node) => {
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
}, [layouted.nodes, activeNode, completedNodes, failedNodes]);

	useEffect(() => {
		if (!rfInstance) return;

		setTimeout(() => {
			rfInstance.fitView({
				padding: 0.2,
				duration: 500,
			});
		}, 0);
	}, [rfInstance, rfNodes]);

	useEffect(() => {
		setRfNodes((prev) => {
			if (isEqual(prev, styledNodes)) return prev;
			return styledNodes;
		});

		setRfEdges((prev) => {
			if (isEqual(prev, layouted.edges)) return prev;
			return layouted.edges;
		});
	}, [styledNodes, layouted.edges]);

	return (
		<div style={{ display: "flex", height: 600, gap: 16 }}>
			<div style={{ flex: 1, minWidth: 0 }}>
				<ReactFlow
					nodes={rfNodes}
					edges={rfEdges}
					onNodesChange={onNodesChange}
					onEdgesChange={onEdgesChange}
					onInit={setRfInstance}
				>
					<Background />
					<Controls />
				</ReactFlow>
			</div>

			<div
				style={{
					width: 260,
					padding: 12,
					borderLeft: "1px solid #ddd",
					overflowY: "auto",
					background: "#fafafa",
					color: "#333"
				}}
			>
				<h3 style={{ marginTop: 0 }}>Researchers</h3>
				{researchItems.length === 0 ? (
					<p>No researchers yet</p>
				) : (
					<ul style={{ paddingLeft: 18, margin: 0 }}>
						{researchItems.map((topic: string, index: number) => (
							<li key={index} style={{ marginBottom: 8 }}>
								<strong>Researcher {index + 1}:</strong> {topic}
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}