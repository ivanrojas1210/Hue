import { useState, useEffect, useRef } from "react";

/* ------------------------------------------------------------------ */
/*  Ivan Rojas - brand tokens (the tool wears these; it GENERATES the  */
/*  other palettes).                                                   */
/* ------------------------------------------------------------------ */
const BRAND = {
  green: "#065F46",
  navy: "#1E293B",
  muted: "#64748B",
  bg: "#EFF1F4",
  surface: "#FFFFFF",
  line: "#DDE2EA",
  frame: "#C4CBD6",
  chrome: "#E4E8EE",
};

const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------------------------- color math --------------------------- */
function hexToRgb(hex) {
  const h = (hex || "").replace("#", "").trim();
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}
function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const chan = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(rgb.r) + 0.7152 * chan(rgb.g) + 0.0722 * chan(rgb.b);
}
function contrast(fg, bg) {
  const L1 = luminance(fg);
  const L2 = luminance(bg);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}
function readableOn(hex) {
  return contrast("#FFFFFF", hex) >= contrast("#111111", hex) ? "#FFFFFF" : "#111111";
}
function hairline(hex) {
  return readableOn(hex) === "#FFFFFF" ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)";
}
function isHex(hex) {
  return /^#[0-9a-fA-F]{6}$/.test((hex || "").trim());
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* --------------------- persistent storage (localStorage) ------------------- */
const SAVED_KEY = "hue:saved:v2";
const store = {
  async load() {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  },
  async save(list) {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(list));
    } catch (_) {}
  },
};

const EXAMPLES = ["calm winter morning", "energetic app for runners", "warm artisan bakery", "midnight fintech dashboard"];
const CORE = ["primary", "secondary", "accent", "background", "surface", "textPrimary", "textSecondary"];
const ROLE_ORDER = [
  ["primary", "Primary"],
  ["onPrimary", "Text on primary"],
  ["secondary", "Secondary"],
  ["accent", "Accent"],
  ["onAccent", "Text on accent"],
  ["background", "Background"],
  ["surface", "Surface"],
  ["textPrimary", "Text primary"],
  ["textSecondary", "Text secondary"],
];

function normalize(colors) {
  const c = { ...colors };
  if (!isHex(c.onPrimary?.hex)) c.onPrimary = { hex: readableOn(c.primary.hex), label: "Button text" };
  if (!isHex(c.onAccent?.hex)) c.onAccent = { hex: readableOn(c.accent.hex), label: "Button text" };
  return c;
}

function pairsFor(colors) {
  return [
    { label: "Body text on background", fg: colors.textPrimary.hex, bg: colors.background.hex, kind: "text" },
    { label: "Muted text on background", fg: colors.textSecondary.hex, bg: colors.background.hex, kind: "text" },
    { label: "Body text on surface", fg: colors.textPrimary.hex, bg: colors.surface.hex, kind: "text" },
    { label: "Button text on primary", fg: colors.onPrimary.hex, bg: colors.primary.hex, kind: "button" },
    { label: "Button text on accent", fg: colors.onAccent.hex, bg: colors.accent.hex, kind: "button" },
  ];
}

function extractJson(raw) {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = cleaned.indexOf("{");
  const b = cleaned.lastIndexOf("}");
  return a !== -1 && b !== -1 ? cleaned.slice(a, b + 1) : cleaned;
}

/* seamless inline-editable text. auto mode sizes the field to its content
   (responsive) with a small buffer so nothing ever clips. */
