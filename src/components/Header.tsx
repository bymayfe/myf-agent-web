"use client";

import { useEffect, useState } from "react";
import { Brain, Settings, Circle, Terminal } from "lucide-react";

interface HeaderProps {
  providerLabel: string;
  modelLabel: string;
  projectName?: string | null;
  sessionTitle?: string | null;
  onOpenSettings: () => void;
  onToggleTerminal?: () => void;
  isTerminalOpen?: boolean;
  taskCount?: number;
}

export default function Header({
  providerLabel,
  modelLabel,
  projectName,
  sessionTitle,
  onOpenSettings,
  onToggleTerminal,
  isTerminalOpen,
  taskCount = 0,
}: HeaderProps) {
  const [port, setPort] = useState<string>("3111");

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.port) {
      setPort(window.location.port);
    }
  }, []);

  return (
    <header className="glass h-14 border-b border-gray-800 flex items-center justify-between px-6 z-20 shrink-0">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
          <Brain size={16} />
        </div>
        <div>
          <span className="font-bold text-lg tracking-wide text-white">
            MYF <span className="text-cyan-400">AGENT</span>
          </span>
          <span className="text-xs ml-2 px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-800/60 text-cyan-300 font-mono-custom">
            Web UI · :{port}
          </span>
        </div>

        {/* Antigravity Tarzı Breadcrumb: Proje / Oturum */}
        {(projectName || sessionTitle) && (
          <div className="hidden md:flex items-center gap-2 pl-4 border-l border-gray-800 text-xs">
            {projectName && (
              <span className="font-semibold text-gray-300 bg-gray-900 px-2 py-0.5 rounded border border-gray-800">
                📁 {projectName}
              </span>
            )}
            {projectName && sessionTitle && <span className="text-gray-600">/</span>}
            {sessionTitle && (
              <span className="text-gray-400 font-medium truncate max-w-xs">
                {sessionTitle}
              </span>
            )}
          </div>
        )}
      </div>


      <div className="flex items-center space-x-3 text-xs">
        {onToggleTerminal && (
          <button
            onClick={onToggleTerminal}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${
              isTerminalOpen
                ? "bg-amber-950/80 border-amber-600/70 text-amber-300 shadow-sm"
                : "bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800"
            }`}
            title="Canlı Terminal / Background Task Panelini Aç/Kapat"
          >
            <Terminal size={14} className={taskCount > 0 ? "text-amber-400" : ""} />
            <span>Terminal</span>
            {taskCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-black text-[10px] font-bold">
                {taskCount}
              </span>
            )}
          </button>
        )}

        <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-gray-900 border border-gray-800 text-gray-300">
          <Circle size={8} className="fill-emerald-500 text-emerald-500 animate-pulse" />
          <span className="font-semibold text-emerald-400">{providerLabel.toUpperCase()}</span>
          <span className="text-gray-500">·</span>
          <span className="text-gray-300 font-mono-custom">{modelLabel}</span>
        </div>

        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-900 border border-gray-800 text-gray-300 hover:bg-gray-800 transition-colors"
        >
          <Settings size={14} />
          Ayarlar
        </button>
      </div>
    </header>
  );
}
