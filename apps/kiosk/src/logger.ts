import { info, warn, error, debug, attachConsole } from '@tauri-apps/plugin-log';

export async function initLogger(): Promise<void> {
  try {
    await attachConsole();
  } catch {
    // Not in Tauri environment (e.g., browser dev)
  }
}

export const log = { info, warn, error, debug };
