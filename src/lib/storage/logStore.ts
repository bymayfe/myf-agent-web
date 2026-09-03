// src/lib/storage/logStore.ts
// Python agent_system/storage/log_store.py ile %100 uyumlu SQLite veritabanı motoru.
// Konum: <proje_klasoru>/.myfcli/logs.db
// Node.js native `node:sqlite` (DatabaseSync) kullanır — harici bağımlılık gerektirmez.

import path from "path";
import fs from "fs";

// @ts-ignore
import { DatabaseSync } from "node:sqlite";

export interface ProjectRun {
  run_id: string;
  session_id: string;
  project_name: string;
  brief: string;
  status: "running" | "success" | "failed" | "partial";
  total_agents: number;
  files_written: number;
  error_count: number;
  elapsed_sec: number;
  started_at: string;
  finished_at: string;
}

export interface AgentStep {
  step_id: string;
  run_id: string;
  step_number: number;
  agent_id: string;
  agent_name: string;
  agent_role: string;
  model: string;
  status: "running" | "success" | "failed" | "partial";
  prompt_chars: number;
  prompt_text: string;
  response_chars: number;
  files_written: string; // JSON array of filenames
  elapsed_sec: number;
  output_summary: string;
  full_output: string;
  started_at: string;
  finished_at: string;
}

export interface ErrorEvent {
  error_id: string;
  run_id: string;
  step_id: string;
  agent_name: string;
  agent_model: string;
  error_type: string; // 'syntax' | 'import' | 'runtime' | 'test_fail' | 'llm' | 'micro_fix'
  error_msg: string;
  file_path: string;
  retry_attempt: number;
  resolved: number; // 0 or 1
  resolver: string; // e.g. 'micro_fix'
  created_at: string;
}

const _DDL = `
CREATE TABLE IF NOT EXISTS project_runs (
    run_id          TEXT PRIMARY KEY,
    session_id      TEXT DEFAULT '',
    project_name    TEXT DEFAULT '',
    brief           TEXT DEFAULT '',
    status          TEXT DEFAULT 'running',
    total_agents    INT  DEFAULT 0,
    files_written   INT  DEFAULT 0,
    error_count     INT  DEFAULT 0,
    elapsed_sec     REAL DEFAULT 0.0,
    started_at      TEXT DEFAULT '',
    finished_at     TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS agent_steps (
    step_id         TEXT PRIMARY KEY,
    run_id          TEXT REFERENCES project_runs(run_id) ON DELETE CASCADE,
    step_number     INT  DEFAULT 0,
    agent_id        TEXT DEFAULT '',
    agent_name      TEXT DEFAULT '',
    agent_role      TEXT DEFAULT '',
    model           TEXT DEFAULT '',
    status          TEXT DEFAULT 'running',
    prompt_chars    INT  DEFAULT 0,
    prompt_text     TEXT DEFAULT '',
    response_chars  INT  DEFAULT 0,
    files_written   TEXT DEFAULT '[]',
    elapsed_sec     REAL DEFAULT 0.0,
    output_summary  TEXT DEFAULT '',
    full_output     TEXT DEFAULT '',
    started_at      TEXT DEFAULT '',
    finished_at     TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS error_events (
    error_id        TEXT PRIMARY KEY,
    run_id          TEXT REFERENCES project_runs(run_id) ON DELETE CASCADE,
    step_id         TEXT DEFAULT '',
    agent_name      TEXT DEFAULT '',
    agent_model     TEXT DEFAULT '',
    error_type      TEXT DEFAULT 'runtime',
    error_msg       TEXT DEFAULT '',
    file_path       TEXT DEFAULT '',
    retry_attempt   INT  DEFAULT 0,
    resolved        INT  DEFAULT 0,
    resolver        TEXT DEFAULT '',
    created_at      TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_steps_run   ON agent_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_errors_run  ON error_events(run_id);
CREATE INDEX IF NOT EXISTS idx_errors_step ON error_events(step_id);
`;

function nowStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function shortId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export class LogStore {
  private dbCache: Map<string, any> = new Map();

  private getDbPath(projectDir: string): string {
    const dir = path.join(projectDir, ".myfcli");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, "logs.db");
  }

  private open(projectDir: string): any {
    const dbPath = this.getDbPath(projectDir);
    let db = this.dbCache.get(dbPath);
    if (!db) {
      db = new DatabaseSync(dbPath);
      db.exec("PRAGMA journal_mode = WAL;");
      db.exec("PRAGMA foreign_keys = ON;");
      db.exec(_DDL);
      this.dbCache.set(dbPath, db);
    }
    return db;
  }

  // ─── Pipeline Koşuları (Runs) ───────────────────────────

  startRun(
    sessionId: string,
    projectName: string,
    brief: string,
    projectDir: string
  ): string {
    const db = this.open(projectDir);
    const runId = shortId("run");
    const started = nowStr();

    const stmt = db.prepare(`
      INSERT INTO project_runs (run_id, session_id, project_name, brief, status, started_at)
      VALUES (?, ?, ?, ?, 'running', ?)
    `);
    stmt.run(runId, sessionId, projectName, brief, started);
    return runId;
  }

  finishRun(
    runId: string,
    status: "success" | "failed" | "partial",
    totalAgents: number,
    filesWritten: number,
    elapsedSec: number,
    errorCount: number = 0,
    projectDir: string
  ): void {
    const db = this.open(projectDir);
    const finished = nowStr();

    const stmt = db.prepare(`
      UPDATE project_runs
      SET status = ?, total_agents = ?, files_written = ?, error_count = ?, elapsed_sec = ?, finished_at = ?
      WHERE run_id = ?
    `);
    stmt.run(status, totalAgents, filesWritten, errorCount, elapsedSec, finished, runId);
  }

  // ─── Ajan Adımları (Steps) ──────────────────────────────

  startStep(
    runId: string,
    stepNumber: number,
    agentId: string,
    agentName: string,
    agentRole: string,
    model: string,
    promptChars: number,
    promptText: string,
    projectDir: string
  ): string {
    const db = this.open(projectDir);
    const stepId = shortId("step");
    const started = nowStr();

    const stmt = db.prepare(`
      INSERT INTO agent_steps (
        step_id, run_id, step_number, agent_id, agent_name, agent_role,
        model, status, prompt_chars, prompt_text, started_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)
    `);
    stmt.run(
      stepId,
      runId,
      stepNumber,
      agentId,
      agentName,
      agentRole,
      model,
      promptChars,
      promptText,
      started
    );
    return stepId;
  }

  finishStep(
    stepId: string,
    status: "success" | "failed" | "partial",
    responseChars: number,
    filesWritten: string[],
    elapsedSec: number,
    outputSummary: string,
    fullOutput: string,
    projectDir: string
  ): void {
    const db = this.open(projectDir);
    const finished = nowStr();
    const filesJson = JSON.stringify(filesWritten || []);

    const stmt = db.prepare(`
      UPDATE agent_steps
      SET status = ?, response_chars = ?, files_written = ?, elapsed_sec = ?,
          output_summary = ?, full_output = ?, finished_at = ?
      WHERE step_id = ?
    `);
    stmt.run(
      status,
      responseChars,
      filesJson,
      elapsedSec,
      outputSummary,
      fullOutput,
      finished,
      stepId
    );
  }

  // ─── Hata Olayları (Error Events) ───────────────────────

  logError(
    runId: string,
    stepId: string,
    agentName: string,
    agentModel: string,
    errorType: string,
    errorMsg: string,
    filePath: string,
    projectDir: string
  ): string {
    const db = this.open(projectDir);
    const errorId = shortId("err");
    const created = nowStr();

    const stmt = db.prepare(`
      INSERT INTO error_events (
        error_id, run_id, step_id, agent_name, agent_model,
        error_type, error_msg, file_path, retry_attempt, resolved, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
    `);
    stmt.run(
      errorId,
      runId,
      stepId,
      agentName,
      agentModel,
      errorType,
      errorMsg,
      filePath,
      created
    );

    // Run tablosundaki error_count'u artır
    if (runId) {
      try {
        db.prepare("UPDATE project_runs SET error_count = error_count + 1 WHERE run_id = ?").run(runId);
      } catch {
        // ignore
      }
    }

    return errorId;
  }

  resolveError(errorId: string, resolver: string, projectDir: string): void {
    const db = this.open(projectDir);
    const stmt = db.prepare(`
      UPDATE error_events
      SET resolved = 1, resolver = ?
      WHERE error_id = ?
    `);
    stmt.run(resolver, errorId);
  }

  // ─── Sorgulama (Queries) ────────────────────────────────

  getRuns(projectDir: string, limit: number = 20): ProjectRun[] {
    try {
      const db = this.open(projectDir);
      const stmt = db.prepare(`
        SELECT * FROM project_runs ORDER BY started_at DESC LIMIT ?
      `);
      return stmt.all(limit) as ProjectRun[];
    } catch {
      return [];
    }
  }

  getSteps(runId: string, projectDir: string): AgentStep[] {
    try {
      const db = this.open(projectDir);
      const stmt = db.prepare(`
        SELECT * FROM agent_steps WHERE run_id = ? ORDER BY step_number ASC, started_at ASC
      `);
      return stmt.all(runId) as AgentStep[];
    } catch {
      return [];
    }
  }

  getStepDetails(stepId: string, projectDir: string): AgentStep | null {
    try {
      const db = this.open(projectDir);
      const stmt = db.prepare(`
        SELECT * FROM agent_steps WHERE step_id = ?
      `);
      return (stmt.get(stepId) as AgentStep) || null;
    } catch {
      return null;
    }
  }

  getErrors(projectDir: string, runId?: string, limit: number = 50): ErrorEvent[] {
    try {
      const db = this.open(projectDir);
      if (runId) {
        const stmt = db.prepare(`
          SELECT * FROM error_events WHERE run_id = ? ORDER BY created_at DESC LIMIT ?
        `);
        return stmt.all(runId, limit) as ErrorEvent[];
      } else {
        const stmt = db.prepare(`
          SELECT * FROM error_events ORDER BY created_at DESC LIMIT ?
        `);
        return stmt.all(limit) as ErrorEvent[];
      }
    } catch {
      return [];
    }
  }

  getErrorTypeSummary(projectDir: string): Record<string, number> {
    try {
      const db = this.open(projectDir);
      const stmt = db.prepare(`
        SELECT error_type, COUNT(*) as cnt FROM error_events GROUP BY error_type
      `);
      const rows = stmt.all() as Array<{ error_type: string; cnt: number }>;
      const summary: Record<string, number> = {};
      for (const r of rows) {
        summary[r.error_type] = r.cnt;
      }
      return summary;
    } catch {
      return {};
    }
  }

  getLatestRunId(projectDir: string): string | null {
    try {
      const db = this.open(projectDir);
      const stmt = db.prepare(`
        SELECT run_id FROM project_runs ORDER BY started_at DESC LIMIT 1
      `);
      const row = stmt.get() as { run_id: string } | undefined;
      return row ? row.run_id : null;
    } catch {
      return null;
    }
  }

  // ─── Dışa Aktarma (Audit Log & JSON Export) ───────────────

  exportAuditLogMd(projectDir: string, runId?: string): string {
    const targetRunId = runId || this.getLatestRunId(projectDir);
    if (!targetRunId) return "# AUDIT LOG\n\nKayıtlı çalışma bulunamadı.";

    const db = this.open(projectDir);
    const run = db.prepare("SELECT * FROM project_runs WHERE run_id = ?").get(targetRunId) as ProjectRun;
    const steps = this.getSteps(targetRunId, projectDir);
    const errors = this.getErrors(projectDir, targetRunId);

    let md = `# 📋 PROJE DENETİM RAPORU (AUDIT LOG)\n\n`;
    md += `**Proje:** ${run?.project_name || path.basename(projectDir)}  \n`;
    md += `**Koşu ID:** \`${targetRunId}\`  \n`;
    md += `**Durum:** \`${run?.status || "Bilinmiyor"}\`  \n`;
    md += `**Başlangıç:** ${run?.started_at} | **Bitiş:** ${run?.finished_at}  \n`;
    md += `**Toplam Süre:** ${run?.elapsed_sec?.toFixed(1) || "0.0"}s | **Toplam Hata:** ${run?.error_count || 0}  \n\n`;

    md += `## 🤖 Ajan Adımları ve Token Metrikleri\n\n`;
    md += `| # | Ajan | Rol | Model | Prompt | Yanıt | Süre | Dosyalar |\n`;
    md += `|---|---|---|---|---|---|---|---|\n`;
    for (const s of steps) {
      let files = "[]";
      try {
        const parsed = JSON.parse(s.files_written || "[]");
        files = parsed.join(", ") || "-";
      } catch {
        files = s.files_written || "-";
      }
      md += `| ${s.step_number} | **${s.agent_name}** | ${s.agent_role} | \`${s.model.split("/").pop()}\` | ${s.prompt_chars} ch | ${s.response_chars} ch | ${s.elapsed_sec.toFixed(1)}s | ${files} |\n`;
    }

    if (errors.length > 0) {
      md += `\n## ⚠️ Hata Olayları ve Micro-Fix Durumu\n\n`;
      md += `| ID | Ajan | Hata Tipi | Dosya | Durum | Çözümleyici |\n`;
      md += `|---|---|---|---|---|---|\n`;
      for (const e of errors) {
        const resolvedStr = e.resolved ? "✅ Çözüldü" : "❌ Beklemede";
        md += `| \`${e.error_id}\` | ${e.agent_name} | \`${e.error_type}\` | \`${e.file_path || "-"}\` | ${resolvedStr} | ${e.resolver || "-"} |\n`;
      }
    }

    md += `\n---\n*Bu rapor MYF Agent SQLite log_store motoru tarafından otomatik üretilmiştir.*\n`;

    const auditFilePath = path.join(projectDir, "AUDIT_LOG.md");
    try {
      fs.writeFileSync(auditFilePath, md, "utf-8");
    } catch {
      // ignore
    }

    return md;
  }

  exportLogsJson(projectDir: string): string {
    const runs = this.getRuns(projectDir, 50);
    const data = runs.map((r) => ({
      run: r,
      steps: this.getSteps(r.run_id, projectDir),
      errors: this.getErrors(projectDir, r.run_id),
    }));

    const jsonPath = path.join(projectDir, ".myfcli", "full_logs.json");
    try {
      fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf-8");
    } catch {
      // ignore
    }
    return jsonPath;
  }
}

export const logStore = new LogStore();
