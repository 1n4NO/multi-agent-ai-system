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
	const { activeNode, activeNodes, completedNodes, failedNodes, researcherProgress } = graphState;
	const [rfInstance, setRfInstance] = useState<any>(null);
	const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
	const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);

	const isResearchNode = (id: string) => id.startsWith("research_");

	const getNodeStatus = (id: string) => {
		if (failedNodes?.has(id)) return "failed";
		if (completedNodes?.has(id)) return "completed";
		if (activeNodes?.has(id)) return "active";
		if (activeNode === id) return "active";
		return "idle";
	};

	const getNodeStyle = (status: string, progress?: number) => {
		const baseStyle = (() => {
			switch (status) {
				case "active":
					return { background: "#2196f3", color: "white" };
				case "completed":
					return { background: "#4caf50", color: "white" };
				case "failed":
					return { background: "#f44336", color: "white" };
				default:
					return { background: "#eee", color: "black" };
			}
		})();

		if (typeof progress === "number" && progress >= 0 && progress < 100) {
			return {
				...baseStyle,
				background: `linear-gradient(to right, rgba(25,118,210,0.5) ${progress}%, ${baseStyle.background} ${progress}%)`,
			};
		}

		return baseStyle;
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

	const dynamicResearchNodes: Node[] = researchItems.map((topic: string, index: number) => {
		const progress = graphState?.researcherProgress?.[`research_${index}`] ?? 0;
		return {
			id: `research_${index}`,
			data: {
				label: `Researcher ${index + 1}`,
				topic,
				progress,
			},
			position: { x: 0, y: 0 },
		};
	});

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
	const layouted = useMemo(() => getLayoutedElements(nodes, edges), [nodes, edges]);

	// Apply styles
	const styledNodes = useMemo(() => {
		return layouted.nodes.map((node) => {
			const status = getNodeStatus(node.id);
			const progress = node.data?.progress ?? (isResearchNode(node.id) ? (researcherProgress?.[node.id] ?? 0) : undefined);

			return {
				...node,
				style: {
					...getNodeStyle(status, progress),
					borderRadius: 10,
					padding: 10,
				},
			};
		});
	}, [layouted.nodes, activeNode, activeNodes, completedNodes, failedNodes, researcherProgress]);

	useEffect(() => {
		if (!rfInstance) return;

		if (!isEqual(rfNodes, styledNodes)) {
			setRfNodes(styledNodes);
		}

		if (!isEqual(rfEdges, layouted.edges)) {
			setRfEdges(layouted.edges);
		}

		setTimeout(() => {
			rfInstance.fitView({
				padding: 0.2,
				duration: 500,
			});
		}, 0);
	}, [rfInstance, rfNodes, rfEdges, styledNodes, layouted.edges]);

	return (
		<div style={{ display: "flex", height: 600, gap: 16 }}>
			<div style={{ flex: 1, minWidth: 0 }}>
				<ReactFlow
					nodes={rfNodes}
					edges={rfEdges}
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
					<ul style={{ paddingLeft: 0, margin: 0, listStyle: "none" }}>
						{researchItems.map((topic: string, index: number) => {
							const progress = graphState?.researcherProgress?.[`research_${index}`] ?? 0;
							return (
								<li key={index} style={{ marginBottom: 12, padding: 8, borderRadius: 8, background: "#fff", border: "1px solid #ddd" }}>
									<div style={{ fontWeight: 700, marginBottom: 4 }}>Researcher {index + 1}</div>
									<div style={{ marginBottom: 4, fontSize: 12, color: "#555" }}>{topic}</div>
									<div style={{ height: 8, borderRadius: 999, background: "rgba(0, 0, 0, 0.1)" }}>
										<div style={{ width: `${progress}%`, height: "100%", borderRadius: 999, background: "#1976d2" }} />
									</div>
									<div style={{ marginTop: 2, fontSize: 11, color: "#444" }}>{progress}%</div>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
}