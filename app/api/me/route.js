import { NextResponse } from "next/server";
import { leggiSessione } from "@/lib/session";
import { configurato } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await leggiSessione().catch(() => null);
  return NextResponse.json({ codice: !!s?.ok, login: s?.login || null, repo: s?.repo || null, database: configurato() });
}
