"use client";

// src/components/ActivityFeed.tsx
// Fotoğraftaki Antigravity tarzı activity feed.
// Her turn için: özet başlık + expand edilince detay olaylar.
// "Edited llmClient.ts +14 -5" · "Ran 11 commands, edited 5 files" · "3 notes"

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Terminal,
  Eye,
  StickyNote,
  Globe,
  Map,
  Zap,
  AlertCircle,
  Wrench,
} from "lucide-react";
import type { ActivityGroup, ActivityEvent, ActivityKind } from "@/lib/activityLog";

// ─── İkon & renk haritası ─────────────────────────────────────────────────────

const KIND_META: Record<
  ActivityKind,
  { icon: React.ElementType; color: string; label: string }
> = {
  tool:     { icon: Wrench,       color: "text-amber-400",  label: "Tool" },
  edit:     { icon: Pencil,       color: "text-cyan-400",   label: "Edited" },
  run:      { icon: Terminal,     color: "text-emerald-400", label: "Ran" },
  view:     { icon: Eye,          color: "text-gray-400",   label: "Viewed" },
  note:     { icon: StickyNote,   color: "text-amber-400",  label: "Note" },
  search:   { icon: Globe,        color: "text-blue-400",   label: "Web search" },
  map:      { icon: Map,          color: "text-purple-400", label: "Map" },
  pipeline: { icon: Zap,          color: "text-yellow-400", label: "Pipeline" },
  error:    { icon: AlertCircle,  color: "text-red-400",    label: "Error" },
};

// ─── Tek olay satırı ──────────────────────────────────────────────────────────

