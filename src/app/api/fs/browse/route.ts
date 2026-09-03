// src/app/api/fs/browse/route.ts
// Sunucu tarafında klasör ağacını gezme ve alt dizinleri listeleme API'si.

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const homeDir = os.homedir();
  const searchPath = req.nextUrl.searchParams.get("path") || `${homeDir}/Desktop/Projects`;
  const resolvedPath = path.resolve(searchPath.replace(/^~/, homeDir));

  try {
    const stat = await fs.stat(resolvedPath);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: "Geçerli bir klasör değil" }, { status: 400 });
    }

    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });

    const directories: { name: string; path: string; isHidden: boolean }[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const isHidden = entry.name.startsWith(".");
        // node_modules ve .git gibi ağır klasörleri gizli/atlanabilir say ama listede göster
        directories.push({
          name: entry.name,
          path: path.join(resolvedPath, entry.name),
          isHidden,
        });
      }
    }

    // İsme göre alfabetik sırala (gizliler sonda)
    directories.sort((a, b) => {
      if (a.isHidden && !b.isHidden) return 1;
      if (!a.isHidden && b.isHidden) return -1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    const parentPath = path.dirname(resolvedPath);

    return NextResponse.json({
      currentPath: resolvedPath,
      parentPath: parentPath !== resolvedPath ? parentPath : null,
      homePath: homeDir,
      shortcuts: [
        { name: "🏠 Ana Dizin", path: homeDir },
        { name: "🖥️ Masaüstü", path: path.join(homeDir, "Desktop") },
        { name: "📂 Projects", path: path.join(homeDir, "Desktop", "Projects") },
        { name: "📁 İndirilenler", path: path.join(homeDir, "Downloads") },
      ],
      directories,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Klasör okunamadı" },
      { status: 500 }
    );
  }
}
