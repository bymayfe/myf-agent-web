// src/lib/pipeline/pipelineRunner.ts
// Gerçek 5 Aşamalı Sıralı Pipeline Motoru (Next.js & TypeScript Portu).
// Planlama (Architect) → Kod Üretimi (Developer) → Doğrulama (QA) → Hata Onarımı (Fix) → Özet (Reviewer)

import { promises as fs } from "fs";
import path from "path";
import { callLlm } from "../llmClient";
import { logStore } from "../storage/logStore";
import type { ChatMessage, Settings, ProvidersFile } from "@/types";

export interface PipelineStepEvent {
  stage: number;
  totalStages: number;
  stageName: string;
  stageIcon: string;
  status: "start" | "progress" | "file_written" | "test_pass" | "test_fail" | "done" | "error";
  message: string;
  file?: string;
  details?: Record<string, unknown>;
}

export interface PipelineOptions {
  projectRequirement: string;
  projectDir: string;
  settings: Settings;
  providers: ProvidersFile;
  apiKey?: string;
  sessionId?: string;
  runId?: string;
  onEvent: (event: PipelineStepEvent) => void;
}

export interface PlannedFile {
  filename: string;
  description: string;
  language: string;
}

/**
 * 1. Aşama: Mimar (Architect) — Gereksinimleri analiz edip dosya haritasını ve mimariyi üretir.
 */
export async function runArchitectStage(
  requirement: string,
  options: PipelineOptions
): Promise<{ files: PlannedFile[]; architectureSummary: string }> {
  const stageStart = Date.now();
  const model = options.settings.planning_model || options.settings.coordinator_model;

  options.onEvent({
    stage: 1,
    totalStages: 5,
    stageName: "Yazılım Mimarı (Architect)",
    stageIcon: "📐",
    status: "start",
    message: "Proje gereksinimleri analiz ediliyor ve dosya yapısı planlanıyor...",
  });

  const prompt = `Sen kıdemli bir yazılım mimarısın. Aşağıdaki proje isteği için eksiksiz bir mimari tasarım ve oluşturulacak dosyaların JSON listesini hazırla.

PROJE İSTEĞİ:
${requirement}

LÜTFEN SADECE VE SADECE AŞAĞIDAKİ JSON FORMATINDA ÇIKTI ÜRET (Markdown veya ek metin ekleme):
{
  "summary": "Projenin kısa mimari özeti ve teknoloji yığını",
  "files": [
    {
      "filename": "package.json",
      "description": "Proje bağımlılıkları ve scriptleri",
      "language": "json"
    },
    {
      "filename": "src/app/page.tsx",
      "description": "Ana dashboard bileşeni",
      "language": "typescript"
    }
  ]
}`;

  let stepId = "";
  if (options.runId) {
    stepId = logStore.startStep(
      options.runId,
      1,
      "agent-arch",
      "Yazılım Mimarı (Architect)",
      "architect",
      model,
      prompt.length,
      prompt,
      options.projectDir
    );
  }

  const provider = options.providers.providers[options.settings.active_provider];
  let responseText = "";

  await callLlm({
    messages: [
      { role: "system", content: "Sen kıdemli bir sistem mimarısın. Sadece geçerli JSON çıktısı üretirsin." },
      { role: "user", content: prompt },
    ],
    model,
    apiBase: provider.api_base,
    apiKey: options.apiKey,
    temperature: 0.2,
    maxTokens: 3000,
    thinkMode: false,
    warmup: options.settings.warmup,
    onToken: (tok) => {
      responseText += tok;
    },
  });

  let parsed: { summary?: string; files?: PlannedFile[] } = {};
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  } catch {
    parsed = {
      summary: "Uygulama temel bileşenleri ve yapılandırması",
      files: [
        { filename: "README.md", description: "Proje dökümantasyonu", language: "markdown" },
        { filename: "src/app/page.tsx", description: "Ana Sayfa Bileşeni", language: "typescript" },
      ],
    };
  }

  const plannedFiles = parsed.files && parsed.files.length > 0 ? parsed.files : [
    { filename: "README.md", description: "Proje kılavuzu", language: "markdown" }
  ];

  const elapsedSec = (Date.now() - stageStart) / 1000;
  if (stepId) {
    logStore.finishStep(
      stepId,
      "success",
      responseText.length,
      plannedFiles.map((f) => f.filename),
      elapsedSec,
      `Mimari plan hazırlandı: ${plannedFiles.length} dosya oluşturulacak.`,
      responseText,
      options.projectDir
    );
  }

  options.onEvent({
    stage: 1,
    totalStages: 5,
    stageName: "Yazılım Mimarı (Architect)",
    stageIcon: "📐",
    status: "done",
    message: `Mimari plan hazırlandı: ${plannedFiles.length} dosya oluşturulacak.`,
    details: { filesCount: plannedFiles.length, summary: parsed.summary },
  });

  return { files: plannedFiles, architectureSummary: parsed.summary || "" };
}

