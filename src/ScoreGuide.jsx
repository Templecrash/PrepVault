import { useEffect } from "react";

const GREEN = "#1B5E20";
const M = "'Geist Mono','JetBrains Mono', monospace";
const SANS = "'Outfit','DM Sans','Segoe UI',sans-serif";

const GUIDE_TITLE = "Understanding Your Preparedness Score: How It's Measured and How to Improve It";
const GUIDE_DESC = "Your preparedness score is a 0–100 number calculated from water, food, power, heat, communications, and coverage. Learn the six tiers, the continuity math behind each life-support line, and the highest-point fixes to improve it.";
const GUIDE_SLUG = "/understanding-your-preparedness-score";

const sectionTitle = {
  fontSize: 22, fontWeight: 800, color: "#e6edf3", margin: "0 0 14px", lineHeight: 1.25, letterSpacing: -0.5,
};
const subTitle = {
  fontSize: 17, fontWeight: 800, color: "#e6edf3", margin: "28px 0 10px", lineHeight: 1.3,
};
const body = { fontSize: 15, lineHeight: 1.75, color: "rgba(230,237,243,0.82)", margin: "0 0 16px" };

function SourceLink({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: GREEN, textDecoration: "underline", textUnderlineOffset: 2, wordBreak: "break-all" }}>
      {children}
    </a>
  );
}

function Figure({ svg, caption }) {
  return (
    <figure style={{ margin: "20px 0", padding: "18px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", overflowX: "auto" }}>
      <div style={{ minWidth: 0, width: "100%" }}>
        {svg}
      </div>
      <figcaption style={{ marginTop: 12, fontSize: 12, lineHeight: 1.6, color: "rgba(230,237,243,0.45)", fontStyle: "italic" }}>{caption}</figcaption>
    </figure>
  );
}

