// Sessione = un cookie cifrato (AES-256-GCM) con dentro: codice accettato, token GitHub, nome, repository scelto.
import crypto from "node:crypto";
import { cookies } from "next/headers";

export const COOKIE = "studio";

function chiave() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET mancante o troppo corta (almeno 16 caratteri).");
  return crypto.createHash("sha256").update(s).digest();
}

export function sigilla(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", chiave(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url");
}

export function apri(testo) {
  try {
    const b = Buffer.from(testo, "base64url");
    const d = crypto.createDecipheriv("aes-256-gcm", chiave(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"));
  } catch {
    return null;
  }
}

export async function leggiSessione() {
  const jar = await cookies();
  const v = jar.get(COOKIE)?.value;
  return v ? apri(v) : null;
}

export async function scriviSessione(dati) {
  const jar = await cookies();
  jar.set(COOKIE, sigilla(dati), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function cancellaSessione() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export function utenteAmmesso(login) {
  const elenco = (process.env.STUDIO_ALLOWED_USERS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return elenco.length === 0 || elenco.includes(String(login || "").toLowerCase());
}
