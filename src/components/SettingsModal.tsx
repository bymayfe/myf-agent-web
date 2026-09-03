"use client";

import { useEffect, useState } from "react";
import {
  X,
  Globe,
  GitBranch,
  Files,
  Cpu,
  Terminal,
  Puzzle,
  RefreshCw,
  FolderOpen,
  HelpCircle,
  FileCode,
  CheckCircle2,
  Brain,
  Sparkles,
} from "lucide-react";
import type { ModelOption, ProvidersFile, Settings } from "@/types";
import type { PluginManifest } from "@/lib/plugins/types";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  providers: ProvidersFile;
  onSave: (partial: Partial<Settings> & { provider?: string }) => Promise<void>;
}

type Tab = "model" | "behavior" | "plugins" | "security" | "about";

const TABS: { id: Tab; label: string }[] = [
  { id: "model", label: "Sağlayıcı & Model" },
  { id: "behavior", label: "Davranış" },
  { id: "plugins", label: "Eklentiler (Plugins)" },
  { id: "security", label: "Güvenlik" },
  { id: "about", label: "Hakkında" },
];

const PLUGIN_ICONS: Record<string, React.ElementType> = {
  Globe,
  GitBranch,
  Files,
  Cpu,
  Terminal,
  Puzzle,
  FileCode,
  CheckCircle2,
  Brain,
  Sparkles,
};

