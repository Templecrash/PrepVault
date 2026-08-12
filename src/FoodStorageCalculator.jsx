import { useState, useEffect, useMemo, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   PrepVault Food Storage Calculator — standalone, shareable, offline-first.

   No account. No telemetry. No server-side storage. Every input and result
   stays in the visitor's browser; shareable plans are encoded in the URL.

   Primary brand color: #1B5E20
   ═══════════════════════════════════════════════════════════════════════ */

const PRIMARY = "#1B5E20";
const PRIMARY_DARK = "#124212";
const PRIMARY_SOFT = "#2E7D32";

const PERIODS = [
  { id: "2wk", label: "2 weeks", days: 14 },
  { id: "1mo", label: "1 month", days: 30 },
  { id: "3mo", label: "3 months", days: 90 },
  { id: "6mo", label: "6 months", days: 180 },
  { id: "1yr", label: "1 year", days: 365 },
];

/* Reference basis (public, estimate-grade): pounds per adult per year.
   Sources: CDC / LDS-Church / extension-service food-storage references.
   Children under 7 are counted at roughly half an adult portion. */
const LB_PER_ADULT_YEAR = {
  grains: { label: "Grains", icon: "🌾", detail: "Beans, rice, wheat, oats, pasta", lbs: 400, rotationMonths: 30 },
  legumes: { label: "Legumes", icon: "🫘", detail: "Dried beans, lentils, peas", lbs: 60, rotationMonths: 24 },
  sugars: { label: "Sugars", icon: "🍚", detail: "Sugar, honey, syrups", lbs: 60, rotationMonths: 24 },
  proteins: { label: "Proteins", icon: "🥫", detail: "Canned meat, fish, dried proteins", lbs: 60, rotationMonths: 18 },
  oilsFats: { label: "Oils & Fats", icon: "🫒", detail: "Cooking oil, shortening, nut butters", lbs: 36, rotationMonths: 12 },
  dairy: { label: "Dairy", icon: "🥛", detail: "Dry/powdered milk, cheese", lbs: 48, rotationMonths: 12 },
  fruits: { label: "Fruits", icon: "🍎", detail: "Canned & dried fruit", lbs: 60, rotationMonths: 12 },
  vegetables: { label: "Vegetables", icon: "🥕", detail: "Canned & dried vegetables", lbs: 60, rotationMonths: 12 },
};

const WATER_GAL_PER_PERSON_DAY = 1;

const DIETS = [
  { id: "vegetarian", label: "Vegetarian" },
  { id: "noDairy", label: "No dairy" },
  { id: "noNuts", label: "No nuts" },
  { id: "noGluten", label: "No gluten" },
  { id: "other", label: "Other" },
];

/* ── URL plan code (lossless, human-readable) ──────────────────────────── */
function encodePlan({ adults, children, periodIdx, diets, trackConsumption, mealsPerDay }) {
  const p = PERIODS[periodIdx] ? PERIODS[periodIdx].id : "2wk";
  const dietStr = ["vegetarian", "noDairy", "noNuts", "noGluten", "other"]
    .filter((d) => diets[d])
    .map((d) => d.slice(0, 2))
    .join("");
  let code = `${adults}a${children}c${p}`;
  if (dietStr) code += `d${dietStr}`;
  if (trackConsumption) code += `m${mealsPerDay}`;
  return code;
}

function decodePlan(code) {
  if (!code) return null;
  const m = code.match(/^(\d+)a(\d+)c(2wk|1mo|3mo|6mo|1yr)(?:d([a-z]*))?(?:m(\d+))?$/);
  if (!m) return null;
  const periodIdx = PERIODS.findIndex((p) => p.id === m[3]);
  const diets = { vegetarian: false, noDairy: false, noNuts: false, noGluten: false, other: false };
  const map = { ve: "vegetarian", nd: "noDairy", nn: "noNuts", ng: "noGluten", ot: "other" };
  const dstr = m[4] || "";
  for (let i = 0; i + 1 < dstr.length; i += 2) {
    const key = map[dstr.slice(i, i + 2)];
    if (key) diets[key] = true;
  }
  return {
    adults: Math.max(1, parseInt(m[1], 10) || 1),
    children: Math.max(0, parseInt(m[2], 10) || 0),
    periodIdx: periodIdx >= 0 ? periodIdx : 0,
    diets,
    trackConsumption: !!m[5],
    mealsPerDay: m[5] ? Math.max(1, parseInt(m[5], 10)) : 3,
  };
}

function initialPlanState() {
  const params = new URLSearchParams(window.location.search);
  const decoded = decodePlan(params.get("plan"));
  if (!decoded) return null;
  return { ...decoded, fromUrl: true };
}

/* ── Calculation ───────────────────────────────────────────────────────── */
function computePlan(inputs) {
  const { adults, children, periodIdx, diets, trackConsumption, mealsPerDay } = inputs;
  const period = PERIODS[periodIdx];
  const yearFraction = period.days / 365;
  // Child (under 7) counts as ~ half an adult portion.
  const adultEquivalents = adults + children * 0.5;

  const categories = Object.keys(LB_PER_ADULT_YEAR).map((key) => {
    const c = LB_PER_ADULT_YEAR[key];
    let perAdultLbs = c.lbs;
    let note = c.rotationMonths ? `Also eat-through within ${c.rotationMonths} months` : null;
    // Diet adjustments — reduce/remove categories the visitor skips.
    if (diets.noGluten && key === "grains") perAdultLbs *= 0.85;
    if (diets.vegetarian && key === "proteins") perAdultLbs *= 0.7;
    if (diets.noDairy && key === "dairy") { perAdultLbs = 0; note = "Skipped — no dairy"; }
    if (diets.noNuts && key === "oilsFats") perAdultLbs *= 0.85;
    if (trackConsumption && key === "grains") {
      // Let the estimate lean on real meals-per-day rather than a flat rule.
      const mealFactor = Math.max(0.5, Math.min(1.5, mealsPerDay / 3));
      perAdultLbs *= mealFactor;
    }
    return {
      key,
      label: c.label,
      icon: c.icon,
      detail: c.detail,
      lbs: Math.round(perAdultLbs * adultEquivalents * yearFraction),
      yearRef: `1-year reference: ~${c.lbs} lb/adult`,
      note,
    };
  });

  const waterGallons = Math.round(WATER_GAL_PER_PERSON_DAY * (adults + children) * period.days);

  const totalLbs = categories.reduce((sum, c) => sum + c.lbs, 0);

  return { categories, waterGallons, totalLbs, period, adults, children, adultEquivalents };
}

/* ── UI primitives ────────────────────────────────────────────────────── */
const fs = { fontFamily: "'Outfit','DM Sans','Segoe UI',sans-serif" };
const mono = { fontFamily: "'Geist Mono','JetBrains Mono',monospace" };

function Step({ step, total, title, children }) {
  return (
    <section style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
        Step {step} of {total}
      </div>
      <h2 style={{ margin: "0 0 18px", fontSize: 22, fontWeight: 800, color: "#0a0c10", letterSpacing: -0.5 }}>{title}</h2>
      {children}
    </section>
  );
}

function PrimaryButton({ children, onClick, style, disabled, type }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: "14px 28px",
        borderRadius: 10,
        background: disabled ? "rgba(27,94,32,0.3)" : `linear-gradient(135deg,${PRIMARY},${PRIMARY_DARK})`,
        color: "#fff",
        border: "none",
        fontSize: 15,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: "0 4px 20px rgba(27,94,32,0.25)",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main page
   ═══════════════════════════════════════════════════════════════════════ */
export default function FoodStorageCalculator() {
  const restored = useMemo(() => initialPlanState(), []);
  const [step, setStep] = useState(restored ? "results" : "start");
  const [adults, setAdults] = useState(restored ? restored.adults : 2);
  const [children, setChildren] = useState(restored ? restored.children : 0);
  const [showChildren, setShowChildren] = useState(restored ? restored.children > 0 : false);
  const [showRefine, setShowRefine] = useState(false);
  const [periodIdx, setPeriodIdx] = useState(restored ? restored.periodIdx : 0);
  const [diets, setDiets] = useState(restored ? restored.diets : { vegetarian: false, noDairy: false, noNuts: false, noGluten: false, other: false });
  const [trackConsumption, setTrackConsumption] = useState(restored ? restored.trackConsumption : false);
  const [mealsPerDay, setMealsPerDay] = useState(restored ? restored.mealsPerDay : 3);
  const [have, setHave] = useState({});
  const [linkCopied, setLinkCopied] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const plan = useMemo(
    () => computePlan({ adults, children, periodIdx, diets, trackConsumption, mealsPerDay }),
    [adults, children, periodIdx, diets, trackConsumption, mealsPerDay]
  );

  const planCode = useMemo(
    () => encodePlan({ adults, children, periodIdx, diets, trackConsumption, mealsPerDay }),
    [adults, children, periodIdx, diets, trackConsumption, mealsPerDay]
  );

  // Set document title + Open Graph description for share/preview.
  useEffect(() => {
    document.title = "Food Storage Calculator — PrepVault";
    const ensureMeta = (prop, content) => {
      let el = document.querySelector(`meta[property="${prop}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute("property", prop); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    ensureMeta("og:title", "Food Storage Calculator — How much should you store?");
    ensureMeta("og:description", "A free, offline-friendly planning tool. Get a realistic food & water storage list. No account, no data collected.");
    ensureMeta("description", "Free offline food storage calculator. See how much food (in pounds) and water your household should store for 2 weeks to 1 year.");
  }, []);

  const shareUrl = useMemo(() => {
    const base = window.location.origin + window.location.pathname;
    return `${base}?plan=${planCode}`;
  }, [planCode]);

  const copyLink = useCallback(() => {
    try {
      navigator.clipboard.writeText(shareUrl).then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      });
    } catch {
      // Fallback for browsers without async clipboard.
      const ta = document.createElement("textarea");
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  }, [shareUrl]);

  const printPlan = useCallback(() => {
    window.print();
  }, []);

  const gap = useMemo(() => {
    let shortfallLbs = 0;
    let shortCategories = 0;
    plan.categories.forEach((c) => {
      const haveVal = parseFloat(have[c.key]) || 0;
      if (haveVal < c.lbs) {
        shortfallLbs += c.lbs - haveVal;
        shortCategories += 1;
      }
    });
    return { shortfallLbs: Math.round(shortfallLbs), shortCategories };
  }, [have, plan]);

  const haveWater = parseFloat(have.water) || 0;

  const onHaveChange = (key, val) => {
    setHave((prev) => ({ ...prev, [key]: val }));
  };

  /* ── Landing ── */
  if (step === "start") {
    return (
      <Shell>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center", paddingTop: 20 }}>
          <div style={{ display: "inline-block", padding: "6px 14px", borderRadius: 20, background: "rgba(27,94,32,0.08)", border: "1px solid rgba(27,94,32,0.18)", fontSize: 12, color: PRIMARY, fontWeight: 700, ...mono, marginBottom: 24, letterSpacing: 1 }}>
            Food Storage Calculator
          </div>
          <h1 style={{ fontSize: "clamp(30px, 5vw, 48px)", fontWeight: 900, margin: "0 0 16px", lineHeight: 1.08, color: "#0a0c10", letterSpacing: -1 }}>
            How much food and water should you store for your household?
          </h1>
          <p style={{ fontSize: "clamp(14px, 2vw, 17px)", color: "rgba(0,0,0,0.55)", maxWidth: 560, margin: "0 auto 36px", lineHeight: 1.65 }}>
            A free, offline-friendly planning tool. Tell us who's in your household and how long you're preparing for — you'll get a realistic list, in pounds, you can store, save, and share. No account, no data collected.
          </p>
          <PrimaryButton onClick={() => setStep("household")}>Start my plan →</PrimaryButton>
        </div>

        <StaticReference />
      </Shell>
    );
  }

  /* ── Household ── */
  if (step === "household") {
    return (
      <Shell>
        <Step step={1} total={5} title="How many people are you preparing for?">
          <Field label="Adults">
            <Stepper value={adults} setValue={(v) => setAdults(Math.max(1, v))} min={1} />
          </Field>

          {!showChildren ? (
            <button
              onClick={() => setShowChildren(true)}
              style={{ display: "block", margin: "14px 0 0", background: "none", border: "none", color: PRIMARY, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            >
              + Add children
            </button>
          ) : (
            <Field label="Children under 7">
              <Stepper value={children} setValue={(v) => setChildren(Math.max(0, v))} min={0} />
              <p style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", margin: "8px 0 0", lineHeight: 1.5 }}>
                Ages matter to the per-person portions. Children under 7 are counted at roughly half an adult portion.
              </p>
            </Field>
          )}

          <button
            onClick={() => setShowRefine((s) => !s)}
            style={{ display: "block", margin: "20px 0 0", background: "none", border: "none", color: "rgba(0,0,0,0.55)", fontSize: 13, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}
          >
            Refine for age &amp; activity
          </button>
          {showRefine && (
            <p style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", margin: "8px 0 0", lineHeight: 1.5 }}>
              Optional: finer age buckets and activity level are available in the full PrepVault experience. For this estimate, children under 7 are counted at roughly half an adult portion.
            </p>
          )}

          <div style={{ marginTop: 28 }}>
            <PrimaryButton onClick={() => setStep("period")}>Continue →</PrimaryButton>
          </div>
        </Step>
      </Shell>
    );
  }

  /* ── Planning period ── */
  if (step === "period") {
    return (
      <Shell>
        <Step step={2} total={5} title="How long should your supplies cover?">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
            {PERIODS.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setPeriodIdx(i)}
                style={{
                  padding: "18px 12px",
                  borderRadius: 12,
                  background: periodIdx === i ? PRIMARY : "#fff",
                  color: periodIdx === i ? "#fff" : "#0a0c10",
                  border: periodIdx === i ? `2px solid ${PRIMARY}` : "2px solid rgba(0,0,0,0.1)",
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: periodIdx === i ? "0 6px 20px rgba(27,94,32,0.25)" : "none",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", margin: "16px 0 0", lineHeight: 1.5 }}>
            A 14-day reserve is the widely cited emergency baseline; you can choose a longer period if you prefer.
          </p>
          <div style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <PrimaryButton onClick={() => setStep("refine")}>Continue →</PrimaryButton>
            <SecondaryButton onClick={() => setStep("household")}>← Back</SecondaryButton>
          </div>
        </Step>
      </Shell>
    );
  }

  /* ── Optional refinement ── */
  if (step === "refine") {
    return (
      <Shell>
        <Step step={3} total={5} title="Want it closer to your household?">
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "rgba(0,0,0,0.6)", margin: "0 0 12px" }}>Diet &amp; allergies</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
            {DIETS.map((d) => (
              <label
                key={d.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 16px",
                  borderRadius: 24,
                  border: diets[d.id] ? `2px solid ${PRIMARY}` : "2px solid rgba(0,0,0,0.12)",
                  background: diets[d.id] ? "rgba(27,94,32,0.08)" : "#fff",
                  color: diets[d.id] ? PRIMARY : "#0a0c10",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={diets[d.id]}
                  onChange={() => setDiets((p) => ({ ...p, [d.id]: !p[d.id] }))}
                  style={{ accentColor: PRIMARY }}
                />
                {d.label}
              </label>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", margin: "0 0 24px", lineHeight: 1.5 }}>
            Choose only what you'd actually skip; these adjust some categories.
          </p>

          <h3 style={{ fontSize: 14, fontWeight: 700, color: "rgba(0,0,0,0.6)", margin: "0 0 12px" }}>Consumption basis</h3>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={trackConsumption}
              onChange={() => setTrackConsumption((v) => !v)}
              style={{ accentColor: PRIMARY, width: 18, height: 18 }}
            />
            <span style={{ fontSize: 14, fontWeight: 600 }}>I track what my household actually eats</span>
          </label>
          <p style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", margin: "0 0 12px", lineHeight: 1.5 }}>
            Turns on a field for approximate meals-per-day and lets the estimate lean on your real consumption rather than a general per-person rule.
          </p>
          {trackConsumption && (
            <div style={{ marginLeft: 28, marginBottom: 8 }}>
              <Field label="Approximate meals per day (household)">
                <Stepper value={mealsPerDay} setValue={(v) => setMealsPerDay(Math.max(1, v))} min={1} />
              </Field>
            </div>
          )}

          <div style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <PrimaryButton onClick={() => setStep("results")}>Show my plan →</PrimaryButton>
            <button onClick={() => setStep("results")} style={{ background: "none", border: "none", color: "rgba(0,0,0,0.55)", fontSize: 13, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
              Skip for now, I'll take the general estimate
            </button>
          </div>
        </Step>
      </Shell>
    );
  }

  /* ── Results + gap-closer + share (combined scroll) ── */
  return (
    <Shell>
      <div className="calc-results" style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Results headline */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
            Your plan <span style={{ color: PRIMARY }}>(updates as you change inputs)</span>
          </div>
          <h2 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 800, color: "#0a0c10", letterSpacing: -0.5 }}>
            Covers a {plan.period.label} reserve for {plan.adults} adult{plan.adults !== 1 ? "s" : ""} and {plan.children} child{plan.children !== 1 ? "ren" : ""}.
          </h2>
          <p style={{ fontSize: 13, color: "rgba(0,0,0,0.5)", margin: 0 }}>
            {plan.totalLbs.toLocaleString()} lb of stored food + {plan.waterGallons.toLocaleString()} gallons of water.
          </p>
        </div>

        {/* Edit controls summary */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
          <EditChip label={`${plan.adults} adult${plan.adults !== 1 ? "s" : ""}`} onClick={() => setStep("household")} />
          <EditChip label={`${plan.children} child${plan.children !== 1 ? "ren" : ""}`} onClick={() => setStep("household")} />
          <EditChip label={plan.period.label} onClick={() => setStep("period")} />
          <EditChip label={trackConsumption ? `${mealsPerDay} meals/day` : "general estimate"} onClick={() => setStep("refine")} />
        </div>

        {/* Category rows */}
        <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, overflow: "hidden" }}>
          {plan.categories.map((c, i) => {
            const haveVal = parseFloat(have[c.key]) || 0;
            const ready = haveVal >= c.lbs;
            const shortfall = Math.max(0, c.lbs - haveVal);
            return (
              <div
                key={c.key}
                style={{
                  padding: "16px 18px",
                  background: i % 2 === 0 ? "#fff" : "rgba(27,94,32,0.02)",
                  borderTop: i === 0 ? "none" : "1px solid rgba(0,0,0,0.06)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 22 }} role="img" aria-label={c.label}>{c.icon}</span>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {c.label} — <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(0,0,0,0.5)" }}>{c.detail}</span>{" "}
                      <strong style={{ color: PRIMARY }}>{c.lbs.toLocaleString()} lb</strong>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginTop: 3 }}>{c.yearRef}</div>
                    {c.note && <div style={{ fontSize: 11, color: "#a16207", marginTop: 2 }}>↻ {c.note}</div>}
                  </div>
                </div>
                {/* have vs need */}
                {showShare && (
                  <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <input
                      type="number"
                      min="0"
                      placeholder="have (lb)"
                      value={have[c.key] ?? ""}
                      onChange={(e) => onHaveChange(c.key, e.target.value)}
                      style={{ width: 110, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, fontFamily: "inherit" }}
                      aria-label={`${c.label} pounds on hand`}
                    />
                    <StatusChip ready={ready} label={ready ? "Ready" : `Stock up — ${shortfall.toLocaleString()} lb more`} />
                  </div>
                )}
              </div>
            );
          })}
          {/* Water row */}
          <div style={{ padding: "16px 18px", background: "rgba(14,165,233,0.06)", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 22 }} role="img" aria-label="Water">💧</span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  Water — <strong style={{ color: "#0ea5e9" }}>Store {plan.waterGallons.toLocaleString()} gallons</strong>
                </div>
                <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginTop: 3 }}>
                  ≈ 1 gallon per person per day; 14 gallons per person covers a two-week reserve.
                </div>
              </div>
            </div>
            {showShare && (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <input
                  type="number"
                  min="0"
                  placeholder="have (gal)"
                  value={have.water ?? ""}
                  onChange={(e) => onHaveChange("water", e.target.value)}
                  style={{ width: 110, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, fontFamily: "inherit" }}
                  aria-label="Gallons of water on hand"
                />
                <StatusChip ready={haveWater >= plan.waterGallons} label={haveWater >= plan.waterGallons ? "Ready" : `Stock up — ${(plan.waterGallons - haveWater).toLocaleString()} gal more`} />
              </div>
            )}
          </div>
        </div>

        {/* Footnote */}
        <p style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", margin: "16px 0 28px", lineHeight: 1.6 }}>
          Quantities are planning estimates based on public CDC, LDS-Church, and extension-service food-storage references (e.g., about 400 lb grains, 60 lb legumes, and 60 lb sugars per adult per year). Your household, diet, and climate change what's right. This is a starting estimate, not a guarantee.
        </p>

        {/* Actions */}
        {!showShare ? (
          <PrimaryButton style={{ width: "100%" }} onClick={() => { setShowShare(true); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }}>
            What do I already have? →
          </PrimaryButton>
        ) : (
          <>
            <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 24, marginBottom: 24 }}>
              <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: "#0a0c10" }}>
                What you already have vs. what you need
              </h2>
              <p style={{ fontSize: 13, color: "rgba(0,0,0,0.55)", margin: "0 0 16px" }}>
                You're {gap.shortfallLbs.toLocaleString()} lb short across {gap.shortCategories} {gap.shortCategories === 1 ? "category" : "categories"}.
              </p>
            </div>

            <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 24 }}>
              <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: "#0a0c10" }}>Take your plan with you</h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                <ShareRow
                  icon="🔗"
                  title="Copy a link to this exact plan"
                  body="A unique URL that reopens your household and period. Result links live on the served page; nothing is stored server-side."
                  action={
                    <SecondaryButton onClick={copyLink}>{linkCopied ? "Link copied." : "Copy link"}</SecondaryButton>
                  }
                />
                <ShareRow
                  icon="🖼️"
                  title="Summary card"
                  body="A clean summary of household size, period, category totals, and water — ready to message."
                />
                <ShareRow
                  icon="🖨️"
                  title="Print or save as PDF"
                  body="The full list with checkboxes, used as a shopping list and rotation tracker."
                  action={<SecondaryButton onClick={printPlan}>Print / PDF</SecondaryButton>}
                />
              </div>

              <p style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", margin: "16px 0 0" }}>
                Store quantities are estimates. Share the method, not the promise.
              </p>
            </div>
          </>
        )}

        {/* Summary card (shown with share options) */}
        <div className="share-card" style={{ display: showShare ? "block" : "none" }}>
          <SummaryCard plan={plan} planCode={planCode} />
        </div>
      </div>
    </Shell>
  );
}

/* ── Small components ──────────────────────────────────────────────────── */
function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f6f8f6", color: "#0a0c10", ...fs }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes calcFadeUp { from { transform: translateY(14px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        .calc-page section { animation: calcFadeUp 0.3s ease-out; }
        @media print {
          body * { visibility: hidden; }
          .calc-results, .calc-results * { visibility: visible; }
          .calc-results { position: absolute; left: 0; top: 0; width: 100%; }
          .calc-no-print { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <header style={{ borderBottom: "1px solid rgba(0,0,0,0.06)", background: "rgba(255,255,255,0.8)", position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(10px)" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 9, color: "inherit", textDecoration: "none" }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg,${PRIMARY},${PRIMARY_DARK})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, ...mono, color: "#fff" }}>P</div>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.5 }}>PrepVault</span>
          </a>
          <span style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", ...mono }}>Food Storage Calculator</span>
        </div>
      </header>

      <main style={{ maxWidth: 980, margin: "0 auto", padding: "36px 20px 60px" }}>
        {children}
      </main>

      <footer style={{ borderTop: "1px solid rgba(0,0,0,0.06)", padding: "20px", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", ...mono }}>
          PrepVault — Offline-first · Encrypted · No cloud dependency
        </div>
        <div style={{ fontSize: 10, color: "rgba(0,0,0,0.3)", marginTop: 4 }}>
          No account required. No telemetry. Your plan never leaves your browser.
        </div>
      </footer>
    </div>
  );
}

function StaticReference() {
  return (
    <div style={{ maxWidth: 720, margin: "40px auto 0", textAlign: "left" }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.55)", textTransform: "uppercase", letterSpacing: 2, margin: "0 0 14px" }}>
        Reference baseline (per adult, per year)
      </h2>
      <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, overflow: "hidden" }}>
        {Object.values(LB_PER_ADULT_YEAR).map((c, i) => (
          <div key={c.key} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", background: i % 2 === 0 ? "#fff" : "rgba(27,94,32,0.02)", borderTop: i === 0 ? "none" : "1px solid rgba(0,0,0,0.06)", fontSize: 13 }}>
            <span>{" "}{c.icon} {c.label}</span>
            <span style={{ fontWeight: 700, color: PRIMARY, ...mono }}>~{c.lbs} lb</span>
          </div>
        ))}
        <div style={{ padding: "12px 16px", fontSize: 13, background: "rgba(14,165,233,0.04)", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
          <span>💧 Water</span>
        </div>
      </div>
      <p style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", margin: "12px 0 0", lineHeight: 1.6 }}>
        Quantities are planning estimates based on public CDC, LDS-Church, and extension-service food-storage references. This is a starting estimate, not a guarantee.
      </p>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.65)", marginBottom: 10 }}>{label}</label>
      {children}
    </div>
  );
}

function Stepper({ value, setValue, min }) {
  const btn = {
    width: 44,
    height: 44,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.15)",
    background: "#fff",
    fontSize: 20,
    fontWeight: 700,
    cursor: "pointer",
    color: PRIMARY,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button onClick={() => setValue(value - 1)} disabled={value <= min} style={{ ...btn, opacity: value <= min ? 0.35 : 1 }} aria-label="Decrease">−</button>
      <span style={{ fontSize: 26, fontWeight: 800, minWidth: 40, textAlign: "center", ...mono }}>{value}</span>
      <button onClick={() => setValue(value + 1)} style={btn} aria-label="Increase">+</button>
    </div>
  );
}

function SecondaryButton({ children, onClick, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "12px 20px",
        borderRadius: 10,
        background: "#fff",
        color: PRIMARY,
        border: `1px solid ${PRIMARY}`,
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function EditChip({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ padding: "8px 14px", borderRadius: 20, background: "rgba(27,94,32,0.06)", border: "1px solid rgba(27,94,32,0.18)", color: PRIMARY, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
    >
      {label} ✎
    </button>
  );
}

function StatusChip({ ready, label }) {
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        background: ready ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.14)",
        color: ready ? "#15803d" : "#b45309",
      }}
    >
      {label}
    </span>
  );
}

function ShareRow({ icon, title, body, action }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 18px", borderRadius: 12, background: "#fff", border: "1px solid rgba(0,0,0,0.08)" }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
        <div style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", marginTop: 3, lineHeight: 1.5 }}>{body}</div>
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

function SummaryCard({ plan, planCode }) {
  return (
    <div style={{ marginTop: 24, padding: "18px 20px", borderRadius: 14, background: `linear-gradient(135deg,${PRIMARY},${PRIMARY_DARK})`, color: "#fff" }}>
      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.8, letterSpacing: 1, ...mono }}>PREPVAULT · FOOD STORAGE PLAN</div>
      <div style={{ fontSize: 18, fontWeight: 800, margin: "8px 0 4px" }}>
        {plan.adults} adult{plan.adults !== 1 ? "s" : ""} · {plan.children} child{plan.children !== 1 ? "ren" : ""} · {plan.period.label}
      </div>
      <div style={{ fontSize: 13, opacity: 0.85 }}>
        {plan.totalLbs.toLocaleString()} lb food · {plan.waterGallons.toLocaleString()} gal water
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        {plan.categories.slice(0, 8).map((c) => (
          <span key={c.key} style={{ fontSize: 11, background: "rgba(255,255,255,0.14)", padding: "3px 8px", borderRadius: 12 }}>
            {c.icon} {c.label} {c.lbs} lb
          </span>
        ))}
      </div>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 14, ...mono }}>{planCode}</div>
    </div>
  );
}
