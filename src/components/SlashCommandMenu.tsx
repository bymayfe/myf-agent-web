"use client";

import React, { useEffect, useRef } from "react";
import {
  Play,
  FastForward,
  Globe,
  Terminal,
  FileText,
  GitCompare,
  CheckSquare,
  XCircle,
  Trash2,
  PlusCircle,
  RotateCcw,
  Brain,
  Sliders,
  Settings,
  HelpCircle,
  Search,
  FolderTree,
} from "lucide-react";

export interface SlashCommand {
  name: string;
  description: string;
  category: "Pipeline" | "Oturum" | "Araçlar" | "Ayarlar" | "Genel";
  aliases?: string[];
  placeholder?: string;
  directAction?: "settings" | "terminal" | "clear" | "new";
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // ── Pipeline ──
  {
    name: "/run",
    description: "5 Aşamalı Sıralı Pipeline'ı Başlat (Architect → Dev → QA → Fix → Review)",
    category: "Pipeline",
    aliases: ["/start"],
  },
  {
    name: "/continue",
    description: "Kaldığı yerden sonraki adımları tamamla ve devam et",
    category: "Pipeline",
    aliases: ["/devam"],
  },

  // ── Araçlar & Araştırma ──
  {
    name: "/search",
    description: "İnternette güncel bilgi ve web araştırması yap",
    category: "Araçlar",
    aliases: ["/web", "@web"],
    placeholder: "/search ",
  },
  {
    name: "/graph",
    description: "Codebase Memory mimari ve sembol grafiğini getir",
    category: "Araçlar",
    aliases: ["/codemap"],
  },
  {
    name: "/terminal",
    description: "Terminal görev ve çıktı panelini aç / kapat",
    category: "Araçlar",
    directAction: "terminal",
  },

  // ── Oturum & Kod Durumu ──
  {
    name: "/status",
    description: "Projede üretilen dosyaları ve genel durumu incele",
    category: "Oturum",
  },
  {
    name: "/changes",
    description: "Bekleyen dosya ve kod değişikliklerini incele",
    category: "Oturum",
  },
  {
    name: "/apply",
    description: "Bekleyen kod değişikliklerini onayla ve projeye uygula",
    category: "Oturum",
  },
  {
    name: "/discard",
    description: "Bekleyen değişiklikleri uygulamadan iptal et",
    category: "Oturum",
  },
  {
    name: "/clear",
    description: "Ekrandaki sohbet mesajlarını ve görünümü temizle",
    category: "Oturum",
    aliases: ["/cls"],
    directAction: "clear",
  },
  {
    name: "/new",
    description: "Yeni temiz bir sohbet / oturum başlat",
    category: "Oturum",
    directAction: "new",
  },
  {
    name: "/reset",
    description: "Oturumu ve ajan hafızasını sıfırla",
    category: "Oturum",
  },

  // ── Ayarlar ──
  {
    name: "/think",
    description: "Düşünme zincirini (reasoning) aç / kapat",
    category: "Ayarlar",
    placeholder: "/think ",
  },
  {
    name: "/model",
    description: "Modeli hızlıca değiştir (Örn: /model nemotron)",
    category: "Ayarlar",
    placeholder: "/model ",
  },
  {
    name: "/settings",
    description: "Tüm sistem ayarları menüsünü aç",
    category: "Ayarlar",
    directAction: "settings",
  },

  // ── Genel ──
  {
    name: "/help",
    description: "Kullanılabilir komutların tam listesini göster",
    category: "Genel",
  },
];

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Pipeline: { bg: "bg-cyan-950/40", text: "text-cyan-400", border: "border-cyan-800/40" },
  Araçlar: { bg: "bg-amber-950/40", text: "text-amber-400", border: "border-amber-800/40" },
  Oturum: { bg: "bg-purple-950/40", text: "text-purple-400", border: "border-purple-800/40" },
  Ayarlar: { bg: "bg-blue-950/40", text: "text-blue-400", border: "border-blue-800/40" },
  Genel: { bg: "bg-emerald-950/40", text: "text-emerald-400", border: "border-emerald-800/40" },
};

