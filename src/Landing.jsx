/* ═══════════════════════════════════════════════════════════
   PrepVault Landing Page
   Personal Continuity System — readiness check, privacy-first.
   Approved content per Deliverable 3440.
   ═══════════════════════════════════════════════════════════ */
const M = "'Geist Mono','JetBrains Mono',monospace";

const BANDS = [
  { label: "FORTIFIED", min: 90, color: "#22c55e", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.25)" },
  { label: "PREPARED", min: 75, color: "#84cc16", bg: "rgba(132,204,22,0.08)", border: "rgba(132,204,22,0.25)" },
  { label: "MODERATE", min: 60, color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)" },
  { label: "VULNERABLE", min: 40, color: "#fb923c", bg: "rgba(251,146,60,0.08)", border: "rgba(251,146,60,0.25)" },
  { label: "AT RISK", min: 20, color: "#ef4444", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)" },
  { label: "CRITICAL", min: 0, color: "#dc2626", bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.25)" },
];

const CONTINUITY = [
  { icon: "⚡", label: "Power Hours", desc: "Autonomy for critical loads" },
  { icon: "💧", label: "Water Days", desc: "Stored + filtered supply" },
  { icon: "🔥", label: "Heat Days", desc: "Wood, propane & fuel mix" },
  { icon: "🍱", label: "Caloric Days", desc: "Days of edible calories" },
];

const SCENARIOS = [
  { icon: "📉", label: "Economic Collapse" },
  { icon: "⚡", label: "EMP Attack" },
  { icon: "🌲", label: "Wildfire" },
  { icon: "☢️", label: "Nuclear" },
  { icon: "🦠", label: "Pandemic" },
  { icon: "🔌", label: "Grid Failure" },
  { icon: "🌨️", label: "Winter Storm" },
  { icon: "☀️", label: "Solar Flare" },
  { icon: "🚱", label: "Water Disruption" },
  { icon: "📦", label: "Supply Chain Shock" },
  { icon: "🇷🇺", label: "Russia Conflict" },
  { icon: "🇨🇳", label: "China Conflict" },
  { icon: "🤖", label: "AI Disruption" },
];

const PIN_LAYERS = [
  { icon: "🏠", label: "Buildings" },
  { icon: "🌿", label: "Flora" },
  { icon: "🏞️", label: "Water" },
  { icon: "🦌", label: "Wildlife" },
  { icon: "🥾", label: "Trails" },
  { icon: "📦", label: "Caches" },
  { icon: "🎯", label: "Defense" },
];

const PRIVACY = [
  { icon: "🔐", title: "AES-256-GCM", desc: "Encrypted local storage and encrypted backup export/import." },
  { icon: "🚫", title: "Zero Telemetry", desc: "No tracking, no analytics, no phone-home. Your data never leaves the device." },
  { icon: "🔑", title: "PIN Lock", desc: "4-digit PIN gate for the local app and secure comms." },
  { icon: "💾", title: "Encrypted Backup", desc: "Password-protected backup export. Unreadable without your password." },
];

const navBtn = (label, primary, onClick) => (
  <button
    onClick={onClick}
    style={{
      padding: primary ? "10px 22px" : "8px 18px",
      borderRadius: 8,
      background: primary ? "linear-gradient(135deg,#c8553a,#a3412d)" : "rgba(255,255,255,0.02)",
      color: primary ? "#fff" : "rgba(255,255,255,0.6)",
      border: primary ? "none" : "1px solid rgba(255,255,255,0.08)",
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer",
      fontFamily: "inherit",
      whiteSpace: "nowrap",
    }}
  >
    {label}
  </button>
);

const sectionHead = (eyebrow, title) => (
  <div style={{ textAlign: "center", marginBottom: 34 }}>
    <div style={{ fontSize: 11, color: "#c8553a", textTransform: "uppercase", letterSpacing: 3, fontWeight: 700, fontFamily: M, marginBottom: 10 }}>{eyebrow}</div>
    <h2 style={{ margin: 0, fontSize: "clamp(22px, 3vw, 32px)", fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.2 }}>{title}</h2>
  </div>
);

