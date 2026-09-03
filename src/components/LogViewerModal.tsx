"use client";

import { useEffect, useState, useCallback } from "react";
import {
  X,
  RefreshCw,
  Database,
  Terminal,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Wrench,
  Download,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Layers,
  Code2,
} from "lucide-react";
import type { ProjectRun, AgentStep, ErrorEvent } from "@/lib/storage/logStore";

interface LogViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectDir?: string;
  projectName?: string | null;
}

type TabType = "runs" | "steps" | "errors" | "audit";

export default function LogViewerModal({
  isOpen,
  onClose,
  projectDir,
  projectName,
}: LogViewerModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("steps");
  const [runs, setRuns] = useState<ProjectRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [errors, setErrors] = useState<ErrorEvent[]>([]);
  const [auditMd, setAuditMd] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [fixingErrorId, setFixingErrorId] = useState<string | null>(null);
  const [fixNotification, setFixNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const fetchLogData = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setFixNotification(null);

    try {
      const qDir = projectDir ? `&projectDir=${encodeURIComponent(projectDir)}` : "";
      
      // 1. Özet ve Koşuları çek
      const summaryRes = await fetch(`/api/logs?action=summary${qDir}`);
      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setRuns(data.runs || []);
        const targetRun = selectedRunId || data.latestRunId || (data.runs?.[0]?.run_id) || "";
        setSelectedRunId(targetRun);

        // 2. Adımları çek
        if (targetRun) {
          const stepsRes = await fetch(`/api/logs?action=steps&runId=${targetRun}${qDir}`);
          if (stepsRes.ok) {
            const stepsData = await stepsRes.json();
            setSteps(stepsData.steps || []);
          }
        } else {
          setSteps([]);
        }
      }

      // 3. Hataları çek
      const errorsRes = await fetch(`/api/logs?action=errors${qDir}`);
      if (errorsRes.ok) {
        const errData = await errorsRes.json();
        setErrors(errData.errors || []);
      }

      // 4. Audit Log Markdown çek
      const auditRes = await fetch(`/api/logs?action=audit${qDir}`);
      if (auditRes.ok) {
        const aData = await auditRes.json();
        setAuditMd(aData.markdown || "");
      }
    } catch (e) {
      console.error("Log verileri alınamadı:", e);
    } finally {
      setLoading(false);
    }
  }, [isOpen, projectDir, selectedRunId]);

  useEffect(() => {
    if (isOpen) {
      fetchLogData();
    }
  }, [isOpen, fetchLogData]);

  // Seçili Run değiştiğinde adımları güncelle
  const handleSelectRun = async (runId: string) => {
    setSelectedRunId(runId);
    setLoading(true);
    try {
      const qDir = projectDir ? `&projectDir=${encodeURIComponent(projectDir)}` : "";
      const res = await fetch(`/api/logs?action=steps&runId=${runId}${qDir}`);
      if (res.ok) {
        const data = await res.json();
        setSteps(data.steps || []);
      }
    } finally {
      setLoading(false);
    }
  };

  // Micro-Fix tetikleyici
  const handleTriggerMicroFix = async (errorId: string) => {
    setFixingErrorId(errorId);
    setFixNotification(null);

    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fix",
          errorId,
          projectDir,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFixNotification({
          type: "success",
          message: data.message || "Hata Micro-Fix ile başarıyla onarıldı!",
        });
        // Verileri tazele
        await fetchLogData();
      } else {
        setFixNotification({
          type: "error",
          message: data.error || "Micro-Fix onarımı sırasında bir hata oluştu.",
        });
      }
    } catch (err) {
      setFixNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Bağlantı hatası",
      });
    } finally {
      setFixingErrorId(null);
    }
  };

  // JSON / MD Dışa Aktarma
  const handleExport = async () => {
    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "export",
          runId: selectedRunId,
          projectDir,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFixNotification({
          type: "success",
          message: `Raporlar diske yazıldı:\n• ${data.auditLogPath}\n• ${data.jsonPath}`,
        });
      }
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  const unresolvedErrorsCount = errors.filter((e) => !e.resolved).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in p-4">
      <div className="glass-modal w-full max-w-5xl h-[88vh] flex flex-col rounded-2xl border border-gray-700/80 shadow-2xl overflow-hidden bg-gray-950/95 text-gray-200">
        {/* Üst Başlık Barı */}
        <div className="h-16 px-6 border-b border-gray-800 flex items-center justify-between shrink-0 bg-gray-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-800/70 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/20">
              <Database size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-white tracking-wide">
                  Pipeline & Ajan Süreç Denetleyicisi
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono-custom bg-gray-800 text-cyan-300 border border-gray-700">
                  SQLite: .myfcli/logs.db
                </span>
              </div>
              <div className="text-xs text-gray-400 truncate max-w-md">
                📁 {projectDir || "Aktif Çalışma Dizininde Kayıt"} {projectName ? `(${projectName})` : ""}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchLogData}
              disabled={loading}
              className="p-2 rounded-xl bg-gray-900 border border-gray-800 hover:bg-gray-800 text-gray-300 transition-colors disabled:opacity-50"
              title="Yenile"
            >
              <RefreshCw size={16} className={loading ? "animate-spin text-cyan-400" : ""} />
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-900 border border-gray-800 hover:bg-gray-800 text-xs text-gray-300 transition-colors"
              title="AUDIT_LOG.md ve JSON olarak kaydet"
            >
              <Download size={14} />
              <span>Dışa Aktar</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-gray-900 border border-gray-800 hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Bildirim Alanı */}
        {fixNotification && (
          <div
            className={`px-6 py-2.5 text-xs flex items-center justify-between border-b ${
              fixNotification.type === "success"
                ? "bg-emerald-950/80 border-emerald-800/80 text-emerald-200"
                : "bg-red-950/80 border-red-800/80 text-red-200"
            }`}
          >
            <div className="flex items-center gap-2 whitespace-pre-line font-medium">
              {fixNotification.type === "success" ? (
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle size={16} className="text-red-400 shrink-0" />
              )}
              <span>{fixNotification.message}</span>
            </div>
            <button
              onClick={() => setFixNotification(null)}
              className="text-xs opacity-75 hover:opacity-100 underline"
            >
              Kapat
            </button>
          </div>
        )}

        {/* Tab Butonları */}
        <div className="h-12 px-6 border-b border-gray-800 flex items-center justify-between bg-gray-900/30 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("steps")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === "steps"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/60"
              }`}
            >
              <Layers size={14} />
              <span>Ajan Adımları & Promptlar</span>
              <span className="px-1.5 py-0.2 rounded-full bg-gray-800 text-[10px] text-gray-300">
                {steps.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("errors")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === "errors"
                  ? "bg-red-500/20 text-red-300 border border-red-500/40 shadow-sm"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/60"
              }`}
            >
              <AlertCircle size={14} />
              <span>Hata & Micro-Fix Olayları</span>
              {unresolvedErrorsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-red-600 text-[10px] text-white font-bold animate-pulse">
                  {unresolvedErrorsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("runs")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === "runs"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/60"
              }`}
            >
              <Clock size={14} />
              <span>Pipeline Koşuları</span>
              <span className="px-1.5 py-0.2 rounded-full bg-gray-800 text-[10px] text-gray-300">
                {runs.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("audit")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === "audit"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/60"
              }`}
            >
              <FileText size={14} />
              <span>AUDIT_LOG.md Raporu</span>
            </button>
          </div>

          {/* Koşu Seçici */}
          {runs.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Aktif Koşu:</span>
              <select
                value={selectedRunId}
                onChange={(e) => handleSelectRun(e.target.value)}
                className="bg-gray-900 border border-gray-700/80 rounded-lg px-2.5 py-1 text-cyan-300 font-mono text-xs focus:outline-none focus:border-cyan-500"
              >
                {runs.map((r) => (
                  <option key={r.run_id} value={r.run_id}>
                    {r.run_id} ({r.status}) - {r.started_at?.slice(11, 19) || ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Ana İçerik Alanı */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* TAB 1: ADIMLAR & PROMPTLAR */}
          {activeTab === "steps" && (
            <div className="space-y-3">
              {steps.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500 text-xs space-y-2">
                  <Layers size={36} className="text-gray-600" />
                  <p>Bu çalışma için henüz kayıtlı bir ajan adımı bulunmuyor.</p>
                  <p className="text-[11px] text-gray-600">
                    Sıralı pipeline veya ajan görevi çalıştırıldığında tüm prompt ve çıktılar buraya otomatik düşecektir.
                  </p>
                </div>
              ) : (
                steps.map((step) => {
                  const isExpanded = expandedStepId === step.step_id;
                  let filesList: string[] = [];
                  try {
                    filesList = JSON.parse(step.files_written || "[]");
                  } catch {
                    filesList = [];
                  }

                  return (
                    <div
                      key={step.step_id}
                      className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden hover:border-gray-700 transition-all"
                    >
                      <div
                        onClick={() => setExpandedStepId(isExpanded ? null : step.step_id)}
                        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-800/40 select-none"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-md bg-gray-800 flex items-center justify-center text-xs font-mono text-cyan-400 font-bold">
                            #{step.step_number}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-white">
                                {step.agent_name}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-gray-800 text-gray-400">
                                {step.agent_role}
                              </span>
                              <span className="text-[10px] font-mono text-cyan-400/80">
                                {step.model.split("/").pop()}
                              </span>
                            </div>
                            <div className="text-[11px] text-gray-400 mt-0.5">
                              {step.output_summary || "Adım tamamlandı."}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-xs font-mono">
                          <div className="text-right">
                            <span className="text-gray-400">Prompt:</span>{" "}
                            <span className="text-cyan-300 font-semibold">{step.prompt_chars.toLocaleString()} ch</span>
                          </div>
                          <div className="text-right">
                            <span className="text-gray-400">Yanıt:</span>{" "}
                            <span className="text-emerald-300 font-semibold">{step.response_chars.toLocaleString()} ch</span>
                          </div>
                          <div className="text-right">
                            <span className="text-gray-400">Süre:</span>{" "}
                            <span className="text-amber-300">{step.elapsed_sec.toFixed(1)}s</span>
                          </div>
                          <div className="text-gray-500">
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </div>
                        </div>
                      </div>

                      {/* Genişletilmiş Prompt ve Çıktı Ayrıntıları */}
                      {isExpanded && (
                        <div className="p-4 border-t border-gray-800/80 bg-gray-950/80 space-y-4 text-xs font-mono">
                          {filesList.length > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500">Oluşturulan Dosyalar:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {filesList.map((f, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 text-[11px]"
                                  >
                                    {f}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Tam Prompt */}
                          <div>
                            <div className="flex items-center justify-between text-gray-400 mb-1 text-[11px]">
                              <span className="flex items-center gap-1 font-semibold text-gray-300">
                                <Code2 size={13} className="text-cyan-400" />
                                Model Prompt Metni ({step.prompt_chars} Karakter)
                              </span>
                            </div>
                            <pre className="p-3 rounded-lg bg-gray-900 border border-gray-800/80 text-gray-300 text-[11px] whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed">
                              {step.prompt_text || "(Prompt metni kaydedilmedi)"}
                            </pre>
                          </div>

                          {/* Tam Çıktı */}
                          <div>
                            <div className="flex items-center justify-between text-gray-400 mb-1 text-[11px]">
                              <span className="flex items-center gap-1 font-semibold text-gray-300">
                                <Sparkles size={13} className="text-emerald-400" />
                                Model Tam Çıktısı ({step.response_chars} Karakter)
                              </span>
                            </div>
                            <pre className="p-3 rounded-lg bg-gray-900 border border-gray-800/80 text-gray-300 text-[11px] whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
                              {step.full_output || "(Boş çıktı)"}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: HATALAR VE MICRO-FIX */}
          {activeTab === "errors" && (
            <div className="space-y-3">
              {errors.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500 text-xs space-y-2">
                  <CheckCircle2 size={36} className="text-emerald-500" />
                  <p className="text-emerald-300 font-semibold">Tebrikler, kayıtlı hiçbir hata olayı yok!</p>
                  <p className="text-[11px] text-gray-600">
                    Test veya derleme sırasında meydana gelen tüm hatalar burada listelenir ve tek tıkla onarılabilir.
                  </p>
                </div>
              ) : (
                errors.map((err) => {
                  const isResolved = Boolean(err.resolved);
                  const isFixing = fixingErrorId === err.error_id;

                  return (
                    <div
                      key={err.error_id}
                      className={`p-4 rounded-xl border ${
                        isResolved
                          ? "bg-gray-900/40 border-gray-800"
                          : "bg-red-950/20 border-red-800/60 shadow-lg shadow-red-950/20"
                      } space-y-3`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isResolved
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                                : "bg-red-950 text-red-300 border border-red-800/60"
                            }`}
                          >
                            {err.error_type}
                          </span>
                          <span className="font-mono text-xs text-gray-400">
                            ID: {err.error_id}
                          </span>
                          <span className="text-gray-500">·</span>
                          <span className="text-xs text-gray-300">
                            {err.agent_name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {isResolved ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                              <CheckCircle2 size={14} /> Çözüldü ({err.resolver || "micro_fix"})
                            </span>
                          ) : (
                            <button
                              onClick={() => handleTriggerMicroFix(err.error_id)}
                              disabled={isFixing}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition-all shadow-md shadow-red-600/30 border border-red-500/60 disabled:opacity-50"
                            >
                              <Wrench size={13} className={isFixing ? "animate-spin" : ""} />
                              <span>{isFixing ? "Onarılıyor..." : "Micro-Fix ile Otomatik Onar"}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Hata Mesajı ve Dosya */}
                      <div className="space-y-1 text-xs">
                        {err.file_path && (
                          <div className="font-mono text-cyan-300 text-[11px]">
                            📁 Dosya: {err.file_path}
                          </div>
                        )}
                        <pre className="p-3 rounded-lg bg-gray-950 border border-gray-800 text-red-300 text-[11px] whitespace-pre-wrap font-mono leading-relaxed">
                          {err.error_msg}
                        </pre>
                      </div>

                      <div className="text-[10px] text-gray-500 flex justify-between items-center pt-1 border-t border-gray-800/60">
                        <span>Oluşturulma: {err.created_at}</span>
                        <span>Model: {err.agent_model}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 3: KOŞULAR (RUNS) */}
          {activeTab === "runs" && (
            <div className="space-y-3">
              {runs.length === 0 ? (
                <div className="text-center py-16 text-gray-500 text-xs">
                  Henüz kaydedilmiş pipeline koşusu bulunmuyor.
                </div>
              ) : (
                runs.map((r) => (
                  <div
                    key={r.run_id}
                    onClick={() => {
                      handleSelectRun(r.run_id);
                      setActiveTab("steps");
                    }}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      selectedRunId === r.run_id
                        ? "bg-cyan-950/20 border-cyan-500/50 shadow-md"
                        : "bg-gray-900/40 border-gray-800 hover:border-gray-700 hover:bg-gray-800/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-cyan-300 font-bold">
                          {r.run_id}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            r.status === "success"
                              ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800/60"
                              : r.status === "running"
                              ? "bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 animate-pulse"
                              : "bg-red-950/80 text-red-300 border border-red-800/60"
                          }`}
                        >
                          {r.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 font-mono">
                        {r.started_at}
                      </div>
                    </div>

                    <div className="text-xs text-gray-300 font-medium mb-3 line-clamp-2">
                      {r.brief || "Proje gereksinimi belirtilmedi."}
                    </div>

                    <div className="flex items-center gap-4 text-xs font-mono text-gray-400 pt-2 border-t border-gray-800">
                      <span>📁 {r.files_written} Dosya</span>
                      <span>⏱️ {r.elapsed_sec?.toFixed(1) || 0}s</span>
                      <span className={r.error_count > 0 ? "text-red-400 font-bold" : ""}>
                        ⚠️ {r.error_count} Hata
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 4: AUDIT LOG MARKDOWN */}
          {activeTab === "audit" && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <span className="text-xs font-semibold text-white flex items-center gap-2">
                  <FileText size={16} className="text-cyan-400" />
                  Proje Denetim Raporu (AUDIT_LOG.md)
                </span>
                <span className="text-[11px] text-gray-400 font-mono">
                  Otomatik Üretilen Rapor
                </span>
              </div>
              <pre className="p-4 rounded-lg bg-gray-950 text-gray-300 text-xs font-mono leading-relaxed whitespace-pre-wrap max-h-[55vh] overflow-y-auto">
                {auditMd || "# AUDIT LOG\n\nHenüz kayıtlı bir denetim raporu bulunamadı."}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
