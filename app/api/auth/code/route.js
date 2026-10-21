import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { leggiSessione, scriviSessione } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const atteso = process.env.STUDIO_CODE;
  if (!atteso) return NextResponse.json({ errore: "Studio non è configurato: manca STUDIO_CODE su Vercel." }, { status: 500 });
  const { codice } = await req.json().catch(() => ({}));
  const a = Buffer.from(String(codice || "").trim().toLowerCase());
  const b = Buffer.from(String(atteso).trim().toLowerCase());
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return NextResponse.json({ errore: "Codice non corretto." }, { status: 401 });
  const s = (await leggiSessione()) || {};
  await scriviSessione({ ...s, ok: true });
  return NextResponse.json({ ok: true });
}
