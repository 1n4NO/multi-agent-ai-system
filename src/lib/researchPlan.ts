export type ResearchMode = "web" | "llm";

export type ResearchPlanItem = {
	id: string;
	prompt: string;
	mode: ResearchMode;
};

export type ResearchPlanPayload = {
	researchers: ResearchPlanItem[];
};

export function createResearchPlanId() {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}

	return `research-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createResearchPlanItem(
	prompt: string,
	mode: ResearchMode = "web"
): ResearchPlanItem {
	return {
		id: createResearchPlanId(),
		prompt,
		mode,
	};
}

export function createResearchPlanPayload(tasks: string[]): ResearchPlanPayload {
	return {
		researchers: tasks.map((task) => createResearchPlanItem(task)),
	};
}

export function isResearchPlanPayload(value: unknown): value is ResearchPlanPayload {
	if (!value || typeof value !== "object") {
		return false;
	}

	const maybeResearchers = (value as { researchers?: unknown }).researchers;

	if (!Array.isArray(maybeResearchers)) {
		return false;
	}

	return maybeResearchers.every((item) => {
		if (!item || typeof item !== "object") {
			return false;
		}

		const candidate = item as {
			id?: unknown;
			prompt?: unknown;
			mode?: unknown;
		};

		return (
			typeof candidate.id === "string" &&
			typeof candidate.prompt === "string" &&
			(candidate.mode === "web" || candidate.mode === "llm")
		);
	});
}
