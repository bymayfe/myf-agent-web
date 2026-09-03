"use client";

// src/components/FolderPickerModal.tsx
// Görsel ve Native Klasör Seçici Modalı.
// Hem işletim sisteminin yerel klasör seçici penceresini (zenity/kdialog) tek tıkla açar,
// hem de doğrudan arayüz içinden klasör ağacında gezinerek seçim yapmayı sağlar.

import { useState, useEffect, useCallback } from "react";
import {
  Folder,
  FolderOpen,
  FolderPlus,
  ArrowUp,
  X,
  Check,
  Monitor,
  HardDrive,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

interface FolderPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelectFolder: (folderPath: string, projectName: string) => Promise<void>;
}

interface DirectoryItem {
  name: string;
  path: string;
  isHidden: boolean;
}

interface BrowseData {
  currentPath: string;
  parentPath: string | null;
  homePath: string;
  shortcuts: { name: string; path: string }[];
  directories: DirectoryItem[];
}

export default function FolderPickerModal({
  open,
  onClose,
  onSelectFolder,
}: FolderPickerModalProps) {
  const [currentPath, setCurrentPath] = useState<string>("");
  const [projectName, setProjectName] = useState<string>("");
  const [data, setData] = useState<BrowseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [nativeLoading, setNativeLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  const loadDirectory = useCallback(async (path?: string) => {
    setLoading(true);
    setError("");
    try {
      const url = path ? `/api/fs/browse?path=${encodeURIComponent(path)}` : "/api/fs/browse";
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Klasör yüklenemedi");
      }
      setData(json);
      setCurrentPath(json.currentPath);
      // Varsayılan proje adı olarak klasörün adını belirle
      const folderBaseName = json.currentPath.split("/").filter(Boolean).pop() || "Proje";
      setProjectName(folderBaseName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Klasör okunamadı");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadDirectory();
    }
  }, [open, loadDirectory]);

  // Native OS klasör seçici dialog (zenity/kdialog)
  const handleOpenNativeDialog = async () => {
    setNativeLoading(true);
    setError("");
    try {
      const res = await fetch("/api/fs/pick-folder", { method: "POST" });
      const json = await res.json();
      if (json.ok && json.path) {
        // Seçilen klasöre git veya doğrudan ekle
        await loadDirectory(json.path);
      } else if (json.error) {
        setError(json.error);
      }
    } catch {
      setError("Sistem seçici penceresi açılamadı. Aşağıdaki klasör ağacından seçebilirsiniz.");
    } finally {
      setNativeLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!currentPath) return;
    setSubmitting(true);
    setError("");
    try {
      await onSelectFolder(currentPath, projectName.trim() || currentPath.split("/").pop() || "Proje");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Proje eklenemedi");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  // Breadcrumb parçaları
  const pathParts = currentPath.split("/").filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-700/80 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        
        {/* Modal Başlık */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 bg-gray-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
              <FolderPlus size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-100">Proje Klasörü Seç</h2>
              <p className="text-xs text-gray-400">Çalışmak istediğin proje dizinini seç</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Üst Kısayollar ve Native Seçici Butonu */}
        <div className="px-5 py-3 border-b border-gray-800/60 bg-gray-950/20 flex flex-wrap items-center justify-between gap-2">
          {/* Hızlı Kısayol Butonları */}
          <div className="flex flex-wrap items-center gap-1.5">
            {data?.shortcuts.map((sc) => (
              <button
                key={sc.path}
                onClick={() => loadDirectory(sc.path)}
                className={`text-xs px-2.5 py-1 rounded-md border transition-all ${
                  currentPath === sc.path
                    ? "bg-cyan-950/60 border-cyan-700/80 text-cyan-300 font-medium"
                    : "bg-gray-800/50 border-gray-700/50 text-gray-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                {sc.name}
              </button>
            ))}
          </div>

          {/* Sistem Klasör Seçici Butonu (Native Zenity/Kdialog) */}
          <button
            onClick={handleOpenNativeDialog}
            disabled={nativeLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-950/60 border border-indigo-700/60 hover:bg-indigo-900/60 text-indigo-200 text-xs font-medium transition-all shadow-sm"
            title="İşletim sisteminin yerel klasör seçici penceresini aç"
          >
            <Monitor size={13} className="text-indigo-400" />
            {nativeLoading ? "Pencere Açılıyor..." : "Sistem Penceresinde Aç"}
          </button>
        </div>

        {/* Breadcrumbs & Yol Çubuğu */}
        <div className="px-5 py-2.5 bg-gray-900/80 border-b border-gray-800 flex items-center gap-2">
          <button
            onClick={() => data?.parentPath && loadDirectory(data.parentPath)}
            disabled={!data?.parentPath || loading}
            className="p-1.5 rounded-md bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-gray-800 text-gray-300 transition-colors"
            title="Üst Klasöre Çık"
          >
            <ArrowUp size={14} />
          </button>

          <div className="flex-1 flex items-center gap-1 overflow-x-auto py-0.5 text-xs text-gray-400 font-mono no-scrollbar">
            <button
              onClick={() => loadDirectory("/")}
              className="hover:text-cyan-400 flex items-center gap-1 shrink-0 px-1 py-0.5 rounded hover:bg-gray-800"
            >
              <HardDrive size={12} /> /
            </button>
            {pathParts.map((part, idx) => {
              const fullSubPath = "/" + pathParts.slice(0, idx + 1).join("/");
              const isLast = idx === pathParts.length - 1;
              return (
                <div key={fullSubPath} className="flex items-center gap-1 shrink-0">
                  <ChevronRight size={10} className="text-gray-600" />
                  <button
                    onClick={() => loadDirectory(fullSubPath)}
                    className={`px-1.5 py-0.5 rounded transition-colors ${
                      isLast
                        ? "bg-cyan-950/60 text-cyan-300 font-semibold border border-cyan-800/40"
                        : "hover:text-cyan-400 hover:bg-gray-800"
                    }`}
                  >
                    {part}
                  </button>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => loadDirectory(currentPath)}
            disabled={loading}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
            title="Yenile"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Klasör Listesi */}
        <div className="flex-1 overflow-y-auto p-4 min-h-[220px] max-h-[340px]">
          {loading ? (
            <div className="h-full flex items-center justify-center text-xs text-gray-500 gap-2 py-10">
              <RefreshCw size={16} className="animate-spin text-cyan-500" />
              Klasörler taranıyor...
            </div>
          ) : data?.directories.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 text-xs py-10 gap-1">
              <FolderOpen size={28} className="text-gray-600 mb-1 opacity-60" />
              <p className="font-medium text-gray-400">Bu klasörde alt dizin yok.</p>
              <p className="text-gray-600">Doğrudan bu klasörü seçebilirsiniz.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {data?.directories.map((dir) => (
                <button
                  key={dir.path}
                  onClick={() => loadDirectory(dir.path)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition-all border ${
                    dir.isHidden
                      ? "text-gray-500 bg-gray-950/30 border-gray-800/40 hover:bg-gray-800/40 hover:text-gray-300"
                      : "text-gray-200 bg-gray-800/40 border-gray-700/40 hover:bg-cyan-950/40 hover:border-cyan-800/50 hover:text-cyan-200"
                  }`}
                >
                  <Folder size={15} className={dir.isHidden ? "text-gray-600" : "text-cyan-400 shrink-0"} />
                  <span className="truncate flex-1 font-medium">{dir.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Hata Mesajı */}
        {error && (
          <div className="mx-5 mb-2 px-3 py-2 rounded-lg bg-red-950/40 border border-red-800/50 flex items-center gap-2 text-red-300 text-xs">
            <AlertTriangle size={14} className="shrink-0 text-red-400" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* Alt Seçim ve Onay Çubuğu */}
        <div className="p-4 border-t border-gray-800 bg-gray-950/60 flex flex-col sm:flex-row items-center gap-3">
          <div className="flex-1 w-full flex items-center gap-2">
            <span className="text-xs text-gray-400 shrink-0">Proje Adı:</span>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Proje Adı"
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-cyan-600 font-medium"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg border border-gray-700 hover:bg-gray-800 text-gray-300 text-xs font-medium transition-colors"
            >
              Vazgeç
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting || !currentPath}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold transition-all shadow-md shadow-cyan-950/50"
            >
              <Check size={14} />
              {submitting ? "Ekleniyor..." : "Bu Klasörü Seç"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
