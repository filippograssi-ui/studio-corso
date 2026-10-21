// Tutto quello che serve per parlare con GitHub: leggere un repository, fare un commit, annullarlo, vedere la pubblicazione.
import { leggiTarGz } from "./tar.js";

const API_PREDEFINITA = "https://api.github.com";
const API = () => process.env.GITHUB_API_URL || API_PREDEFINITA; // GITHUB_API_URL serve solo ai collaudi

export async function gh(token, percorso, { method = "GET", body } = {}) {
  const r = await fetch(API() + percorso, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text();
    const e = new Error(`GitHub ${r.status} ${method} ${percorso}: ${t.slice(0, 300)}`);
    e.status = r.status;
    throw e;
  }
  return r.status === 204 ? null : r.json();
}

export async function elencoRepository(token) {
  const lista = await gh(token, "/user/repos?affiliation=owner&sort=pushed&per_page=60");
  return lista.map(r => ({ nome: r.full_name, privato: r.private, aggiornato: r.pushed_at, branch: r.default_branch }));
}

export async function caricaRepository(token, owner, repo) {
  const info = await gh(token, `/repos/${owner}/${repo}`);
  if (!info.permissions?.push) throw Object.assign(new Error("Non hai il permesso di modificare questo repository."), { status: 403 });
  const branch = info.default_branch;
  const ref = await gh(token, `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
  const headSha = ref.object.sha;
  const commit = await gh(token, `/repos/${owner}/${repo}/git/commits/${headSha}`);
  const r = await fetch(`${API()}/repos/${owner}/${repo}/tarball/${headSha}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`Impossibile scaricare il repository (${r.status}).`);
  const files = leggiTarGz(Buffer.from(await r.arrayBuffer()));
  return { info, branch, headSha, treeSha: commit.tree.sha, files };
}

// Un solo commit con tutti i file cambiati. cambi: Map percorso -> string (testo nuovo) | null (file eliminato)
export async function faiCommit(token, owner, repo, { branch, headSha, treeSha }, cambi, messaggio) {
  const voci = [];
  for (const [percorso, testo] of cambi) {
    if (testo === null) {
      voci.push({ path: percorso, mode: "100644", type: "blob", sha: null });
    } else {
      const blob = await gh(token, `/repos/${owner}/${repo}/git/blobs`, { method: "POST", body: { content: testo, encoding: "utf-8" } });
      voci.push({ path: percorso, mode: "100644", type: "blob", sha: blob.sha });
    }
  }
  const albero = await gh(token, `/repos/${owner}/${repo}/git/trees`, { method: "POST", body: { base_tree: treeSha, tree: voci } });
  const commit = await gh(token, `/repos/${owner}/${repo}/git/commits`, { method: "POST", body: { message: messaggio, tree: albero.sha, parents: [headSha] } });
  try {
    await gh(token, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, { method: "PATCH", body: { sha: commit.sha } });
  } catch (e) {
    if (e.status === 422 || e.status === 409) throw new Error("Il repository è cambiato mentre lavoravo. Riprova a inviare la richiesta.");
    throw e;
  }
  return commit.sha;
}

export async function ultimiCommit(token, owner, repo, quanti = 15) {
  const info = await gh(token, `/repos/${owner}/${repo}`);
  const lista = await gh(token, `/repos/${owner}/${repo}/commits?sha=${info.default_branch}&per_page=${quanti}`);
  return { branch: info.default_branch, commit: lista.map(c => ({ sha: c.sha, messaggio: c.commit.message.split("\n")[0], data: c.commit.author?.date })) };
}

// Annulla una modifica di Studio: riporta il sito a com'era PRIMA di quel commit (con un nuovo commit, la storia resta).
export async function annullaCommit(token, owner, repo, sha) {
  const info = await gh(token, `/repos/${owner}/${repo}`);
  const branch = info.default_branch;
  const c = await gh(token, `/repos/${owner}/${repo}/git/commits/${sha}`);
  if (!c.message.startsWith("Studio:")) throw new Error("Si possono annullare solo le modifiche fatte con Studio.");
  const padre = c.parents?.[0]?.sha;
  if (!padre) throw new Error("Questa modifica non ha una versione precedente.");
  const cp = await gh(token, `/repos/${owner}/${repo}/git/commits/${padre}`);
  const ref = await gh(token, `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
  const nuovo = await gh(token, `/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: { message: `Studio: annullata la modifica "${c.message.replace(/^Studio:\s*/, "").split("\n")[0].slice(0, 60)}"`, tree: cp.tree.sha, parents: [ref.object.sha] },
  });
  await gh(token, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, { method: "PATCH", body: { sha: nuovo.sha } });
  return nuovo.sha;
}

// Stato della pubblicazione su Vercel (Vercel scrive su GitHub lo stato di ogni deploy).
export async function statoPubblicazione(token, owner, repo, sha) {
  const q = sha ? `sha=${sha}` : "environment=Production";
  const lista = await gh(token, `/repos/${owner}/${repo}/deployments?${q}&per_page=5`);
  if (!lista.length) return { stato: "nessuno", url: null };
  const d = lista[0];
  const st = await gh(token, `/repos/${owner}/${repo}/deployments/${d.id}/statuses?per_page=1`);
  const s = st[0];
  return { stato: s ? s.state : "pending", url: s?.environment_url || s?.target_url || null };
}
