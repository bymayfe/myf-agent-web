// src/lib/store.ts
// Basit dosya tabanlı kalıcılık katmanı. Python tarafındaki settings.json /
// providers_config.json / .myfcli/sessions/*.json dosyalarının TS karşılığı.
// Sunucu tarafında (Node runtime, route handler'lar) çalışır — istemciden import edilmez.

import { promises as fs } from "fs";
import fsSync from "fs";
import path from "path";
import type { Settings, ProvidersFile, SessionFile, SessionMeta, ProjectEntry } from "@/types";
import { DEFAULT_PROVIDERS, DEFAULT_SETTINGS_JSON } from "./defaultProviders";

export function getProjectsBaseDir(): string {
  if (process.env.AGENT_PROJECTS_DIR) {
    return path.resolve(process.env.AGENT_PROJECTS_DIR);
  }
  // 1. Monorepo kontrolü (CLI_Project/agent_system/projects)
  const monorepo = path.resolve(process.cwd(), "..", "agent_system", "projects");
  if (fsSync.existsSync(path.resolve(process.cwd(), "..", "agent_system"))) {
    return monorepo;
  }
  // 2. Yan yana klonlanan repo kontrolü (../myf-agent-cli/agent_system/projects)
  const siblingCli = path.resolve(process.cwd(), "..", "myf-agent-cli", "agent_system", "projects");
  if (fsSync.existsSync(path.resolve(process.cwd(), "..", "myf-agent-cli", "agent_system"))) {
    return siblingCli;
  }
  // 3. Standalone Next.js modu: Uygulama içindeki "projects" klasörü
  return path.resolve(process.cwd(), "projects");
}

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
  if (providers.providers[providerName]) {
    providers.providers[providerName].agent_models = providers.providers[providerName].agent_models || {} as any;
    providers.providers[providerName].agent_models.coordinator = modelId;
    await writeJson(PROVIDERS_PATH, providers);
  }
}

/** İlgili sağlayıcının gerçek API anahtarını .env.local'den okur. Asla diske yazılmaz. */
export function getProviderApiKey(envVarName: string | null): string {
  if (!envVarName) return "";
  return process.env[envVarName] ?? "";
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

const PROJECTS_BASE_DIR = path.resolve(process.cwd(), "..", "agent_system", "projects");

export async function createSession(title: string, slug: string, projectDir?: string): Promise<SessionFile> {
  await ensureDataDirs();
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const nowIso = now.toISOString();

  let resolvedDir = projectDir && projectDir.trim() ? projectDir.trim() : "";
  // Eğer kullanıcı özel bir klasör seçmediyse, Python CLI ile birebir aynı:
  // agent_system/projects/ altında her oturum için izole bir proje klasörü tahsis et
  if (!resolvedDir) {
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const cleanSlug = (slug || "yeni_proje").replace(/[^a-zA-Z0-9_\-]/g, "_").toLowerCase();
    const folderName = `${dateStr}_${cleanSlug}`;
    const baseDir = getProjectsBaseDir();
    resolvedDir = path.join(baseDir, folderName);
    try {
      await fs.mkdir(resolvedDir, { recursive: true });
    } catch {
      // ignore
    }
  }

  const session: SessionFile = {
    session_id: id,
    title,
    slug,
    project_dir: resolvedDir,
    created_at: nowIso,
    updated_at: nowIso,
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
  const cleanTitle = newTitle.trim();
  session.title = cleanTitle;
  session.updated_at = new Date().toISOString();

  // Eğer oturumun proje dizini PROJECTS_BASE_DIR içinde ve henüz "yeni_proje" ise,
  // Python CLI gibi klasör adını yeni başlığın slug'ı ile güncelle:
  const baseDir = getProjectsBaseDir();
  if (
    session.project_dir &&
    (session.project_dir.startsWith(baseDir) || session.project_dir.includes("agent_system/projects") || session.project_dir.includes("/projects/")) &&
    session.project_dir.includes("yeni_proje")
  ) {
    const parentDir = path.dirname(session.project_dir);
    const oldBase = path.basename(session.project_dir);
    const timePrefix = oldBase.split("_").slice(0, 2).join("_");
    const newSlug = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").slice(0, 30);
    if (newSlug) {
      const newFolderName = `${timePrefix}_${newSlug}`;
      const newDir = path.join(parentDir, newFolderName);
      try {
        await fs.rename(session.project_dir, newDir);
        session.project_dir = newDir;
        session.slug = newSlug;
      } catch {
        // rename başarısızsa eski yolda devam et
      }
    }
  }

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