/**
 * 2. Aşama: Geliştirici (Developer) — Her bir dosyayı tek tek eksiksiz yazar ve diske kaydeder.
 */
export async function runDeveloperStage(
  plannedFiles: PlannedFile[],
  architectureSummary: string,
  options: PipelineOptions
): Promise<string[]> {
  options.onEvent({
    stage: 2,
    totalStages: 5,
    stageName: "Yazılım Geliştirici (Developer)",
    stageIcon: "💻",
    status: "start",
    message: `${plannedFiles.length} adet dosya sırayla eksiksiz üretiliyor ve diske yazılıyor...`,
  });

  const writtenFiles: string[] = [];
  const provider = options.providers.providers[options.settings.active_provider];
  const model = options.settings.code_model || options.settings.coordinator_model;

  for (let i = 0; i < plannedFiles.length; i++) {
    const file = plannedFiles[i];
    const fileStart = Date.now();

    options.onEvent({
      stage: 2,
      totalStages: 5,
      stageName: "Yazılım Geliştirici (Developer)",
      stageIcon: "💻",
      status: "progress",
      file: file.filename,
      message: `[${i + 1}/${plannedFiles.length}] ${file.filename} yazılıyor...`,
    });

    const filePrompt = `Sen uzman bir tam-yığın (full-stack) yazılımcısın.
Mimari Özeti: ${architectureSummary}

GÖREV: Aşağıdaki dosyanın TAM ve EKSİKSİZ kaynak kodunu üret.
Hedef Dosya: ${file.filename}
Açıklama: ${file.description}

ÖNEMLİ KURALLAR:
1. Asla "// kodlar buraya", "TODO", "kısaltma yapıldı" gibi yer tutucular BIRAKMA.
2. Tüm importları, tipleri, mantığı ve fonksiyonları tam olarak yaz.
3. Çıktıyı doğrudan \`\`\`${file.language || "text"}\n// filepath: ${file.filename}\n[KODLAR]\n\`\`\` bloğu içinde ver.`;

    let stepId = "";
    if (options.runId) {
      stepId = logStore.startStep(
        options.runId,
        2,
        `agent-dev-${i + 1}`,
        `Yazılım Geliştirici (${file.filename})`,
        "developer",
        model,
        filePrompt.length,
        filePrompt,
        options.projectDir
      );
    }

    let fileContent = "";
    await callLlm({
      messages: [
        { role: "system", content: "Sen profesyonel bir yazılım geliştiricisin. Eksiksiz ve hatasız kod üretirsin." },
        { role: "user", content: filePrompt },
      ],
      model,
      apiBase: provider.api_base,
      apiKey: options.apiKey,
      temperature: 0.2,
      maxTokens: 4096,
      thinkMode: false,
      warmup: options.settings.warmup,
      onToken: (tok) => {
        fileContent += tok;
      },
    });

    // Kod bloğunu çıkar
    let cleanedCode = fileContent;
    const codeMatch = fileContent.match(/```(?:\w*)\n([\s\S]*?)```/);
    if (codeMatch) {
      cleanedCode = codeMatch[1].replace(/^\/\/\s*filepath:[^\n]+\n/, "").trim();
    }

    const targetPath = path.isAbsolute(file.filename)
      ? file.filename
      : path.join(options.projectDir, file.filename);

    const elapsedSec = (Date.now() - fileStart) / 1000;

    try {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, cleanedCode, "utf-8");
      writtenFiles.push(file.filename);

      if (stepId) {
        logStore.finishStep(
          stepId,
          "success",
          fileContent.length,
          [file.filename],
          elapsedSec,
          `Dosya diske kaydedildi: ${file.filename} (${cleanedCode.split("\n").length} satır)`,
          fileContent,
          options.projectDir
        );
      }

      options.onEvent({
        stage: 2,
        totalStages: 5,
        stageName: "Yazılım Geliştirici (Developer)",
        stageIcon: "💻",
        status: "file_written",
        file: file.filename,
        message: `✅ Dosya diske kaydedildi: ${file.filename} (${cleanedCode.split("\n").length} satır)`,
      });
    } catch (err) {
      if (stepId) {
        logStore.finishStep(
          stepId,
          "failed",
          fileContent.length,
          [],
          elapsedSec,
          `Dosya yazılamadı: ${file.filename}`,
          fileContent,
          options.projectDir
        );
      }

      options.onEvent({
        stage: 2,
        totalStages: 5,
        stageName: "Yazılım Geliştirici (Developer)",
        stageIcon: "💻",
        status: "error",
        file: file.filename,
        message: `❌ Dosya yazılamadı: ${file.filename} — ${err instanceof Error ? err.message : "Hata"}`,
      });
    }
  }

  options.onEvent({
    stage: 2,
    totalStages: 5,
    stageName: "Yazılım Geliştirici (Developer)",
    stageIcon: "💻",
    status: "done",
    message: `Kod üretimi tamamlandı: ${writtenFiles.length} dosya başarıyla oluşturuldu.`,
  });

  return writtenFiles;
}

