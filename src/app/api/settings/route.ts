import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings, setActiveProvider, getProviders, updateProviderModel, getProviderApiKey, setProviderApiKey } from "@/lib/store";
import type { Settings } from "@/types";

export const runtime = "nodejs";

export async function GET() {
  const settings = await getSettings();
  const providersFile = await getProviders();

  // Her sağlayıcı için API anahtarı tanımlı mı bilgisi ekle
  const providersWithKeyStatus = {
    ...providersFile,
    providers: Object.fromEntries(
      Object.entries(providersFile.providers).map(([k, p]) => [
        k,
        {
          ...p,
          has_key: p.requires_key ? !!getProviderApiKey(p.api_key_env) : true,
        },
      ])
    ),
  };

  return NextResponse.json({ settings, providers: providersWithKeyStatus });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<Settings> & {
    provider?: string;
    api_key?: string;
    api_key_env?: string;
  };

  const activeProv = body.provider || body.active_provider;
  if (activeProv) {
    await setActiveProvider(activeProv);
  }

  // API Anahtarı girildiyse .env.local'e kaydet
  if (body.api_key && body.api_key_env) {
    await setProviderApiKey(body.api_key_env, body.api_key);
  }

  const { provider, api_key, api_key_env, ...rest } = body;
  if (activeProv) rest.active_provider = activeProv;
  const updated = await saveSettings(rest);

  if (activeProv && rest.coordinator_model) {
    await updateProviderModel(activeProv, rest.coordinator_model);
  }

  return NextResponse.json({ ok: true, settings: updated });
}