export default function Landing({ onPrimaryDemo, onCreateAccount, onSignIn }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#fff", fontFamily: "'Outfit','DM Sans','Segoe UI',sans-serif" }}>
      <style>{`
        @keyframes fadeUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes glow { 0%,100%{box-shadow:0 0 30px rgba(200,85,58,0.2)} 50%{box-shadow:0 0 60px rgba(200,85,58,0.35)} }
        .pv-section { max-width: 980px; margin: 0 auto; padding: 70px 20px; }
      `}</style>

      {/* ── Nav ── */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 28px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(10,12,16,0.8)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#c8553a,#8b2e1a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, fontFamily: M, color: "#fff" }}>P</div>
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.5 }}>PrepVault</span>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: M, marginLeft: 4 }}>v3.0</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {navBtn("Sign In", false, onSignIn)}
          {navBtn("Get Started", true, onCreateAccount)}
        </div>
      </nav>

      {/* ── Hero ── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "100px 20px 60px", textAlign: "center", animation: "fadeUp 0.6s ease-out" }}>
        <div style={{ display: "inline-block", padding: "6px 14px", borderRadius: 20, background: "rgba(200,85,58,0.08)", border: "1px solid rgba(200,85,58,0.15)", fontSize: 11, color: "#c8553a", fontWeight: 700, fontFamily: M, marginBottom: 28, letterSpacing: 1 }}>PERSONAL CONTINUITY SYSTEM</div>
        <h1 style={{ fontSize: "clamp(36px, 6vw, 60px)", fontWeight: 900, margin: "0 0 16px", lineHeight: 1.05, letterSpacing: -1 }}>
          Your survival plan,<br />
          <span style={{ background: "linear-gradient(135deg,#c8553a,#e8724a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>encrypted &amp; offline-ready</span>
        </h1>
        <p style={{ fontSize: "clamp(14px, 2vw, 18px)", color: "rgba(255,255,255,0.45)", maxWidth: 640, margin: "0 auto 44px", lineHeight: 1.7 }}>
          PrepVault turns scattered supplies and plans into one continuously updated picture of readiness — a live 100-point score, days-of-supply math, and crisis simulations, all without a cloud account.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginBottom: 20 }}>
          <button onClick={onPrimaryDemo} style={{ padding: "16px 36px", borderRadius: 12, background: "linear-gradient(135deg,#c8553a,#a3412d)", color: "#fff", border: "none", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 24px rgba(200,85,58,0.35)", animation: "glow 3s ease-in-out infinite" }}>Try the Demo →</button>
          <button onClick={onCreateAccount} style={{ padding: "16px 36px", borderRadius: 12, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Create Free Account</button>
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontFamily: M }}>No credit card · Works offline · Your data stays yours</div>
      </div>

      {/* ── Stats ── */}
      <div style={{ maxWidth: 700, margin: "0 auto 40px", padding: "0 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "rgba(255,255,255,0.04)", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
          {[
            { val: "30", label: "Supply Categories" },
            { val: "13", label: "Crisis Scenarios" },
            { val: "AES-256", label: "Encryption" },
            { val: "100%", label: "Offline Capable" },
          ].map((s, i) => (
            <div key={i} style={{ padding: "20px 12px", textAlign: "center", background: "#0a0c10" }}>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: M, color: "#c8553a", marginBottom: 4 }}>{s.val}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Readiness check ── */}
      <section className="pv-section" aria-labelledby="readiness-head">
        {sectionHead("01 — Readiness check", "Know exactly where you stand")}
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", maxWidth: 720, margin: "0 auto 32px", textAlign: "center", lineHeight: 1.7 }}>
          Log inventory across <strong style={{ color: "#fff", fontWeight: 700 }}>30 supply categories</strong> — water, food, medical, firewood, fuel, power, comms, defense, firearms, farm, livestock, bullion, and more. PrepVault computes a live <strong style={{ color: "#fff", fontWeight: 700 }}>Preparedness Score</strong> with six rating bands, from <span style={{ color: "#22c55e", fontWeight: 700 }}>FORTIFIED</span> to <span style={{ color: "#ef4444", fontWeight: 700 }}>CRITICAL</span>.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 32 }}>
          {BANDS.map((b) => (
            <div key={b.label} style={{ padding: "16px 8px", borderRadius: 10, background: b.bg, border: "1px solid " + b.border, textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 800, fontFamily: M, color: b.color, letterSpacing: 0.5 }}>{b.label}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: M, marginTop: 4 }}>{b.min}+</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: M, textTransform: "uppercase", letterSpacing: 2, textAlign: "center", marginBottom: 16 }}>Instant continuity answers</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {CONTINUITY.map((c, i) => (
            <div key={i} style={{ padding: "18px 20px", borderRadius: 12, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(200,85,58,0.08)", border: "1px solid rgba(200,85,58,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{c.icon}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{c.label}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{c.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Simulate and plan ── */}
      <section className="pv-section" aria-labelledby="simulate-head" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        {sectionHead("02 — Simulate and plan", "Test yourself against 13 scenarios")}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 32 }}>
          {SCENARIOS.map((s, i) => (
            <div key={i} style={{ padding: "8px 14px", borderRadius: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", fontSize: 11, color: "rgba(255,255,255,0.6)", fontFamily: M, display: "flex", alignItems: "center", gap: 6 }}>
              <span>{s.icon}</span>{s.label}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          {[
            { icon: "🎯", title: "Opportunity Engine", desc: "Shows the exact score gain of every fix and ranks what to do first — no more buying randomly." },
            { icon: "🚨", title: "Crisis Mode", desc: "Animates the dashboard with a resource countdown and scenario-specific immediate actions." },
            { icon: "📈", title: "Scored Results", desc: "Every simulation ends with a scored result and gap analysis you can act on." },
          ].map((f, i) => (
            <div key={i} style={{ padding: "22px 24px", borderRadius: 14, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ fontSize: 26, marginBottom: 10 }}>{f.icon}</div>
              <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700 }}>{f.title}</h3>
              <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Map and coordinate ── */}
      <section className="pv-section" aria-labelledby="map-head" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        {sectionHead("03 — Map and coordinate", "Know your ground, keep your team tight")}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
          <div style={{ padding: "22px 24px", borderRadius: 14, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ fontSize: 26, marginBottom: 10 }}>🗺️</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700 }}>Esri satellite map</h3>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>Pin your place across <strong style={{ color: "#fff" }}>44 pin types</strong> — buildings, flora, water, wildlife, trails, caches, and defense.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PIN_LAYERS.map((p, i) => (
                <span key={i} style={{ padding: "6px 12px", borderRadius: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", fontSize: 10, color: "rgba(255,255,255,0.6)", fontFamily: M }}>{p.icon} {p.label}</span>
              ))}
            </div>
          </div>
          <div style={{ padding: "22px 24px", borderRadius: 14, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ fontSize: 26, marginBottom: 10 }}>👥</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700 }}>Team coordination</h3>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>Coordinate with encrypted chat, call-signs, a duress phrase, rally points, and shared live locations.</p>
          </div>
        </div>
      </section>

      {/* ── Your data stays yours ── */}
      <section className="pv-section" aria-labelledby="privacy-head" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        {sectionHead("04 — Your data stays yours", "Private by design, offline by default")}
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", maxWidth: 720, margin: "0 auto 32px", textAlign: "center", lineHeight: 1.7 }}>
          Everything runs locally in your browser. The demo loads rich sample data instantly — <strong style={{ color: "#fff" }}>no signup required</strong>.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {PRIVACY.map((p, i) => (
            <div key={i} style={{ padding: "22px 24px", borderRadius: 14, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ fontSize: 26, marginBottom: 10 }}>{p.icon}</div>
              <h3 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, fontFamily: M }}>{p.title}</h3>
              <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "30px 20px 70px", textAlign: "center" }}>
        <div style={{ padding: "44px 32px", borderRadius: 16, background: "rgba(200,85,58,0.04)", border: "1px solid rgba(200,85,58,0.12)" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: "clamp(20px, 3vw, 26px)", fontWeight: 800 }}>Know your number.</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "0 0 26px", lineHeight: 1.7 }}>Try the demo or create your free account — everything runs locally.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={onPrimaryDemo} style={{ padding: "14px 32px", borderRadius: 10, background: "linear-gradient(135deg,#c8553a,#a3412d)", color: "#fff", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 20px rgba(200,85,58,0.3)" }}>Try the Demo →</button>
            <button onClick={onCreateAccount} style={{ padding: "14px 32px", borderRadius: 10, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Create Free Account</button>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={{ padding: "20px 28px 30px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: M }}>PrepVault — Personal Continuity System</div>
        <div style={{ display: "flex", gap: 20, fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: M }}>
          <span>AES-256-GCM</span><span>Offline-First</span><span>Zero Telemetry</span>
        </div>
      </footer>
    </div>
  );
}