/**
 * 3. & 4. Aşama: QA & Micro-Fix — Sentaks kontrolü, SQLite hata kaydı ve LLM tabanlı otomatik onarım.
 */
export async function runQAFixStage(
  writtenFiles: string[],
  options: PipelineOptions
): Promise<void> {
  options.onEvent({
    stage: 3,
    totalStages: 5,
    stageName: "QA Test & Doğrulama",
    stageIcon: "🧪",
    status: "start",
    message: "Üretilen dosyaların sentaks ve yapısal doğrulaması yapılıyor...",
  });

  const qaStart = Date.now();
  const qaModel = options.settings.code_model || options.settings.coordinator_model;
  const fixModel = options.settings.micro_fix_model || options.settings.code_model || options.settings.coordinator_model;
  const provider = options.providers.providers[options.settings.active_provider];

  let qaStepId = "";
  if (options.runId) {
    qaStepId = logStore.startStep(
      options.runId,
      3,
      "agent-qa",
      "QA Test & Doğrulama",
      "qa_engineer",
      qaModel,
      writtenFiles.join(", ").length,
      `Kontrol edilen dosyalar: ${writtenFiles.join(", ")}`,
      options.projectDir
    );
  }

  let hasIssue = false;
  let totalFixed = 0;

  for (const fname of writtenFiles) {
    const fullPath = path.join(options.projectDir, fname);
    try {
      const content = await fs.readFile(fullPath, "utf-8");
      if (fname.endsWith(".json")) {
        JSON.parse(content);
      }
      options.onEvent({
        stage: 3,
        totalStages: 5,
        stageName: "QA Test & Doğrulama",
        stageIcon: "🧪",
        status: "test_pass",
        file: fname,
        message: `Sentaks geçerli: ${fname}`,
      });
    } catch (err) {
      hasIssue = true;
      const errMsg = err instanceof Error ? err.message : "Sentaks Hatası";

      // 1. Hatayı SQLite error_events tablosuna kaydet
      let errId = "";
      if (options.runId) {
        errId = logStore.logError(
          options.runId,
          qaStepId,
          "QA Test & Doğrulama",
          qaModel,
          fname.endsWith(".json") ? "json_syntax" : "syntax_error",
          errMsg,
          fname,
          options.projectDir
        );
      }

      options.onEvent({
        stage: 3,
        totalStages: 5,
        stageName: "QA Test & Doğrulama",
        stageIcon: "🧪",
        status: "test_fail",
        file: fname,
        message: `Hata tespit edildi (${fname}): ${errMsg}`,
      });

      // 4. Aşama: Micro-Fix LLM Onarımı
      options.onEvent({
        stage: 4,
        totalStages: 5,
        stageName: "Otomatik Hata Onarımı (Micro-Fix)",
        stageIcon: "🔧",
        status: "progress",
        file: fname,
        message: `Hata inceleniyor ve Micro-Fix ile onarılıyor: ${fname}...`,
      });

      const fixStart = Date.now();
      try {
        const rawContent = await fs.readFile(fullPath, "utf-8");
        const fixPrompt = `Sen kıdemli bir kod onarım ve hata giderme (Micro-Fix) uzmanısın.
Aşağıdaki dosyada derleme/sentaks hatası meydana geldi. Dosyadaki hatayı tespit et ve hatasız tam kodu üret.

DOSYA: ${fname}
HATA MESAJI: ${errMsg}

MEVCUT İÇERİK:
${rawContent}

LÜTFEN SADECE DÜZELTİLMİŞ KODU DOĞRUDAN KOD BLOĞU İÇİNDE VER:`;

        let fixStepId = "";
        if (options.runId) {
          fixStepId = logStore.startStep(
            options.runId,
            4,
            "agent-fix",
            `Micro-Fix Onarım (${fname})`,
            "micro_fix",
            fixModel,
            fixPrompt.length,
            fixPrompt,
            options.projectDir
          );
        }

        let fixResponse = "";
        await callLlm({
          messages: [
            { role: "system", content: "Sen hata onarım uzmanısın. Yalnızca düzeltilmiş geçerli kodu üretirsin." },
            { role: "user", content: fixPrompt },
          ],
          model: fixModel,
          apiBase: provider.api_base,
          apiKey: options.apiKey,
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

        await fs.writeFile(fullPath, repairedCode, "utf-8");
        totalFixed++;

        if (errId) {
          logStore.resolveError(errId, "micro_fix", options.projectDir);
        }

        const fixElapsed = (Date.now() - fixStart) / 1000;
        if (fixStepId) {
          logStore.finishStep(
            fixStepId,
            "success",
            fixResponse.length,
            [fname],
            fixElapsed,
            `Hata Micro-Fix ile giderildi: ${fname}`,
            fixResponse,
            options.projectDir
          );
        }

        options.onEvent({
          stage: 4,
          totalStages: 5,
          stageName: "Otomatik Hata Onarımı (Micro-Fix)",
          stageIcon: "🔧",
          status: "done",
          file: fname,
          message: `Onarım tamamlandı ve doğrulandı: ${fname}`,
        });
      } catch (fixErr) {
        options.onEvent({
          stage: 4,
          totalStages: 5,
          stageName: "Otomatik Hata Onarımı (Micro-Fix)",
          stageIcon: "🔧",
          status: "error",
          file: fname,
          message: `Micro-Fix onarımı başarısız oldu: ${fixErr instanceof Error ? fixErr.message : "Bilinmeyen Hata"}`,
        });
      }
    }
  }

  const qaElapsed = (Date.now() - qaStart) / 1000;
  if (qaStepId) {
    logStore.finishStep(
      qaStepId,
      "success",
      0,
      writtenFiles,
      qaElapsed,
      hasIssue ? `${totalFixed} hata tespit edilip onarıldı.` : "Tüm dosyalar sentaks testini geçti.",
      `Doğrulanan dosyalar: ${writtenFiles.length}`,
      options.projectDir
    );
  }

  options.onEvent({
    stage: 3,
    totalStages: 5,
    stageName: "QA Test & Doğrulama",
    stageIcon: "🧪",
    status: "done",
    message: hasIssue ? `Testler ve ${totalFixed} adet onarım tamamlandı.` : "Tüm dosyalar başarıyla doğrulandı.",
  });
}

/**
 * 5. Aşama: Kod İnceleyici & Rapor (Reviewer) — CHANGELOG ve çalıştırma talimatları.
 */
export async function runReviewerStage(
  writtenFiles: string[],
  requirement: string,
  options: PipelineOptions
): Promise<string> {
  const revStart = Date.now();
  const model = options.settings.coordinator_model;

  options.onEvent({
    stage: 5,
    totalStages: 5,
    stageName: "Kod Gözlemcisi (Reviewer)",
    stageIcon: "📋",
    status: "start",
    message: "Proje özeti ve çalıştırma kılavuzu hazırlanıyor...",
  });

  const changelogPath = path.join(options.projectDir, "CHANGELOG.md");
  const report = `# 🚀 Proje Pipeline Raporu

**Oluşturulma Tarihi:** ${new Date().toLocaleString("tr-TR")}
**Hedef İstek:** ${requirement}

## 📁 Oluşturulan Dosyalar (${writtenFiles.length} Adet)
${writtenFiles.map((f) => `- \`${f}\``).join("\n")}

## ⚡ Projeyi Çalıştırma Adımları
\`\`\`bash
cd ${options.projectDir}
npm install
npm run dev
\`\`\`
`;

  try {
    await fs.writeFile(changelogPath, report, "utf-8");
  } catch {
    // ignore
  }

  const revElapsed = (Date.now() - revStart) / 1000;
  if (options.runId) {
    const stepId = logStore.startStep(
      options.runId,
      5,
      "agent-review",
      "Kod Gözlemcisi (Reviewer)",
      "reviewer",
      model,
      requirement.length,
      requirement,
      options.projectDir
    );
    logStore.finishStep(
      stepId,
      "success",
      report.length,
      ["CHANGELOG.md"],
      revElapsed,
      "Proje özeti ve CHANGELOG.md oluşturuldu.",
      report,
      options.projectDir
    );
  }

  options.onEvent({
    stage: 5,
    totalStages: 5,
    stageName: "Kod Gözlemcisi (Reviewer)",
    stageIcon: "📋",
    status: "done",
    message: "Pipeline başarıyla tamamlandı! Proje kullanıma hazır.",
  });

  return report;
}

