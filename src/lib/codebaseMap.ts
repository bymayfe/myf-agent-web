// src/lib/codebaseMap.ts
// Hafif codebase index/map katmanı.
// Python codebase_graph.py + brain.py'nin TS karşılığı.
//
// Amaç: Koordinatörün milyonlarca token harcamadan proje yapısını anlaması.
// Strateji:
//   1. Proje dosyalarını tara (yüzeysel — sembol regex ile)
//   2. Kompakt JSON map oluştur: { path → { symbols, size, lines, lang } }
//   3. Koordinatör sistem promptuna "PROJE HARİTASI" olarak enjekte edilir
//   4. Model "daha fazla detay" istediğinde sadece ilgili dosyayı okur

import { promises as fs } from "fs";
import path from "path";

export interface FileEntry {
  path: string;       // relative to projectDir
  lang: string;
  lines: number;
  size: number;       // bytes
  symbols: string[];  // fonksiyon/sınıf/interface isimleri (regex)
  lastModified: number;
}

export interface CodebaseMap {
  projectDir: string;
  indexedAt: string;
  fileCount: number;
  totalLines: number;
  files: Record<string, FileEntry>; // key = relative path
}

// Hangi uzantılar dahil edilsin
const INCLUDE_EXTS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "go", "rs", "java", "c", "cpp", "h",
  "css", "scss", "html", "json", "yaml", "yml",
  "md", "sh", "bat",
]);

// Her zaman atlanacaklar
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "__pycache__",
  ".venv", "venv", "dist", "build", ".cache",
  "coverage", ".pytest_cache",
]);

// Dile göre sembol regex'leri
const SYMBOL_PATTERNS: Record<string, RegExp[]> = {
  ts: [
    /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    /(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    /(?:export\s+)?interface\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    /(?:export\s+)?type\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g,
    /(?:export\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g,
  ],
  py: [
    /^def\s+([A-Za-z_][A-Za-z0-9_]*)/gm,
    /^class\s+([A-Za-z_][A-Za-z0-9_]*)/gm,
  ],
  go: [
    /^func\s+(?:\([^)]*\)\s+)?([A-Za-z_][A-Za-z0-9_]*)/gm,
    /^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+struct/gm,
  ],
};
SYMBOL_PATTERNS["tsx"] = SYMBOL_PATTERNS["ts"];
SYMBOL_PATTERNS["js"] = SYMBOL_PATTERNS["ts"];
SYMBOL_PATTERNS["jsx"] = SYMBOL_PATTERNS["ts"];

function detectLang(filePath: string): string {
  return path.extname(filePath).slice(1).toLowerCase() || "text";
}

function extractSymbols(content: string, lang: string): string[] {
  const patterns = SYMBOL_PATTERNS[lang] ?? [];
  const found = new Set<string>();
  for (const pattern of patterns) {
    // regex'i sıfırla (global flag ile)
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m[1] && m[1].length > 1) found.add(m[1]);
    }
  }
  return [...found].slice(0, 40); // max 40 sembol/dosya
}

async function scanDir(
  dirPath: string,
  projectDir: string,
  files: Record<string, FileEntry>
): Promise<void> {
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true, encoding: "utf-8" }) as import("fs").Dirent[];
  } catch {
    return;
  }

  for (const entry of entries) {
    const name = entry.name as string;
    const fullPath = path.join(dirPath, name);
    const relPath = path.relative(projectDir, fullPath);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(name) && !name.startsWith(".")) {
        await scanDir(fullPath, projectDir, files);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(name).slice(1).toLowerCase();
      if (!INCLUDE_EXTS.has(ext)) continue;

      try {
        const stat = await fs.stat(fullPath);
        if (stat.size > 500_000) continue; // 500KB üstünü atla

        const lang = detectLang(name);
        let symbols: string[] = [];
        let lines = 0;

        // Sadece kod dosyalarında sembol çıkar
        if (SYMBOL_PATTERNS[lang]) {
          const content = await fs.readFile(fullPath, "utf-8").catch(() => "");
          lines = content.split("\n").length;
          symbols = extractSymbols(content, lang);
        } else {
          // JSON, YAML, MD gibi — sadece meta
          lines = Math.ceil(stat.size / 40);
        }

        files[relPath] = {
          path: relPath,
          lang,
          lines,
          size: stat.size,
          symbols,
          lastModified: stat.mtimeMs,
        };
      } catch {
        // erişim hatası — atla
      }
    }
  }
}

// ─── Dışa açık API ───────────────────────────────────────────────────────────

export async function buildCodebaseMap(projectDir: string): Promise<CodebaseMap> {
  const files: Record<string, FileEntry> = {};
  await scanDir(projectDir, projectDir, files);

  const totalLines = Object.values(files).reduce((s, f) => s + f.lines, 0);

  return {
    projectDir,
    indexedAt: new Date().toISOString(),
    fileCount: Object.keys(files).length,
    totalLines,
    files,
  };
}

/** Kompakt proje haritasını LLM sistem promptuna enjekte edilecek formata dönüştür.
 *  Token tasarrufu için semboller satır-inline gösterilir. */
export function formatMapForLLM(map: CodebaseMap, maxFiles = 60): string {
  if (map.fileCount === 0) return "(Proje henüz boş veya taranmadı)";

  const lines: string[] = [
    `=== PROJE KOD HARİTASI (${map.fileCount} dosya · ${map.totalLines.toLocaleString()} satır) ===`,
    `Dizin: ${map.projectDir}`,
    "",
  ];

  const entries = Object.values(map.files)
    .sort((a, b) => b.lines - a.lines) // en büyük önce
    .slice(0, maxFiles);

  for (const f of entries) {
    const syms = f.symbols.length > 0 ? ` [${f.symbols.slice(0, 10).join(", ")}]` : "";
    lines.push(`  ${f.path} (${f.lines}L · ${f.lang})${syms}`);
  }

  if (map.fileCount > maxFiles) {
    lines.push(`  ... ve ${map.fileCount - maxFiles} dosya daha`);
  }

  lines.push("");
  lines.push('(Detay için: "X dosyasını göster" yaz)');

  return lines.join("\n");
}

/** Belirli bir dosyanın sembollerini ve kısa özetini döndür (full okumadan önce) */
export function getFileEntry(map: CodebaseMap, relPath: string): FileEntry | null {
  return map.files[relPath] ?? null;
}

/** Sembol veya dosya adına göre arama */
export function searchMap(
  map: CodebaseMap,
  query: string
): FileEntry[] {
  const q = query.toLowerCase();
  return Object.values(map.files).filter(
    (f) =>
      f.path.toLowerCase().includes(q) ||
      f.symbols.some((s) => s.toLowerCase().includes(q))
  );
}
