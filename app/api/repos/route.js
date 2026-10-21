import { NextResponse } from "next/server";
import { leggiSessione } from "@/lib/session";
import { elencoRepository } from "@/lib/github";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await leggiSessione().catch(() => null);
  if (!s?.token) return NextResponse.json({ errore: "Non hai fatto l'accesso." }, { status: 401 });
  try {
    return NextResponse.json({ repository: await elencoRepository(s.token) });
  } catch (e) {
    return NextResponse.json({ errore: "GitHub non risponde: " + e.message }, { status: 502 });
  }
}
