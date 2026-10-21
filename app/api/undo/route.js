import { NextResponse } from "next/server";
import { leggiSessione } from "@/lib/session";
import { annullaCommit } from "@/lib/github";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const s = await leggiSessione().catch(() => null);
  if (!s?.token || !s?.repo) return NextResponse.json({ errore: "Accedi e scegli il repository." }, { status: 401 });
  const { sha } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f]{40}$/.test(String(sha || ""))) return NextResponse.json({ errore: "Modifica non valida." }, { status: 400 });
  const [owner, repo] = s.repo.split("/");
  try {
    return NextResponse.json({ sha: await annullaCommit(s.token, owner, repo, sha) });
  } catch (e) {
    return NextResponse.json({ errore: e.message }, { status: 400 });
  }
}
