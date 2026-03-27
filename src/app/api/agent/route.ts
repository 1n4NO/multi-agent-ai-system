import { NextRequest, NextResponse } from "next/server";
import { runAgents } from "@/lib/orchestrator/runAgents";

export async function POST(req: NextRequest) {
  try {
    const { goal } = await req.json();

    if (!goal) {
      return NextResponse.json(
        { success: false, error: "Goal is required" },
        { status: 400 }
      );
    }

    const result = await runAgents(goal);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Something went wrong" },
      { status: 500 }
    );
  }
}