function EventRow({ event }: { event: ActivityEvent }) {
  const meta = KIND_META[event.kind] || KIND_META.note;
  const Icon = meta.icon;

  // Tool Call: "🔧 [git_ops] git_status"
  if (event.kind === "tool") {
    return (
      <div className="space-y-1 py-1">
        <div className="flex items-center gap-1.5 text-xs text-amber-300">
          <Icon size={12} className={meta.color} />
          <span className="font-semibold text-amber-400 font-mono">[{event.pluginName || "Tool"}]</span>
          <span className="font-mono text-gray-200">{event.toolName}</span>
          {event.status === "error" && (
            <span className="text-[10px] text-red-400 font-mono ml-auto">hata</span>
          )}
        </div>
        {event.toolOutput && (
          <div className="pl-4 text-[11px] text-gray-400 font-mono whitespace-pre-wrap max-h-28 overflow-y-auto bg-gray-900/60 rounded p-1.5 border border-gray-800/60">
            {event.toolOutput}
          </div>
        )}
      </div>
    );
  }

  // Edit: "Edited llmClient.ts +27 -32"
  if (event.kind === "edit" && event.files) {
    return (
      <div className="space-y-0.5">
        {event.files.map((f, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-gray-400 py-0.5">
            <Icon size={12} className={meta.color} />
            <span className="font-mono text-gray-300 truncate max-w-[180px]">
              {f.path.split("/").pop()}
            </span>
            {f.added > 0 && (
              <span className="text-emerald-400 font-mono">+{f.added}</span>
            )}
            {f.removed > 0 && (
              <span className="text-red-400 font-mono">-{f.removed}</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  // View: "Check current state of llmClient.ts"
  if (event.kind === "view" && event.files?.[0]) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 py-0.5">
        <Icon size={12} className={meta.color} />
        <span className="font-mono text-gray-300 truncate">
          {event.files[0].path.split("/").pop()}
        </span>
      </div>
    );
  }

  // Run: komut + exit code
  if (event.kind === "run") {
    return (
      <div className="flex items-start gap-2 text-xs text-gray-400 py-0.5">
        <Icon size={12} className={`${meta.color} mt-0.5 shrink-0`} />
        <span className="font-mono text-gray-300 truncate">{event.command}</span>
        {event.exitCode !== undefined && event.exitCode !== 0 && (
          <span className="text-red-400 shrink-0">exit {event.exitCode}</span>
        )}
      </div>
    );
  }

  // Pipeline: stage badge
  if (event.kind === "pipeline") {
    const statusColor =
      event.status === "done" ? "text-emerald-400" :
      event.status === "error" ? "text-red-400" :
      "text-yellow-400";
    return (
      <div className="flex items-center gap-2 text-xs py-0.5">
        <Icon size={12} className={`${meta.color} shrink-0`} />
        <span className={`font-semibold ${statusColor}`}>{event.stage}</span>
        {event.message && (
          <span className="text-gray-500 truncate">{event.message}</span>
        )}
      </div>
    );
  }

  // Search
  if (event.kind === "search") {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 py-0.5">
        <Icon size={12} className={meta.color} />
        <span className="text-gray-300 truncate italic">&ldquo;{event.query}&rdquo;</span>
        {event.resultCount !== undefined && (
          <span className="text-gray-500 shrink-0">{event.resultCount} sonuç</span>
        )}
      </div>
    );
  }

  // Note / Map / Error — genel mesaj
  return (
    <div className="flex items-start gap-2 text-xs text-gray-400 py-0.5">
      <Icon size={12} className={`${meta.color} mt-0.5 shrink-0`} />
      <span className="text-gray-400 leading-relaxed line-clamp-2">
        {event.message ?? meta.label}
      </span>
    </div>
  );
}

// ─── Tek turn kartı ───────────────────────────────────────────────────────────

function TurnCard({ group, index }: { group: ActivityGroup; index: number }) {
  const [open, setOpen] = useState(false);
  const hasEvents = group.events.length > 0;
  const summary = group.summary ?? `${group.events.length} olay`;

  // edit olaylarından dosya sayısı + toplam diff
  const editEvents = group.events.filter((e) => e.kind === "edit");
  const editedFiles = new Set(editEvents.flatMap((e) => (e.files ?? []).map((f) => f.path)));
  const runCount = group.events.filter((e) => e.kind === "run").length;
  const noteCount = group.events.filter((e) => e.kind === "note").length;

  return (
    <div className="border border-gray-800/60 rounded-lg overflow-hidden mb-2">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!hasEvents}
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-gray-800/40 transition-colors disabled:cursor-default"
      >
        <span className="shrink-0 mt-0.5">
          {open ? (
            <ChevronDown size={13} className="text-gray-500" />
          ) : (
            <ChevronRight size={13} className="text-gray-500" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] text-gray-600 font-mono">#{index + 1}</span>
            {summary ? (
              <span className="text-xs text-gray-300 font-medium">{summary}</span>
            ) : (
              <span className="text-xs text-gray-600 italic">aktivite yok</span>
            )}
          </div>
          {/* İnline istatistik — fotoğraftaki gibi */}
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            {editedFiles.size > 0 && (
              <span className="flex items-center gap-1">
                <Pencil size={9} className="text-cyan-500" />
                {editedFiles.size} file{editedFiles.size !== 1 ? "s" : ""}
              </span>
            )}
            {runCount > 0 && (
              <span className="flex items-center gap-1">
                <Terminal size={9} className="text-emerald-500" />
                {runCount} cmd{runCount !== 1 ? "s" : ""}
              </span>
            )}
            {noteCount > 0 && (
              <span className="flex items-center gap-1">
                <StickyNote size={9} className="text-amber-500" />
                {noteCount} note{noteCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </button>

      {open && hasEvents && (
        <div className="px-3 pb-3 pt-1 space-y-0.5 border-t border-gray-800/40 bg-gray-950/30">
          {group.events.map((evt) => (
            <EventRow key={evt.id} event={evt} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Ana bileşen ─────────────────────────────────────────────────────────────

interface ActivityFeedProps {
  groups: ActivityGroup[];
}

export default function ActivityFeed({ groups }: ActivityFeedProps) {
  if (groups.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center text-gray-600 text-xs px-4">
        <div>
          <Zap size={24} className="mx-auto mb-2 opacity-30" />
          <p>Henüz aktivite yok.</p>
          <p className="mt-1">Ajan bir şeyler yaptığında burada görünecek.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2 px-1">
        Aktivite Günlüğü — {groups.length} tur
      </div>
      {[...groups].reverse().map((g, i) => (
        <TurnCard key={g.turnId} group={g} index={groups.length - 1 - i} />
      ))}
    </div>
  );
}
