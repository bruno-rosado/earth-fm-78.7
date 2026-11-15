import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PREFERENCE_KEY, sanitizePreferences, type AccessibilityPreferences, type SpeechState } from "./accessibility.js";
import { createNarrationController, createNarrationLoader, type NarrationController } from "./narrationAudio.js";

function readOverrides(): Partial<AccessibilityPreferences> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(PREFERENCE_KEY) ?? "{}");
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  } catch { return {}; }
}

const media = (query: string) => window.matchMedia?.(query);
const systemPreferences = () => ({
  highContrast: Boolean(media("(prefers-contrast: more)")?.matches),
  reducedMotion: Boolean(media("(prefers-reduced-motion: reduce)")?.matches),
});

export function useAccessibilityPreferences() {
  const [overrides, setOverrides] = useState(readOverrides);
  const [system, setSystem] = useState(systemPreferences);
  const preferences = useMemo(() => sanitizePreferences(overrides, system), [overrides, system]);
  useEffect(() => {
    const queries = [media("(prefers-contrast: more)"), media("(prefers-reduced-motion: reduce)")];
    const update = () => setSystem(systemPreferences());
    queries.forEach((query) => query?.addEventListener("change", update));
    return () => queries.forEach((query) => query?.removeEventListener("change", update));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.contrast = preferences.highContrast ? "high" : "standard";
    document.documentElement.dataset.textSize = preferences.textSize;
    document.documentElement.dataset.reducedMotion = String(preferences.reducedMotion);
    try { localStorage.setItem(PREFERENCE_KEY, JSON.stringify(overrides)); } catch { /* Session preferences still work. */ }
  }, [preferences, overrides]);
  const setPreference = useCallback(<K extends keyof AccessibilityPreferences>(key: K, value: AccessibilityPreferences[K]) => {
    setOverrides((previous) => ({ ...previous, [key]: value }));
  }, []);
  const reset = useCallback(() => setOverrides({}), []);
  return { preferences, setPreference, reset };
}

export function useSpeech(preferences: AccessibilityPreferences, onDucking: (active: boolean) => void) {
  const [state, setState] = useState<SpeechState>({ text: "", speaking: false, message: "" });
  const controller = useRef<NarrationController | null>(null);
  const loader = useRef<ReturnType<typeof createNarrationLoader> | null>(null);
  const supported = "Audio" in window && "fetch" in window;
  useEffect(() => {
    let mounted = true;
    loader.current ??= createNarrationLoader();
    controller.current = createNarrationController({
      createAudio: () => new Audio(),
      loadAudio: loader.current,
      onState: (next) => { if (mounted) setState(next); }, onDucking,
    });
    return () => { mounted = false; controller.current?.dispose(); controller.current = null; };
  }, [supported, onDucking]);
  useEffect(() => { controller.current?.updatePreferences(preferences); }, [preferences]);
  const read = useCallback((text: string) => controller.current?.speak(text, preferences), [preferences]);
  const stop = useCallback(() => controller.current?.cancel(), []);
  return { ...state, supported, read, stop };
}

export type AccessibilitySettingsState = ReturnType<typeof useAccessibilityPreferences>;
export type SpeechReader = ReturnType<typeof useSpeech>;
