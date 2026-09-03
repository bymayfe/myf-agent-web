"use client";

// src/components/FileChangesBlock.tsx
// Antigravity & Cursor tarzı "Edited <badge> <file> +A -R" satırları ve satır satır Diff görüntüleyici.

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Undo2,
  Loader2,
} from "lucide-react";
import type { FileDiffResult, DiffLine } from "@/lib/diffHelper";
import { getFileBadge } from "./ToolCallBlock";

export interface EditedFile extends FileDiffResult {}

interface FileChangesBlockProps {
  files: EditedFile[];
  sessionId?: string | null;
}

export default function FileChangesBlock({ files, sessionId }: FileChangesBlockProps) {
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [discardedFiles, setDiscardedFiles] = useState<Record<string, boolean>>({});
  const [loadingFile, setLoadingFile] = useState<string | null>(null);

  if (!files || files.length === 0) return null;

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const handleDiscard = async (file: EditedFile, e: React.MouseEvent) => {
    e.stopPropagation();
    if (loadingFile) return;
    setLoadingFile(file.path);
    try {
      const res = await fetch("/api/fs/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: file.path,
          oldContent: file.oldContent,
          isNew: file.isNew,
          sessionId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDiscardedFiles((prev) => ({ ...prev, [file.path]: true }));
      }
    } catch {
      // ignore
    } finally {
      setLoadingFile(null);
    }
  };

  return (
    <div className="my-1.5 flex flex-col gap-1 font-sans">
      {files.map((file, idx) => {
        const isDiscarded = discardedFiles[file.path];
        const isExpanded = !!expandedFiles[file.path];
        const isLoading = loadingFile === file.path;
        const filename = file.path.split("/").pop() || file.path;
        const badge = getFileBadge(filename);

        return (
          <div key={idx} className="flex flex-col">
            {/* Antigravity "Edited <badge> <file> +A -R" Satırı */}
            <div
              onClick={() => !isDiscarded && toggleFile(file.path)}
              className={`flex items-center gap-2 text-xs py-1 px-1.5 -mx-1.5 rounded-lg cursor-pointer transition-colors group ${
                isDiscarded
                  ? "opacity-50 line-through bg-gray-900/20"
                  : "hover:bg-gray-800/40"
              }`}
            >
              <span className="text-gray-400 font-normal">Edited</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] ${badge.bg} ${badge.text}`}>
                {badge.label}
              </span>
              <span className="font-semibold text-gray-200 group-hover:text-cyan-300 transition-colors">
                {filename}
              </span>
              <span className="text-emerald-400 font-mono text-[11px] font-semibold">
                +{file.added || 0}
              </span>
              <span className="text-rose-400 font-mono text-[11px] font-semibold">
                -{file.removed || 0}
              </span>

              {/* Sağdaki Aksiyonlar (Geri Al / Farkı İncele) */}
              <div className="ml-auto flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {!isDiscarded && (
                  <button
                    onClick={(e) => handleDiscard(file, e)}
                    disabled={isLoading}
                    className="flex items-center gap-1 text-[10px] text-rose-300 hover:text-rose-200 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 px-1.5 py-0.5 rounded transition-colors"
                    title="Bu dosyadaki değişiklikleri geri al (Discard)"
                  >
                    {isLoading ? <Loader2 size={10} className="animate-spin" /> : <Undo2 size={10} />}
                    <span>Geri Al</span>
                  </button>
                )}
                {isDiscarded && (
                  <span className="text-[10px] text-gray-500 font-mono flex items-center gap-1">
                    <Check size={10} className="text-emerald-400" /> Geri Alındı
                  </span>
                )}
              </div>
            </div>

            {/* Satır Satır Renkli Git Diff Kutusu */}
            {isExpanded && !isDiscarded && (
              <div className="mt-1 mb-2 rounded-xl border border-gray-800 bg-[#07090f] overflow-hidden text-xs shadow-md">
                <div className="px-3 py-1.5 bg-gray-900/80 border-b border-gray-800 flex items-center justify-between text-[11px] font-mono text-gray-400">
                  <span>{file.path}</span>
                  <span>{file.lines?.length || 0} satır</span>
                </div>

                <div className="p-2 font-mono text-[11px] leading-relaxed max-h-60 overflow-y-auto divide-y divide-gray-900/40">
                  {file.lines && file.lines.length > 0 ? (
                    file.lines.map((line: DiffLine, lIdx: number) => {
                      const isAdd = line.type === "add";
                      const isDel = line.type === "remove";
                      return (
                        <div
                          key={lIdx}
                          className={`flex items-start px-2 py-0.5 ${
                            isAdd
                              ? "bg-emerald-950/30 text-emerald-300"
                              : isDel
                              ? "bg-rose-950/30 text-rose-300"
                              : "text-gray-400"
                          }`}
                        >
                          <span className="w-5 shrink-0 select-none text-gray-600 text-right pr-2">
                            {isAdd ? "+" : isDel ? "-" : " "}
                          </span>
                          <span className="w-8 shrink-0 select-none text-gray-600 text-right pr-2">
                            {line.newLineNumber || line.oldLineNumber || ""}
                          </span>
                          <span className="whitespace-pre-wrap flex-1 break-all select-text">
                            {line.text || " "}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="px-3 py-2 text-gray-500 italic">
                      (Dosya sıfırdan oluşturuldu, {file.added} satır eklendi)
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
