import { NextResponse } from "next/server";
import { cancellaSessione } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  await cancellaSessione();
  return NextResponse.json({ ok: true });
}
