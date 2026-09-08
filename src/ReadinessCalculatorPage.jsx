import { useEffect } from "react";

const MONO = "'Geist Mono','JetBrains Mono',monospace";
const ACCENT = "#c8553a";
const GRAD = "linear-gradient(135deg,#c8553a,#a3412d)";

const SCALE_AREAS = [
  { icon: "💧", label: "Water", desc: "Stored water compared with your household's daily drinking and basic hygiene needs." },
  { icon: "🥫", label: "Food", desc: "Stored calories per person per day, not just bags and cans." },
  { icon: "⚡", label: "Power", desc: "Backup capacity compared with the systems your property depends on." },
  { icon: "🔥", label: "Heat", desc: "Whether your home can stay livable during colder months when the power is out." },
  { icon: "🩹", label: "Medical", desc: "First-aid supplies and prescription coverage for the people in your household." },
  { icon: "📡", label: "Communications", desc: "How you would reach help and how family members would check in with each other." },
];

const FAQ = [
  {
    q: "Do I need an account to get my score?",
    a: "No. Your 0 to 100 score, category breakdown, and days-of-supply estimate appear in your browser without an account.",
  },
  {
    q: "Where do my answers go?",
    a: "Nowhere. The calculator processes your answers on your device and does not send them to a server.",
  },
  {
    q: "What does days of supply mean?",
    a: "It is an estimate of how long your household could cover basic needs from the supplies already in your home if you could not restock today.",
  },
  {
    q: "I scored low. What should I do?",
    a: "Start with your lowest category and choose one small action. Add a few days of water, build one week of food, or test your backup power plan. Then take the assessment again and watch the score move.",
  },
  {
    q: "Is this meant to scare me?",
    a: "No. It is a practical self-assessment. The goal is to show you what is already covered and where one useful improvement would help most.",
  },
  {
    q: "How is this different from a simple checklist?",
    a: "A checklist tells you whether you checked a box. This calculator gives you a personalized score, a category breakdown, and an estimated self-sufficiency window based on your household size, property, and stored supplies.",
  },
];

const SCORE_BANDS = [
  { range: "0 to 25", color: "#ef4444", note: "Critical gaps: your stored supplies cover basic needs for only a short stretch." },
  { range: "26 to 50", color: "#f59e0b", note: "Foundation stage: some basics are in place, with clear gaps to close." },
  { range: "51 to 75", color: "#0ea5e9", note: "Solid footing: you have a meaningful buffer, with targeted gaps holding you back." },
  { range: "76 to 100", color: "#22c55e", note: "Strongly prepared: your household has extended coverage across most categories." },
];

