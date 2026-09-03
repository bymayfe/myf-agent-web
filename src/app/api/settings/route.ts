// src/app/api/settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings, setActiveProvider, getProviders, updateProviderModel } from "@/lib/store";
import type { Settings } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSettings();
  const providersFile = await getProviders();
  return NextResponse.json(
    { settings, providers: providersFile },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    }
  );
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<Settings> & { provider?: string };

  const activeProv = body.provider || body.active_provider;
  if (activeProv) {
    await setActiveProvider(activeProv);
  }

  const { provider, ...rest } = body;
  if (activeProv) rest.active_provider = activeProv;
  const updated = await saveSettings(rest);

  if (activeProv && rest.coordinator_model) {
    await updateProviderModel(activeProv, rest.coordinator_model);
  }

  return NextResponse.json({ ok: true, settings: updated });
}