function getCommandIcon(cmd: string) {
  switch (cmd) {
    case "/run":
    case "/start":
      return Play;
    case "/continue":
    case "/devam":
      return FastForward;
    case "/search":
    case "/web":
      return Globe;
    case "/graph":
    case "/codemap":
      return FolderTree;
    case "/terminal":
      return Terminal;
    case "/status":
      return FileText;
    case "/changes":
      return GitCompare;
    case "/apply":
      return CheckSquare;
    case "/discard":
      return XCircle;
    case "/clear":
    case "/cls":
      return Trash2;
    case "/new":
      return PlusCircle;
    case "/reset":
      return RotateCcw;
    case "/think":
      return Brain;
    case "/model":
      return Sliders;
    case "/settings":
      return Settings;
    case "/help":
    default:
      return HelpCircle;
  }
}

interface SlashCommandMenuProps {
  filter: string; // e.g. "ru" when input is "/ru"
  selectedIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
}

export default function SlashCommandMenu({
  filter,
  selectedIndex,
  onSelect,
  onClose,
}: SlashCommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const cleanFilter = filter.trim().toLowerCase().replace(/^\//, "");

  const filtered = SLASH_COMMANDS.filter((cmd) => {
    if (!cleanFilter) return true;
    const nameMatch = cmd.name.toLowerCase().includes(cleanFilter);
    const aliasMatch = cmd.aliases?.some((a) => a.toLowerCase().includes(cleanFilter));
    const descMatch = cmd.description.toLowerCase().includes(cleanFilter);
    return nameMatch || aliasMatch || descMatch;
  });

  // Seçili öğeyi otomatik görünür yap
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLButtonElement>("[data-cmd-item]");
    const activeItem = items[selectedIndex];
    if (activeItem) {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (filtered.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-2 p-3 rounded-2xl bg-[#12141c]/95 border border-gray-800 shadow-2xl backdrop-blur-md z-50 text-xs text-gray-400 text-center animate-in fade-in zoom-in-95 duration-100">
        Eşleşen komut bulunamadı
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-2xl bg-[#12141c]/95 border border-gray-800 shadow-2xl backdrop-blur-md z-50 overflow-hidden flex flex-col max-h-80 animate-in fade-in zoom-in-95 duration-100">
      {/* Başlık ve Kısayol İpuçları */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800/80 bg-gray-900/60 text-[11px] font-mono text-gray-400">
        <div className="flex items-center gap-1.5 font-semibold text-gray-300">
          <span className="text-cyan-400 font-bold">/</span>
          <span>KOMUTLAR</span>
          <span className="text-[10px] text-gray-500 font-normal">({filtered.length})</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <span>↑↓ Gezin</span>
          <span>·</span>
          <span>Enter / Tab Seç</span>
          <span>·</span>
          <span>Esc Kapat</span>
        </div>
      </div>

      {/* Komut Listesi */}
      <div ref={listRef} className="overflow-y-auto p-1.5 space-y-1 divide-y divide-transparent">
        {filtered.map((cmd, idx) => {
          const isSelected = idx === selectedIndex;
          const Icon = getCommandIcon(cmd.name);
          const colors = CATEGORY_COLORS[cmd.category] || CATEGORY_COLORS.Genel;

          return (
            <button
              key={cmd.name}
              data-cmd-item
              type="button"
              onClick={() => onSelect(cmd)}
              onMouseEnter={() => {}}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left transition-all text-xs group ${
                isSelected
                  ? "bg-cyan-950/40 border border-cyan-700/50 shadow-sm"
                  : "hover:bg-gray-800/60 border border-transparent"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {/* İkon */}
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${colors.bg} ${colors.text} ${colors.border}`}
                >
                  <Icon size={14} />
                </div>

                {/* Komut Adı ve Açıklaması */}
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono font-semibold text-sm ${
                        isSelected ? "text-cyan-300" : "text-gray-200 group-hover:text-white"
                      }`}
                    >
                      {cmd.name}
                    </span>
                    {cmd.aliases && cmd.aliases.length > 0 && (
                      <span className="text-[10px] font-mono text-gray-500 truncate">
                        ({cmd.aliases.join(", ")})
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400 truncate leading-snug">
                    {cmd.description}
                  </span>
                </div>
              </div>

              {/* Kategori Rozeti */}
              <div className="shrink-0 ml-2">
                <span
                  className={`text-[9.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${colors.bg} ${colors.text} ${colors.border}`}
                >
                  {cmd.category}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
