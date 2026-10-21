import { NextResponse } from "next/server";
import { leggiSessione, scriviSessione } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const s = await leggiSessione().catch(() => null);
  if (!s?.token) return NextResponse.json({ errore: "Non hai fatto l'accesso." }, { status: 401 });
  const { nome } = await req.json().catch(() => ({}));
  if (nome === null) { await scriviSessione({ ...s, repo: null }); return NextResponse.json({ ok: true }); }
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(nome || "")) || nome.split("/")[0].toLowerCase() !== s.login.toLowerCase()) {
    return NextResponse.json({ errore: "Repository non valido: deve essere uno dei tuoi." }, { status: 400 });
  }
  await scriviSessione({ ...s, repo: nome });
  return NextResponse.json({ ok: true });
}
