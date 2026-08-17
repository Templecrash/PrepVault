import { useEffect } from "react";

export const GUIDE_PATH = "/guide/winter-outage-autonomy";
export const GUIDE_TITLE = "How Long Will Power, Water, Heat, and Food Last in a Winter Outage?";
export const GUIDE_DESCRIPTION =
  "Calculate how many days your power, water, heat, and food will actually last when the grid goes down in winter. Step-by-step continuity math for cold-climate households.";
export const GUIDE_PUBLISHED = "2026-08-17";

const MONO = "'JetBrains Mono',monospace";
const SANS = "'Outfit','DM Sans','Segoe UI',sans-serif";
const ACCENT = "#c8553a";

function upsertMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

const sectionTitle = {
  fontSize: "clamp(20px, 3.2vw, 28px)",
  fontWeight: 800,
  letterSpacing: -0.5,
  lineHeight: 1.2,
  margin: "0 0 14px",
  color: "#fff",
};

const subTitle = {
  fontSize: 11,
  color: "rgba(255,255,255,0.3)",
  textTransform: "uppercase",
  letterSpacing: 3,
  fontWeight: 700,
  marginBottom: 20,
};

const bodyP = {
  fontSize: 15,
  color: "rgba(255,255,255,0.62)",
  lineHeight: 1.75,
  margin: "0 0 16px",
};

const bodyPStrong = { ...bodyP, color: "rgba(255,255,255,0.82)" };

const formulaCard = {
  padding: "16px 20px",
  borderRadius: 12,
  background: "rgba(200,85,58,0.06)",
  border: "1px solid rgba(200,85,58,0.18)",
  borderLeft: "4px solid " + ACCENT,
  fontFamily: MONO,
  fontSize: 15,
  fontWeight: 700,
  color: "#fff",
  margin: "20px 0",
};

const qBlock = {
  padding: "14px 18px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.025)",
  border: "1px solid rgba(255,255,255,0.06)",
  margin: "20px 0",
};

const qTitle = {
  fontSize: 15,
  fontWeight: 800,
  color: "#fff",
  marginBottom: 8,
  lineHeight: 1.4,
};

