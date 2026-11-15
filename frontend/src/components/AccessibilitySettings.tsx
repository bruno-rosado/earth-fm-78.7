import { useEffect, useRef } from "react";
import { KEYBOARD_HELP } from "../services/accessibility.js";
import type { AccessibilitySettingsState, SpeechReader } from "../services/useAccessibility";

interface Props {
  open: boolean;
  settings: AccessibilitySettingsState;
  speech: SpeechReader;
  onClose(): void;
  onReadPage(): void;
}

export default function AccessibilitySettings({ open, settings, speech, onClose, onReadPage }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const { preferences, setPreference, reset } = settings;
  useEffect(() => { if (open) heading.current?.focus(); }, [open]);
  return (
    <section id="accessibility-settings" className="accessibility-panel" aria-labelledby="accessibility-title" hidden={!open}>
      <div className="accessibility-heading">
        <div><p className="eyebrow">Your listening space</p><h2 id="accessibility-title" ref={heading} tabIndex={-1}>Accessibility settings</h2></div>
        <button type="button" className="access-button" onClick={onClose}>Close settings</button>
      </div>
      <div className="accessibility-columns">
        <fieldset>
          <legend>Display and motion</legend>
          <label className="access-toggle"><input type="checkbox" checked={preferences.highContrast} onChange={(event) => setPreference("highContrast", event.target.checked)} /><span>High contrast<small>Bright text and stronger outlines on a black background.</small></span></label>
          <label className="access-field">Text size<select value={preferences.textSize} onChange={(event) => setPreference("textSize", event.target.value as typeof preferences.textSize)}><option value="standard">Standard</option><option value="large">Large</option><option value="extra">Extra large</option></select></label>
          <label className="access-toggle"><input type="checkbox" checked={preferences.reducedMotion} onChange={(event) => setPreference("reducedMotion", event.target.checked)} /><span>Reduce visual motion<small>Removes scan-line animation and simplifies the data display. Video still plays when requested.</small></span></label>
        </fieldset>
        <fieldset>
          <legend>Read aloud</legend>
          <p className="access-hint">Speech starts only when you request it. Music becomes quieter while the voice is speaking.</p>
          {!speech.supported && <p className="access-hint">Speech is unavailable in this browser. Reading buttons still provide a written transcript.</p>}
          <label className="access-field">Reading speed<span className="access-range"><input type="range" min={0.75} max={1.5} step={0.05} value={preferences.speechRate} aria-valuetext={`${preferences.speechRate.toFixed(2)} times normal speed`} onChange={(event) => setPreference("speechRate", Number(event.target.value))} /><output>{preferences.speechRate.toFixed(2)}×</output></span></label>
          <label className="access-field">Narration volume<span className="access-range"><input type="range" min={0} max={1} step={0.05} value={preferences.speechVolume} aria-valuetext={`${Math.round(preferences.speechVolume * 100)} percent`} onChange={(event) => setPreference("speechVolume", Number(event.target.value))} /><output>{Math.round(preferences.speechVolume * 100)}%</output></span></label>
          <div className="access-actions"><button type="button" className="access-button" onClick={onReadPage}>{speech.supported ? "Read page aloud" : "Show page transcript"}</button><button type="button" className="access-button" onClick={speech.stop} disabled={!speech.speaking}>Stop reading</button></div>
        </fieldset>
      </div>
      <div className="accessibility-footer"><p>{KEYBOARD_HELP} Preferences are saved on this device. System motion and contrast preferences apply until you choose your own.</p><button type="button" className="text-button" onClick={reset}>Reset to defaults</button></div>
    </section>
  );
}
