// src/app/api/projects/route.ts
// Proje yönetimi — data/projects.json'da kalıcı.
// GET → proje listesi (exists kontrolü dahil)
// POST → yeni proje ekle { name?, path }
// DELETE → { id } ile sil

import { NextRequest, NextResponse } from "next/server";
import { listProjects, addProject, deleteProject } from "@/lib/store";
import { promises as fs } from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json(
    { projects },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    }
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const dirPath: string = (body.path ?? "").trim();
  const name: string = (body.name ?? "").trim();

  if (!dirPath) {
    return NextResponse.json({ error: "path gerekli" }, { status: 400 });
  }

  // Klasörün var olup olmadığını kontrol et
  const stat = await fs.stat(dirPath).catch(() => null);
  if (!stat) {
    return NextResponse.json(
      { error: `Klasör bulunamadı: ${dirPath}` },
      { status: 404 }
    );
  }
  if (!stat.isDirectory()) {
    return NextResponse.json(
      { error: `Bu bir klasör değil: ${dirPath}` },
      { status: 400 }
    );
  }

  const project = await addProject(name, dirPath);
  return NextResponse.json({ ok: true, project }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id: string = (body.id ?? "").trim();
  const deleteSessions: boolean = Boolean(body.deleteSessions);
  const deleteFiles: boolean = Boolean(body.deleteFiles);

  if (!id) {
    return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  }

  // Önce proje yolunu al (silmeden önce)
  let projectPath: string | undefined;
  if (deleteFiles) {
    const { listProjects } = await import("@/lib/store");
    const projects = await listProjects();
    projectPath = projects.find((p) => p.id === id)?.path;
  }

  await deleteProject(id, deleteSessions);

  // Dosyaları da sil (geri dönüşü yok!)
  if (deleteFiles && projectPath) {
    await fs.rm(projectPath, { recursive: true, force: true }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
