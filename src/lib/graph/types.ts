export type NodeId = string;

export type GraphEvent = {
	step: string;
	[key: string]: unknown;
};

export type StepCallback = (data: GraphEvent) => void;

export type GraphNode = {
	id: NodeId;
	run: (state: GraphState, onStep?: StepCallback) => Promise<unknown>;
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