export default function WinterOutageGuide({ onBack }) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = GUIDE_TITLE + " — PrepVault";

    const url = window.location.origin + GUIDE_PATH;

    upsertMeta("name", "description", GUIDE_DESCRIPTION);
    upsertMeta("property", "og:title", GUIDE_TITLE);
    upsertMeta("property", "og:description", GUIDE_DESCRIPTION);
    upsertMeta("property", "og:type", "article");
    upsertMeta("property", "og:url", url);

    const jsonLd = document.createElement("script");
    jsonLd.type = "application/ld+json";
    jsonLd.id = "prepvault-guide-jsonld";
    jsonLd.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: GUIDE_TITLE,
      description: GUIDE_DESCRIPTION,
      datePublished: GUIDE_PUBLISHED,
      dateModified: GUIDE_PUBLISHED,
      author: { "@type": "Organization", name: "PrepVault" },
      publisher: { "@type": "Organization", name: "PrepVault" },
      mainEntityOfPage: url,
    });
    document.head.appendChild(jsonLd);

    return () => {
      document.title = prevTitle;
      const existing = document.getElementById("prepvault-guide-jsonld");
      if (existing) existing.remove();
    };
  }, []);

  const stepList = (steps) => (
    <div style={{ margin: "0 0 16px" }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "7px 0" }}>
          <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, background: "rgba(200,85,58,0.12)", border: "1px solid rgba(200,85,58,0.25)", color: ACCENT, fontSize: 11, fontWeight: 800, fontFamily: MONO, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
          <span style={{ fontSize: 15, color: "rgba(255,255,255,0.62)", lineHeight: 1.7 }}>{s}</span>
        </div>
      ))}
    </div>
  );

  const tableRows = [
    ["Power", "Fuel stored, burn rate at load, derating, safety margin", "Usable fuel ÷ daily burn"],
    ["Water", "Stored gallons, people, gallons per person per day", "Stored ÷ (people × daily use)"],
    ["Heat", "Fuel on hand in Btu, daily house heat load", "Usable fuel Btu ÷ daily load"],
    ["Food", "Stored servings, people, meals per day", "Stored servings ÷ daily need"],
  ];

  const th = { padding: "12px 14px", textAlign: "left", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.35)", borderBottom: "1px solid rgba(255,255,255,0.08)", whiteSpace: "nowrap" };
  const td = { padding: "14px", fontSize: 13, color: "rgba(255,255,255,0.62)", borderBottom: "1px solid rgba(255,255,255,0.05)", verticalAlign: "top", lineHeight: 1.6 };
  const tdMono = { ...td, fontFamily: MONO, color: "#fff", fontWeight: 700, fontSize: 12.5 };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#fff", fontFamily: SANS }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* ── Nav Bar ── */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(10,12,16,0.8)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#c8553a,#8b2e1a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, fontFamily: MONO, color: "#fff" }}>P</div>
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.5 }}>PrepVault</span>
        </div>
        <button onClick={onBack} style={{ padding: "8px 18px", borderRadius: 8, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>← Back to PrepVault</button>
      </nav>

      {/* ── Article ── */}
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "56px 20px 60px" }}>
        <div style={{ display: "inline-block", padding: "6px 14px", borderRadius: 20, background: "rgba(200,85,58,0.08)", border: "1px solid rgba(200,85,58,0.15)", fontSize: 11, color: ACCENT, fontWeight: 700, fontFamily: MONO, marginBottom: 22, letterSpacing: 1 }}>CONTINUITY MATH</div>

        <h1 style={{ fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 900, margin: "0 0 12px", lineHeight: 1.1, letterSpacing: -1 }}>
          How Long Will Power, Water, Heat, and Food Last in a Winter Outage?
        </h1>
        <p style={{ fontSize: 18, color: "rgba(255,255,255,0.42)", margin: "0 0 12px", lineHeight: 1.6 }}>A cold-climate continuity-math guide</p>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", fontFamily: MONO, marginBottom: 44 }}>Checked {GUIDE_PUBLISHED} · PrepVault</div>

        {/* The four numbers */}
        <h2 style={sectionTitle}>The four numbers that decide whether your plan holds</h2>
        <p style={bodyP}>
          When a winter storm kills the grid, the useful question isn't "how much stuff do I have?" It's "how many days can this household keep running on what I have?" That number is your days of autonomy, and it's really four numbers: power, water, heat, and food. Each one is calculated from different inputs, and the smallest of the four is your real limit, because that's the system that fails first.
        </p>
        <p style={bodyP}>
          Winter outages are routinely measured in days, not hours. During Winter Storm Fern (January 2026), more than a million customers lost power and parts of Mississippi were dark for about two weeks. The 2002 Central Plains ice storm left roughly 650,000 customers without power for up to 14 days. Rural areas with above-ground power lines commonly face 5–7 day outages after major ice storms, according to U.S. EIA context. Plan around days.
        </p>

        {/* Power */}
        <h2 style={{ ...sectionTitle, marginTop: 48 }}>Power: how long will your generator fuel last?</h2>
        <div style={qBlock}>
          <div style={qTitle}>How do I calculate how much gas I need for a power outage?</div>
        </div>
        <div style={formulaCard}>Days of power = usable fuel ÷ daily fuel burn</div>
        {stepList([
          <span><strong style={{ color: "#fff" }}>Find your burn rate.</strong> Your generator's manual or the manufacturer's sheet gives gallons (or pounds of propane, or kWh of battery) per hour at a given load. Burn scales with load — a generator running half the house uses far less than one running everything.</span>,
          <span><strong style={{ color: "#fff" }}>Count usable fuel, not total fuel.</strong> Subtract what you reserve as a backup margin.</span>,
          <span><strong style={{ color: "#fff" }}>Derate for conditions.</strong> Cold temperatures and high altitude reduce engine output and real-world efficiency. The PNNL Generator Runtime Calculator (DOE's method) adjusts consumption for temperature and altitude and adds a safety margin.</span>,
          <span><strong style={{ color: "#fff" }}>Multiply by planned run time.</strong> Daily burn = hourly burn × hours per day you plan to run.</span>,
        ])}
        <p style={bodyP}>
          Two benchmarks ground the math. NFPA 110, the emergency-power standard, calls for a minimum 96-hour fuel supply for emergency and standby generators. For a rough scale reference, one industry estimate puts a 500-gallon propane tank at sustaining a whole-home load for about 5–8 days (an estimate, not measured data). Battery systems are the same math in kWh: days = usable kWh ÷ daily draw.
        </p>
        <p style={bodyP}>
          Two things almost always ride on this number: a well pump (if your water comes from a well) and any electric heating. If they're part of your load, they're part of the daily burn above — power math gates the next two sections.
        </p>

        {/* Water */}
        <h2 style={{ ...sectionTitle, marginTop: 48 }}>Water: how many days of stored water do you have?</h2>
        <p style={bodyP}>
          The Ready.gov baseline is 1 gallon per person per day for drinking and basic sanitation, a 3-day minimum supply, with FEMA recommending a two-week target — the right target when winter storms close roads for days.
        </p>
        <div style={formulaCard}>Days of water = stored gallons ÷ (people × gallons per person per day)</div>
        <p style={bodyP}>
          Two people with 40 stored gallons: 40 ÷ 2 = 20 days of drinking water. A family of four with the same 40 gallons: 10 days. Add what you'll use for flushing and hygiene to your daily total.
        </p>
        <div style={qBlock}>
          <div style={qTitle}>Can I flush the toilet if the power is out?</div>
          <p style={{ ...bodyP, margin: 0 }}>
            If your home is on a well, the answer is usually no. A well pump runs on electricity, so well households lose water pressure immediately when the power drops. For those homes, your water days are the smaller of stored water ÷ daily use and your power days — unless the pump is on generator-backed power. That's the single most common reason a well household's water plan dies before the storm does.
          </p>
        </div>
        <p style={bodyP}>
          In cold climates, plan to keep stored water somewhere it won't freeze, and remember that a tank of frozen water is a wall of ice, not a supply.
        </p>

        {/* Heat */}
        <h2 style={{ ...sectionTitle, marginTop: 48 }}>Heat: how long will your house stay warm without power?</h2>
        <p style={bodyP}>This depends entirely on how you heat.</p>
        <div style={qBlock}>
          <div style={qTitle}>How long will a house stay warm without power?</div>
          <p style={{ ...bodyP, margin: 0 }}>
            For an average home, roughly 8–12 hours after the power goes out — then it cools gradually. That figure is an industry estimate, not measured data, and building-science thermal-lag numbers are analogies rather than household-autonomy evidence. The honest takeaway: if you heat with electricity and have no backup, your heat "days" are counted in hours.
          </p>
        </div>
        <p style={bodyP}>If you heat with fuel — wood, propane, or heating oil — heat autonomy is fuel math:</p>
        <div style={formulaCard}>Days of heat = usable fuel (in Btu) ÷ daily house heat load (Btu per day)</div>
        <p style={bodyP}>
          Your house's daily heat load is the harder input. The standard method is the "how to calculate heat loss in your house" approach: estimate the building's heat loss against a design baseline such as the ASHRAE 99% winter design temperature for your area — the colder the design temperature, the higher your load. Then convert fuel into delivered heat: cordwood gives different Btu per cord by species and moisture content, propane and heating oil carry rated Btu per gallon or pound, and your appliance's efficiency determines how much of that fuel becomes heat.
        </p>
        <p style={bodyPStrong}>
          This is usually the binding constraint in a cold climate. Heat demand is enormous relative to what most households can store, and it only gets worse the further north you go — which is why heat-fuel autonomy deserves more attention than the other three numbers.
        </p>

        {/* Food */}
        <h2 style={{ ...sectionTitle, marginTop: 48 }}>Food: how many days of food do you have?</h2>
        <p style={bodyP}>
          The guidance baselines are a 72-hour minimum, with FEMA's two-week supply as the stronger target for extended outages.
        </p>
        <div style={formulaCard}>Days of food = stored servings ÷ (people × meals per day)</div>
        <p style={bodyP}>
          Count what you actually have in servings — cans, pouches, freeze-dried bags — and divide by your household's daily meal count. A household of four eating three meals a day needs 12 servings a day, so 120 stored servings is 10 days. Extend the math to calories if you track them: total stored calories ÷ your household's daily calorie need.
        </p>
        <p style={bodyP}>
          If the freezer is part of your plan: a well-filled, closed freezer keeps food frozen for about 2–3 days (UGA FACS Extension). After that, follow CDC and FSIS food-safety rules — when in doubt, throw it out, and never taste food to check it.
        </p>

        {/* Put it together */}
        <h2 style={{ ...sectionTitle, marginTop: 48 }}>Put it together: your household's days of autonomy</h2>
        <p style={bodyP}>Now run all four through one worksheet:</p>
        <div style={{ overflowX: "auto", margin: "20px 0 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.015)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr>
                <th style={th}>Domain</th>
                <th style={th}>Inputs you need</th>
                <th style={th}>Formula</th>
                <th style={th}>Your days</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...td, fontWeight: 800, color: "#fff" }}>{r[0]}</td>
                  <td style={td}>{r[1]}</td>
                  <td style={tdMono}>{r[2]}</td>
                  <td style={{ ...td, color: "rgba(255,255,255,0.25)" }}>—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={bodyP}>
          Example household (illustrative, not a real plan): two people, 40 gallons of water, 10 days of stored servings, generator fuel sized for 5 days at planned load, and enough seasoned firewood for 14 days of heat. Water 20 days, food 10 days, power 5 days, heat 14 days. The household's real autonomy is <strong style={{ color: "#fff" }}>5 days</strong> — power fails first, and once the generator fuel is gone, the well and the plan both stop.
        </p>
        <p style={bodyPStrong}>
          Your autonomy is the smallest number in the table, because that's the system that ends the plan. That number is also your upgrade target: get the smallest number up first. If it's power, add fuel toward NFPA 110's 96-hour minimum, or shrink the load. If it's water, push stored volume toward FEMA's two-week target. If it's heat, add a second, non-electric heat path.
        </p>
        <div style={{ margin: "28px 0 20px", padding: "22px 24px", borderRadius: 14, background: "rgba(200,85,58,0.04)", border: "1px solid rgba(200,85,58,0.14)" }}>
          <p style={{ ...bodyP, margin: "0 0 12px" }}>
            PrepVault turns exactly this math into a living picture. It's an offline-first, encrypted preparedness dashboard that computes day-by-day continuity estimates for power, water, heat, and food, tuned to your climate zone, and surfaces the fragilities this calculation exposes as a weighted Preparedness Score. It runs entirely on your device with zero telemetry; optional cloud sync is yours to enable. Calculate by hand first — then keep the picture current as your supplies change.
          </p>
          <button onClick={onBack} style={{ padding: "12px 26px", borderRadius: 10, background: "linear-gradient(135deg,#c8553a,#a3412d)", color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 20px rgba(200,85,58,0.3)" }}>Open PrepVault</button>
        </div>

        {/* Method, sources, limits */}
        <h2 style={{ ...sectionTitle, marginTop: 48 }}>Method, sources, and limits</h2>
        <p style={bodyP}>
          The math is only as good as its inputs. Measure your generator's real burn at your planned load. Weigh or count actual stored fuel and water. Run a real heat-loss calculation for your house rather than a guess. Count real servings, not "about enough." Recheck every number against your household, your property, and your climate zone.
        </p>
        <div style={{ ...subTitle, marginTop: 24 }}>Sources</div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {[
            "Ready.gov (food and water baselines, winter-storm guidance)",
            "FEMA (two-week supply guidance)",
            "CDC and American Red Cross (food and water safety)",
            "FSIS (freezer food-safety rules)",
            "UGA FACS Extension (freezer 2–3 day window)",
            "NFPA 110 (96-hour fuel standard)",
            "PNNL / U.S. DOE (generator runtime method)",
            "U.S. EIA (winter-outage duration context)",
            "ASHRAE (99% winter design temperature heat-loss methodology)",
          ].map((s, i) => (
            <li key={i} style={{ padding: "5px 0", fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, display: "flex", gap: 10 }}>
              <span style={{ color: ACCENT, fontFamily: MONO, fontWeight: 700, flexShrink: 0 }}>•</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
        <p style={{ ...bodyP, marginTop: 24, fontSize: 12.5, color: "rgba(255,255,255,0.35)" }}>
          Checked {GUIDE_PUBLISHED}. The 8–12 hour heat-retention figure is an industry estimate, not measured data. Outage-duration examples come from outage reporting and EIA context and will differ from your local history.
        </p>
      </main>

      {/* ── Footer ── */}
      <div style={{ padding: "20px 28px 30px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: MONO }}>PrepVault — Personal Continuity System</div>
        <div style={{ display: "flex", gap: 20, fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: MONO }}>
          <span>AES-256-GCM</span><span>Offline-First</span><span>Zero Telemetry</span>
        </div>
      </div>
    </div>
  );
}
