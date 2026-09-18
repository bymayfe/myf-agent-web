// src/lib/terminalManager.ts
// Arka plan terminal süreç yöneticisi.
// Süreç grubu izolasyonu, süreç ağacı sonlandırma (killProcessTree), port tespiti ve yetim dev sunucuları tarama özelliklerini sağlar.

import { spawn, execSync, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";

export type TerminalTaskStatus = "running" | "completed" | "error" | "stopped";

export interface TerminalTaskRecord {
  id: string;
  command: string;
  cwd?: string;
  status: TerminalTaskStatus;
  output: string;
  startedAt: string;
  endedAt?: string;
  pid?: number;
  port?: number;
  exitCode?: number | null;
  isOrphan?: boolean;
}

export interface SpawnOptions {
  id?: string;
  cmd: string;
  cwd?: string;
  onChunk?: (chunk: string) => void;
  autoKillDevServerOnReady?: boolean;
}

/**
 * Süreç ağacını (ana süreç ve tüm çocuk süreçler: node, next-server, npm vb.) güvenle ve tamamen sonlandırır.
 */
export async function killProcessTree(pid: number, signal: NodeJS.Signals = "SIGTERM"): Promise<boolean> {
  if (!pid || pid <= 1) return false;

  try {
    // 1. Süreç grubu ID'sine sinyal gönder (detached süreçler)
    try {
      process.kill(-pid, signal);
    } catch {
      // Süreç grubu olmayabilir, yoksay
    }

    // 2. pkill ile doğrudan ve dolaylı çocuk süreçleri sonlandır
    try {
      execSync(`pkill -P ${pid} -${signal === "SIGKILL" ? "9" : "15"} 2>/dev/null || true`);
    } catch {
      // yoksay
    }

    // 3. Ana sürece doğrudan sinyal gönder
    try {
      process.kill(pid, signal);
    } catch {
      // yoksay
    }

    // 4. Eğer SIGKILL değilse, kısa süre bekle ve hala hayattaysa SIGKILL ile zorla kapat
    if (signal !== "SIGKILL") {
      await new Promise((r) => setTimeout(r, 500));
      let isAlive = false;
      try {
        process.kill(pid, 0);
        isAlive = true;
      } catch {
        isAlive = false;
      }

      if (isAlive) {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          // yoksay
        }
        try {
          execSync(`pkill -9 -P ${pid} 2>/dev/null || true`);
        } catch {
          // yoksay
        }
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // yoksay
        }
      }
    }

    return true;
  } catch (err) {
    console.error(`killProcessTree hatası (PID: ${pid}):`, err);
    return false;
  }
}

/**
 * Çıktı metninden port numarasını yakalar (3000, 3001, 8080 vb.)
 */
export function extractPortFromText(text: string): number | undefined {
  const patterns = [
    /(?:localhost|127\.0\.0\.1):(\d{2,5})/i,
    /port\s*[:=]?\s*(\d{2,5})/i,
    /ready\s+on\s+.*:(\d{2,5})/i,
    /listening\s+on\s+.*:(\d{2,5})/i,
    /local:\s+http:\/\/.*:(\d{2,5})/i,
    /network:\s+http:\/\/.*:(\d{2,5})/i,
  ];

  for (const regex of patterns) {
    const match = text.match(regex);
    if (match && match[1]) {
      const p = parseInt(match[1], 10);
      if (p > 1024 && p < 65535 && p !== 3111) {
        return p;
      }
    }
  }
  return undefined;
}

class TerminalManager {
  private tasks: Map<string, TerminalTaskRecord> = new Map();
  private childProcesses: Map<string, ChildProcess> = new Map();
  private listeners: Map<string, Set<(chunk: string) => void>> = new Map();

  constructor() {
    // Başlangıçta sistemdeki yetim dev sunucuları tara
    this.scanRunningDevServers().catch(() => {});
  }

  /**
   * Görevi ID'ye göre getirir ve canlılığını doğrular.
   */
  public getTask(id: string): TerminalTaskRecord | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    if (task.status === "running" && task.pid) {
      try {
        process.kill(task.pid, 0); // Canlı mı testi
      } catch {
        // Süreç ölmüş
        task.status = "stopped";
        task.endedAt = new Date().toISOString();
      }
    }

