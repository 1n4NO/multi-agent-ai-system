import type { StepCallback } from "@/lib/graph/types";
import type { ResearchPlanItem } from "@/lib/researchPlan";
import { createAbortError, throwIfAborted } from "@/lib/utils/abort";

export type ControlState = {
	sessionId: string;
	autoProceed: boolean;
	pausedAt: string | null;
	waiting: boolean;
};

export type SessionClientState = ControlState & {
	researchPlan: ResearchPlanItem[];
};

type Waiter = {
	nodeId: string;
	resolve: () => void;
	reject: (error: Error) => void;
};

export class RunSessionControl {
	private waiter: Waiter | null = null;
	private closed = false;
	private autoProceed: boolean;
	private pausedAt: string | null = null;
	private researchPlan: ResearchPlanItem[] = [];

	constructor(
		public readonly sessionId: string,
		autoProceed: boolean
	) {
		this.autoProceed = autoProceed;
	}

	getState(): ControlState {
		return {
			sessionId: this.sessionId,
			autoProceed: this.autoProceed,
			pausedAt: this.pausedAt,
			waiting: this.waiter !== null,
		};
	}

	getClientState(): SessionClientState {
		return {
			...this.getState(),
			researchPlan: this.getResearchPlan(),
		};
	}

	getResearchPlan() {
		return this.researchPlan.map((item) => ({ ...item }));
	}

	setResearchPlan(researchPlan: ResearchPlanItem[]) {
		this.researchPlan = researchPlan.map((item) => ({ ...item }));
		return this.getClientState();
	}

	private emitState(onStep?: StepCallback) {
		onStep?.({
			step: "control_state",
			...this.getClientState(),
		});
	}

	async beforeNode(
		nodeId: string,
		onStep?: StepCallback,
		signal?: AbortSignal
	) {
		if (nodeId === "planner" || nodeId === "research_router") {
			return;
		}

		throwIfAborted(signal);

		if (this.closed || this.autoProceed) {
			this.pausedAt = null;
			return;
		}

		this.pausedAt = nodeId;

		await new Promise<void>((resolve, reject) => {
			this.waiter = {
				nodeId,
				resolve: () => {
					this.waiter = null;
					this.pausedAt = null;
					this.emitState(onStep);
					resolve();
				},
				reject: (error) => {
					this.waiter = null;
					this.pausedAt = null;
					this.emitState(onStep);
					reject(error);
				},
			};
			this.emitState(onStep);

			if (signal?.aborted) {
				this.waiter.reject(createAbortError());
				return;
			}

			const onAbort = () => {
				this.waiter?.reject(createAbortError());
			};

			signal?.addEventListener("abort", onAbort, { once: true });
		});
	}

	continueOnce() {
		if (!this.waiter) {
			return this.getClientState();
		}

		this.waiter.resolve();
		return this.getClientState();
	}

	setAutoProceed(autoProceed: boolean) {
		this.autoProceed = autoProceed;

		if (autoProceed && this.waiter) {
			this.waiter.resolve();
		}

		return this.getClientState();
	}

	close() {
		this.closed = true;

		if (this.waiter) {
			this.waiter.reject(createAbortError());
		}
	}
}

declare global {
	var __multiAgentRunSessions:
		| Map<string, RunSessionControl>
		| undefined;
}

function getSessionStore() {
	if (!globalThis.__multiAgentRunSessions) {
		globalThis.__multiAgentRunSessions = new Map<string, RunSessionControl>();
	}

	return globalThis.__multiAgentRunSessions;
}

export function createRunSession(autoProceed: boolean) {
	const sessionId = crypto.randomUUID();
	const session = new RunSessionControl(sessionId, autoProceed);
	getSessionStore().set(sessionId, session);
	return session;
}

export function getRunSession(sessionId: string) {
	return getSessionStore().get(sessionId);
}

export function deleteRunSession(sessionId: string) {
	getSessionStore().delete(sessionId);
}
