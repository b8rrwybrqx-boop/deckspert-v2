import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: "reachable" });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        database: "unreachable",
        error: error instanceof Error ? error.message : "unknown error"
      },
      { status: 500 }
    );
  }
}
