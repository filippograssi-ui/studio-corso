import { NextResponse } from "next/server";
import { leggiSessione } from "@/lib/session";
import { ultimiCommit } from "@/lib/github";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await leggiSessione().catch(() => null);
  if (!s?.token || !s?.repo) return NextResponse.json({ errore: "Accedi e scegli il repository." }, { status: 401 });
  const [owner, repo] = s.repo.split("/");
  try {
    return NextResponse.json(await ultimiCommit(s.token, owner, repo));
  } catch (e) {
    return NextResponse.json({ errore: e.message }, { status: 502 });
  }
}