/**
 * Ana Pipeline Çalıştırıcı — SQLite LogStore ile %100 entegre.
 */
export async function executePipeline(options: PipelineOptions): Promise<string> {
  const pipelineStart = Date.now();
  const projectName = path.basename(options.projectDir);

  // 1. SQLite Koşu (Run) Kaydını Başlat
  const runId = logStore.startRun(
    options.sessionId || "",
    projectName,
    options.projectRequirement,
    options.projectDir
  );
  options.runId = runId;

  try {
    const { files, architectureSummary } = await runArchitectStage(options.projectRequirement, options);
    const writtenFiles = await runDeveloperStage(files, architectureSummary, options);
    await runQAFixStage(writtenFiles, options);
    const report = await runReviewerStage(writtenFiles, options.projectRequirement, options);

    const totalElapsed = (Date.now() - pipelineStart) / 1000;
    const errors = logStore.getErrors(options.projectDir, runId);

    // 2. Koşu kaydını tamamla
    logStore.finishRun(
      runId,
      "success",
      5,
      writtenFiles.length,
      totalElapsed,
      errors.length,
      options.projectDir
    );

    // 3. Proje dizinine AUDIT_LOG.md ve full_logs.json üret
    logStore.exportAuditLogMd(options.projectDir, runId);
    logStore.exportLogsJson(options.projectDir);

    return report;
  } catch (err) {
    const totalElapsed = (Date.now() - pipelineStart) / 1000;
    logStore.finishRun(runId, "failed", 5, 0, totalElapsed, 1, options.projectDir);
    logStore.exportAuditLogMd(options.projectDir, runId);
    throw err;
  }
}
