// src/lib/activityLog.ts
// Activity log katmanı. Fotoğraftaki gibi "Edited file +14 -5 · Ran N commands · 3 notes" tarzı.
// Her oturuma ait activity olayları session JSON'ında tutulur.
// Koordinatör her anlamlı eylem yaptığında bu log güncellenir.

export type ActivityKind =
  | "edit"        // Dosya düzenlendi
  | "run"         // Komut çalıştırıldı
  | "view"        // Dosya görüntülendi / okundu
  | "note"        // Ajan notu / düşüncesi
  | "search"      // Web araması
  | "map"         // Codebase map güncellendi
  | "tool"        // Eklenti aracı çalıştırıldı (Tool Call)
  | "pipeline"    // Pipeline adımı
  | "error";      // Hata

export interface FileChange {
  path: string;
  added: number;
  removed: number;
}

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  timestamp: string;
  // edit için
  files?: FileChange[];
  // run için
  command?: string;
  exitCode?: number;
  // note / pipeline için
  message?: string;
  // search için
  query?: string;
  resultCount?: number;
  // tool için
  toolName?: string;
  pluginName?: string;
  toolOutput?: string;
  // pipeline için
  stage?: string;
  status?: "running" | "done" | "error";
}

export interface ActivityGroup {
  /** Bir asistan yanıtına karşılık gelen olaylar grubu */
  turnId: string;
  startedAt: string;
  events: ActivityEvent[];
  summary?: string; // "Edited 2 files, ran 3 commands · 1 note"
}

// ─── Özet üretici ─────────────────────────────────────────────────────────────

export function summarizeGroup(group: ActivityGroup): string {
  const edits = group.events.filter((e) => e.kind === "edit");
  const runs = group.events.filter((e) => e.kind === "run");
  const views = group.events.filter((e) => e.kind === "view");
  const notes = group.events.filter((e) => e.kind === "note");
  const searches = group.events.filter((e) => e.kind === "search");
  const tools = group.events.filter((e) => e.kind === "tool");

  const parts: string[] = [];

  if (tools.length > 0) {
    parts.push(`executed ${tools.length} tool${tools.length !== 1 ? "s" : ""}`);
  }
  if (edits.length > 0) {
    const totalFiles = new Set(edits.flatMap((e) => (e.files ?? []).map((f) => f.path))).size;
    parts.push(`Edited ${totalFiles} file${totalFiles !== 1 ? "s" : ""}`);
  }
  if (views.length > 0) {
    parts.push(`viewed ${views.length} file${views.length !== 1 ? "s" : ""}`);
  }
  if (runs.length > 0) {
    parts.push(`ran ${runs.length} command${runs.length !== 1 ? "s" : ""}`);
  }
  if (searches.length > 0) {
    parts.push(`${searches.length} web search${searches.length !== 1 ? "es" : ""}`);
  }
  if (notes.length > 0) {
    parts.push(`${notes.length} note${notes.length !== 1 ? "s" : ""}`);
  }

  return parts.join(", ");
}

export function makeToolEvent(
  toolName: string,
  pluginName: string,
  output: string,
  status: "running" | "done" | "error" = "done"
): ActivityEvent {
  return {
    id: makeId(),
    kind: "tool",
    timestamp: new Date().toISOString(),
    toolName,
    pluginName,
    toolOutput: output,
    status,
  };
}

// ─── Builder yardımcıları ─────────────────────────────────────────────────────

let _counter = 0;
function makeId(): string {
  return `act_${Date.now()}_${++_counter}`;
}

export function makeEditEvent(files: FileChange[]): ActivityEvent {
  return {
    id: makeId(),
    kind: "edit",
    timestamp: new Date().toISOString(),
    files,
  };
}

export function makeRunEvent(command: string, exitCode?: number): ActivityEvent {
  return {
    id: makeId(),
    kind: "run",
    timestamp: new Date().toISOString(),
    command,
    exitCode,
  };
}

export function makeViewEvent(filePath: string): ActivityEvent {
  return {
    id: makeId(),
    kind: "view",
    timestamp: new Date().toISOString(),
    files: [{ path: filePath, added: 0, removed: 0 }],
  };
}

export function makeNoteEvent(message: string): ActivityEvent {
  return {
    id: makeId(),
    kind: "note",
    timestamp: new Date().toISOString(),
    message,
  };
}

export function makeSearchEvent(query: string, resultCount: number): ActivityEvent {
  return {
    id: makeId(),
    kind: "search",
    timestamp: new Date().toISOString(),
    query,
    resultCount,
  };
}

export function makePipelineEvent(
  stage: string,
  status: "running" | "done" | "error",
  message?: string
): ActivityEvent {
  return {
    id: makeId(),
    kind: "pipeline",
    timestamp: new Date().toISOString(),
    stage,
    status,
    message,
  };
}

export function makeMapEvent(fileCount: number): ActivityEvent {
  return {
    id: makeId(),
    kind: "map",
    timestamp: new Date().toISOString(),
    message: `Codebase map güncellendi: ${fileCount} dosya`,
  };
}

// ─── Group yönetimi ───────────────────────────────────────────────────────────

export function createGroup(turnId: string): ActivityGroup {
  return {
    turnId,
    startedAt: new Date().toISOString(),
    events: [],
  };
}

export function addEvent(group: ActivityGroup, event: ActivityEvent): void {
  group.events.push(event);
  group.summary = summarizeGroup(group);
}