export default function ReadinessCalculatorPage() {
  useEffect(() => {
    const origin = window.location.origin;
    const url = origin + "/readiness-calculator";
    const title = "How Prepared Is Your Household? Free Readiness Calculator — PrepVault";
    const description = "Get a private 0 to 100 household readiness score, a category breakdown, and an estimated days-of-supply window. Runs on your device — no sign-up and nothing sent to a server.";

    const prev = { title: document.title };
    const tags = {};
    const apply = (tag, attr, val) => {
      const el = document.createElement(tag);
      el.setAttribute(attr, val);
      document.head.appendChild(el);
      return el;
    };

    document.title = title;
    tags.description = apply("meta", "name", "description"); tags.description.setAttribute("content", description);
    tags.canonical = apply("link", "rel", "canonical"); tags.canonical.setAttribute("href", url);
    tags.ogTitle = apply("meta", "property", "og:title"); tags.ogTitle.setAttribute("content", title);
    tags.ogDescription = apply("meta", "property", "og:description"); tags.ogDescription.setAttribute("content", description);
    tags.ogUrl = apply("meta", "property", "og:url"); tags.ogUrl.setAttribute("content", url);
    tags.ogType = apply("meta", "property", "og:type"); tags.ogType.setAttribute("content", "website");
    tags.ogSite = apply("meta", "property", "og:site_name"); tags.ogSite.setAttribute("content", "PrepVault");

    const jsonLd = document.createElement("script");
    jsonLd.type = "application/ld+json";
    jsonLd.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map(f => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
    document.head.appendChild(jsonLd);

    return () => {
      document.title = prev.title;
      [tags.description, tags.ogTitle, tags.ogDescription, tags.ogUrl, tags.ogType, tags.ogSite].forEach(el => el?.remove());
      tags.canonical?.remove();
      jsonLd.remove();
    };
  }, []);

  const btnPrimary = { display: "inline-block", padding: "14px 30px", borderRadius: 10, background: GRAD, color: "#fff", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 20px rgba(200,85,58,0.3)", textDecoration: "none" };
  const btnGhost = { display: "inline-block", padding: "14px 30px", borderRadius: 10, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textDecoration: "none" };
  const h2 = { margin: "0 0 18px", fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, letterSpacing: -0.4 };
  const p = { margin: "0 0 16px", fontSize: "clamp(13px,1.6vw,15px)", color: "rgba(255,255,255,0.55)", lineHeight: 1.8 };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#fff", fontFamily: "'Outfit','DM Sans','Segoe UI',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes fadeUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
        .rc-content{max-width:820px;margin:0 auto;padding:0 20px}
        .rc-section{padding:44px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
        .rc-areas{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}
        .rc-faq{border-top:1px solid rgba(255,255,255,0.06)}
        .rc-faq details{background:rgba(255,255,255,0.015);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:0;margin-bottom:10px}
        .rc-faq summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;font-size:14px;font-weight:700;color:rgba(255,255,255,0.85)}
        .rc-faq summary::-webkit-details-marker{display:none}
        .rc-faq summary .rc-plus{color:${ACCENT};font-weight:800;flex-shrink:0}
        .rc-faq details[open] .rc-plus{transform:rotate(45deg)}
        .rc-faq .rc-a{padding:0 18px 16px;font-size:13px;color:rgba(255,255,255,0.5);line-height:1.8}
        .rc-table-wrap{overflow-x:auto;margin:18px 0}
        .rc-table{width:100%;border-collapse:collapse;min-width:460px}
        .rc-table th{padding:12px 14px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1.5;color:rgba(255,255,255,0.35);border-bottom:1px solid rgba(255,255,255,0.08)}
        .rc-table td{padding:12px 14px;font-size:13px;color:rgba(255,255,255,0.65);line-height:1.6;border-bottom:1px solid rgba(255,255,255,0.04)}
        .rc-table td:first-child{font-family:${MONO};font-weight:700;color:rgba(255,255,255,0.85);white-space:nowrap}
        .rc-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px}
        @media (max-width:768px){
          .rc-areas{grid-template-columns:1fr 1fr}
          .rc-content{padding:0 16px}
          .rc-section{padding:36px 0}
        }
        @media (max-width:420px){
          .rc-areas{grid-template-columns:1fr}
        }
      `}</style>

      {/* ── Nav Bar ── */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(10,12,16,0.8)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100, gap: 10, flexWrap: "wrap" }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "#fff" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#c8553a,#8b2e1a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, fontFamily: MONO }}>P</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.2 }}>PrepVault</div>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", letterSpacing: 1.5, textTransform: "uppercase" }}>Readiness Calculator</div>
          </div>
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href="/" style={{ padding: "8px 14px", borderRadius: 8, color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>PrepVault Home</a>
          <a href="https://myprepplan.app" style={btnPrimary}>Get Started Free</a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div className="rc-content" style={{ paddingTop: 72, paddingBottom: 8, textAlign: "center", animation: "fadeUp 0.6s ease-out" }}>
        <div style={{ display: "inline-block", padding: "6px 14px", borderRadius: 20, background: "rgba(200,85,58,0.08)", border: "1px solid rgba(200,85,58,0.15)", fontSize: 11, color: ACCENT, fontWeight: 700, fontFamily: MONO, marginBottom: 24, letterSpacing: 1 }}>FREE PREPVAULT TOOL · RUNS ON YOUR DEVICE</div>
        <h1 style={{ fontSize: "clamp(32px,5.5vw,54px)", fontWeight: 900, margin: "0 0 18px", lineHeight: 1.1, letterSpacing: -1 }}>
          How prepared is your household,<br />
          <span style={{ background: "linear-gradient(135deg,#c8553a,#e8724a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>really?</span>
        </h1>
        <p style={{ ...p, fontSize: "clamp(14px,2vw,17px)", maxWidth: 620, margin: "0 auto 20px", color: "rgba(255,255,255,0.45)" }}>
          Get a private 0 to 100 household readiness score, a category breakdown, and an estimated days-of-supply window for your household. The assessment runs entirely on your device. No sign-up is required to see your score, and no data is sent to any server.
        </p>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center", flexWrap: "wrap", margin: "8px 0 40px", fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: MONO }}>
          <span style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>0–100 score</span>
          <span style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>6 categories</span>
          <span style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>Days-of-supply estimate</span>
          <span style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>No sign-up</span>
          <span style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>No data sent</span>
        </div>
      </div>

      {/* ── See where you stand ── */}
      <div className="rc-section rc-content">
        <h2 style={h2}>See where you stand</h2>
        <p style={p}>You do not need a stockpile or a background in preparedness to use this. Answer a few direct questions about your household size, your property, and the supplies you already keep. The calculator scores six areas:</p>
        <div className="rc-areas">
          {SCALE_AREAS.map(a => (
            <div key={a.label} style={{ padding: "16px 18px", borderRadius: 14, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ fontSize: 18, marginBottom: 6 }}>{a.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{a.label}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>{a.desc}</div>
            </div>
          ))}
        </div>
        <p style={p}>Then it combines those answers into one 0 to 100 household readiness score and estimates how many days your household could cover basic needs from what you have stored today.</p>
        <p style={p}>The result is personalized, not generic. The score adjusts for your household size and climate, and it gives you a clear place to start improving.</p>
      </div>

      {/* ── What you get ── */}
      <div className="rc-section rc-content">
        <h2 style={h2}>What you get</h2>
        <p style={p}><strong style={{ color: "rgba(255,255,255,0.9)" }}>A 0 to 100 readiness score.</strong> A single number that reflects how your current supplies compare with common household planning baselines. Use it to see where you are today, then take the assessment again as you improve.</p>
        <div style={{ padding: "20px 22px", borderRadius: 14, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}><strong style={{ color: "rgba(255,255,255,0.9)" }}>A category-by-category breakdown.</strong> See exactly what is covered and what is pulling your score down.</p>
          {SCALE_AREAS.map(a => (
            <p key={a.label} style={{ margin: "0 0 8px", fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ fontFamily: MONO, color: ACCENT, fontWeight: 700 }}>{a.icon}</span>
              <span><strong style={{ color: "rgba(255,255,255,0.75)" }}>{a.label}:</strong> {a.desc}</span>
            </p>
          ))}
        </div>
        <p style={{ ...p, marginTop: 16 }}><strong style={{ color: "rgba(255,255,255,0.9)" }}>An estimated self-sufficiency window.</strong> How many days your current supplies could support your household, based on what you have stored rather than what you hope to have.</p>
        <p style={p}><strong style={{ color: "rgba(255,255,255,0.9)" }}>A clear starting point.</strong> Your lowest category is the most useful place to begin. The calculator helps you see the gap so you can close it with one practical step at a time.</p>
      </div>

      {/* ── How the score is calculated ── */}
      <div className="rc-section rc-content">
        <h2 style={h2}>How the score is calculated</h2>
        <p style={p}>The calculator uses common household preparedness baselines for each category, then adjusts for household size and climate.</p>
        {[
          "Water is measured against a planning baseline of about one gallon per person per day for drinking and basic hygiene.",
          "Food is measured against daily calorie needs for each person in the household.",
          "Power and heat are measured against the real loads your property depends on, such as a well pump, furnace, refrigerator, or critical medical equipment.",
          "Medical and communications are scored from the needs and plans you describe.",
        ].map((li, i) => (
          <p key={i} style={{ margin: "0 0 10px", fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.8, display: "flex", gap: 10 }}>
            <span style={{ fontFamily: MONO, color: ACCENT, fontWeight: 700 }}>—</span>
            <span>{li}</span>
          </p>
        ))}
        <p style={p}>Your category results combine into the 0 to 100 household readiness score. The score is an estimate based on your answers, not a guarantee.</p>
        <div style={{ padding: "20px 22px", borderRadius: 14, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="rc-table-wrap">
            <table className="rc-table">
              <thead>
                <tr><th>Score</th><th>What it suggests</th></tr>
              </thead>
              <tbody>
                {SCORE_BANDS.map(b => (
                  <tr key={b.range}>
                    <td><span className="rc-dot" style={{ background: b.color }} />{b.range}</td>
                    <td>{b.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ ...p, margin: "14px 0 0", fontSize: 12 }}>Use the score as a starting point, not a judgment. Preparedness is built one category at a time.</p>
        </div>
      </div>

      {/* ── Private by design ── */}
      <div className="rc-section rc-content">
        <h2 style={h2}>Private by design</h2>
        <div style={{ padding: "24px 26px", borderRadius: 16, background: "rgba(200,85,58,0.04)", border: "1px solid rgba(200,85,58,0.12)" }}>
          <p style={p}>This calculator is a free PrepVault tool. It runs locally in your browser, so it does not need a server to score your answers.</p>
          <p style={p}>Your answers stay on your device. There is no account requirement, no email request, and no upload. You can use the calculator when you want a private, honest read on where your household stands.</p>
          <a href="#readiness-calculator" style={btnPrimary}>Start the readiness assessment</a>
        </div>
      </div>

      {/* ── Keep building with PrepVault ── */}
      <div className="rc-section rc-content" id="readiness-calculator">
        <h2 style={h2}>Keep building on your score with PrepVault</h2>
        <p style={p}>The calculator shows you where you are today. PrepVault helps you track the supplies behind that score and keep improving over time.</p>
        <p style={p}>PrepVault is a free, offline-first household planner. You can use it to:</p>
        {[
          "Save your household profile and readiness results in one private place.",
          "Track what you have by category, including quantities, expiry dates, and locations.",
          "See your estimated days of supply update as you add supplies.",
          "Focus on the categories that need the most attention.",
          "Keep your planning data on your device.",
        ].map((li, i) => (
          <p key={i} style={{ margin: "0 0 8px", fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.7, display: "flex", gap: 10 }}>
            <span style={{ color: "#22c55e", fontWeight: 800 }}>✓</span>
            <span>{li}</span>
          </p>
        ))}
        <p style={{ ...p, marginTop: 16 }}>The calculator is free, and PrepVault is free to start. No credit card required.</p>
        <a href="https://myprepplan.app" style={btnPrimary}>Create your free PrepVault account</a>
      </div>

      {/* ── FAQ ── */}
      <div className="rc-section rc-content">
        <h2 style={h2}>Frequently asked questions</h2>
        <div className="rc-faq">
          {FAQ.map(f => (
            <details key={f.q}>
              <summary>{f.q}<span className="rc-plus">+</span></summary>
              <div className="rc-a">{f.a}</div>
            </details>
          ))}
        </div>
      </div>

      {/* ── Final CTA ── */}
      <div className="rc-content" style={{ padding: "56px 20px 64px", textAlign: "center" }}>
        <div style={{ padding: "40px 32px", borderRadius: 16, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 style={{ margin: "0 0 10px", fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, letterSpacing: -0.4 }}>Start with a private answer</h2>
          <p style={{ ...p, maxWidth: 560, margin: "0 auto 26px" }}>You cannot close a preparedness gap you cannot see. This calculator gives you an honest, private read on your household's readiness, and PrepVault gives you a free, offline-first way to act on it.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="#readiness-calculator" style={btnPrimary}>Start the readiness assessment</a>
            <a href="https://myprepplan.app" style={btnGhost}>Create your free PrepVault account</a>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ padding: "22px 28px 30px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: MONO }}>PrepVault — Personal Continuity System</div>
        <div style={{ display: "flex", gap: 20, fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: MONO, alignItems: "center", flexWrap: "wrap" }}>
          <a href="/readiness-calculator" style={{ color: "rgba(255,255,255,0.35)", textDecoration: "none" }}>Readiness Calculator</a>
          <a href="https://myprepplan.app" style={{ color: "rgba(255,255,255,0.35)", textDecoration: "none" }}>Create Free Account</a>
          <span>AES-256-GCM</span><span>Offline-First</span><span>Zero Telemetry</span>
        </div>
      </div>
    </div>
  );
}