function ScoreTable({ headers, rows }) {
  return (
    <div style={{ overflowX: "auto", margin: "16px 0" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 520 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.1)", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "rgba(230,237,243,0.45)", fontWeight: 700 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              {r.map((cell, j) => (
                <td key={j} style={{ padding: "11px 12px", verticalAlign: "top", color: "rgba(230,237,243,0.85)" }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bullet({ title, children }) {
  return (
    <li style={{ margin: "0 0 12px", lineHeight: 1.7 }}>
      <strong style={{ color: "#e6edf3" }}>{title}</strong> {children}
    </li>
  );
}

function ImproveStep({ num, label, points, target, children, tips }) {
  return (
    <section style={{ margin: "26px 0" }}>
      <h4 style={{ fontSize: 15, fontWeight: 800, color: "#e6edf3", margin: "0 0 6px", display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ color: GREEN, fontFamily: M }}>{num}. {label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(230,237,243,0.5)", fontFamily: M }}>{points} pts · target {target}</span>
      </h4>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(230,237,243,0.75)", margin: "0 0 10px" }}>{children}</p>
      <ol style={{ margin: "0 0 0 18px", padding: 0 }}>
        {tips.map((t, i) => (
          <li key={i} style={{ margin: "0 0 8px", fontSize: 14, lineHeight: 1.65, color: "rgba(230,237,243,0.75)" }}>
            <strong style={{ color: "#e6edf3" }}>{t.title}</strong> {t.body}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function ScoreGuide({ onBack, onOpenApp }) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = GUIDE_TITLE;

    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", GUIDE_DESC);

    const jsonLd = document.createElement("script");
    jsonLd.type = "application/ld+json";
    jsonLd.id = "prepvault-guide-jsonld";
    jsonLd.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: GUIDE_TITLE,
      description: GUIDE_DESC,
      inLanguage: "en",
      about: "Preparedness score",
      isAccessibleForFree: true,
      publisher: { "@type": "Organization", name: "PrepVault" },
      mainEntityOfPage: GUIDE_SLUG,
    });
    document.head.appendChild(jsonLd);

    window.scrollTo(0, 0);
    return () => {
      document.title = prevTitle;
      document.getElementById("prepvault-guide-jsonld")?.remove();
    };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#e6edf3", fontFamily: SANS }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* ── Nav Bar ── */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(10,12,16,0.9)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={onBack}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg," + GREEN + ",#0d3d16)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, fontFamily: M, color: "#fff" }}>P</div>
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.5 }}>PrepVault</span>
        </div>
        <button onClick={onOpenApp} style={{ padding: "8px 18px", borderRadius: 8, background: "linear-gradient(135deg," + GREEN + ",#0d3d16)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Open PrepVault</button>
      </nav>

      {/* ── Article ── */}
      <article style={{ maxWidth: 780, margin: "0 auto", padding: "48px 20px 80px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: GREEN, fontFamily: M, marginBottom: 16 }}>Preparedness Guide</div>
        <h1 style={{ fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 900, margin: "0 0 18px", lineHeight: 1.1, letterSpacing: -1, color: "#fff" }}>
          Understanding Your Preparedness Score: How Ready Are You, Really?
        </h1>

        <p style={body}>
          You have a pantry, a first-aid kit, and a vague feeling that you're "mostly prepared." That feeling is not a measurement — and it's the wrong question. The real questions are: <strong style={{ color: "#e6edf3" }}>how long can your household actually sustain itself on what you've stored, and what should you fix next?</strong>
        </p>

        <p style={body}>
          A preparedness score answers both. It turns a checklist into one honest number — 0 to 100 — calculated from the life-support systems that actually keep a household running when the grid, the stores, and the water supply don't: water, food, power, heat, communications, and how many preparedness categories you actually stock. You don't guess the number. It's computed from your inventory, your property, and your household size, then placed on a tier scale from <strong style={{ color: "#e6edf3" }}>Critical</strong> to <strong style={{ color: "#e6edf3" }}>Fortified</strong>.
        </p>

        <p style={body}>
          This guide explains how that score works, what each tier means, the math behind each life-support line, and — most usefully — the concrete fixes that move the number fastest. The tier thresholds below are PrepVault's own framework, built to align with established preparedness standards, not a government cutoff. More on why that matters later.
        </p>

        <section>
          <h2 style={sectionTitle}>What your preparedness score actually measures</h2>
          <p style={body}>No single authority defines one numeric preparedness score. The field uses several methods, each with a citable receipt:</p>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 8px" }}>
            <Bullet title="Yes/no item counts.">The Household Emergency Preparedness Instrument (HEPI v3) scores 50 questions across four subscales and runs 0–40 with one point per yes-response.</Bullet>
            <Bullet title="Z-scored composite averaging.">A peer-reviewed Household Preparedness Score merges resources, planning, and actions into 24 indicators and averages them into a single score designed to be comparable with the American Red Cross "Get a Kit; Make a Plan; Be Informed" campaign.</Bullet>
            <Bullet title="Banded quiz scoring.">Pierce County's "Preparedness Quiz – How Ready Are You?" scores 10 questions and bands totals into readiness ranges.</Bullet>
            <Bullet title="Composite national indices.">The National Health Security Preparedness Index combines roughly 130 measures — with an acknowledged lack of consensus on how to approach measurement.</Bullet>
          </ul>
          <p style={body}>PrepVault uses the composite method: a weighted 0–100 score built from the life-support lines your inventory actually feeds. The weight reflects how quickly each line becomes a crisis. Water and food get the most weight because the body runs out of them in days. Power and heat follow, then communications and category coverage.</p>
        </section>

        <section>
          <h2 style={sectionTitle}>How the 100-point score is weighted</h2>
          <p style={body}>The score divides 100 points across six lines, and each line earns full marks at a defined target:</p>
          <ScoreTable
            headers={["Life-support line", "Points", "Full marks at", "What it measures"]}
            rows={[
              ["Water", "25", "14 days", "Stored water and filtration, plus renewable sources"],
              ["Food", "25", "30 days", "Total stored calories ÷ household daily need"],
              ["Power", "15", "72 hours", "Generator fuel, battery, and solar autonomy"],
              ["Heat", "15", "30 days", "Firewood and propane heating days, climate-adjusted"],
              ["Communications", "10", "3 channels", "Independent backup channels (cellular, satellite, HAM/GMRS, weather band)"],
              ["Category coverage", "10", "30 categories", "Distinct preparedness categories with at least one item"],
            ]}
          />
          <Figure
            caption="Figure 1. Each life-support line is scored proportionally to its target — for example, 14 days of water earns the full 25 points, while 7 days earns about half."
            svg={(
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 210" role="img" aria-labelledby="wtitle wdesc" style={{ width: "100%", height: "auto" }}>
                <title id="wtitle">How the 100-point Preparedness Score is weighted</title>
                <desc id="wdesc">Horizontal bar showing water 25 points, food 25 points, power 15 points, heat 15 points, communications 10 points, and category coverage 10 points, totaling 100.</desc>
                <text x="360" y="26" text-anchor="middle" font-family="system-ui, sans-serif" font-size="17" font-weight="700" fill="#1B5E20">How the 100-point Preparedness Score is weighted</text>
                <g font-family="system-ui, sans-serif">
                  <rect x="0" y="70" width="180" height="46" fill="#0ea5e9"/><text x="90" y="98" text-anchor="middle" font-size="15" font-weight="700" fill="#fff">25</text>
                  <rect x="180" y="70" width="180" height="46" fill="#f59e0b"/><text x="270" y="98" text-anchor="middle" font-size="15" font-weight="700" fill="#fff">25</text>
                  <rect x="360" y="70" width="108" height="46" fill="#eab308"/><text x="414" y="98" text-anchor="middle" font-size="14" font-weight="700" fill="#1B5E20">15</text>
                  <rect x="468" y="70" width="108" height="46" fill="#a16207"/><text x="522" y="98" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">15</text>
                  <rect x="576" y="70" width="72" height="46" fill="#10b981"/><text x="612" y="98" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">10</text>
                  <rect x="648" y="70" width="72" height="46" fill="#6b7280"/><text x="684" y="98" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">10</text>
                  <text x="90" y="140" text-anchor="middle" font-size="13" font-weight="700" fill="#0e1111">Water</text>
                  <text x="270" y="140" text-anchor="middle" font-size="13" font-weight="700" fill="#0e1111">Food</text>
                  <text x="414" y="140" text-anchor="middle" font-size="13" font-weight="700" fill="#0e1111">Power</text>
                  <text x="522" y="140" text-anchor="middle" font-size="13" font-weight="700" fill="#0e1111">Heat</text>
                  <text x="612" y="140" text-anchor="middle" font-size="12" font-weight="700" fill="#0e1111">Comms</text>
                  <text x="684" y="140" text-anchor="middle" font-size="12" font-weight="700" fill="#0e1111">Coverage</text>
                  <text x="90" y="160" text-anchor="middle" font-size="12" fill="#5b6366">25 pts</text>
                  <text x="270" y="160" text-anchor="middle" font-size="12" fill="#5b6366">25 pts</text>
                  <text x="414" y="160" text-anchor="middle" font-size="12" fill="#5b6366">15 pts</text>
                  <text x="522" y="160" text-anchor="middle" font-size="12" fill="#5b6366">15 pts</text>
                  <text x="612" y="160" text-anchor="middle" font-size="11" fill="#5b6366">10 pts</text>
                  <text x="684" y="160" text-anchor="middle" font-size="11" fill="#5b6366">10 pts</text>
                </g>
              </svg>
            )}
          />
          <p style={body}>Because each line is scored as "current value ÷ target," the score is honest about partial progress. Store half your water target and you earn roughly half the water points. There are no trick questions and no "I did one checklist item" inflation — the math only counts what's actually in your inventory.</p>
        </section>

        <section>
          <h2 style={sectionTitle}>The six preparedness tiers: Critical to Fortified</h2>
          <p style={body}>The score is rounded to a whole number and placed on six tiers. These tiers are PrepVault's own framework, built to align with established preparedness standards (see the sources at the end) rather than to copy any single authority's cutoff.</p>
          <ScoreTable
            headers={["Tier", "Score", "What it means in practice"]}
            rows={[
              ["Critical", "0–19", "Life-support lines are far below target. A multi-day outage would be a serious problem. Start with water and food."],
              ["At Risk", "20–39", "Some supplies exist, but most life-support lines sit below target. One or two focused fixes move the score quickly."],
              ["Vulnerable", "40–59", "The core lines are partially stocked. Gaps are usually concentrated in a single line or two."],
              ["Moderate", "60–74", "Most lines meet or approach target. The remaining points come from closing the last gap and adding coverage."],
              ["Prepared", "75–89", "Core life-support lines meet their targets and coverage is broad. The plan can withstand most realistic disruptions."],
              ["Fortified", "90–100", "All six lines meet their targets with redundancy — multiple water sources, multiple channels, diversified heat."],
            ]}
          />
          <Figure
            caption="Figure 2. Tier boundaries are fixed and consistent, so the number always reads the same way for the same household."
            svg={(
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 250" role="img" aria-labelledby="ttitle tdesc" style={{ width: "100%", height: "auto" }}>
                <title id="ttitle">Preparedness Score tier scale from Critical to Fortified</title>
                <desc id="tdesc">A 0 to 100 scale divided into six tiers: Critical 0 to 19, At Risk 20 to 39, Vulnerable 40 to 59, Moderate 60 to 74, Prepared 75 to 89, Fortified 90 to 100.</desc>
                <text x="360" y="26" text-anchor="middle" font-family="system-ui, sans-serif" font-size="17" font-weight="700" fill="#1B5E20">Preparedness Score tiers: 0–100 scale</text>
                <g font-family="system-ui, sans-serif">
                  <text x="72" y="62" text-anchor="middle" font-size="13" font-weight="700" fill="#ef4444">Critical</text>
                  <text x="216" y="62" text-anchor="middle" font-size="13" font-weight="700" fill="#f97316">At Risk</text>
                  <text x="360" y="62" text-anchor="middle" font-size="13" font-weight="700" fill="#a16207">Vulnerable</text>
                  <text x="486" y="62" text-anchor="middle" font-size="13" font-weight="700" fill="#65a30d">Moderate</text>
                  <text x="612" y="62" text-anchor="middle" font-size="13" font-weight="700" fill="#16a34a">Prepared</text>
                  <text x="684" y="62" text-anchor="middle" font-size="13" font-weight="700" fill="#1B5E20">Fortified</text>
                  <rect x="0" y="80" width="144" height="44" fill="#ef4444"/><text x="72" y="107" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">0–19</text>
                  <rect x="144" y="80" width="144" height="44" fill="#f97316"/><text x="216" y="107" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">20–39</text>
                  <rect x="288" y="80" width="144" height="44" fill="#eab308"/><text x="360" y="107" text-anchor="middle" font-size="13" font-weight="700" fill="#1B5E20">40–59</text>
                  <rect x="432" y="80" width="108" height="44" fill="#84cc16"/><text x="486" y="107" text-anchor="middle" font-size="12" font-weight="700" fill="#1B5E20">60–74</text>
                  <rect x="540" y="80" width="108" height="44" fill="#22c55e"/><text x="594" y="107" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">75–89</text>
                  <rect x="648" y="80" width="72" height="44" fill="#1B5E20"/><text x="684" y="107" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">90–100</text>
                  <line x1="0" y1="140" x2="720" y2="140" stroke="#c9d2d4" strokeWidth="1"/>
                  <text x="0" y="162" text-anchor="middle" font-size="12" fill="#5b6366">0</text>
                  <text x="360" y="162" text-anchor="middle" font-size="12" fill="#5b6366">50</text>
                  <text x="720" y="162" text-anchor="middle" font-size="12" fill="#5b6366">100</text>
                  <text x="360" y="196" text-anchor="middle" font-size="12" fill="#5b6366">Higher score = longer sustained continuity on stored resources</text>
                </g>
              </svg>
            )}
          />
          <p style={body}>A tier is a diagnostic, not a verdict. "Vulnerable" tells you the household can sustain itself for a short window but not a long one. The useful output is always the same: <em>which line is furthest below its target, and what fix gains the most points?</em></p>
        </section>

        <section>
          <h2 style={sectionTitle}>The continuity math behind your score</h2>
          <p style={body}>Each life-support line is computed from what's actually logged — quantities, calories, fuel, and channels — then divided by your household's daily need. Here's the formula behind each number.</p>
          <Figure
            caption="Figure 3. Every line is 'what you hold ÷ what the household needs,' so the score scales with your actual numbers."
            svg={(
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 330" role="img" aria-labelledby="ctitle cdesc" style={{ width: "100%", height: "auto" }}>
                <title id="ctitle">Life-support continuity targets and how each is measured</title>
                <desc id="cdesc">Five cards: Water target 14 days from stored gallons divided by daily use plus filtration days; Food target 30 days from stored calories divided by household daily need; Power target 72 hours from generator battery and solar hours; Heat target 30 days from firewood and propane heating days; Communications target 3 independent channels.</desc>
                <text x="360" y="26" text-anchor="middle" font-family="system-ui, sans-serif" font-size="17" font-weight="700" fill="#1B5E20">Life-support targets and the math behind them</text>
                <g font-family="system-ui, sans-serif">
                  <rect x="0" y="46" width="132" height="232" rx="8" fill="#f4f7f5" stroke="#d4e0d6"/>
                  <circle cx="66" cy="76" r="12" fill="#0ea5e9"/><text x="66" y="115" text-anchor="middle" font-size="18" font-weight="800" fill="#0e1111">14</text><text x="66" y="131" text-anchor="middle" font-size="11" fill="#5b6366">days</text>
                  <text x="66" y="158" text-anchor="middle" font-size="12" font-weight="700" fill="#0e1111">Water</text>
                  <text x="66" y="182" text-anchor="middle" font-size="10" fill="#5b6366">Stored gallons ÷</text>
                  <text x="66" y="195" text-anchor="middle" font-size="10" fill="#5b6366">daily use</text>
                  <text x="66" y="211" text-anchor="middle" font-size="10" fill="#5b6366">+ filtration days</text>
                  <text x="66" y="230" text-anchor="middle" font-size="10" font-weight="700" fill="#0e1111">25 pts</text>
                  <rect x="147" y="46" width="132" height="232" rx="8" fill="#f4f7f5" stroke="#d4e0d6"/>
                  <circle cx="213" cy="76" r="12" fill="#f59e0b"/><text x="213" y="115" text-anchor="middle" font-size="18" font-weight="800" fill="#0e1111">30</text><text x="213" y="131" text-anchor="middle" font-size="11" fill="#5b6366">days</text>
                  <text x="213" y="158" text-anchor="middle" font-size="12" font-weight="700" fill="#0e1111">Food</text>
                  <text x="213" y="182" text-anchor="middle" font-size="10" fill="#5b6366">Stored calories ÷</text>
                  <text x="213" y="195" text-anchor="middle" font-size="10" fill="#5b6366">household daily</text>
                  <text x="213" y="208" text-anchor="middle" font-size="10" fill="#5b6366">need (2,000 cal)</text>
                  <text x="213" y="230" text-anchor="middle" font-size="10" font-weight="700" fill="#0e1111">25 pts</text>
                  <rect x="294" y="46" width="132" height="232" rx="8" fill="#f4f7f5" stroke="#d4e0d6"/>
                  <circle cx="360" cy="76" r="12" fill="#eab308"/><text x="360" y="115" text-anchor="middle" font-size="18" font-weight="800" fill="#0e1111">72</text><text x="360" y="131" text-anchor="middle" font-size="11" fill="#5b6366">hours</text>
                  <text x="360" y="158" text-anchor="middle" font-size="12" font-weight="700" fill="#0e1111">Power</text>
                  <text x="360" y="182" text-anchor="middle" font-size="10" fill="#5b6366">Generator hours +</text>
                  <text x="360" y="195" text-anchor="middle" font-size="10" fill="#5b6366">battery hours +</text>
                  <text x="360" y="208" text-anchor="middle" font-size="10" fill="#5b6366">solar hours</text>
                  <text x="360" y="230" text-anchor="middle" font-size="10" font-weight="700" fill="#0e1111">15 pts</text>
                  <rect x="441" y="46" width="132" height="232" rx="8" fill="#f4f7f5" stroke="#d4e0d6"/>
                  <circle cx="507" cy="76" r="12" fill="#a16207"/><text x="507" y="115" text-anchor="middle" font-size="18" font-weight="800" fill="#0e1111">30</text><text x="507" y="131" text-anchor="middle" font-size="11" fill="#5b6366">days</text>
                  <text x="507" y="158" text-anchor="middle" font-size="12" font-weight="700" fill="#0e1111">Heat</text>
                  <text x="507" y="182" text-anchor="middle" font-size="10" fill="#5b6366">Firewood + propane</text>
                  <text x="507" y="195" text-anchor="middle" font-size="10" fill="#5b6366">heating days,</text>
                  <text x="507" y="208" text-anchor="middle" font-size="10" fill="#5b6366">climate-adjusted</text>
                  <text x="507" y="230" text-anchor="middle" font-size="10" font-weight="700" fill="#0e1111">15 pts</text>
                  <rect x="588" y="46" width="132" height="232" rx="8" fill="#f4f7f5" stroke="#d4e0d6"/>
                  <circle cx="654" cy="76" r="12" fill="#10b981"/><text x="654" y="115" text-anchor="middle" font-size="18" font-weight="800" fill="#0e1111">3</text><text x="654" y="131" text-anchor="middle" font-size="11" fill="#5b6366">channels</text>
                  <text x="654" y="158" text-anchor="middle" font-size="12" font-weight="700" fill="#0e1111">Comms</text>
                  <text x="654" y="182" text-anchor="middle" font-size="10" fill="#5b6366">Independent backup</text>
                  <text x="654" y="195" text-anchor="middle" font-size="10" fill="#5b6366">channels: cellular,</text>
                  <text x="654" y="208" text-anchor="middle" font-size="10" fill="#5b6366">satellite, radio,</text>
                  <text x="654" y="221" text-anchor="middle" font-size="10" fill="#5b6366">weather band</text>
                  <text x="654" y="230" text-anchor="middle" font-size="10" font-weight="700" fill="#0e1111">10 pts</text>
                  <text x="360" y="300" text-anchor="middle" font-size="12" fill="#5b6366">Full marks at each target. Below target = a fixable gap.</text>
                </g>
              </svg>
            )}
          />
          <p style={body}>A worked example, kept simple to show the logic — <strong style={{ color: "#e6edf3" }}>this is an illustrative scenario, not a real household</strong>:</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <Bullet title="Water.">Two people at 1 gallon per person per day need 2 gallons/day. Stored 21 gallons: 21 ÷ 2 = 10.5 days of stored water. Two purification devices add 3 days each, for a total of roughly 16.5 days — above the 14-day target, earning full water points. Add a well or spring, and the property-profile adjustment pushes the line further out.</Bullet>
            <Bullet title="Food.">Two people at 2,000 calories per person per day need 4,000 calories/day. If the pantry holds 96,000 calories, that's 24 days — 80% of the 30-day target, earning 20 of 25 points.</Bullet>
            <Bullet title="Power.">10 gallons of gasoline at 5.5 hours per gallon = 55 hours of generator runtime. Under the 72-hour target, so power earns 15 × (55 ÷ 72) ≈ 11 points. Solar panels and a battery bank would close the gap.</Bullet>
          </ul>
          <p style={body}>The pattern to internalize: <strong style={{ color: "#e6edf3" }}>the score rewards closing gaps, and it tells you exactly which line is the gap.</strong> The 25-point lines are where most households should start, because water and food are the first things the human body needs.</p>
        </section>

        <section>
          <h2 style={sectionTitle}>What your score can't tell you</h2>
          <p style={body}>An honest score comes with honest limits. No authority defines an evidence-based numeric cutoff between "prepared" and "unprepared" — HEPI v3's scoring guide states that none exists, and the HHS Office of the Assistant Secretary for Planning and Evaluation reports a lack of consensus among practitioners and scholars on how to approach preparedness measurement. The tiers in this guide are PrepVault's framework, aligned to the Red Cross "Get a Kit; Make a Plan; Be Informed" method and NFPA 1600's continuity-program criteria — not a certification or a legal threshold.</p>
          <p style={body}>A preparedness score measures <strong style={{ color: "#e6edf3" }}>stored and arranged continuity</strong>. It does not measure:</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <Bullet title="Skill.">A stocked medical cabinet is not a trained responder. The score counts supplies and training you log; it can't certify competence.</Bullet>
            <Bullet title="Physical condition or health.">The 2,000-calorie baseline and 1-gallon water figure are planning assumptions, not medical advice for any individual.</Bullet>
            <Bullet title="Scenario-specific readiness.">The score is a general continuity baseline. A blizzard stresses heat and power; a pandemic stresses supplies and medical. Scenario simulations re-weight the lines — the baseline doesn't replace them.</Bullet>
          </ul>
        </section>

        <section>
          <h2 style={sectionTitle}>How to improve your preparedness score, one life-support line at a time</h2>
          <p style={body}>Every improvement recommendation is prioritized by how many points it gains, so you can see the highest-leverage move first. The gains below come straight from the scoring formula — fix the line furthest below its target, and the number moves the most.</p>

          <ImproveStep num="1" label="Water" points="25" target="14 days" tips={[
            { title: "Store to the 14-day target.", body: "Add food-grade water storage for the shortfall: for two people, roughly 28 gallons minus what you already hold." },
            { title: "Add purification.", body: "A gravity-fed filter (such as a Berkey-style unit) plus purification tablets turns stored water into an indefinite supply. Each purification device adds 3 days of continuity in the formula." },
            { title: "Diversify sources.", body: "Rainwater collection, a well, or access to a natural spring adds days to the water line and removes dependence on any single source. Municipal-only water with no natural backup is flagged as a vulnerability." },
          ]}>
            The standard baseline is 1 gallon of water per person per day for drinking and basic hygiene, per Ready.gov. Washington State Emergency Management extends that to a "Be 2 Weeks Ready" 14-day supply — the target PrepVault uses. Two people need about 28 gallons for 14 days.
          </ImproveStep>

          <ImproveStep num="2" label="Food" points="25" target="30 days at 2,000 cal/person/day" tips={[
            { title: "Build calorie-dense reserves.", body: "Freeze-dried meals, rice, beans, and canned goods are the workhorses. Focus on items with long shelf life and known calorie counts." },
            { title: "Match the pantry to the household.", body: "The number that matters is calories per person per day, not pounds. A pantry heavy on starches without protein and fat is a calorie plan, not a meal plan." },
            { title: "Add a renewable source.", body: "Even a small garden — potatoes, beans, tomatoes, squash — adds caloric days and diversifies the food line." },
          ]}>
            Ready.gov's minimum is a three-day supply of non-perishable food. PrepVault's 30-day target is a self-reliance extension of that baseline — the duration that covers extended utility and supply-chain outages. Total the calories across everything you hold, divide by household need (people × 2,000), and that's your food days.
          </ImproveStep>

          <ImproveStep num="3" label="Power" points="15" target="72 hours" tips={[
            { title: "Add a generator with stored fuel.", body: "Gasoline is credited at 5.5 hours per gallon in the formula, so 72 hours needs roughly 13 gallons of fuel." },
            { title: "Add solar.", body: "A portable 100W+ panel with a charge controller and battery bank adds silent, renewable hours that don't depend on fuel supply." },
            { title: "Stock batteries.", body: "Solar without battery storage is weather-dependent. Rechargeable 18650s and AAs with a solar-compatible charger carry the line through nights and cloudy days." },
          ]}>
            Power is the line that fails first and compounds everything else: no power means no well pump, no freezer, no phone. The formula counts generator runtime, battery hours, and solar hours together.
          </ImproveStep>

          <ImproveStep num="4" label="Heat" points="15" target="30 days" tips={[
            { title: "Stock heating fuel.", body: "In cold climates, stack 2+ cords of seasoned firewood and keep propane as backup. Elsewhere, firewood or propane covering 30 cold days." },
            { title: "Diversify heat sources.", body: "One fuel source — wood only, or propane only — is a single point of failure. Add the second source." },
            { title: "Confirm the appliance.", body: "A wood stove or fireplace that's actually installed and usable is what converts cords into days." },
          ]}>
            Heat is the silent killer in cold climates. The line is climate-adjusted: firewood is credited at about one cord per 30 days, and in cold or arctic zones a single fuel source is flagged as a critical vulnerability.
          </ImproveStep>

          <ImproveStep num="5" label="Communications" points="10" target="3 channels" tips={[
            { title: "Add a NOAA weather radio.", body: "It's the cheapest and most useful early-warning channel — hand-crank models need no grid." },
            { title: "Add a second channel.", body: "HAM/GMRS or a satellite phone creates redundancy." },
            { title: "Aim for three.", body: "Three independent channels is full marks. Each channel below three is a flagged gap." },
          ]}>
            When the grid and the networks go down, your phone is a brick. The formula counts distinct independent channels: cellular, satellite (satellite phone), HAM/GMRS radio, and NOAA weather radio.
          </ImproveStep>

          <ImproveStep num="6" label="Category coverage" points="10" target="30 categories" tips={[
            { title: "Build medical supplies.", body: "Medical emergencies are the most common crisis regardless of scenario. Start with a comprehensive first-aid kit, a trauma kit (tourniquet, hemostatic gauze), and prescription reserves." },
            { title: "Build bug-out bags.", body: "In an evacuation, a pre-packed 72-hour bag (water, food, first aid, fire kit, shelter, documents, cash) saves critical minutes — one per person." },
            { title: "Add perimeter security.", body: "Motion-sensor lights, trail cameras, and trip-wire alarms at entry points deter threats and provide early warning." },
            { title: "Fill remaining empty categories", body: " from the list, starting with the ones your location and household make most relevant." },
          ]}>
            Each of the 30 preparedness categories (medical, defense, bug-out bags, farm, and so on) earns roughly a third of a point per covered category, so coverage is worth 10 points total. Empty categories that should be stocked are flagged one by one.
          </ImproveStep>

          <h3 style={subTitle}>The fragility flags the score also watches</h3>
          <p style={body}>Beyond the six lines, the score surfaces specific failure modes worth acting on even when the number looks okay:</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <Bullet title="Caloric reserve below 7 days"></Bullet>
            <Bullet title="Power autonomy under 24 hours"></Bullet>
            <Bullet title="Single heat fuel source in a cold climate"></Bullet>
            <Bullet title="Fewer than two water purification options"></Bullet>
            <Bullet title="Fewer than two communication channels"></Bullet>
            <Bullet title="Municipal-only water with no natural backup"></Bullet>
            <Bullet title="Grid-dependent with no backup generator"></Bullet>
          </ul>
          <p style={body}>These are the "it's fine until it isn't" situations. The score treats each as a warning worth resolving.</p>

          <Figure
            caption="Figure 4. Preparedness is a journey, not a finish line. Recalculate after each fix and the plan compounds."
            svg={(
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 330" role="img" aria-labelledby="ltitle ldesc" style={{ width: "100%", height: "auto" }}>
                <title id="ltitle">The score improvement loop</title>
                <desc id="ldesc">Four steps in a loop: score it, find the weakest line, fix the highest-point gap, then recalculate and watch the tier move.</desc>
                <text x="360" y="26" text-anchor="middle" font-family="system-ui, sans-serif" font-size="17" font-weight="700" fill="#1B5E20">Turn the number into a plan</text>
                <g font-family="system-ui, sans-serif">
                  <rect x="40" y="60" width="280" height="80" rx="10" fill="#1B5E20"/><text x="180" y="92" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">1. Score it</text><text x="180" y="114" text-anchor="middle" font-size="12" fill="#dce9dd">See the number and the tier</text>
                  <rect x="400" y="60" width="280" height="80" rx="10" fill="#1B5E20"/><text x="540" y="92" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">2. Find the weakest line</text><text x="540" y="114" text-anchor="middle" font-size="12" fill="#dce9dd">Water, food, power, heat, or comms below target</text>
                  <rect x="400" y="220" width="280" height="80" rx="10" fill="#2e7d32"/><text x="540" y="252" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">3. Fix the highest-point gap</text><text x="540" y="274" text-anchor="middle" font-size="12" fill="#e5f0e6">Do the recommended next action</text>
                  <rect x="40" y="220" width="280" height="80" rx="10" fill="#2e7d32"/><text x="180" y="252" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">4. Recalculate</text><text x="180" y="274" text-anchor="middle" font-size="12" fill="#e5f0e6">Watch the score and tier move</text>
                  <path d="M322 100 H396" stroke="#5b6366" strokeWidth="2" markerEnd="url(#a)"/>
                  <path d="M540 142 V216" stroke="#5b6366" strokeWidth="2" markerEnd="url(#b)"/>
                  <path d="M398 260 H324" stroke="#5b6366" strokeWidth="2" markerEnd="url(#c)"/>
                  <path d="M180 218 V144" stroke="#5b6366" strokeWidth="2" markerEnd="url(#d)"/>
                  <defs>
                    <marker id="a" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#5b6366"/></marker>
                    <marker id="b" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#5b6366"/></marker>
                    <marker id="c" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#5b6366"/></marker>
                    <marker id="d" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#5b6366"/></marker>
                  </defs>
                </g>
              </svg>
            )}
          />
        </section>

        <section>
          <h2 style={sectionTitle}>Where the standards come from</h2>
          <p style={body}>The targets and methods in this guide are grounded in published standards and research:</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <Bullet title="Ready.gov">— the FEMA baseline: 1 gallon of water per person per day and a three-day supply of non-perishable food for a basic kit. <SourceLink href="https://www.ready.gov/kit">https://www.ready.gov/kit</SourceLink></Bullet>
            <Bullet title={'Washington State Emergency Management, "Be 2 Weeks Ready"'} >— the 14-day supply standard that defines PrepVault's water target, and the "preparedness is a journey" pacing this guide uses. <SourceLink href="https://mil.wa.gov/asset/6866e0b1009ac/2-Weeks-Ready-Individual-Family-Brochure-02-Press-ENGLISH.pdf">https://mil.wa.gov/asset/6866e0b1009ac/2-Weeks-Ready-Individual-Family-Brochure-02-Press-ENGLISH.pdf</SourceLink></Bullet>
            <Bullet title={'American Red Cross, "Get a Kit; Make a Plan; Be Informed"'} >— the three-part readiness method PrepVault's composite score is designed to be comparable with. <SourceLink href="https://www.redcross.org/get-help/how-to-prepare-for-emergencies.html">https://www.redcross.org/get-help/how-to-prepare-for-emergencies.html</SourceLink></Bullet>
            <Bullet title="NFPA 1600" >— the all-hazards standard for emergency management and business continuity programs, covering assessment across preparedness, response, continuity, and recovery. <SourceLink href="https://www.osha.gov/emergency-preparedness/getting-started">https://www.osha.gov/emergency-preparedness/getting-started</SourceLink></Bullet>
            <Bullet title="Household Preparedness Score (peer-reviewed)" >— the methodological precedent for a tiered household score: 24 indicators z-transformed and averaged, aligned to the Red Cross framework. <SourceLink href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11025835">https://pmc.ncbi.nlm.nih.gov/articles/PMC11025835</SourceLink></Bullet>
            <Bullet title="HEPI v3 scoring guide (NIEHS)" >— a validated 50-item household preparedness instrument, and the source of the honest note that no evidence-based numeric cutoff between prepared and unprepared exists. <SourceLink href="https://portal.niehs.nih.gov/dr2/unmanaged/files/HEPI_V3_Scoring_Guide_508.pdf">https://portal.niehs.nih.gov/dr2/unmanaged/files/HEPI_V3_Scoring_Guide_508.pdf</SourceLink></Bullet>
            <Bullet title={'ASPE, "Measuring Preparedness"'} >— documents national indices and the lack of consensus on preparedness measurement, which is why this guide's tiers are labeled as PrepVault's framework rather than an authority's threshold. <SourceLink href="https://aspe.hhs.gov/reports/measuring-preparedness">https://aspe.hhs.gov/reports/measuring-preparedness</SourceLink></Bullet>
          </ul>
        </section>

        <section>
          <h2 style={sectionTitle}>Your next step: turn the number into a plan</h2>
          <p style={body}>
            Ready to see your number? Open PrepVault — an offline-first, encrypted dashboard that runs entirely on your device with zero telemetry — and add what you actually hold: water, food, fuel, batteries, medical supplies. The score, the continuity days for each life-support line, and a prioritized list of the highest-point fixes update as you go. The app is designed around exactly this loop: score it, find the weakest line, fix the highest-point gap, recalculate.
          </p>
          <p style={body}>
            If you only take one idea from this guide, make it this: <strong style={{ color: "#e6edf3" }}>don't ask "am I prepared?" — ask "how many days of water, food, power, heat, and communications do I actually hold?"</strong> The answer is a number. The gap is the plan.
          </p>
        </section>

        {/* ── CTA ── */}
        <div style={{ marginTop: 40, padding: "32px", borderRadius: 16, background: "rgba(27,94,32,0.08)", border: "1px solid rgba(27,94,32,0.2)", textAlign: "center" }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 800, color: "#fff" }}>Find your number</h2>
          <p style={{ fontSize: 13, color: "rgba(230,237,243,0.5)", margin: "0 0 22px", lineHeight: 1.6 }}>Open PrepVault and add what you actually hold. Your score, continuity days, and the next highest-point fix update as you go.</p>
          <button onClick={onOpenApp} style={{ padding: "14px 32px", borderRadius: 10, background: "linear-gradient(135deg," + GREEN + ",#0d3d16)", color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 20px rgba(27,94,32,0.35)" }}>Open PrepVault</button>
        </div>
      </article>

      {/* ── Footer ── */}
      <div style={{ padding: "20px 28px 30px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: M }}>PrepVault — Personal Continuity System</div>
        <div style={{ display: "flex", gap: 20, fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: M }}>
          <span>AES-256-GCM</span><span>Offline-First</span><span>Zero Telemetry</span>
        </div>
      </div>
    </div>
  );
}
