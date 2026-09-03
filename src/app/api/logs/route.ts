// src/app/api/logs/route.ts
// Pipeline, Ajan Adımları, SQLite logs.db ve Hata Olayları API Endpoint'i

import { NextRequest } from "next/server";
import { logStore } from "@/lib/storage/logStore";
import { getSettings, getProviders, getProviderApiKey, loadSession } from "@/lib/store";
import { callLlm } from "@/lib/llmClient";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") || "summary";
  let projectDir = searchParams.get("projectDir") || "";
  const sessionId = searchParams.get("sessionId");
  const runId = searchParams.get("runId") || undefined;
  const stepId = searchParams.get("stepId") || undefined;

  // Eğer projectDir verilmediyse sessionId'den bulmaya çalış
  if (!projectDir && sessionId) {
    const session = await loadSession(sessionId);
    if (session?.project_dir) {
      projectDir = session.project_dir;
    }
  }

  // Varsayılan dizin
  if (!projectDir) {
    projectDir = process.cwd();
  }

  try {
    switch (action) {
      case "runs":
      case "summary": {
        const runs = logStore.getRuns(projectDir, 20);
        const latestRunId = logStore.getLatestRunId(projectDir);
        const errorSummary = logStore.getErrorTypeSummary(projectDir);
        const recentErrors = logStore.getErrors(projectDir, undefined, 10);
        return Response.json({
          projectDir,
          runs,
          latestRunId,
          errorSummary,
          recentErrors,
        });
      }

      case "steps": {
        const targetRunId = runId || logStore.getLatestRunId(projectDir) || "";
        const steps = targetRunId ? logStore.getSteps(targetRunId, projectDir) : [];
        return Response.json({ runId: targetRunId, steps });
      }

      case "step": {
        if (!stepId) {
          return Response.json({ error: "stepId gereklidir." }, { status: 400 });
        }
        const step = logStore.getStepDetails(stepId, projectDir);
        return Response.json({ step });
      }

      case "errors": {
        const errors = logStore.getErrors(projectDir, runId, 50);
        const summary = logStore.getErrorTypeSummary(projectDir);
        return Response.json({ errors, summary });
      }

      case "audit": {
        const md = logStore.exportAuditLogMd(projectDir, runId);
        return Response.json({ markdown: md });
      }

      default:
        return Response.json({ error: `Bilinmeyen action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Log veritabanı okuma hatası";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action || "export";
  let projectDir = body.projectDir || "";
  const sessionId = body.sessionId;

  if (!projectDir && sessionId) {
    const session = await loadSession(sessionId);
    if (session?.project_dir) {
      projectDir = session.project_dir;
    }
  }

  if (!projectDir) {
    projectDir = process.cwd();
  }

  try {
    if (action === "export") {
      const runId = body.runId || undefined;
      const md = logStore.exportAuditLogMd(projectDir, runId);
      const jsonPath = logStore.exportLogsJson(projectDir);
      return Response.json({
        success: true,
        auditLogPath: path.join(projectDir, "AUDIT_LOG.md"),
        jsonPath,
        markdown: md,
      });
    }

    if (action === "fix") {
      const errorId = body.errorId;
      if (!errorId) {
        return Response.json({ error: "errorId belirtilmelidir." }, { status: 400 });
      }

      const errors = logStore.getErrors(projectDir);
      const targetError = errors.find((e) => e.error_id === errorId);

      if (!targetError) {
        return Response.json({ error: "Hata kaydı bulunamadı." }, { status: 404 });
      }

      if (!targetError.file_path) {
        return Response.json({ error: "Bu hata için ilişkili bir dosya yolu yok." }, { status: 400 });
      }

      const filePath = path.isAbsolute(targetError.file_path)
        ? targetError.file_path
        : path.join(projectDir, targetError.file_path);

      if (!fs.existsSync(filePath)) {
        return Response.json({ error: `Hedef dosya bulunamadı: ${filePath}` }, { status: 404 });
      }

      const originalContent = fs.readFileSync(filePath, "utf-8");
      const settings = await getSettings();
      const providers = await getProviders();
      const provider = providers.providers[settings.active_provider];

      if (!provider) {
        return Response.json({ error: "Aktif sağlayıcı bulunamadı." }, { status: 500 });
      }

      const fixModel = settings.micro_fix_model || settings.code_model || settings.coordinator_model;
      const apiKey = getProviderApiKey(provider.api_key_env);

      const fixPrompt = `Sen kıdemli bir kod onarım ve hata giderme (Micro-Fix) uzmanısın.
Aşağıdaki dosyada derleme/sentaks hatası meydana geldi. Dosyadaki hatayı tespit et ve hatasız tam kodu üret.

DOSYA: ${targetError.file_path}
HATA TİPİ: ${targetError.error_type}
HATA MESAJI: ${targetError.error_msg}

MEVCUT İÇERİK:
${originalContent}

LÜTFEN SADECE DÜZELTİLMİŞ KODU DOĞRUDAN KOD BLOĞU İÇİNDE VER (Açıklama veya ek metin ekleme):`;

      let fixResponse = "";
      await callLlm({
        messages: [
          { role: "system", content: "Sen hata onarım uzmanısın. Yalnızca düzeltilmiş geçerli kodu üretirsin." },
          { role: "user", content: fixPrompt },
        ],
        model: fixModel,
        apiBase: provider.api_base,
        apiKey,
        temperature: 0.1,
        maxTokens: 4096,
        thinkMode: false,
        warmup: false,
        onToken: (tok) => {
          fixResponse += tok;
        },
      });

      let repairedCode = fixResponse;
      const codeMatch = fixResponse.match(/```(?:\w*)\n([\s\S]*?)```/);
      if (codeMatch) {
        repairedCode = codeMatch[1].trim();
      }

      fs.writeFileSync(filePath, repairedCode, "utf-8");

      // SQLite'ta hatayı çözüldü olarak işaretle
      logStore.resolveError(errorId, "micro_fix_ui", projectDir);

      return Response.json({
        success: true,
        message: `${targetError.file_path} başarıyla Micro-Fix ile onarıldı ve diske yazıldı.`,
        file: targetError.file_path,
      });
    }

    return Response.json({ error: `Bilinmeyen action: ${action}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "İşlem sırasında hata oluştu";
    return Response.json({ error: message }, { status: 500 });
  }
}
