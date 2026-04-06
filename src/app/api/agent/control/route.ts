import { NextRequest, NextResponse } from "next/server";
import { getRunSession } from "@/lib/orchestrator/sessionControl";
import { isResearchPlanPayload } from "@/lib/researchPlan";

export async function POST(req: NextRequest) {
	const { sessionId, action, autoProceed, researchPlan } = await req.json();

	if (typeof sessionId !== "string") {
		return NextResponse.json(
			{ error: "Missing sessionId." },
			{ status: 400 }
		);
	}

	const session = getRunSession(sessionId);
	if (!session) {
		return NextResponse.json(
			{ error: "Run session not found." },
			{ status: 404 }
		);
	}

	if (action === "continue") {
		return NextResponse.json(session.continueOnce());
	}

	if (action === "rerun_dirty_research") {
		return NextResponse.json(await session.rerunDirtyResearch());
	}

	if (action === "set_auto" && typeof autoProceed === "boolean") {
		return NextResponse.json(session.setAutoProceed(autoProceed));
	}

	if (
		action === "set_research_plan" &&
		isResearchPlanPayload({ researchers: researchPlan })
	) {
		return NextResponse.json(session.setResearchPlan(researchPlan));
	}

	return NextResponse.json(
		{ error: "Invalid control action." },
		{ status: 400 }
	);
}
