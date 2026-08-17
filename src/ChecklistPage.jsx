import { useEffect } from "react";

/* ═══════════════════════════════════════════════════════════
   PREPVAULT — READINESS FRAGILITIES CHECKLIST (public page)
   Evergreen checklist article. Discoverable route:
   /emergency-preparedness-checklist
   ═══════════════════════════════════════════════════════════ */

const M = "'Geist Mono','JetBrains Mono', monospace";
const BRAND = "#1B5E20";
const BRAND_LIGHT = "#2E7D32";

const TITLE = "Emergency Preparedness Checklist: Find Your Household's Readiness Fragilities";
const META_DESCRIPTION = "A gap-checking emergency preparedness checklist that scores your household across six readiness domains and flags the single points of failure most prep lists miss — backup power, comms, and the continuity numbers that tell you how long you can actually last.";
const SLUG = "/emergency-preparedness-checklist";
const REVIEWED_DATE = "August 17, 2026";
const ISO_DATE = "2026-08-17";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: TITLE,
  description: META_DESCRIPTION,
  datePublished: ISO_DATE,
  dateModified: ISO_DATE,
  author: { "@type": "Organization", name: "PrepVault" },
  publisher: { "@type": "Organization", name: "PrepVault" },
  mainEntityOfPage: { "@type": "WebPage", "@id": SLUG },
  articleSection: "Emergency preparedness",
  keywords: "emergency preparedness checklist, readiness fragilities, survival kit list, disaster supply kit, preparedness gaps",
};

const SCORE_ROWS = [
  { domain: "Inventory & stock", fragile: "A life-safety item missing (water under 3 days, no meds, no cash)", partial: "Basics covered at 3 days, gaps in depth", covered: "7–14 days across basics, meds, cash, pets" },
  { domain: "Power & property", fragile: "No backup power or heat if the grid fails", partial: "One backup option, short duration", covered: "Backup power plus alternative heat, and hours you can name" },
  { domain: "Communications", fragile: "One comms channel only", partial: "Two channels, no meeting point", covered: "Two independent channels plus a pre-agreed plan" },
  { domain: "Household team", fragile: "Plan exists only in one head", partial: "Plan written down, not practiced", covered: "Roles assigned, documents bagged, drilled this year" },
  { domain: "Food & home production", fragile: "Under 3 days of non-perishables", partial: "3–7 days, no rotation plan", covered: "14 days plus rotation and grid-free cooking" },
  { domain: "Crisis scenarios", fragile: "No 72-hour kit, no evacuation plan", partial: "Kit exists, no car kit or drill", covered: "Go-bags, car kit, and a scenario walkthrough done" },
];

const SECTIONS = [
  {
    id: "inventory",
    title: "1. Inventory & stock: can you last three days without a store?",
    intro: "The minimum official baseline is three days; the Orange County Fire Authority recommends seven to ten, and REI's kit guidance plans for ten to fourteen. Water and food are the floor.",
    items: [
      ["Water", "one gallon per person per day for drinking and sanitation. Three days minimum; a week or more is the better target."],
      ["Food", "non-perishable meals that need no refrigeration; three days minimum, two weeks preferred, with a rotation so nothing expires (UGA Extension covers food-storage shelf life)."],
      ["Medications", "enough of every prescription and critical over-the-counter med to cover at least a week."],
      ["Cash", "small bills; cards and ATMs are no good when the network is down (Ready.gov includes cash in its kit for this reason)."],
      ["First aid", "a stocked kit covering the injuries most likely in your household."],
      ["Pets", "food, water, and meds for every animal (Ready.gov and state guides include pet guidance)."],
      ["Fuel", "safely storable fuel for your cooking and heating methods."],
    ],
  },
  {
    id: "power",
    title: "2. Power & property: what breaks when the grid does?",
    intro: "A four-hour power outage — the kind of near-miss that makes households start auditing — is a preview. The fragilities are the parts that fail first.",
    items: [
      ["Backup power", "a generator, battery, or power station sized for what you actually need to run. \"No backup generator\" is the classic fragility."],
      ["Power hours", "how many hours you can run essentials (heat, fridge, comms, medical devices) on current backup. Name the number."],
      ["Alternative heat", "heat that doesn't depend on grid power, for cold-season households."],
      ["Backup water", "a supply or a filter if municipal water fails (Ready.gov links CDC guidance on making water safe)."],
      ["Fire and CO safety", "working detectors and an extinguisher."],
    ],
  },
  {
    id: "comms",
    title: "3. Communications: one channel is a fragility",
    intro: null,
    items: [
      ["Two independent ways", "to reach your household and get news — a battery or hand-crank radio that works when cell service doesn't, plus a plan for when phones are down."],
      ["A pre-agreed meeting point", "for the household when you're apart."],
      ["A written contact list", "not just the numbers saved in your phone."],
    ],
  },
  {
    id: "team",
    title: "4. Household team: is the plan in more than one head?",
    intro: null,
    items: [
      ["A written household plan", "not a plan that lives only in one person's head."],
      ["Assigned roles for the first hour", "who grabs the go-bags, who handles pets, who checks on neighbors who need help."],
      ["A document bag", "copies of IDs, insurance, and important records, kept ready (state guides like Texas Ready include a document bag in their kit)."],
      ["A drill", "walk through your most likely scenario at least once a year."],
    ],
  },
  {
    id: "food",
    title: "5. Food & home production: depth, not just a pantry",
    intro: null,
    items: [
      ["Pantry depth", "three days minimum, two weeks preferred, rotated."],
      ["Grid-free cooking", "a stove or method that works without electricity."],
      ["If you grow food", "water and maintenance that survive an outage, plus seed, store, and preserve basics so a harvest never becomes a single point of failure."],
    ],
  },
  {
    id: "scenarios",
    title: "6. Crisis scenarios: what happens in the first hour?",
    intro: null,
    items: [
      ["A 72-hour kit / go-bag for each household member", "(Ready.gov covers home, work, and car kits)."],
      ["A car kit", "if you drive."],
      ["An evacuate-vs-shelter decision", "made in advance for your area (state guides cover both variants)."],
      ["A scenario walkthrough", "of the most likely event where you live — flood, wildfire, winter storm, or outage — and what you'd do in the first four hours."],
    ],
  },
];

