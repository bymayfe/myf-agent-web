// src/lib/store.ts
// Basit dosya tabanlı kalıcılık katmanı. Python tarafındaki settings.json /
// providers_config.json / .myfcli/sessions/*.json dosyalarının TS karşılığı.
// Sunucu tarafında (Node runtime, route handler'lar) çalışır — istemciden import edilmez.

import { promises as fs } from "fs";
import fsSync from "fs";
import path from "path";
import type { Settings, ProvidersFile, SessionFile, SessionMeta, ProjectEntry } from "@/types";
import { DEFAULT_PROVIDERS, DEFAULT_SETTINGS_JSON } from "./defaultProviders";

const DATA_DIR = path.join(process.cwd(), "data");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");
const PROVIDERS_PATH = path.join(DATA_DIR, "providers_config.json");
const PROJECTS_PATH = path.join(DATA_DIR, "projects.json");

async function ensureDataDirs() {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, data: unknown) {
  await ensureDataDirs();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ─── Settings ──────────────────────────────────────────────

export async function getSettings(): Promise<Settings> {
  await ensureDataDirs();
  return readJson<Settings>(SETTINGS_PATH, DEFAULT_SETTINGS_JSON as Settings);
}

export async function saveSettings(partial: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const merged = { ...current, ...partial };
  await writeJson(SETTINGS_PATH, merged);
  return merged;
}

// ─── Providers ─────────────────────────────────────────────

export async function getProviders(): Promise<ProvidersFile> {
  await ensureDataDirs();
  return readJson<ProvidersFile>(PROVIDERS_PATH, DEFAULT_PROVIDERS);
}

export async function setActiveProvider(name: string): Promise<ProvidersFile> {
  const providers = await getProviders();
  if (!providers.providers[name]) {
    throw new Error(`Bilinmeyen sağlayıcı: ${name}`);
  }
  providers.active_provider = name;
  await writeJson(PROVIDERS_PATH, providers);
  return providers;
}

export async function updateProviderModel(providerName: string, modelId: string): Promise<void> {
  const providers = await getProviders();
  const prov = providers.providers[providerName];
  if (prov) {
    prov.agent_models = prov.agent_models || ({} as any);
    prov.agent_models.coordinator = modelId;

    // Model context window içine de ekle (hafızaya kaydet)
    prov.model_context_windows = prov.model_context_windows || {};
    const prefix = prov.model_prefix ? `${prov.model_prefix}/` : "";
    const cleanKey = modelId.startsWith(prefix) ? modelId.slice(prefix.length) : modelId;
    if (!prov.model_context_windows[cleanKey] && !prov.model_context_windows[modelId]) {
      prov.model_context_windows[cleanKey] = prov.default_context_window || 131072;
    }

    await writeJson(PROVIDERS_PATH, providers);
  }
}

/** İlgili sağlayıcının gerçek API anahtarını .env.local'den okur. */
export function getProviderApiKey(envVarName: string | null): string {
  if (!envVarName) return "";
  if (process.env[envVarName]) return process.env[envVarName]!;

  try {
    const envPath = path.join(process.cwd(), ".env.local");
    if (fsSync.existsSync(envPath)) {
      const content = fsSync.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
          const [key, ...valParts] = trimmed.split("=");
          if (key.trim() === envVarName) {
            const val = valParts.join("=").trim().replace(/^["']|["']$/g, "");
            process.env[envVarName] = val;
            return val;
          }
        }
      }
    }
  } catch {}

  return "";
}

/** Sağlayıcı için API anahtarını .env.local dosyasına yazar. */
export async function setProviderApiKey(envVarName: string, key: string): Promise<void> {
  if (!envVarName || !key) return;
  const envPath = path.join(process.cwd(), ".env.local");
  try {
    let content = "";
    try {
      content = await fs.readFile(envPath, "utf-8");
    } catch {
      content = "";
    }
    const lines = content.split("\n").filter((l) => !l.startsWith(`${envVarName}=`));
    lines.push(`${envVarName}=${key.trim()}`);
    await fs.writeFile(envPath, lines.join("\n") + "\n", "utf-8");
    process.env[envVarName] = key.trim();
  } catch (err) {
    console.error("Failed to write .env.local", err);
  }
}

// ─── Sessions ──────────────────────────────────────────────

function sessionPath(id: string) {
  return path.join(SESSIONS_DIR, `${id}.json`);
}

export async function listSessions(): Promise<SessionMeta[]> {
  await ensureDataDirs();
  const files = await fs.readdir(SESSIONS_DIR);
  const metas: SessionMeta[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const full = await readJson<SessionFile | null>(path.join(SESSIONS_DIR, f), null);
    if (full) {
      // Mesaj içermeyen boş oturumları listede gösterme
      if (!full.conversation_history || full.conversation_history.length === 0) {
        continue;
      }
      const { conversation_history: _unused, ...meta } = full;
      void _unused;
      metas.push(meta);
    }
  }
  return metas.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

export async function loadSession(id: string): Promise<SessionFile | null> {
  return readJson<SessionFile | null>(sessionPath(id), null);
}

export async function createSession(title: string, slug: string, projectDir?: string): Promise<SessionFile> {
  await ensureDataDirs();
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const workspaceRoot = path.resolve(process.cwd(), "..");
  const resolvedDir = projectDir && projectDir.trim()
    ? projectDir.trim()
    : workspaceRoot;
  const session: SessionFile = {
    session_id: id,
    title,
    slug,
    project_dir: resolvedDir,
    created_at: now,
    updated_at: now,
    conversation_history: [],
  };
  await writeJson(sessionPath(id), session);
  return session;
}

export async function saveSessionHistory(
  id: string,
  history: SessionFile["conversation_history"]
): Promise<void> {
  const session = await loadSession(id);
  if (!session) return;
  session.conversation_history = history;
  session.updated_at = new Date().toISOString();
  await writeJson(sessionPath(id), session);
}

export async function updateSessionTitle(id: string, newTitle: string): Promise<void> {
  const session = await loadSession(id);
  if (!session) return;
  session.title = newTitle.trim();
  session.updated_at = new Date().toISOString();
  await writeJson(sessionPath(id), session);
}

export async function deleteSession(id: string): Promise<void> {
  try {
    await fs.unlink(sessionPath(id));
  } catch {
    /* zaten yoksa sorun değil */
  }
}

// ─── Projects ──────────────────────────────────────────────

export async function listProjects(): Promise<ProjectEntry[]> {
  await ensureDataDirs();
  const list = await readJson<ProjectEntry[]>(PROJECTS_PATH, []);
  // Her projenin klasörünün gerçekten var olup olmadığını kontrol et
  const checked: ProjectEntry[] = [];
  for (const p of list) {
    const exists = await fs.stat(p.path).then(() => true).catch(() => false);
    checked.push({ ...p, exists });
  }
  return checked;
}

export async function addProject(name: string, dirPath: string): Promise<ProjectEntry> {
  await ensureDataDirs();
  const list = await listProjects();
  const entry: ProjectEntry = {
    id: `proj_${Date.now()}`,
    name: name || dirPath.split("/").pop() || dirPath,
    path: dirPath,
    addedAt: new Date().toISOString(),
    exists: true,
  };
  list.push(entry);
  await writeJson(PROJECTS_PATH, list.map(({ exists: _e, ...rest }) => rest));
  return entry;
}

export async function deleteProject(id: string, deleteSessions = false): Promise<void> {
  await ensureDataDirs();
  const list = await listProjects();
  const proj = list.find((p) => p.id === id);
  const filtered = list.filter((p) => p.id !== id).map(({ exists: _e, ...rest }) => rest);
  await writeJson(PROJECTS_PATH, filtered);

  // Projeye bağlı oturumları da sil
  if (deleteSessions && proj) {
    const files = await fs.readdir(SESSIONS_DIR).catch(() => [] as string[]);
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const full = await readJson<{ project_dir?: string; slug?: string; title?: string } | null>(
        path.join(SESSIONS_DIR, f),
        null
      );
      if (!full) continue;
      const sDir = (full.project_dir || "").replace(/\/$/, "");
      const pPath = (proj.path || "").replace(/\/$/, "");
      const pName = (proj.name || "").toLowerCase();
      const sSlug = (full.slug || "").toLowerCase();
      const sTitle = (full.title || "").toLowerCase();
      const belongs =
        (sDir && (sDir === pPath || sDir.startsWith(pPath))) ||
        (sSlug && sSlug === pName) ||
        (sDir && pName && sDir.endsWith(`/${pName}`)) ||
        (sTitle && pName && sTitle.startsWith(pName));
      if (belongs) {
        await fs.unlink(path.join(SESSIONS_DIR, f)).catch(() => {});
      }
    }
  }
}
