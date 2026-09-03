// src/lib/codebaseMemoryClient.ts
// DeusData/codebase-memory-mcp (v0.10.8) için TypeScript JSON-RPC MCP İstemcisi.
// Proje mimarisini, sembol grafiğini, çağrı yollarını ve AST bağlantılarını sorgular.

import { spawn, ChildProcess } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: {
    content?: Array<{ type: string; text?: string }>;
    [key: string]: unknown;
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

class CodebaseMemoryClient {
  private proc: ChildProcess | null = null;
  private reqId = 0;
  private pendingRequests = new Map<number, (res: JsonRpcResponse) => void>();
  private buffer = "";
  private isInitialized = false;
  private binaryPath: string | null = null;
  private isDisabled = false;
  private _warnedMissing = false;

  private async findBinary(): Promise<string | null> {
    if (this.binaryPath) return this.binaryPath;

    const rootDir = path.resolve(process.cwd(), "..");
    const cbDir = path.join(rootDir, "third_party", "codebase_memory");
    const isWin = os.platform() === "win32";

    const candidates = [
      path.join(cbDir, isWin ? "codebase-memory-mcp.exe" : "codebase-memory-mcp"),
      path.join(cbDir, "codebase-memory-mcp"),
      path.join(cbDir, "codebase-memory-mcp.exe"),
      path.join(os.homedir(), ".local", "bin", "codebase-memory-mcp"),
    ];

    for (const c of candidates) {
      try {
        const stat = await fs.stat(c);
        if (stat.isFile() || stat.isSymbolicLink()) {
          this.binaryPath = c;
          return c;
        }
      } catch {
        // continue
      }
    }

    return null;
  }

  public async isAvailable(): Promise<boolean> {
    if (this.isDisabled) return false;
    const bin = await this.findBinary();
    if (!bin && !this._warnedMissing) {
      // Sessiz başarısızlık yerine sunucu konsoluna bir kez uyarı basıyoruz —
      // "codebase memory MCP çalışıyor mu?" sorusunun cevabı: hayır, çünkü
      // binary hiçbir aday yolda bulunamadı. Beklenen konum:
      // <proje_kökü>/third_party/codebase_memory/codebase-memory-mcp(.exe)
      this._warnedMissing = true;
      console.warn(
        "[codebase-memory-mcp] Binary bulunamadı, bu eklenti bu oturumda pasif kalacak. " +
          "Beklenen konum: <proje_kökü>/third_party/codebase_memory/codebase-memory-mcp " +
          "veya ~/.local/bin/codebase-memory-mcp"
      );
    }
    return bin !== null;
  }

  private async ensureProcess(): Promise<boolean> {
    if (this.isDisabled) return false;
    if (this.proc && this.proc.exitCode === null && this.isInitialized) {
      return true;
    }

    const bin = await this.findBinary();
    if (!bin) {
      this.isDisabled = true;
      return false;
    }

    try {
      const runtimeDir = path.join(os.tmpdir(), "myfcli_cbm", "runtime");
      const cacheDir = path.join(os.tmpdir(), "myfcli_cbm", "cache");
      await fs.mkdir(runtimeDir, { recursive: true });
      await fs.mkdir(cacheDir, { recursive: true });

      const env = {
        ...process.env,
        CBM_RUNTIME_DIR: runtimeDir,
        CBM_CACHE_DIR: cacheDir,
      };

      this.proc = spawn(bin, ["--ui=false"], {
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.proc.stdout?.on("data", (data: Buffer) => {
        this.buffer += data.toString("utf-8");
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed: JsonRpcResponse = JSON.parse(trimmed);
            if (typeof parsed.id === "number" && this.pendingRequests.has(parsed.id)) {
              const resolver = this.pendingRequests.get(parsed.id);
              this.pendingRequests.delete(parsed.id);
              resolver?.(parsed);
            }
          } catch {
            // ignore non-json lines
          }
        }
      });

      this.proc.on("close", () => {
        this.proc = null;
        this.isInitialized = false;
      });

      // Initialize handshake gönder
      const initRes = await this.sendRaw("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "myf-web-agent", version: "3.5" },
      });

      if (initRes && !initRes.error) {
        this.isInitialized = true;
        return true;
      }

      this.close();
      this.isDisabled = true;
      return false;
    } catch {
      this.close();
      this.isDisabled = true;
      return false;
    }
  }

  private sendRaw(method: string, params?: Record<string, unknown>, timeoutMs = 10000): Promise<JsonRpcResponse | null> {
    return new Promise((resolve) => {
      if (!this.proc || !this.proc.stdin) {
        return resolve(null);
      }

      this.reqId++;
      const id = this.reqId;
      const req: JsonRpcRequest = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          resolve(null);
        }
      }, timeoutMs);

      this.pendingRequests.set(id, (res) => {
        clearTimeout(timer);
        resolve(res);
      });

      try {
        this.proc.stdin.write(JSON.stringify(req) + "\n");
      } catch {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        resolve(null);
      }
    });
  }

  /** MCP tool çağrısı */
  public async callTool(name: string, args: Record<string, unknown> = {}, timeoutMs = 15000): Promise<string | null> {
    const ok = await this.ensureProcess();
    if (!ok) return null;

    const res = await this.sendRaw("tools/call", { name, arguments: args }, timeoutMs);
    if (!res || res.error) return null;

    const result = res.result;
    if (result && Array.isArray(result.content)) {
      const texts = result.content
        .map((c) => (typeof c === "object" && c && "text" in c ? String(c.text) : ""))
        .filter(Boolean);
      return texts.join("\n") || JSON.stringify(result);
    }

    return result ? JSON.stringify(result, null, 2) : null;
  }

  /** Projeyi bilgi grafiğine indeksle */
  public async indexRepository(projectDir: string): Promise<string | null> {
    return this.callTool("index_repository", { repo_path: projectDir, mode: "fast" }, 30000);
  }

  /** Sembol veya fonksiyon grafiğini ara */
  public async searchGraph(query: string, projectDir?: string): Promise<string | null> {
    const root = projectDir || path.resolve(process.cwd(), "..");
    return this.callTool("search_graph", {
      project: root,
      query,
      name_pattern: `.*${query}.*`,
    });
  }

  /** Çağrı yolunu izle (Kim çağırıyor / Kimi çağırıyor) */
  public async tracePath(
    functionName: string,
    direction: "inbound" | "outbound" | "both" = "both",
    projectDir?: string
  ): Promise<string | null> {
    const root = projectDir || path.resolve(process.cwd(), "..");
    return this.callTool("trace_path", {
      project: root,
      function_name: functionName,
      direction,
    });
  }

  /** Belirli bir fonksiyon veya sınıfın tam kodunu oku */
  public async getCodeSnippet(qualifiedName: string, projectDir?: string): Promise<string | null> {
    const root = projectDir || path.resolve(process.cwd(), "..");
    return this.callTool("get_code_snippet", {
      project: root,
      qualified_name: qualifiedName,
    });
  }

  /** Proje mimari özetini al */
  public async getArchitecture(projectDir?: string): Promise<string | null> {
    const root = projectDir || path.resolve(process.cwd(), "..");
    return this.callTool("get_architecture", { project: root });
  }

  /** Kod içinde regex/metin ara */
  public async searchCode(pattern: string, projectDir?: string): Promise<string | null> {
    const root = projectDir || path.resolve(process.cwd(), "..");
    return this.callTool("search_code", { project: root, pattern });
  }


  public close() {
    if (this.proc) {
      try {
        this.proc.kill();
      } catch {
        // ignore
      }
      this.proc = null;
    }
    this.isInitialized = false;
    this.pendingRequests.clear();
  }
}

export const codebaseMemoryClient = new CodebaseMemoryClient();