const CONTINUITY_ITEMS = [
  ["Power hours", "hours of essential-power capacity you can name."],
  ["Water days", "gallons stored plus filtration, divided by 1 gallon per person per day."],
  ["Food days", "days of non-perishable meals on hand."],
  ["Heat days", "days of cold-season heat without grid power."],
];

const CLOSE_GAPS = [
  ["Life-safety fragilities first", "heat, water, backup power, comms, medications."],
  ["Cheap high-assurance wins", "cash, document copies, a battery radio, a week of meds, a written plan."],
  ["Then build depth", "three days to seven to fourteen, rotating stock."],
];

const SOURCES = [
  { text: <>Ready.gov "Build A Kit" (FEMA) — water, food, medicine, cash, pet guidance, home/work/car kits, and a PDF checklist (last updated 07/01/2026).</>, href: "https://www.ready.gov/kit" },
  { text: <>American Red Cross — companion preparedness authority.</>, href: null },
  { text: <>State emergency-management guidance — Orange County Fire Authority (three-day baseline, seven to ten days recommended), Nevada OEM, and Texas Ready (itemized first-aid kit, document bag, evacuate-vs-shelter variants, pet and access-needs sections).</>, href: null },
  { text: <>APHA Get Ready — public-health stockpile framing.</>, href: null },
  { text: <>UGA Extension — food-storage shelf life.</>, href: null },
  { text: <>Institutional gap-analysis work for the fragility concept — UNDRR Recovery Readiness Framework, World Bank Crisis Preparedness Gap Analysis, PNNL gap-assessment work, and WHO's "identify gaps before a real emergency occurs" framing.</>, href: null },
];

export default function ChecklistPage() {
  useEffect(() => {
    document.title = TITLE + " — PrepVault";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", META_DESCRIPTION);
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", window.location.origin + SLUG);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#fff", fontFamily: "'Outfit','DM Sans','Segoe UI',sans-serif", paddingBottom: 40 }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <style>{`
        @keyframes cpFadeUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .cp-check-table { border-collapse: collapse; width: 100%; font-size: 13px; }
        .cp-check-table th, .cp-check-table td { border: 1px solid rgba(255,255,255,0.08); padding: 10px 12px; text-align: left; vertical-align: top; line-height: 1.5; }
        .cp-check-table th { background: rgba(27,94,32,0.16); color: #c9e4cb; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
        .cp-check-table td:first-child { font-weight: 700; white-space: nowrap; }
        .cp-table-wrap { overflow-x: auto; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; background: rgba(255,255,255,0.015); }
      `}</style>

      {/* ── Nav ── */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(10,12,16,0.85)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, color: "#fff", textDecoration: "none" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg," + BRAND + "," + BRAND_LIGHT + ")", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, fontFamily: M, color: "#fff" }}>P</div>
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.5 }}>PrepVault</span>
        </a>
        <a href="/" style={{ padding: "8px 18px", borderRadius: 8, background: "linear-gradient(135deg," + BRAND + "," + BRAND_LIGHT + ")", color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none", fontFamily: "inherit" }}>Open PrepVault</a>
      </nav>

      {/* ── Article ── */}
      <article style={{ maxWidth: 760, margin: "0 auto", padding: "48px 20px 40px" }}>
        <header style={{ marginBottom: 36, animation: "cpFadeUp 0.5s ease-out" }}>
          <div style={{ display: "inline-block", padding: "5px 12px", borderRadius: 20, background: "rgba(27,94,32,0.12)", border: "1px solid rgba(27,94,32,0.28)", fontSize: 11, color: "#a5d6a7", fontWeight: 700, fontFamily: M, marginBottom: 20, letterSpacing: 1 }}>EMERGENCY PREPAREDNESS</div>
          <h1 style={{ fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 900, margin: "0 0 16px", lineHeight: 1.12, letterSpacing: -0.5 }}>
            Emergency Preparedness Checklist: Find Your Household's Readiness Fragilities
          </h1>
          <p style={{ fontSize: "clamp(15px, 2vw, 18px)", color: "rgba(255,255,255,0.5)", margin: "0 0 14px", lineHeight: 1.6 }}>
            {META_DESCRIPTION}
          </p>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontFamily: M }}>Reviewed {REVIEWED_DATE} · PrepVault</div>
        </header>

        <div style={{ fontSize: 15, lineHeight: 1.75, color: "rgba(255,255,255,0.82)" }}>
          <p>The most useful emergency preparedness checklist isn't a longer shopping list. It's the one that shows you what you're missing.</p>
          <p>Most official checklists — FEMA's Ready.gov "Build A Kit," state emergency-management guides, and the popular 50-plus-item survival lists — are static supplies inventories. They tell you to stock water, food, and medicine. What they don't do is rank your household against a weighted readiness score, surface the points where your plan breaks down, or help you measure how long you can keep running when the grid doesn't.</p>
          <p>That's the gap this checklist closes. <strong>Readiness fragilities</strong> are the single points of failure in your household plan: one way to cook, one comms channel, no backup power, all your documents in one drawer. In preparedness forums, the job is often put bluntly — households want a list that helps them "make sure I'm not missing something stupidly obvious." Institutional planners do the same work under a different name: the World Bank's crisis preparedness gap analysis and the UNDRR recovery readiness framework both treat gap identification as the step before any emergency response. This checklist makes that audit quick, generic, and skimmable.</p>

          <h2 style={{ fontSize: 22, fontWeight: 800, margin: "44px 0 14px", color: "#fff", letterSpacing: -0.3 }}>How to use this checklist</h2>
          <p>Work through the six domains below. For each gap question, mark <strong>Covered</strong>, <strong>Partial</strong>, or <strong>Fragile</strong>. Then compute your continuity numbers (power hours, water days, food days, heat days) and score yourself with the table in the next section. Close Fragile items first.</p>
          <ol style={{ paddingLeft: 22, margin: "16px 0", display: "grid", gap: 8 }}>
            <li>Answer the gap questions honestly — "mostly" counts as Partial, not Covered.</li>
            <li>Add your continuity numbers. They matter more than item counts.</li>
            <li>Score each domain, then fix Fragiles in the priority order at the end.</li>
          </ol>

          <h2 style={{ fontSize: 22, fontWeight: 800, margin: "44px 0 14px", color: "#fff", letterSpacing: -0.3 }}>Score your household</h2>
          <div className="cp-table-wrap" style={{ marginBottom: 16 }}>
            <table className="cp-check-table">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Fragile (0)</th>
                  <th>Partial (1)</th>
                  <th>Covered (2)</th>
                </tr>
              </thead>
              <tbody>
                {SCORE_ROWS.map((r) => (
                  <tr key={r.domain}>
                    <td>{r.domain}</td>
                    <td style={{ color: "rgba(255,255,255,0.62)" }}>{r.fragile}</td>
                    <td style={{ color: "rgba(255,255,255,0.72)" }}>{r.partial}</td>
                    <td style={{ color: "#a5d6a7" }}>{r.covered}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p><strong>Total:</strong> 0–3 = Fragile overall, address immediately. 4–8 = Attention, cover the Fragile domains this month. 9–12 = Covered, rotate and re-check seasonally.</p>

          {SECTIONS.map((s) => (
            <div key={s.id} id={s.id}>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: "44px 0 14px", color: "#fff", letterSpacing: -0.3 }}>{s.title}</h2>
              {s.intro && <p>{s.intro}</p>}
              <ul style={{ listStyle: "none", padding: 0, margin: "16px 0", display: "grid", gap: 12 }}>
                {s.items.map(([label, desc]) => (
                  <li key={label} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 }}>
                    <span style={{ width: 18, height: 18, borderRadius: 5, border: "2px solid " + BRAND_LIGHT, flexShrink: 0, marginTop: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: BRAND_LIGHT }}>✓</span>
                    <span><strong style={{ color: "#fff" }}>{label}</strong> — {desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <h2 style={{ fontSize: 22, fontWeight: 800, margin: "44px 0 14px", color: "#fff", letterSpacing: -0.3 }}>Continuity: the numbers most checklists skip</h2>
          <p>Static lists ask "do you have items?" Fragility auditing asks "how long can you keep going?" Compute these and write them down:</p>
          <ul style={{ listStyle: "none", padding: 0, margin: "16px 0", display: "grid", gap: 10 }}>
            {CONTINUITY_ITEMS.map(([label, desc]) => (
              <li key={label} style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                <span style={{ color: BRAND_LIGHT, fontWeight: 800, fontSize: 14, flexShrink: 0, fontFamily: M }}>▸</span>
                <span><strong style={{ color: "#fff" }}>{label}</strong> — {desc}</span>
              </li>
            ))}
          </ul>
          <p>Targets from official guidance: three days is the floor (Ready.gov); seven to ten is what the Orange County Fire Authority recommends; ten to fourteen is the more comfortable range (REI's kit guidance).</p>

          <h2 style={{ fontSize: 22, fontWeight: 800, margin: "44px 0 14px", color: "#fff", letterSpacing: -0.3 }}>Close the gaps, cheapest first</h2>
          <p>Order your fixes by severity, not by what's fun to buy.</p>
          <ol style={{ paddingLeft: 22, margin: "16px 0", display: "grid", gap: 10 }}>
            {CLOSE_GAPS.map(([label, desc]) => (
              <li key={label}><strong style={{ color: "#fff" }}>{label}</strong> — {desc}</li>
            ))}
          </ol>
          <p>Re-check seasonally and after any near-miss event. The outage that makes you audit is the audit working.</p>

          <div style={{ margin: "44px 0", padding: "32px 28px", borderRadius: 16, background: "rgba(27,94,32,0.08)", border: "1px solid rgba(27,94,32,0.22)" }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 800, color: "#fff" }}>The same audit, automated</h2>
            <p style={{ margin: "0 0 24px", color: "rgba(255,255,255,0.65)" }}>
              If this kind of gap-checking is your plan, PrepVault runs it as a personal preparedness dashboard: it scores your household across the same six readiness domains, computes a weighted Preparedness Score, and flags fragilities in plain language — things like "no backup generator" or "single comms channel." It's offline-first and encrypted, so your household plan never depends on a cloud service that might be down when you need it. That's the point of preparedness: planning that works when nothing else does.
            </p>
            <a href="/" style={{ display: "inline-block", padding: "14px 30px", borderRadius: 10, background: "linear-gradient(135deg," + BRAND + "," + BRAND_LIGHT + ")", color: "#fff", fontSize: 15, fontWeight: 700, textDecoration: "none", fontFamily: "inherit" }}>Open PrepVault</a>
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 800, margin: "44px 0 14px", color: "#fff", letterSpacing: -0.3 }}>Sources</h2>
          <p>Checklist baselines and the fragility concept are drawn from the following, reviewed {REVIEWED_DATE}:</p>
          <ul style={{ paddingLeft: 20, margin: "16px 0", display: "grid", gap: 8, color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
            {SOURCES.map((s, i) => (
              <li key={i}>
                {s.href ? <a href={s.href} target="_blank" rel="noopener noreferrer" style={{ color: "#a5d6a7", textDecoration: "underline" }}>{s.text}</a> : s.text}
              </li>
            ))}
          </ul>
        </div>
      </article>

      {/* ── Footer ── */}
      <footer style={{ maxWidth: 760, margin: "0 auto", padding: "20px 20px 0", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: M }}>PrepVault — Survival planning that works when nothing else does.</div>
        <div style={{ display: "flex", gap: 20, fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: M }}>
          <span>Encrypted</span><span>Offline</span><span>No cloud dependency</span>
        </div>
      </footer>
    </div>
  );
}
