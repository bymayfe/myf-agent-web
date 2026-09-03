// src/lib/plugins/builtins/terminalRegistry.ts
// Süreç-genelinde (process-wide) canlı terminal görev kayıt defteri.
//
// SORUN: Önceden her `run_command` çağrısının çıktısı yalnızca o anki tek bir
// /api/chat SSE bağlantısına (`enqueue`) yazılıyordu. Kullanıcı F5 basıp
// sayfayı yenilediğinde veya sekme değiştirdiğinde tarayıcı o HTTP bağlantısını
// koparıyor, React tarafındaki `useCoordinatorChat` state'i (bir `useRef<Map>`)
// sıfırlanıyor ve ekrandaki metin/terminal çıktısı kayboluyor — ANCAK Node.js
// tarafında spawn edilen alt süreç (child_process) hâlâ çalışmaya devam ediyor
// ve artık kapanmış olan `ReadableStreamDefaultController`'a `enqueue` çağırmayı
// sürdürüyor. Bu da "Invalid state: Controller is already closed" hatasına ve
// process.on('uncaughtException') günlüklerine yol açıyordu.
//
// ÇÖZÜM: Çalışan her komutu, HTTP isteğinden bağımsız, bu modülün tuttuğu
// process-wide bir Map'e kaydet. Next.js dev sunucusunda modüller sıcak-yeniden-
// yükleme (HMR) dışında bellekte kalıcı olduğundan, bu registry sayfa
// yenilemelerine ve yeni SSE bağlantılarına hayatta kalır. UI, /api/terminal/tasks
// uç noktalarını kullanarak bu registry'i bağımsız olarak sorgulayabilir/
// abone olabilir ve çalışan bir görevi gerçekten sonlandırabilir (SIGTERM/SIGKILL).

import type { ChildProcess } from "child_process";

export type TerminalTaskStatus = "running" | "completed" | "error" | "killed";

export interface TerminalTaskRecord {
  id: string;
  command: string;
  cwd: string;
  status: TerminalTaskStatus;
  output: string;
  startedAt: string;
  endedAt?: string;
  sessionId?: string;
  exitCode?: number | null;
}

interface InternalRecord extends TerminalTaskRecord {
  child: ChildProcess | null;
  listeners: Set<(chunk: string) => void>;
}

// globalThis üzerinde tutuyoruz ki Next.js'in modül önbelleğini/HMR'ı
// yenilese bile (dev modda route derlemeleri sırasında olabiliyor) registry
// sıfırlanmasın.
const g = globalThis as unknown as { __myfTerminalRegistry?: Map<string, InternalRecord> };
if (!g.__myfTerminalRegistry) {
  g.__myfTerminalRegistry = new Map();
}
const registry = g.__myfTerminalRegistry;

// Bellek şişmesini önlemek için en fazla bu kadar tamamlanmış görev tutulur.
const MAX_COMPLETED_TASKS = 40;

function pruneCompleted() {
  const completed = Array.from(registry.values())
    .filter((t) => t.status !== "running")
    .sort((a, b) => (a.endedAt || "").localeCompare(b.endedAt || ""));
  while (completed.length > MAX_COMPLETED_TASKS) {
    const oldest = completed.shift();
    if (oldest) registry.delete(oldest.id);
  }
}

export function registerTask(params: {
  id: string;
  command: string;
  cwd: string;
  sessionId?: string;
  child: ChildProcess;
}): void {
  registry.set(params.id, {
    id: params.id,
    command: params.command,
    cwd: params.cwd,
    sessionId: params.sessionId,
    status: "running",
    output: "",
    startedAt: new Date().toISOString(),
    child: params.child,
    listeners: new Set(),
  });
}

export function appendOutput(id: string, chunk: string): void {
  const rec = registry.get(id);
  if (!rec) return;
  rec.output += chunk;
  // Tek bir görevin çıktısının sonsuza kadar büyümesini engelle (~2MB cap)
  if (rec.output.length > 2_000_000) {
    rec.output = rec.output.slice(-1_500_000);
  }
  for (const listener of rec.listeners) {
    try {
      listener(chunk);
    } catch {
      // dinleyici patlarsa görmezden gel
    }
  }
}

export function finishTask(id: string, status: "completed" | "error", exitCode?: number | null): void {
  const rec = registry.get(id);
  if (!rec) return;
  rec.status = status;
  rec.exitCode = exitCode ?? null;
  rec.endedAt = new Date().toISOString();
  rec.child = null;
  pruneCompleted();
}

/** Çalışan bir görevi gerçekten sonlandırır (SIGTERM, kısa süre sonra SIGKILL). */
export function killTask(id: string): { success: boolean; message: string } {
  const rec = registry.get(id);
  if (!rec) return { success: false, message: "Görev bulunamadı." };
  if (rec.status !== "running" || !rec.child) {
    return { success: false, message: "Görev zaten çalışmıyor." };
  }
  try {
    rec.child.kill("SIGTERM");
    const pid = rec.child.pid;
    setTimeout(() => {
      // Süreç 2sn içinde kapanmadıysa zorla öldür.
      if (rec.status === "running" && pid) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // zaten ölmüş olabilir
        }
      }
    }, 2000);
    rec.status = "killed";
    rec.endedAt = new Date().toISOString();
    rec.child = null;
    return { success: true, message: "Sonlandırma sinyali gönderildi." };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Sonlandırılamadı." };
  }
}

export function getTask(id: string): TerminalTaskRecord | null {
  const rec = registry.get(id);
  if (!rec) return null;
  const { child: _child, listeners: _listeners, ...pub } = rec;
  return pub;
}

export function listTasks(sessionId?: string): TerminalTaskRecord[] {
  const all = Array.from(registry.values())
    .filter((t) => !sessionId || t.sessionId === sessionId)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return all.map(({ child: _child, listeners: _listeners, ...pub }) => pub);
}

/** Görev tamamlanana veya yeni bir parça (chunk) gelene kadar bekleyen basit long-poll aboneliği. */
export function subscribe(id: string, onChunk: (chunk: string) => void): () => void {
  const rec = registry.get(id);
  if (!rec) return () => {};
  rec.listeners.add(onChunk);
  return () => rec.listeners.delete(onChunk);
}
