// src/lib/plugins/store.ts
// Eklenti durumlarını (aktif/pasif, özel ayarlar) data/plugins.json dosyasına kaydeder.

import { promises as fs } from "fs";
import path from "path";
import type { PluginsConfig } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const PLUGINS_CONFIG_PATH = path.join(DATA_DIR, "plugins.json");

export async function getPluginsConfig(): Promise<PluginsConfig> {
  try {
    const raw = await fs.readFile(PLUGINS_CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as PluginsConfig;
  } catch {
    return { plugins: {} };
  }
}

export async function savePluginState(pluginId: string, enabled: boolean): Promise<void> {
  const config = await getPluginsConfig();
  if (!config.plugins[pluginId]) {
    config.plugins[pluginId] = { enabled };
  } else {
    config.plugins[pluginId].enabled = enabled;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(PLUGINS_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}
