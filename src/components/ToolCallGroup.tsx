"use client";

// src/components/ToolCallGroup.tsx
// SORUN: "Kod Tabanı Keşfi" (read_file/list_directory/vb.) çağrıları art arda
// onlarca kez tek tek satır olarak render ediliyordu — kullanıcı ekran
// görüntüsünde bunun "aşırı büyük durduğunu" ve modern ajan arayüzlerindeki
// (Claude Code, Antigravity, Codex) gibi TEK bir gruba toplanmasını istedi.
// ÇÖZÜM: Art arda gelen salt-okunur keşif araç çağrıları (bkz.
// ToolCallBlock.tsx -> EXPLORATION_TOOLS) MessageBubble tarafından burada
// tanımlanan tek bir bileşene toplanıp gösteriliyor: varsayılan olarak
// KAPALI, tek satırlık bir özet ("N adım incelendi") — açılınca her adım
// kendi küçük satırında listeleniyor.

import { useState } from "react";
import { ChevronDown, ChevronRight, Folder, FileText } from "lucide-react";
import ToolCallBlock, { parseToolCall } from "./ToolCallBlock";

export interface ToolCallGroupItem {
  rawContent: string;
}

interface ToolCallGroupProps {
  items: ToolCallGroupItem[];
}

function targetLabel(rawContent: string): string {
  const { tool, params } = parseToolCall(rawContent);
  const target = String(params.filePath || params.path || params.dirPath || params.query || "");
  if (target) return target.split("/").pop() || target;
  return tool;
}

export default function ToolCallGroup({ items }: ToolCallGroupProps) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  // Tek bir öğe varsa gruplamaya gerek yok, doğrudan tekil kart yeterli.
  if (items.length === 1) {
    return <ToolCallBlock rawContent={items[0].rawContent} />;
  }

  const labels = items.map((it) => targetLabel(it.rawContent));

  return (
    <div className="my-1.5 rounded-xl border border-blue-800/40 bg-blue-950/20 overflow-hidden font-sans text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/[0.03] transition-colors gap-2"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-1 rounded-md bg-gray-900/80 border border-gray-800 text-blue-400 shrink-0">
            <Folder size={13} />
          </div>
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider shrink-0">
            Kod Tabanı Keşfi:
          </span>
          <span className="font-mono text-gray-200 font-medium truncate text-xs">
            {items.length} adım incelendi ({labels.slice(0, 3).join(", ")}
            {labels.length > 3 ? "…" : ""})
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 text-gray-500">
          <span className="text-[10px] bg-gray-900 border border-gray-800 px-1.5 py-0.5 rounded text-gray-400">
            {open ? "Gizle" : "Detay"}
          </span>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-800/60 bg-gray-950/70 p-2 space-y-1 font-mono text-[11px] max-h-64 overflow-y-auto">
          {labels.map((label, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg text-gray-300">
              <FileText size={11} className="text-blue-400 shrink-0" />
              <span className="truncate">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
