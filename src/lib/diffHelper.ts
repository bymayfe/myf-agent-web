// src/lib/diffHelper.ts
// Basit, hızlı ve temiz Unified Diff üretici (TypeScript).

export interface DiffLine {
  type: "add" | "remove" | "context";
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface FileDiffResult {
  path: string;
  added: number;
  removed: number;
  lines: DiffLine[];
  oldContent: string;
  newContent: string;
  isNew: boolean;
}

/**
 * İki metin arasındaki satır bazlı farkı (diff) hesaplar.
 */
export function computeFileDiff(
  filePath: string,
  oldText: string,
  newText: string
): FileDiffResult {
  const isNew = oldText === "";
  const oldLines = oldText ? oldText.split("\n") : [];
  const newLines = newText ? newText.split("\n") : [];

  if (isNew) {
    const lines: DiffLine[] = newLines.map((line, idx) => ({
      type: "add",
      text: line,
      newLineNumber: idx + 1,
    }));
    return {
      path: filePath,
      added: newLines.length,
      removed: 0,
      lines,
      oldContent: oldText,
      newContent: newText,
      isNew: true,
    };
  }

  // Basit LCS / satır karşılaştırma
  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;

  // Hızlı diff yaklaşımı
  let i = 0;
  let j = 0;
  let oldLineNo = 1;
  let newLineNo = 1;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      lines.push({
        type: "context",
        text: oldLines[i],
        oldLineNumber: oldLineNo++,
        newLineNumber: newLineNo++,
      });
      i++;
      j++;
    } else {
      // Değişiklik bloğu bul
      if (i < oldLines.length && (j >= newLines.length || !newLines.slice(j, j + 5).includes(oldLines[i]))) {
        lines.push({
          type: "remove",
          text: oldLines[i],
          oldLineNumber: oldLineNo++,
        });
        removed++;
        i++;
      } else if (j < newLines.length) {
        lines.push({
          type: "add",
          text: newLines[j],
          newLineNumber: newLineNo++,
        });
        added++;
        j++;
      }
    }
  }

  return {
    path: filePath,
    added,
    removed,
    lines,
    oldContent: oldText,
    newContent: newText,
    isNew: false,
  };
}