function Editable({ value, set, color, size, weight, placeholder, mode = "auto", center, extra }) {
  const base = {
    background: "transparent",
    border: "none",
    outline: "none",
    padding: 0,
    margin: 0,
    color,
    fontSize: size,
    fontWeight: weight,
    fontFamily: "inherit",
    textAlign: center ? "center" : "left",
    ...extra,
  };
  if (mode === "block") {
    return (
      <textarea
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        rows={2}
        style={{ ...base, width: "100%", resize: "none", lineHeight: 1.5 }}
      />
    );
  }
  const width = mode === "full" ? "100%" : `${Math.max((value || "").length, (placeholder || "").length, 2) + 1}ch`;
  return (
    <input
      value={value}
      onChange={(e) => set(e.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      style={{ ...base, width, boxSizing: "content-box" }}
    />
  );
}

export default function Hue() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(null);
  const [saved, setSaved] = useState([]);
  const [copied, setCopied] = useState("");
  const [editRole, setEditRole] = useState(null);
  const [editBackup, setEditBackup] = useState(null);
  const copyTimer = useRef(null);

  /* every text field in the preview is editable + persists across generations */
  const [brandText, setBrandText] = useState("Your Brand");
  const [navText, setNavText] = useState("Features");
  const [badgeText, setBadgeText] = useState("New");
  const [eyebrowText, setEyebrowText] = useState("Overview");
  const [headlineText, setHeadlineText] = useState("Everything in one place");
  const [bodyText, setBodyText] = useState("This is how body text reads in this palette. Calm, clear, and easy on the eyes at a glance.");
  const [btn1Text, setBtn1Text] = useState("Get started");
  const [btn2Text, setBtn2Text] = useState("Learn more");

  useEffect(() => {
    store.load().then((list) => Array.isArray(list) && setSaved(list));
  }, []);

  function persist(list) {
    setSaved(list);
    store.save(list);
  }

  async function callOnce(q) {
    // Calls OUR safe backend (/api/generate), NOT Anthropic directly.
    // The API key stays on the server - never in this browser code.
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: q }),
    });
    if (!res.ok) {
      let msg = "The generator hit a snag.";
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch (_) {}
      throw new Error(msg);
    }
    const data = await res.json();
    const raw = data.text || "";
    const parsed = JSON.parse(extractJson(raw));
    const c = parsed.colors || {};
    if (CORE.some((k) => !isHex(c[k]?.hex))) throw new Error("bad shape");
    const colors = normalize(c);
    return { id: uid(), name: parsed.name || "Untitled", colors, original: clone(colors), source: q };
  }

  async function generate(text) {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setLoading(true);
    setError("");
    setEditRole(null);
    let result = null;
    let lastErr = "";
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      try {
        result = await callOnce(q);
      } catch (e) {
        lastErr = e?.message || "";
      }
    }
    if (result) setWorking(result);
    else setError(lastErr || "The generator hit a snag. Give it another tap, or reword it a little.");
    setLoading(false);
  }

  function updateColor(role, hex) {
    setWorking((w) => (w ? { ...w, colors: { ...w.colors, [role]: { ...w.colors[role], hex } } } : w));
  }
  function resetOriginal() {
    setEditRole(null);
    setWorking((w) => (w ? { ...w, colors: clone(w.original) } : w));
  }
  function startEdit(role) {
    setEditRole(role);
    setEditBackup(working.colors[role].hex);
  }
  function cancelEdit() {
    if (editRole) updateColor(editRole, editBackup);
    setEditRole(null);
    setEditBackup(null);
  }
  function doneEdit() {
    setEditRole(null);
    setEditBackup(null);
  }

  function saveWorking() {
    if (!working || saved.some((s) => s.id === working.id)) return;
    persist([...saved, clone(working)]);
  }
  function removeSaved(id) {
    persist(saved.filter((s) => s.id !== id));
  }
  function loadSaved(s) {
    const colors = normalize(clone(s.colors));
    setEditRole(null);
    setWorking({ ...clone(s), id: uid(), colors, original: clone(colors), source: s.source || s.name });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function copy(text, key) {
    try {
      navigator.clipboard?.writeText(text);
    } catch (_) {}
    setCopied(key);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(""), 1100);
  }

  const isSaved = working && saved.some((s) => s.id === working.id);
  const edited = working && JSON.stringify(working.colors) !== JSON.stringify(working.original);
  const font = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
  const c = working?.colors;
  const generateLabel = working ? "Generate a palette" : "Generate palette";

  return (
    <div style={{ backgroundColor: BRAND.bg, color: BRAND.navy, fontFamily: font }} className="min-h-screen w-full px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-3xl">
        {/* header */}
        <header className="mb-8">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-md text-sm font-bold" style={{ backgroundColor: BRAND.green, color: "#fff" }}>
              H
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Hue</h1>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed" style={{ color: BRAND.muted }}>
            Describe a mood, theme, or a few keywords. Get a color system with an editable live preview, editable colors, and a readability check.
          </p>
        </header>

        {/* input - field, then the Generate button on its OWN row, then the suggestion tags */}
        <div className="rounded-xl p-4 sm:p-5" style={{ backgroundColor: BRAND.surface, border: `1px solid ${BRAND.line}` }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            placeholder="e.g. calm winter morning, or energetic app for runners"
            className="w-full rounded-lg px-3.5 py-3 text-[15px] outline-none"
            style={{ backgroundColor: BRAND.bg, color: BRAND.navy, border: `1px solid ${BRAND.line}` }}
          />

          {/* Generate - its own row, on its own, separated from the suggestions */}
          <div className="mt-3">
            <button
              onClick={() => generate()}
              disabled={loading || !input.trim()}
              className="rounded-lg px-5 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-40"
              style={{ backgroundColor: BRAND.green, color: "#fff" }}
            >
              {loading ? "Mixing…" : generateLabel}
            </button>
          </div>

          {/* suggestions - separate row, clearly not part of the button */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: BRAND.line }}>
            <span className="text-xs" style={{ color: BRAND.muted }}>Try:</span>
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => { setInput(ex); generate(ex); }} className="rounded-full px-3 py-1 text-xs" style={{ backgroundColor: BRAND.bg, color: BRAND.navy, border: `1px solid ${BRAND.line}` }}>
                {ex}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mt-4 text-sm" style={{ color: "#B91C1C" }}>{error}</p>}
        {!working && !loading && !error && <p className="mt-8 text-center text-sm" style={{ color: BRAND.muted }}>Your color system will appear here.</p>}

        {/* working palette */}
        {working && c && (
          <div className="mt-8">
            {/* header: name + Reset + Save (Generate lives in the input box above) */}
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight">{working.name}</h2>
              <div className="flex items-center gap-2">
                {edited && (
                  <button onClick={resetOriginal} className="rounded-lg px-3 py-2 text-sm font-medium" style={{ backgroundColor: BRAND.bg, color: BRAND.navy, border: `1px solid ${BRAND.line}` }} title="Undo all color changes">
                    ↺ Reset
                  </button>
                )}
                <button onClick={saveWorking} disabled={isSaved} className="rounded-lg px-3.5 py-2 text-sm font-medium transition-opacity disabled:opacity-60" style={{ backgroundColor: isSaved ? BRAND.bg : BRAND.navy, color: isSaved ? BRAND.muted : "#fff", border: `1px solid ${isSaved ? BRAND.line : BRAND.navy}` }}>
                  {isSaved ? "✓ Saved" : "Save"}
                </button>
              </div>
            </div>

            {/* ---------- LIVE PREVIEW: framed window, every text editable ---------- */}
            <h3 className="text-sm font-semibold">Live preview</h3>
            <p className="mt-1 text-xs" style={{ color: BRAND.muted }}>Click any text below to edit it: brand, nav, tag, headline, body, and both buttons. Fields grow to fit what you type.</p>
            <div className="mt-3 overflow-hidden rounded-2xl" style={{ border: `1px solid ${BRAND.frame}`, boxShadow: "0 12px 34px -14px rgba(15,23,42,0.35)" }}>
              <div className="flex items-center gap-1.5 px-3 py-2" style={{ backgroundColor: BRAND.chrome, borderBottom: `1px solid ${BRAND.frame}` }}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#CBD5E1" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#CBD5E1" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#CBD5E1" }} />
                <span className="ml-2 text-[11px]" style={{ color: BRAND.muted }}>Preview: all text is editable</span>
              </div>
              <div className="p-4 sm:p-6" style={{ backgroundColor: c.background.hex }}>
                {/* top bar - brand takes flexible space; nav + tag stay fully visible and auto-size */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="h-5 w-5 shrink-0 rounded-md" style={{ backgroundColor: c.primary.hex }} />
                    <Editable value={brandText} set={setBrandText} color={c.textPrimary.hex} size="13px" weight={600} placeholder="Brand" mode="full" />
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <Editable value={navText} set={setNavText} color={c.textSecondary.hex} size="12px" weight={400} placeholder="Nav" />
                    <span className="inline-flex items-center rounded-full px-2.5 py-1" style={{ backgroundColor: c.accent.hex }}>
                      <Editable value={badgeText} set={setBadgeText} color={c.onAccent.hex} size="11px" weight={600} placeholder="Tag" center />
                    </span>
                  </div>
                </div>
                {/* card */}
                <div className="mt-4 rounded-xl p-4 sm:p-5" style={{ backgroundColor: c.surface.hex, border: `1px solid ${hairline(c.surface.hex)}` }}>
                  <Editable value={eyebrowText} set={setEyebrowText} color={c.accent.hex} size="11px" weight={600} placeholder="Eyebrow" extra={{ textTransform: "uppercase", letterSpacing: "0.06em" }} />
                  <div className="mt-1">
                    <Editable value={headlineText} set={setHeadlineText} color={c.textPrimary.hex} size="22px" weight={700} placeholder="Type your headline…" mode="full" />
                  </div>
                  <div className="mt-2">
                    <Editable value={bodyText} set={setBodyText} color={c.textSecondary.hex} size="13px" weight={400} placeholder="Body text…" mode="block" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2.5">
                    <span className="inline-flex rounded-lg px-4 py-2" style={{ backgroundColor: c.primary.hex }}>
                      <Editable value={btn1Text} set={setBtn1Text} color={c.onPrimary.hex} size="13px" weight={500} placeholder="Button" center />
                    </span>
                    <span className="inline-flex rounded-lg px-4 py-2" style={{ backgroundColor: c.accent.hex }}>
                      <Editable value={btn2Text} set={setBtn2Text} color={c.onAccent.hex} size="13px" weight={500} placeholder="Button" center />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ---------- SWATCHES (compact, editable) ---------- */}
            <h3 className="mt-8 text-sm font-semibold">Color roles</h3>
<div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {ROLE_ORDER.map(([key, role]) => {
                const item = c[key];
                const fg = readableOn(item.hex);
                const isEditing = editRole === key;
                return (
                  <div key={key} className="overflow-hidden rounded-lg" style={{ border: `1px solid ${isEditing ? BRAND.green : BRAND.line}` }}>
                    <button onClick={() => copy(item.hex.toUpperCase(), key)} className="group relative flex h-11 w-full items-end p-1.5" style={{ backgroundColor: item.hex }} title="Click to copy hex">
                      <span className="rounded px-1 py-0.5 text-[10px] font-medium opacity-0 transition-opacity group-hover:opacity-100" style={{ backgroundColor: fg === "#FFFFFF" ? "rgba(0,0,0,.35)" : "rgba(255,255,255,.55)", color: fg }}>
                        {copied === key ? "Copied" : "Copy"}
                      </span>
                    </button>
                    <div className="p-1.5" style={{ backgroundColor: BRAND.surface }}>
                      <div className="text-[9px] uppercase tracking-wider" style={{ color: BRAND.muted }}>{role}</div>
                      <div className="mt-0.5 flex items-center justify-between gap-1">
                        <span className="truncate text-[11px]" style={{ fontFamily: mono, color: BRAND.navy }}>{item.hex.toUpperCase()}</span>
                        {!isEditing && (
                          <button onClick={() => startEdit(key)} className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ color: BRAND.green, border: `1px solid ${BRAND.line}` }}>
                            Edit
                          </button>
                        )}
                      </div>
                      {isEditing && (
                        <div className="mt-1.5">
                          <div className="flex items-center gap-1.5">
                            <input type="color" value={item.hex} onChange={(e) => updateColor(key, e.target.value.toUpperCase())} className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" title="Pick a color" />
                            <input value={item.hex.toUpperCase()} onChange={(e) => { const v = e.target.value.toUpperCase(); if (isHex(v)) updateColor(key, v); else setWorking({ ...working, colors: { ...working.colors, [key]: { ...item, hex: v } } }); }} spellCheck={false} className="w-full rounded px-1 py-1 text-[11px] outline-none" style={{ fontFamily: mono, color: BRAND.navy, backgroundColor: BRAND.bg, border: `1px solid ${BRAND.line}` }} />
                          </div>
                          <div className="mt-1.5 flex gap-1.5">
                            <button onClick={cancelEdit} className="flex-1 rounded px-1.5 py-1 text-[11px] font-medium" style={{ color: BRAND.muted, border: `1px solid ${BRAND.line}` }}>Cancel</button>
                            <button onClick={doneEdit} className="flex-1 rounded px-1.5 py-1 text-[11px] font-medium" style={{ backgroundColor: BRAND.green, color: "#fff" }}>Accept</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ---------- READABILITY CHECK ---------- */}
            <div className="mt-8">
              <h3 className="text-sm font-semibold">Readability check</h3>
              <p className="mt-1 text-xs" style={{ color: BRAND.muted }}>Real WCAG contrast per pairing. AA needs 4.5:1, AAA needs 7:1 for normal text.</p>
              <div className="mt-3 overflow-hidden rounded-xl" style={{ border: `1px solid ${BRAND.line}` }}>
                {pairsFor(c).map((p, i) => {
                  const ratio = contrast(p.fg, p.bg);
               const texts = [brandText, navText, headlineText, btn1Text, btn2Text];
const w = (texts[i] || "").trim().split(/\s+/).filter(Boolean);
const words = w.length ? w.slice(0, 2).join(" ") + (w.length > 2 ? "…" : "") : "Aa";
                  return (
                    <div key={p.label} className="flex items-center gap-3 px-3 py-2.5 sm:gap-4" style={{ backgroundColor: BRAND.surface, borderTop: i === 0 ? "none" : `1px solid ${BRAND.line}` }}>
                      <div className="grid h-11 min-w-[92px] max-w-[92px] place-items-center overflow-hidden px-2 text-center" style={{ backgroundColor: p.bg, border: `1px solid ${BRAND.line}`, borderRadius: 8 }}>
                        <span className="truncate text-[12px]" style={{ color: p.fg, fontWeight: p.kind === "button" ? 600 : 400 }}>{words}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px]">{p.label}</div>
                        <div className="text-[12px]" style={{ fontFamily: mono, color: BRAND.muted }}>{ratio.toFixed(2)}:1</div>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <Badge ok={ratio >= 4.5} text="AA" />
                        <Badge ok={ratio >= 7} text="AAA" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* saved palettes */}
        {saved.length > 0 && (
          <div className="mt-10">
            <h3 className="mb-3 text-sm font-semibold">Saved · {saved.length}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {saved.map((s) => {
                const body = contrast(s.colors.textPrimary.hex, s.colors.background.hex);
                return (
                  <div key={s.id} className="rounded-xl p-3" style={{ backgroundColor: BRAND.surface, border: `1px solid ${BRAND.line}` }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-medium">{s.name}</span>
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => loadSaved(s)} className="rounded px-2 py-1 text-[11px]" style={{ color: BRAND.green, border: `1px solid ${BRAND.line}` }}>Load</button>
                        <button onClick={() => removeSaved(s.id)} className="rounded px-2 py-1 text-[11px]" style={{ color: BRAND.muted, border: `1px solid ${BRAND.line}` }} title="Remove">✕</button>
                      </div>
                    </div>
                    <div className="mt-2 flex overflow-hidden rounded-md" style={{ border: `1px solid ${BRAND.line}` }}>
                      {ROLE_ORDER.map(([k]) => (
                        <div key={k} className="h-8 flex-1" style={{ backgroundColor: s.colors[k]?.hex || "#fff" }} title={`${k} ${s.colors[k]?.hex || ""}`} />
                      ))}
                    </div>
                    <div className="mt-2 text-[11px]" style={{ color: BRAND.muted }}>Body text {body.toFixed(1)}:1 · {body >= 7 ? "AAA" : body >= 4.5 ? "AA" : "fails AA"}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <footer className="mt-12 border-t pt-5 text-center text-xs" style={{ borderColor: BRAND.line, color: BRAND.muted }}>Built by Ivan Rojas · ivanrojas.design</footer>
      </div>
    </div>
  );
}

function Badge({ ok, text }) {
  return (
    <span className="rounded-md px-2 py-1 text-[11px] font-semibold" style={{ backgroundColor: ok ? "#DCFCE7" : "#F1F5F9", color: ok ? "#065F46" : "#94A3B8" }}>
      {ok ? "✓ " : "✗ "}
      {text}
    </span>
  );
}
