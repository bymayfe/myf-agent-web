"use client";

// Sidebar — Projeler ve Projeye Bağlı Oturumlar Hiyerarşik Ağaç Görünümü (Tree View)
// Her proje altında kendi oturumları gruplanır, bağımsız oturumlar "Genel Oturumlar" altında listelenir.

import { useState, useEffect } from "react";
import {
  Plus,
  MessageSquare,
  Trash2,
  Folder,
  FolderOpen,
  FolderPlus,
  Zap,
  ChevronDown,
  ChevronRight,
  Circle,
  AlertTriangle,
  X,
} from "lucide-react";

import type { SessionMeta, ProjectEntry } from "@/types";
import type { ActivityGroup } from "@/lib/activityLog";
import ActivityFeed from "./ActivityFeed";
import FolderPickerModal from "./FolderPickerModal";

interface SidebarProps {
  sessions: SessionMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: (projectDir?: string) => void;
  onDelete: (id: string) => void;
  onRefreshSessions?: () => void;
  onOpenSettings?: () => void;
  activityGroups: ActivityGroup[];
}

// ─── Proje Silme Diyaloğu ────────────────────────────────────────────────────
function DeleteProjectDialog({
  project,
  onConfirm,
  onCancel,
}: {
  project: ProjectEntry;
  onConfirm: (deleteSessions: boolean, deleteFiles: boolean) => void;
  onCancel: () => void;
}) {
  const [deleteSessions, setDeleteSessions] = useState(true);
  const [deleteFiles, setDeleteFiles] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="glass-modal w-full max-w-sm mx-4 rounded-2xl border border-gray-700/60 shadow-2xl p-5 space-y-4">
        {/* Başlık */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-950/60 border border-red-800/50 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-red-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Projeyi Kaldır</div>
            <div className="text-xs text-gray-400 truncate max-w-[200px]">{project.name}</div>
          </div>
        </div>

        <p className="text-xs text-gray-400 leading-relaxed">
          <span className="text-cyan-300 font-medium">{project.name}</span> projesi listeden kaldırılacak.
          Aşağıdaki ek seçenekleri işaretleyebilirsiniz:
        </p>

        {/* Seçenekler */}
        <div className="space-y-2.5">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={deleteSessions}
              onChange={(e) => setDeleteSessions(e.target.checked)}
              className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
            />
            <div>
              <div className="text-xs text-gray-200 group-hover:text-white transition-colors">
                Oturumları da sil
              </div>
              <div className="text-[10px] text-gray-500">Bu projeye ait sohbet geçmişi temizlenir</div>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={deleteFiles}
              onChange={(e) => setDeleteFiles(e.target.checked)}
              className="w-4 h-4 rounded accent-red-500 cursor-pointer"
            />
            <div>
              <div className="text-xs text-red-300 group-hover:text-red-200 transition-colors flex items-center gap-1.5">
                Dosyaları da sil
                <span className="text-[9px] bg-red-950/70 border border-red-800/60 text-red-400 px-1.5 py-0.5 rounded font-mono">
                  GERİ ALINAMAZ
                </span>
              </div>
              <div className="text-[10px] text-gray-500 font-mono truncate max-w-[220px]">
                {project.path}
              </div>
            </div>
          </label>
        </div>

        {deleteFiles && (
          <div className="text-[11px] text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2 leading-relaxed">
            ⚠️ Klasör ve içindeki tüm dosyalar <strong>kalıcı olarak silinecek!</strong> Bu işlem geri alınamaz.
          </div>
        )}

        {/* Butonlar */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl text-xs text-gray-400 hover:text-white bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700/50 transition-all"
          >
            İptal
          </button>
          <button
            onClick={() => onConfirm(deleteSessions, deleteFiles)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all border ${
              deleteFiles
                ? "bg-red-900/60 hover:bg-red-800/70 text-red-200 border-red-700/60"
                : "bg-gray-800/80 hover:bg-gray-700/80 text-white border-gray-600/60"
            }`}
          >
            {deleteFiles ? "🗑 Sil (Kalıcı)" : "Kaldır"}
          </button>
        </div>
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}

// ─── Oturum Satırı ────────────────────────────────────────────────────────────
function SessionItem({
  session,
  active,
  isNew,
  onSelect,
  onDelete,
}: {
  session: SessionMeta;
  active: boolean;
  isNew: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${
        active
          ? "bg-cyan-950/70 text-cyan-200 border border-cyan-800/50 shadow-sm"
          : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200"
      }`}
      onClick={onSelect}
    >
      <MessageSquare
        size={13}
        className={`shrink-0 ${active ? "text-cyan-400" : "text-gray-500"}`}
      />
      <span className="truncate flex-1 text-xs">{session.title}</span>

      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] text-gray-500 group-hover:hidden font-mono">
          {relativeTime(session.updated_at || new Date().toISOString())}
        </span>
        {isNew && (
          <Circle size={5} className="fill-cyan-400 text-cyan-400 group-hover:hidden" />
        )}
        <button
          onClick={onDelete}
          className="hidden group-hover:flex items-center text-gray-500 hover:text-red-400 transition-colors p-0.5"
          title="Oturumu sil"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

export default function Sidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRefreshSessions,
  onOpenSettings,
  activityGroups,
}: SidebarProps) {
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [conversationsOpen, setConversationsOpen] = useState(true);
  const [activityOpen, setActivityOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectEntry | null>(null);

  // Projeleri yükle
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => {
        const list: ProjectEntry[] = d.projects ?? [];
        setProjects(list);
        const initExpanded: Record<string, boolean> = {};
        list.forEach((p) => {
          initExpanded[p.id] = true;
        });
        setExpandedProjects(initExpanded);
      })
      .catch(() => {});
  }, []);

  const handleSelectFolder = async (dirPath: string, name: string) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: dirPath, name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Klasör eklenemedi");
    setProjects((prev) => [...prev, data.project]);
    setExpandedProjects((prev) => ({ ...prev, [data.project.id]: true }));
  };

  const handleConfirmDeleteProject = async (deleteSessions: boolean, deleteFiles: boolean) => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;
    try {
      await fetch("/api/projects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: targetId, deleteSessions, deleteFiles }),
      });
      setProjects((prev) => prev.filter((p) => p.id !== targetId));
      if (deleteSessions) {
        onRefreshSessions?.();
      }
    } catch {
      // ignore
    } finally {
      setDeleteTarget(null);
    }
  };

  const toggleProjectExpand = (id: string) => {
    setExpandedProjects((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Oturumları sırala (en güncel üstte)
  const sortedSessions = [...sessions].sort((a, b) => {
    return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
  });
  const recentIds = new Set(sortedSessions.slice(0, 3).map((s) => s.session_id));

  // Oturumları projelere göre grupla
  const projectSessionsMap = new Map<string, SessionMeta[]>();
  const unassignedSessions: SessionMeta[] = [];

  for (const proj of projects) {
    projectSessionsMap.set(proj.id, []);
  }

  for (const s of sortedSessions) {
    const sDir = (s.project_dir || "").replace(/\/$/, "");
    const sSlug = (s.slug || "").toLowerCase();

    const matchedProj = projects.find((p) => {
      const pPath = (p.path || "").replace(/\/$/, "");
      const pName = (p.name || "").toLowerCase();
      if (!pPath && !pName) return false;

      return (
        (sDir && (sDir === pPath || sDir.startsWith(pPath))) ||
        (sSlug && sSlug === pName) ||
        (sDir && pName && sDir.endsWith(`/${pName}`)) ||
        (s.title && pName && s.title.toLowerCase().startsWith(pName))
      );
    });

    if (matchedProj) {
      projectSessionsMap.get(matchedProj.id)?.push(s);
    } else {
      unassignedSessions.push(s);
    }
  }

  const activeSession = sessions.find((s) => s.session_id === activeId);
  const currentProjectDir = activeSession?.project_dir;

  return (
    <>
      <aside className="w-64 shrink-0 glass border-r border-gray-800 flex flex-col overflow-hidden select-none bg-[#0e1017]">

        {/* ── Üst Genel Yeni Oturum Butonu (Always New Independent Conversation) ── */}
        <div className="p-2.5 border-b border-gray-800/60">
          <button
            onClick={() => {
              if (currentProjectDir) {
                onNew(currentProjectDir);
              } else if (projects.length === 1 && projects[0].exists) {
                onNew(projects[0].path);
              } else {
                onNew(undefined);
              }
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-900/90 hover:bg-gray-800 border border-gray-700/60 hover:border-cyan-700/60 text-gray-200 hover:text-white text-xs font-medium transition-all shadow-sm group"
          >
            <Plus size={14} className="text-cyan-400 group-hover:scale-110 transition-transform" />
            <span className="flex-1 text-left">
              {currentProjectDir
                ? `Yeni Oturum (${currentProjectDir.split("/").filter(Boolean).pop()})`
                : projects.length === 1
                ? `Yeni Oturum (${projects[0].name})`
                : "New Conversation"}
            </span>
          </button>
        </div>

        {/* ── Ağaç Görünümü Alanı ──────────────────────────── */}
        <div className="flex-1 overflow-y-auto py-2 px-1.5 space-y-3">

          {/* ── 1. PROJELER (PROJECTS) BÖLÜMÜ ── */}
          <div>
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-gray-400 tracking-wider">
              <span>Projects</span>
              <button
                onClick={() => setPickerOpen(true)}
                className="p-1 rounded-md text-gray-400 hover:text-cyan-400 hover:bg-gray-800 transition-colors"
                title="Yeni Proje Klasörü Ekle"
              >
                <FolderPlus size={13} />
              </button>
            </div>

            {/* Henüz hiç proje yoksa */}
            {projects.length === 0 && (
              <div className="px-2 py-1">
                <button
                  onClick={() => setPickerOpen(true)}
                  className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-dashed border-gray-800 hover:border-cyan-800/60 text-gray-500 hover:text-cyan-300 text-xs transition-colors bg-gray-950/20"
                >
                  <FolderPlus size={13} className="text-cyan-500" />
                  <span>Klasör seçerek proje ekle</span>
                </button>
              </div>
            )}

            {/* HER PROJE VE ALTINDAKİ OTURUMLAR */}
            <div className="space-y-1 mt-1">
              {projects.map((proj) => {
                const isExpanded = expandedProjects[proj.id] ?? true;
                const projSessions = projectSessionsMap.get(proj.id) || [];

                return (
                  <div key={proj.id} className="rounded-xl overflow-hidden">
                    
                    {/* Proje Klasör Başlığı */}
                    <div
                      onClick={() => toggleProjectExpand(proj.id)}
                      className="group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all hover:bg-gray-800/50 text-gray-300 hover:text-white"
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleProjectExpand(proj.id);
                        }}
                        className="text-gray-500 hover:text-gray-300 p-0.5"
                      >
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>

                      {isExpanded ? (
                        <FolderOpen size={14} className="text-cyan-400 shrink-0" />
                      ) : (
                        <Folder size={14} className="text-gray-400 shrink-0" />
                      )}

                      <span className="flex-1 text-xs font-medium truncate">
                        {proj.name}
                      </span>

                      {/* Projede Yeni Oturum Başlat (+) & Sil (🗑) */}
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onNew(proj.path);
                          }}
                          className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-cyan-300 transition-colors"
                          title={`'${proj.name}' projesinde yeni oturum başlat`}
                        >
                          <Plus size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(proj);
                          }}
                          className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-colors"
                          title="Projeyi kaldır"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Projenin Oturumları (Açılır Kapanır) */}
                    {isExpanded && (
                      <div className="mt-0.5 ml-3 pl-2.5 border-l border-gray-800/80 space-y-0.5">
                        {projSessions.length === 0 ? (
                          <button
                            onClick={() => onNew(proj.path)}
                            className="w-full text-left px-2 py-1 text-[11px] text-gray-500 hover:text-cyan-400 hover:bg-gray-800/30 rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <Plus size={11} />
                            <span>İlk oturumu başlat</span>
                          </button>
                        ) : (
                          projSessions.map((s) => (
                            <SessionItem
                              key={s.session_id}
                              session={s}
                              active={activeId === s.session_id}
                              isNew={recentIds.has(s.session_id)}
                              onSelect={() => onSelect(s.session_id)}
                              onDelete={(e) => {
                                e.stopPropagation();
                                onDelete(s.session_id);
                              }}
                            />
                          ))
                        )}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 2. CONVERSATIONS (GENEL OTURUMLAR) BÖLÜMÜ ── */}
          <div className="pt-2 border-t border-gray-800/60">
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-gray-400 tracking-wider">
              <button
                onClick={() => setConversationsOpen((v) => !v)}
                className="flex items-center gap-1.5 hover:text-gray-200 transition-colors"
              >
                {conversationsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>Conversations</span>
              </button>
              <button
                onClick={() => onNew(undefined)}
                className="p-1 rounded-md text-gray-400 hover:text-cyan-400 hover:bg-gray-800 transition-colors"
                title="Yeni Genel Oturum Başlat"
              >
                <Plus size={13} />
              </button>
            </div>

            {conversationsOpen && (
              <div className="mt-1 space-y-0.5">
                {unassignedSessions.length === 0 ? (
                  <div className="px-3 py-1.5 text-[11px] text-gray-600">
                    Henüz genel oturum yok
                  </div>
                ) : (
                  unassignedSessions.map((s) => (
                    <SessionItem
                      key={s.session_id}
                      session={s}
                      active={activeId === s.session_id}
                      isNew={recentIds.has(s.session_id)}
                      onSelect={() => onSelect(s.session_id)}
                      onDelete={(e) => {
                        e.stopPropagation();
                        onDelete(s.session_id);
                      }}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* ── 3. AKTİVİTE GÜNLÜĞÜ BÖLÜMÜ ── */}
          <div className="pt-2 border-t border-gray-800/60">
            <button
              onClick={() => setActivityOpen((v) => !v)}
              className="w-full flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-gray-400 hover:text-gray-200 transition-colors text-left"
            >
              <div className="flex items-center gap-1.5">
                {activityOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>Activity Log</span>
              </div>
              {activityGroups.length > 0 && (
                <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-1.5 py-0.2 rounded">
                  {activityGroups.length}
                </span>
              )}
            </button>

            {activityOpen && (
              <div className="mt-2 max-h-60 overflow-y-auto">
                <ActivityFeed groups={activityGroups} />
              </div>
            )}
          </div>

        </div>

        {/* ── Alt Bar: Ayarlar (Settings) ───────────────────────── */}
        {onOpenSettings && (
          <div className="border-t border-gray-800/60 p-2 bg-gray-950/40">
            <button
              onClick={onOpenSettings}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 transition-colors"
            >
              <Zap size={14} className="text-cyan-400" />
              <span className="flex-1 text-left font-medium">Settings</span>
            </button>
          </div>
        )}
      </aside>

      {/* Klasör Seçici Modal */}
      <FolderPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelectFolder={handleSelectFolder}
      />

      {/* Proje Silme Onay Modalı */}
      {deleteTarget && (
        <DeleteProjectDialog
          project={deleteTarget}
          onConfirm={handleConfirmDeleteProject}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

