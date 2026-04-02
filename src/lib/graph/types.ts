export type NodeId = string;

export type GraphNode = {
	id: NodeId;
	run: (state: GraphState, onStep?: (data: any) => void) => Promise<any>;
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
	data: Record<string, any>;
	meta: {
		attempts: Record<string, number>;
	};
};