export default function SettingsModal({ open, onClose, settings, providers, onSave }: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>("model");
  const [draft, setDraft] = useState<Settings>(settings);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [pluginsDir, setPluginsDir] = useState<string>("");
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showFolderHelp, setShowFolderHelp] = useState(false);

  useEffect(() => setDraft(settings), [settings]);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/models?provider=${draft.active_provider}`)
      .then((r) => r.json())
      .then((d) => {
        const list: ModelOption[] = d.models ?? [];
        setModels(list);
        if (list.length > 0) {
          setDraft((prev) => {
            const hasModel = list.some((m) => m.id === prev.coordinator_model);
            if (!hasModel) {
              const fallback = list[0].id;
              return {
                ...prev,
                coordinator_model: fallback,
                default_model: fallback,
                planning_model: fallback,
                code_model: fallback,
                micro_fix_model: fallback,
              };
            }
            return prev;
          });
        }
      })
      .catch(() => setModels([]));
  }, [open, draft.active_provider]);

  // Eklentileri yükle
  const loadPlugins = () => {
    setPluginsLoading(true);
    fetch("/api/plugins")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setPlugins(d.plugins || []);
          if (d.pluginsDir) setPluginsDir(d.pluginsDir);
        }
      })
      .catch(() => {})
      .finally(() => setPluginsLoading(false));
  };

  useEffect(() => {
    if (open && tab === "plugins") {
      loadPlugins();
    }
  }, [open, tab]);

  const handleTogglePlugin = async (id: string, enabled: boolean) => {
    try {
      const res = await fetch("/api/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", id, enabled }),
      });
      const data = await res.json();
      if (data.ok && data.plugins) {
        setPlugins(data.plugins);
      }
    } catch {
      // ignore
    }
  };

  const handleOpenPluginsFolder = async () => {
    try {
      await fetch("/api/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open-folder" }),
      });
    } catch {
      // ignore
    }
  };

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ ...draft, provider: draft.active_provider });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="glass-modal rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden bg-gray-900 border border-gray-700/80 shadow-2xl">
        
        {/* Modal Başlığı */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 bg-gray-950/40">
          <h2 className="text-base font-semibold text-white">Ayarlar & Eklentiler</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Sekmeler */}
        <div className="flex border-b border-gray-800 px-5 gap-1 bg-gray-950/20 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-cyan-500 text-cyan-400"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Sekme İçerikleri */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {/* SAĞLAYICI & MODEL */}
          {tab === "model" && (
            <>
              <Field label="Sağlayıcı">
                <select
                  value={draft.active_provider}
                  onChange={(e) => {
                    const nextProv = e.target.value;
                    const provConfig = providers.providers[nextProv];
                    const defaultModel = provConfig?.agent_models?.coordinator;
                    setDraft((d) => ({
                      ...d,
                      active_provider: nextProv,
                      ...(defaultModel
                        ? {
                            coordinator_model: defaultModel,
                            default_model: defaultModel,
                            planning_model: defaultModel,
                            code_model: defaultModel,
                            micro_fix_model: defaultModel,
                          }
                        : {}),
                    }));
                  }}
                  className="input-base"
                >
                  {Object.entries(providers.providers).map(([key, p]) => (
                    <option key={key} value={key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Model">
                <select
                  value={
                    models.some((m) => m.id === draft.coordinator_model)
                      ? draft.coordinator_model
                      : models[0]?.id ?? draft.coordinator_model
                  }
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      coordinator_model: e.target.value,
                      default_model: e.target.value,
                      planning_model: e.target.value,
                      code_model: e.target.value,
                      micro_fix_model: e.target.value,
                    }))
                  }
                  className="input-base"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Modeli Bellekte (VRAM) Hazırda Tut (Keep-Alive / Hızlı Yanıt)">
                <div className="space-y-1.5">
                  <Toggle
                    checked={draft.warmup}
                    onChange={(v) => setDraft((d) => ({ ...d, warmup: v }))}
                  />
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    {draft.warmup
                      ? "🟢 Aktif: Model VRAM'de sürekli sıcak tutulur (keep_alive: -1). Her mesaj yazdığınızda SSD'den yükleme beklemeden 0 saniyede anında yanıt verir."
                      : "⚪ Pasif: Model her işlemden 5 dakika sonra bellekten boşaltılarak sistem RAM/VRAM tasarrufu sağlanır."}
                  </p>
                </div>
              </Field>

              <p className="text-xs text-gray-500">
                Bulut sağlayıcıları için API anahtarı <code className="text-cyan-400">.env.local</code> dosyasından
                okunur — buradan girilmez.
              </p>
            </>
          )}

          {/* DAVRANIŞ */}
          {tab === "behavior" && (
            <>
              <Field label="Çalışma Modu">
                <select
                  value={draft.execution_mode}
                  onChange={(e) => setDraft((d) => ({ ...d, execution_mode: e.target.value as Settings["execution_mode"] }))}
                  className="input-base"
                >
                  <option value="interactive">Sohbet (Chat)</option>
                  <option value="sequential">Sıralı Pipeline (Faz 2)</option>
                  <option value="subagent">Subagent / Swarm (Faz 4)</option>
                </select>
              </Field>
              <Field label="Think Modu (Düşünme Süreci Gösterimi)">
                <Toggle checked={draft.think_mode} onChange={(v) => setDraft((d) => ({ ...d, think_mode: v }))} />
              </Field>
              <Field label={`Yaratıcılık / Temperature (${draft.temperature})`}>
                <div className="space-y-1.5">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={draft.temperature}
                    onChange={(e) => setDraft((d) => ({ ...d, temperature: parseFloat(e.target.value) }))}
                    className="w-full accent-cyan-500"
                  />
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-500">0.0 (Kesin)</span>
                    <span className={`font-medium ${
                      draft.temperature <= 0.3
                        ? "text-emerald-400"
                        : draft.temperature <= 0.7
                        ? "text-cyan-400"
                        : "text-amber-400"
                    }`}>
                      {draft.temperature <= 0.3
                        ? "🎯 Kodlama için İdeal (Düşük Yanılsama)"
                        : draft.temperature <= 0.7
                        ? "⚖️ Dengeli Sohbet"
                        : "🎨 Yaratıcı & Serbest"}
                    </span>
                    <span className="text-gray-500">1.0 (Yaratıcı)</span>
                  </div>
                </div>
              </Field>
              <Field label="Maksimum Çıktı Token (Max Tokens)">
                <div className="space-y-1">
                  <input
                    type="number"
                    value={draft.max_tokens}
                    onChange={(e) => setDraft((d) => ({ ...d, max_tokens: parseInt(e.target.value) || 2048 }))}
                    className="input-base"
                  />
                  <p className="text-[11px] text-gray-500">
                    Kodların yarıda kesilmemesi için 4096 veya 8192 önerilir.
                  </p>
                </div>
              </Field>
            </>
          )}

          {/* EKLENTİLER (PLUGINS) */}
          {tab === "plugins" && (
            <div className="space-y-3">
              
              {/* Eklenti Klasörü Bilgi Kutusu */}
              <div className="p-3.5 rounded-xl bg-gray-950/50 border border-gray-800 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-gray-300 font-medium">
                    <FolderOpen size={14} className="text-cyan-400" />
                    <span>Özel Eklenti Klasörü:</span>
                    <code className="text-[11px] text-cyan-300 bg-gray-900 border border-gray-700/60 px-2 py-0.5 rounded font-mono">
                      data/plugins/
                    </code>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setShowFolderHelp((v) => !v)}
                      className="p-1 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                      title="Nasıl eklenti eklenir?"
                    >
                      <HelpCircle size={14} />
                    </button>
                    <button
                      onClick={handleOpenPluginsFolder}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700/60 transition-colors"
                      title="Bu klasörü masaüstünde aç"
                    >
                      <FolderOpen size={12} />
                      Klasörü Aç
                    </button>
                  </div>
                </div>

                {showFolderHelp && (
                  <div className="text-[11px] text-gray-400 bg-gray-900/90 p-2.5 rounded-lg border border-gray-800 mt-1 space-y-1">
                    <p className="font-semibold text-gray-200">💡 Nasıl Özel Eklenti Eklenir?</p>
                    <p>
                      <code>data/plugins/</code> içine yeni bir klasör açıp (örn. <code>benim-arac/</code>) içine <code>plugin.json</code> koyun.
                      Dosyayı kaydettikten sonra aşağıdaki yenile butonuna bastığınızda eklentiniz otomatik algılanacaktır.
                    </p>
                  </div>
                )}
              </div>

              {/* Eklentiler Başlık & Yenile */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <h3 className="text-xs font-semibold text-gray-200">Yüklü Eklentiler ({plugins.length})</h3>
                  <p className="text-[11px] text-gray-500">
                    Modele yetenek kazandıran araçları buradan açıp kapatabilirsiniz.
                  </p>
                </div>
                <button
                  onClick={loadPlugins}
                  disabled={pluginsLoading}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors flex items-center gap-1 text-xs"
                  title="Yenile"
                >
                  <RefreshCw size={13} className={pluginsLoading ? "animate-spin" : ""} />
                  <span>Yenile</span>
                </button>
              </div>

              {/* Eklenti Kartları Listesi */}
              {pluginsLoading && plugins.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-500">Eklentiler taranıyor...</div>
              ) : (
                <div className="space-y-2.5">
                  {plugins.map((p) => {
                    const IconComponent = PLUGIN_ICONS[p.icon] || Puzzle;
                    return (
                      <div
                        key={p.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          p.enabled
                            ? "bg-gray-800/40 border-cyan-800/40 shadow-sm shadow-cyan-950/20"
                            : "bg-gray-950/30 border-gray-800/50 opacity-60"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className={`p-2.5 rounded-xl shrink-0 ${p.enabled ? "bg-cyan-950/80 text-cyan-400 border border-cyan-800/50" : "bg-gray-800 text-gray-500"}`}>
                              <IconComponent size={17} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-gray-100">{p.name}</span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-gray-800/80 border border-gray-700/50 text-gray-400 font-mono">
                                  v{p.version}
                                </span>
                                {p.category === "custom" && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-950/60 border border-purple-800/50 text-purple-300 font-mono">
                                    Özel
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                                {p.description}
                              </p>
                              {/* Sağladığı araçlar */}
                              <div className="flex flex-wrap gap-1 mt-2">
                                {p.toolNames.map((t) => (
                                  <span
                                    key={t.name}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-gray-900 border border-gray-700/60 text-cyan-300 font-mono"
                                    title={t.description}
                                  >
                                    ⚙️ {t.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Düzeltilmiş, şık Toggle Anahtarı */}
                          <div className="shrink-0 pl-2">
                            <Toggle
                              checked={p.enabled}
                              onChange={(val) => handleTogglePlugin(p.id, val)}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* GÜVENLİK */}
          {tab === "security" && (
            <>
              <Field label="İzin Modu">
                <select
                  value={draft.permission_mode}
                  onChange={(e) => setDraft((d) => ({ ...d, permission_mode: e.target.value as Settings["permission_mode"] }))}
                  className="input-base"
                >
                  <option value="ask">Sor (her işlemde onay iste)</option>
                  <option value="session_allow">Oturum boyunca izinli</option>
                  <option value="sandbox">Sandbox</option>
                  <option value="full_autonomy">Tam Otonom</option>
                </select>
              </Field>
              <Field label="Otomatik Audit Log">
                <Toggle checked={draft.auto_audit_log} onChange={(v) => setDraft((d) => ({ ...d, auto_audit_log: v }))} />
              </Field>
            </>
          )}

          {/* HAKKINDA */}
          {tab === "about" && (
            <div className="text-sm text-gray-400 space-y-2">
              <p>
                <span className="text-white font-medium">MYF AI Agent</span> — Next.js 16 / TypeScript full-stack modüler ajan sistemi.
              </p>
              <p className="text-xs text-gray-500">
                DeepSeek Harness felsefesiyle tasarlanmış Eklenti & Araç Mimarisi, Codebase Memory ve Canlı Web Arama motoru ile donatılmıştır.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-800 bg-gray-950/40">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium rounded-lg text-gray-300 hover:bg-gray-800 transition-colors">
            Vazgeç
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 transition-colors shadow-md shadow-cyan-950/40"
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>

      <style jsx global>{`
        .input-base {
          width: 100%;
          background: rgba(17, 24, 39, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: #f3f4f6;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

// ─── Kusursuz, Modern ve Şık Toggle Anahtarı ───────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
        checked ? "bg-cyan-500 shadow-md shadow-cyan-500/30" : "bg-gray-700 hover:bg-gray-600"
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