    return task;
  }

  /**
   * Tüm görevleri listeler ve arka plan durumlarını yeniler.
   */
  public async getTasks(): Promise<TerminalTaskRecord[]> {
    // Yetim dev serverları tara ve listeye ekle
    await this.scanRunningDevServers();

    for (const task of this.tasks.values()) {
      if (task.status === "running" && task.pid) {
        try {
          process.kill(task.pid, 0);
        } catch {
          task.status = "stopped";
          task.endedAt = task.endedAt || new Date().toISOString();
        }
      }
    }

    return Array.from(this.tasks.values()).sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    );
  }

  /**
   * Sisteme dışarıdan veya önceden açılmış olan dev sunucu süreçlerini (Next.js, Vite vb.) tarar ve ekler.
   */
  public async scanRunningDevServers(): Promise<void> {
    try {
      // 1. Öncelik: ss -tlpn (hızlı ve glibc double-free hatası vermez)
      let ssOut = "";
      try {
        ssOut = execSync("ss -tlpn 2>/dev/null || true", { encoding: "utf-8" });
      } catch {
        ssOut = "";
      }

      if (ssOut && ssOut.includes("LISTEN")) {
        const lines = ssOut.trim().split("\n");
        for (const line of lines) {
          if (!line.includes("LISTEN")) continue;

          const portMatch = line.match(/:(\d+)\s+/);
          const pidMatch = line.match(/pid=(\d+)/);
          if (!portMatch || !pidMatch) continue;

          const port = parseInt(portMatch[1], 10);
          const pid = parseInt(pidMatch[1], 10);

          if (!pid || !port || port === 3111) continue; // 3111 Web UI portunu atla
          const isDevPort =
            (port >= 3000 && port <= 3020) ||
            (port >= 5000 && port <= 5020) ||
            (port >= 8000 && port <= 8090);
          if (!isDevPort) continue;

          // Zaten kayıtlı mı?
          const alreadyTracked = Array.from(this.tasks.values()).some(
            (t) => t.pid === pid || (t.port === port && t.status === "running")
          );
          if (alreadyTracked) continue;

          let procCwd = "";
          try {
            procCwd = fs.readlinkSync(`/proc/${pid}/cwd`);
          } catch {
            procCwd = "";
          }

          let cmdline = "";
          try {
            cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, "utf-8").replace(/\0/g, " ").trim();
          } catch {
            cmdline = `node/dev-server (PID ${pid})`;
          }

          const folderName = procCwd ? path.basename(procCwd) : "";
          const taskId = `proc_${pid}_${port}`;
          const displayCommand = folderName ? `npm run dev [${folderName} :${port}]` : `${cmdline.slice(0, 50)} [:${port}]`;

          this.tasks.set(taskId, {
            id: taskId,
            command: displayCommand,
            cwd: procCwd,
            status: "running",
            output: `[Sistemde Aktif Çalışan Süreç Tespit Edildi]\nPID: ${pid}\nPort: ${port}\nKomut: ${cmdline}\nDizin: ${procCwd}\nDurum: Dinleniyor (TCP LISTEN)\n\nBu süreci sonlandırmak ve portu serbest bırakmak için 'İşlemi Durdur' butonunu kullanabilirsiniz.\n`,
            startedAt: new Date().toISOString(),
            pid,
            port,
            isOrphan: true,
          });
        }
        return;
      }

      // 2. Fallback: lsof
      const lsofOut = execSync("lsof -iTCP:3000-3015,5000-5010,8000-8090 -sTCP:LISTEN -P -n 2>/dev/null || true", {
        encoding: "utf-8",
      });

      const lines = lsofOut.trim().split("\n");
      for (const line of lines) {
        if (!line || line.startsWith("COMMAND")) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 9) continue;

        const cmdName = parts[0];
        const pid = parseInt(parts[1], 10);
        const nameCol = parts[parts.length - 1];
        const portMatch = nameCol.match(/:(\d+)$/);
        const port = portMatch ? parseInt(portMatch[1], 10) : undefined;

        if (!pid || !port || port === 3111) continue;

        const alreadyTracked = Array.from(this.tasks.values()).some(
          (t) => t.pid === pid || (t.port === port && t.status === "running")
        );
        if (alreadyTracked) continue;

        let procCwd = "";
        try {
          procCwd = fs.readlinkSync(`/proc/${pid}/cwd`);
        } catch {
          procCwd = "";
        }

        let cmdline = "";
        try {
          cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, "utf-8").replace(/\0/g, " ").trim();
        } catch {
          cmdline = cmdName;
        }

        const taskId = `proc_${pid}_${port}`;
        const folderName = procCwd ? path.basename(procCwd) : "";
        const displayCommand = folderName ? `npm run dev [${folderName} :${port}]` : `${cmdline.slice(0, 50)} [:${port}]`;

        this.tasks.set(taskId, {
          id: taskId,
          command: displayCommand,
          cwd: procCwd,
          status: "running",
          output: `[Sistemde Aktif Çalışan Süreç Tespit Edildi]\nPID: ${pid}\nPort: ${port}\nKomut: ${cmdline}\nDizin: ${procCwd}\nDurum: Dinleniyor (TCP LISTEN)\n\nBu süreci sonlandırmak ve portu serbest bırakmak için 'İşlemi Durdur' butonunu kullanabilirsiniz.\n`,
          startedAt: new Date().toISOString(),
          pid,
          port,
          isOrphan: true,
        });
      }
    } catch {
      // ignore
    }
  }

  /**
   * Canlı çıktı akışı dinleyicisi ekler.
   */
  public subscribe(taskId: string, listener: (chunk: string) => void): () => void {
    if (!this.listeners.has(taskId)) {
      this.listeners.set(taskId, new Set());
    }
    this.listeners.get(taskId)!.add(listener);

    return () => {
      const set = this.listeners.get(taskId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) this.listeners.delete(taskId);
      }
    };
  }

  /**
   * Bir göreve ait çıktıyı dinleyicilere basar ve tamponlar.
   */
  public emitChunk(taskId: string, chunk: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.output += chunk;
      if (!task.port) {
        const detected = extractPortFromText(chunk);
        if (detected) task.port = detected;
      }
    }

    const set = this.listeners.get(taskId);
    if (set) {
      for (const listener of set) {
        try {
          listener(chunk);
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * Yeni bir komut çalıştırır ve canlı yayınlar.
   */
  public runCommand(options: SpawnOptions): Promise<{ success: boolean; output: string }> {
    const {
      id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      cmd,
      cwd = process.cwd(),
      onChunk,
      autoKillDevServerOnReady = false,
    } = options;

    return new Promise((resolve) => {
      // Tehlikeli komut kontrolü
      if (cmd.includes("rm -rf /") || cmd.includes(":(){ :|:& };:")) {
        const err = "Güvenlik nedeniyle bu komut engellendi.";
        onChunk?.(err);
        return resolve({ success: false, output: err });
      }

      // Otomatik non-interactive bayrakları ekle
      let processedCmd = cmd;
      if (processedCmd.startsWith("npx ") && !processedCmd.startsWith("npx -y ") && !processedCmd.startsWith("npx --yes ")) {
        processedCmd = processedCmd.replace(/^npx\s+/, "npx -y ");
      }
      if (processedCmd.includes("create-next-app") && !processedCmd.includes("--yes")) {
        processedCmd += " --yes";
      }
      if (processedCmd.includes("npm init") && !processedCmd.includes("-y") && !processedCmd.includes("--yes")) {
        processedCmd += " -y";
      }

      const childEnv: Record<string, string | undefined> = {
        ...process.env,
        CI: "1",
        DEBIAN_FRONTEND: "noninteractive",
        FORCE_COLOR: "1",
      };
      delete childEnv.PORT; // Web UI 3111 portunun alt projeye sızmasını önle

      const taskRecord: TerminalTaskRecord = {
        id,
        command: cmd,
        cwd,
        status: "running",
        output: "",
        startedAt: new Date().toISOString(),
      };
      this.tasks.set(id, taskRecord);

      let isResolved = false;

      // Linux'ta bağımsız süreç grubuyla detached başlat
      const child = spawn(processedCmd, [], {
        shell: true,
        cwd,
        detached: process.platform !== "win32",
        env: childEnv as NodeJS.ProcessEnv,
      });

      taskRecord.pid = child.pid;
      if (id) {
        this.childProcesses.set(id, child);
      }

      // Dinleyici bağla
      if (onChunk) {
        this.subscribe(id, onChunk);
      }

      // 180 saniyelik güvenlik zaman aşımı
      const timeout = setTimeout(async () => {
        if (!isResolved) {
          isResolved = true;
          if (child.pid) {
            await killProcessTree(child.pid, "SIGKILL");
          }
          const timeoutMsg = "\n[Uyarı: Komut zaman aşımına uğradı (180s) ve sonlandırıldı.]\n";
          this.emitChunk(id, timeoutMsg);
          taskRecord.status = "error";
          taskRecord.endedAt = new Date().toISOString();
          resolve({ success: false, output: taskRecord.output });
        }
      }, 180000);

      const handleData = (data: Buffer) => {
        const text = data.toString("utf-8");
        this.emitChunk(id, text);

        // İnteraktif soru sorulduysa otomatik onay gönder
        if (text.includes("? ") || text.includes("(y/N)") || text.includes("[Y/n]") || text.includes("Enter to submit")) {
          try {
            child.stdin?.write("\n");
          } catch {
            // ignore
          }
        }

        // Eğer sadece test amaçlı çalıştırılıyorsa ve sunucu hazırlandıysa kilitlenmeyi önle
        const isDevServer = /\b(npm\s+run\s+dev|next\s+dev|npm\s+start|npx\s+nodemon|yarn\s+dev|pnpm\s+dev)\b/.test(processedCmd);
        if (autoKillDevServerOnReady && isDevServer && (taskRecord.output.includes("Ready in") || taskRecord.output.includes("Local:") || taskRecord.output.includes("http://localhost"))) {
          setTimeout(async () => {
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeout);
              if (child.pid) {
                // Sadece üst kabuğu değil, node ve next-server çocuklarını da tamamen kapat!
                await killProcessTree(child.pid, "SIGTERM");
              }
              const readyMsg = "\n[Geliştirme sunucusu başarıyla derlendi ve ayağa kalktığı doğrulandı. Portun kilitli kalmaması için test süreci tamamlandı ve süreç sonlandırıldı.]\n";
              this.emitChunk(id, readyMsg);
              taskRecord.status = "completed";
              taskRecord.endedAt = new Date().toISOString();
              resolve({ success: true, output: taskRecord.output });
            }
          }, 3000);
        }
      };

      child.stdout?.on("data", handleData);
      child.stderr?.on("data", handleData);

      child.on("close", (code) => {
        clearTimeout(timeout);
        this.childProcesses.delete(id);
        if (!isResolved) {
          isResolved = true;
          taskRecord.exitCode = code;
          taskRecord.endedAt = new Date().toISOString();
          taskRecord.status = code === 0 ? "completed" : "error";
          resolve({
            success: code === 0,
            output: taskRecord.output || (code === 0 ? "(Başarıyla tamamlandı)" : `Hata (Çıkış kodu: ${code})`),
          });
        }
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        this.childProcesses.delete(id);
        if (!isResolved) {
          isResolved = true;
          const errMsg = `\nKomut başlatılamadı: ${err.message}\n`;
          this.emitChunk(id, errMsg);
          taskRecord.status = "error";
          taskRecord.endedAt = new Date().toISOString();
          resolve({ success: false, output: taskRecord.output });
        }
      });
    });
  }

  /**
   * Görevi ve tüm alt süreçlerini (node, next-server, bash) sonlandırır.
   */
  public async killTask(id: string): Promise<boolean> {
    const task = this.tasks.get(id);
    if (!task) return false;

    if (task.pid) {
      await killProcessTree(task.pid, "SIGTERM");
    }

    const child = this.childProcesses.get(id);
    if (child) {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      this.childProcesses.delete(id);
    }

    task.status = "stopped";
    task.endedAt = new Date().toISOString();
    const stoppedMsg = "\n[⏹️ İşlem durduruldu ve port serbest bırakıldı.]\n";
    this.emitChunk(id, stoppedMsg);

    return true;
  }

  /**
   * Terminal görevini listeden kaldırır (çalışıyorsa önce sonlandırır).
   */
  public async removeTask(id: string): Promise<boolean> {
    const task = this.tasks.get(id);
    if (!task) return false;

    if (task.status === "running") {
      await this.killTask(id);
    }

    this.childProcesses.delete(id);
    this.listeners.delete(id);
    return this.tasks.delete(id);
  }

  /**
   * Tamamlanmış veya durdurulmuş görevleri temizler.
   */
  public clearFinished(): void {
    for (const [id, task] of this.tasks.entries()) {
      if (task.status !== "running") {
        this.tasks.delete(id);
        this.listeners.delete(id);
        this.childProcesses.delete(id);
      }
    }
  }
}

const globalForTerminal = globalThis as unknown as { terminalManager?: TerminalManager };
export const terminalManager = new TerminalManager();
globalForTerminal.terminalManager = terminalManager;
