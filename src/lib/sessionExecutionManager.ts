// src/lib/sessionExecutionManager.ts
// Arka plan sohbet süreç yöneticisi (SessionExecutionManager).
// İstemcinin HTTP bağlantısı koptuğunda (F5, sayfa yenileme, ağ dalgalanması)
// sunucu tarafındaki LLM, araç çağrıları ve dosya yazma süreçlerinin kesilmeden
// çalışmaya devam etmesini ve sayfa yeniden yüklendiğinde istemcinin sürece
// arabellekten (buffer) canlı olarak yeniden bağlanmasını (Re-Attach) sağlar.

export interface ExecutionEvent {
  event: string;
  data: unknown;
  id: number;
  timestamp: number;
}

export interface SessionExecutionRecord {
  sessionId: string;
  prompt: string;
  status: "running" | "completed" | "error" | "aborted";
  abortController: AbortController;
  events: ExecutionEvent[];
  startedAt: number;
  lastUpdatedAt: number;
  fullText: string;
  fullThinking: string;
  editedFiles: unknown[];
  statusNote?: string;
  listeners: Set<(event: ExecutionEvent) => void>;
}

class SessionExecutionManager {
  private executions: Map<string, SessionExecutionRecord> = new Map();

  /**
   * Belirtilen oturum için çalışan veya yakın zamanda tamamlanmış bir süreci getirir.
   */
  public getExecution(sessionId: string): SessionExecutionRecord | undefined {
    return this.executions.get(sessionId);
  }

  /**
   * Oturumun şu anda arka planda aktif olarak çalışıp çalışmadığını kontrol eder.
   */
  public isRunning(sessionId: string): boolean {
    const exec = this.executions.get(sessionId);
    return exec?.status === "running";
  }

  /**
   * Yeni bir arka plan görevi başlatır veya mevcut çalışanı döner.
   */
  public startExecution(
    sessionId: string,
    prompt: string
  ): {
    execution: SessionExecutionRecord;
    emit: (event: string, data: unknown) => void;
    finish: (status?: "completed" | "error" | "aborted") => void;
    signal: AbortSignal;
  } {
    // Varsa önceki tamamlanmış süreci temizle
    const existing = this.executions.get(sessionId);
    if (existing && existing.status === "running") {
      // Zaten çalışıyorsa mevcut abort controller ve dinleyicilerle devam et
      return {
        execution: existing,
        emit: (event: string, data: unknown) => this.emitEvent(sessionId, event, data),
        finish: (status = "completed") => this.finishExecution(sessionId, status),
        signal: existing.abortController.signal,
      };
    }

    const abortController = new AbortController();
    const record: SessionExecutionRecord = {
      sessionId,
      prompt,
      status: "running",
      abortController,
      events: [],
      startedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      fullText: "",
      fullThinking: "",
      editedFiles: [],
      listeners: new Set(),
    };

    this.executions.set(sessionId, record);

    return {
      execution: record,
      emit: (event: string, data: unknown) => this.emitEvent(sessionId, event, data),
      finish: (status = "completed") => this.finishExecution(sessionId, status),
      signal: abortController.signal,
    };
  }

  /**
   * Sürece bir SSE olayı ekler ve tüm aktif dinleyicilere basar.
   */
  public emitEvent(sessionId: string, event: string, data: unknown): void {
    const record = this.executions.get(sessionId);
    if (!record) return;

    record.lastUpdatedAt = Date.now();

    if (event === "content" && typeof data === "string") {
      record.fullText += data;
    } else if (event === "thinking" && typeof data === "string") {
      record.fullThinking += data;
    } else if (event === "status" && typeof data === "string") {
      record.statusNote = data;
    } else if (event === "file_changes" && Array.isArray(data)) {
      record.editedFiles = data;
    }

    const item: ExecutionEvent = {
      event,
      data,
      id: record.events.length,
      timestamp: Date.now(),
    };

    record.events.push(item);

    for (const listener of record.listeners) {
      try {
        listener(item);
      } catch {
        // Dinleyici bağlantısı koptuysa yoksay
      }
    }
  }

  /**
   * Canlı akışa abone olur. Sayfa yenilendiğinde (F5) kaçırılan olayları hemen iletir.
   */
  public subscribe(
    sessionId: string,
    onEvent: (event: ExecutionEvent) => void,
    fromIndex = 0
  ): () => void {
    const record = this.executions.get(sessionId);
    if (!record) {
      return () => {};
    }

    // Kaçırılan veya arabellekte bekleyen geçmiş olayları anında ilet
    if (fromIndex < record.events.length) {
      const missed = record.events.slice(fromIndex);
      for (const item of missed) {
        try {
          onEvent(item);
        } catch {
          // ignore
        }
      }
    }

    record.listeners.add(onEvent);

    return () => {
      record.listeners.delete(onEvent);
    };
  }

  /**
   * Yalnızca kullanıcı açıkça "Durdur" butonuna bastığında süreci iptal eder.
   */
  public abortExecution(sessionId: string): boolean {
    const record = this.executions.get(sessionId);
    if (!record || record.status !== "running") return false;

    record.status = "aborted";
    record.abortController.abort();
    this.emitEvent(sessionId, "notice", "⏹️ İşlem kullanıcı tarafından durduruldu.");
    this.emitEvent(sessionId, "done", "");

    return true;
  }

  /**
   * Sürecin tamamlandığını işaretler ve 10 dakika sonra hafızadan temizler.
   */
  public finishExecution(sessionId: string, status: "completed" | "error" | "aborted" = "completed"): void {
    const record = this.executions.get(sessionId);
    if (!record) return;

    record.status = status;
    record.lastUpdatedAt = Date.now();

    // 10 dakika sonra hafıza şişmesini önlemek için kaydı kaldır
    setTimeout(() => {
      const current = this.executions.get(sessionId);
      if (current && current.status !== "running") {
        this.executions.delete(sessionId);
      }
    }, 600000);
  }
}

const globalForSessionExecution = globalThis as unknown as {
  sessionExecutionManager?: SessionExecutionManager;
};

export const sessionExecutionManager =
  globalForSessionExecution.sessionExecutionManager || new SessionExecutionManager();

globalForSessionExecution.sessionExecutionManager = sessionExecutionManager;
