import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { leggiSessione, apri } from "@/lib/session";
import { avanza, messaggioAmico } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const s = await leggiSessione();
  if (!s?.login) return NextResponse.json({ errore: "Devi prima entrare in Studio." }, { status: 401 });
  const ref = new URL(req.url).searchParams.get("ref") || "";
  if (!/^[a-z0-9]{8,40}$/.test(ref)) return NextResponse.json({ errore: "Progetto non valido." }, { status: 400 });
  const v = (await cookies()).get("studio_sb")?.value;
  const token = v ? apri(v)?.t : null;
  if (!token) return NextResponse.json({ errore: "Serve di nuovo il permesso di Supabase.", riautorizza: true }, { status: 401 });
  try {
    const r = await avanza(token, ref);
    const res = NextResponse.json(r);
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (e) {
    const m = messaggioAmico(e);
    return NextResponse.json(m, { status: m.riautorizza ? 401 : 500 });
  }
}
