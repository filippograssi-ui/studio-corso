import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { leggiSessione, apri } from "@/lib/session";
import { trovaOCrea, messaggioAmico } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const s = await leggiSessione();
  if (!s?.login) return NextResponse.json({ errore: "Devi prima entrare in Studio." }, { status: 401 });
  const v = (await cookies()).get("studio_sb")?.value;
  const token = v ? apri(v)?.t : null;
  if (!token) return NextResponse.json({ errore: "Serve di nuovo il permesso di Supabase.", riautorizza: true }, { status: 401 });
  try {
    const { ref, nuovo } = await trovaOCrea(token, s.login);
    return NextResponse.json({ ref, nuovo });
  } catch (e) {
    const m = messaggioAmico(e);
    return NextResponse.json(m, { status: m.riautorizza ? 401 : 500 });
  }
}
