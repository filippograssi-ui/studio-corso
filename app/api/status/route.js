import { NextResponse } from "next/server";
import { leggiSessione } from "@/lib/session";
import { statoPubblicazione } from "@/lib/github";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const s = await leggiSessione().catch(() => null);
  if (!s?.token || !s?.repo) return NextResponse.json({ errore: "Accedi e scegli il repository." }, { status: 401 });
  const sha = new URL(req.url).searchParams.get("sha");
  if (sha && !/^[0-9a-f]{40}$/.test(sha)) return NextResponse.json({ errore: "sha non valido" }, { status: 400 });
  const [owner, repo] = s.repo.split("/");
  try {
    return NextResponse.json(await statoPubblicazione(s.token, owner, repo, sha));
  } catch (e) {
    return NextResponse.json({ stato: "nessuno", url: null });
  }
}
