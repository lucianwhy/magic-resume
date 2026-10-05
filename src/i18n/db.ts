import { defaultLocale } from "./config";
import { isSupportedLocale } from "./runtime";
import { savePreference, settingsValue } from "@/lib/workspace-settings-client";

// Compatibility helpers for the old locale components; no browser cookies.
export async function getUserLocale() {
  return settingsValue("preferences").locale ?? defaultLocale;
}
export async function setUserLocale(locale: string) {
  if (!isSupportedLocale(locale)) throw new Error("Unsupported locale");
  savePreference("locale", locale);
}
