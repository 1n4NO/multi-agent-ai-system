import type { RunSessionControl } from "@/lib/orchestrator/sessionControl";

export type NodeId = string;

export type GraphEvent = {
	step: string;
	[key: string]: unknown;
};

export type StepCallback = (data: GraphEvent) => void;

export type ExecutionContext = {
	signal?: AbortSignal;
	beforeNode?: (nodeId: string, onStep?: StepCallback, signal?: AbortSignal) => Promise<void>;
	sessionControl?: RunSessionControl;
};

export type GraphNode = {
	id: NodeId;
	run: (
		state: GraphState,
		onStep?: StepCallback,
		context?: ExecutionContext
	) => Promise<unknown>;
};

export type Edge = {
	from: NodeId;
	to: NodeId;
	condition?: (state: GraphState) => boolean;
};

export type Graph = {
	nodes: Record<NodeId, GraphNode>;
	edges: Edge[];
};

export type GraphState = {
	goal: string;
	data: Record<string, unknown>;
	meta: {
		attempts: Record<string, number>;
	};
};
