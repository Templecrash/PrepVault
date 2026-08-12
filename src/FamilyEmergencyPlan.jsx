import { useEffect } from "react";

const M = "'Geist Mono','JetBrains Mono', monospace";
const ACCENT = "#c8553a";

const CITATIONS = [
  { name: "Ready.gov — Make a Plan", url: "https://www.ready.gov/plan" },
  { name: "American Red Cross — Make a Plan / Emergency Preparedness", url: "https://www.redcross.org/get-help/how-to-prepare-for-emergencies/make-a-plan.html" },
  { name: "FEMA — Food and Water in an Emergency", url: "https://www.fema.gov/pdf/library/foodwater.pdf" },
];

export default function FamilyEmergencyPlan() {
  useEffect(() => {
    document.title = "How to Make a Family Emergency Plan: A Printable Template | PrepVault";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "A step-by-step guide to building a family emergency plan — contacts, meeting places, communication plan, and a 72-hour kit — with a printer-friendly template. Covers Ready.gov, American Red Cross, and FEMA guidance.");
    if (typeof window !== "undefined" && window.scrollTo) window.scrollTo(0, 0);
  }, []);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "How to Make a Family Emergency Plan: A Printable Template",
    "description": "A step-by-step guide to building a family emergency plan, with a printer-friendly template covering contacts, meeting places, communication plans, and a 72-hour kit.",
    "author": { "@type": "Organization", "name": "PrepVault" },
    "publisher": { "@type": "Organization", "name": "PrepVault" },
    "datePublished": "2026-08-12",
    "dateModified": "2026-08-12",
    "mainEntityOfPage": "https://prepvault-xi.vercel.app/family-emergency-plan",
  };

  const h1 = { fontSize: "clamp(32px, 5vw, 46px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: -0.5, margin: "0 0 16px" };
  const h2 = { fontSize: 20, fontWeight: 800, margin: "0 0 12px" };
  const p = { fontSize: 15, color: "rgba(255,255,255,0.62)", lineHeight: 1.75, margin: "0 0 16px" };
  const li = { fontSize: 15, color: "rgba(255,255,255,0.62)", lineHeight: 1.7, margin: "0 0 8px" };
  const link = { color: ACCENT, textDecoration: "none", fontWeight: 600 };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#fff", fontFamily: "'Outfit','DM Sans','Segoe UI',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Nav */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(10,12,16,0.8)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "#fff" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#c8553a,#8b2e1a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, fontFamily: M, color: "#fff" }}>P</div>
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.5 }}>PrepVault</span>
        </a>
        <a href="/" style={{ padding: "8px 18px", borderRadius: 8, background: "linear-gradient(135deg,#c8553a,#a3412d)", color: "#fff", textDecoration: "none", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>Open the App</a>
      </nav>

      {/* Article body */}
      <article style={{ maxWidth: 720, margin: "0 auto", padding: "60px 20px 80px" }}>
        <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", marginBottom: 16 }}>Family Preparedness Guide</div>
        <h1 style={h1}>How to Make a Family Emergency Plan: A Printable Template</h1>
        <p style={{ ...p, color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 40 }}>
          Sources: {CITATIONS.map((c, i) => (
            <span key={c.url}>{i > 0 && " · "}<a href={c.url} target="_blank" rel="noopener noreferrer" style={link}>{c.name}</a></span>
          ))}
        </p>

        <p style={p}>A family emergency plan keeps your household on the same page when you're not in the same place. The moment a disaster hits, phone lines jam, cell towers overload, and the people you need can be unreachable. A written plan fixes the two things that fail under stress: knowing how to reconnect and knowing what to do next.</p>
        <p style={p}>As Ready.gov's Make a Plan guide puts it, you may not be together if a disaster strikes. The entire job of a plan is to answer what happens then. And a real plan takes less than an hour to write.</p>
        <p style={p}>This guide walks through every element that emergency-management and preparedness authorities recommend a household plan cover, then gives you a printer-friendly template you can fill out, pin by the door, fold into a go-bag, and store as a digital copy. Fill it once, update it twice a year, and your household will have an answer on paper.</p>

        <h2 style={h2}>What a family emergency plan is and is not</h2>
        <p style={p}>A family emergency plan is not a stockpile and not a go-bag. Those are supplies. A plan is a written set of answers to a handful of questions:</p>
        <ul style={{ paddingLeft: 20, margin: "0 0 16px" }}>
          <li style={li}>Where do we meet if we're apart and can't reach home?</li>
          <li style={li}>What route do we take if we have to evacuate?</li>
          <li style={li}>Who do we call when the local lines are down?</li>
          <li style={li}>What does each person need inside an emergency — medications, glasses, pets, service animals, kids, dietary needs?</li>
          <li style={li}>What do we do when power, water, or heat is gone for days?</li>
        </ul>
        <p style={p}>Authorities keep the shape of that plan consistent. <a href={CITATIONS[0].url} target="_blank" rel="noopener noreferrer" style={link}>Ready.gov's Make a Plan</a> guidance boils it to five steps: know how you'll receive emergency alerts, decide your shelter plan, pick an evacuation route, build a family communication plan, and keep your emergency kit updated. Then you assess your household's specific needs and practice the plan.</p>

        <h2 style={h2}>Step 1: Choose your contacts</h2>
        <p style={p}>The single most important element in any family plan is an out-of-area contact.</p>
        <p style={p}>Emergency planners recommend you each pick the same person who lives far enough away that they are unaffected by the same emergency. Because local calls and texts are often the first thing to fail, that faraway contact acts as a message drop: everyone calls or texts the same person so the family knows who is safe.</p>
        <p style={p}>Beyond the out-of-area contact, the <a href={CITATIONS[1].url} target="_blank" rel="noopener noreferrer" style={link}>American Red Cross</a> recommends choosing two out-of-area and three local neighborhood contacts, and carrying contact cards in every wallet plus a copy in the emergency kit. After a disaster, prefer text or email to phone calls — lines get overwhelmed, and short texts are more likely to get through.</p>

        <h2 style={h2}>Step 2: Agree on meeting places and routes</h2>
        <p style={p}>Decide on two different kinds of meeting places:</p>
        <ol style={{ paddingLeft: 20, margin: "0 0 16px" }}>
          <li style={li}>A spot near your home for local emergencies, like a fire.</li>
          <li style={li}>A spot outside your neighborhood or town for larger disasters that force you out.</li>
        </ol>
        <p style={p}>Planning guidance is explicit that you should also identify two routes out of your neighborhood — the first can be blocked, so the second exists for a reason. Inside the house, learn two ways out of every room; for upper floors, a second way out can be an escape ladder nearby.</p>

        <h2 style={h2}>Step 3: Build your communication plan</h2>
        <p style={p}>A communication plan covers what to do when networks are down and who checks in with whom. Your plan should state that each member texts the out-of-area contact first, in a set order, so a single thread tells everyone who is safe. Put the numbers for utilities, emergency services, and your local contacts on the card alongside family numbers, and keep a paper copy in the kit — not just in your phone, which may be dead.</p>

        <h2 style={h2}>Step 4: Match the plan to your people</h2>
        <p style={p}>A plan that fits one household may miss another. Build yours around the people who are actually in it:</p>
        <ul style={{ paddingLeft: 20, margin: "0 0 16px" }}>
          <li style={li}><strong style={{ color: "#fff" }}>Medical needs</strong> — prescriptions, refills, and powered medical equipment.</li>
          <li style={li}><strong style={{ color: "#fff" }}>Pets and service animals</strong> — food, water, leash or carrier, medications, and a photo of you with your pet. Find out now whether nearby shelters, kennels, or pet-friendly hotels can take pets.</li>
          <li style={li}><strong style={{ color: "#fff" }}>Kids and their routines</strong>; older adults; anyone with disabilities or access or functional needs.</li>
          <li style={li}><strong style={{ color: "#fff" }}>Dietary needs</strong>, so stored food actually works for the family.</li>
        </ul>
        <p style={p}>Write these into the template so nothing is left to memory.</p>

        <h2 style={h2}>Step 5: Build your 72-hour kit — and a two-week home supply</h2>
        <p style={p}>Authorities are unusually consistent here. Water is 1 gallon per person per day. The American Red Cross recommends a 3-day supply for evacuation and a 2-week supply for home; Ready.gov says have your own supplies for at least three days and possibly longer. <a href={CITATIONS[2].url} target="_blank" rel="noopener noreferrer" style={link}>FEMA's guide</a> adds that a normally active person needs at least two quarts a day just to drink, and that children, nursing mothers, and people in hot environments need more.</p>
        <p style={p}>The baseline kit from the American Red Cross combines: water, food, flashlight, a battery-powered or hand-crank radio (a NOAA Weather Radio if you can), extra batteries, a first aid kit, a 7-day supply of medications and medical items, a multi-purpose tool, sanitation and hygiene items, copies of personal documents, a charged phone with chargers, family and emergency contact info, extra cash, an emergency blanket, and maps. Ready.gov adds a whistle, matches in a waterproof container, and a sleeping bag or warm blanket per person.</p>
        <p style={p}>Food guidance is qualitative rather than precise. FEMA notes that, unlike water, food can be safely rationed — except for children and pregnant women — so the aim is to stock enough well-balanced food for your household for three days on the go and two weeks at home. In an extended outage, hidden water is available from the water heater tank, the pipes, and ice cubes, and frozen food in a well-filled, well-insulated freezer stays safe for at least two days.</p>
        <p style={p}>Review the kit every six months and replace near-expiration items, especially meds.</p>

        <h2 style={h2}>Step 6: Practice — twice a year</h2>
        <p style={p}>A plan you never rehearse is two pages of good intentions. The American Red Cross recommends practicing fire drills and neighborhood evacuation routes twice a year — a useful cue is to do it when you change your clocks. Ready.gov recommends a home fire drill at least twice a year, two ways out of every room, a safe meeting spot a safe distance from the house, and practicing getting out in under two minutes.</p>
        <p style={p}>Use each review season to confirm contact numbers are current, kids are old enough to dial the out-of-area contact, and the kit still fits everyone.</p>

        <h2 style={h2}>Step 7: Keep your plan on paper and in a file</h2>
        <p style={p}>Authorities support keeping both forms. Ready.gov offers a fillable Make a Family Emergency Plan form plus a Family Communication Plan card, and separately recommends you save important documents to the cloud. Keep a physical copy in each member's backpack or notebook, a copy in the kit, and a copy in your phone. In an off-grid event, paper — not a device — is what you can still read.</p>
        <p style={p}>That's the part where PrepVault earns its place. PrepVault is an offline-first, encrypted emergency preparedness dashboard that tracks the supplies behind your plan across dozens of categories, scores your household's readiness, and simulates how you'd fare across 13 scenarios including grid failure, winter storm, pandemic, and EMP. Because it runs on your device with AES-256 encryption and no telemetry, your data never leaves unless you enable optional cloud sync — a plan that lives offline, exactly like the paper copy in your go-bag. It turns your 72-hour supply and two-week pantry into a live Preparedness Score and per-resource day counts instead of a guess.</p>

        {/* ═══ Printable Template ═══ */}
        <div style={{ marginTop: 40, padding: "32px 28px", borderRadius: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 style={{ ...h2, marginBottom: 6 }}>Printable family emergency plan template</h2>
          <p style={{ ...p, fontSize: 13, marginBottom: 24 }}>Fill this in, print one for the fridge and one per go-bag, and keep a digital copy on every phone.</p>

          <TemplateSection title="Household details" items={[
            "Household name: __________",
            "Plan created / updated: __________",
            "Primary contact (home): ______________ Phone: __________",
            "Address & safety hazard notes: __________",
          ]} />

          <TemplateSection title="Emergency contacts" items={[
            "Out-of-area contact: __________ Phone: __________ Email: __________",
            "Backup out-of-area contact: __________ Phone: __________",
            "Local contacts (choose three):",
            "  1. ___________________ Phone: __________",
            "  2. ___________________ Phone: __________",
            "  3. ___________________ Phone: __________",
            "Utility/other numbers: __________",
          ]} />

          <TemplateSection title="Meeting places" items={[
            "Near-home meeting spot: __________",
            "Out-of-neighborhood meeting spot: __________",
            "Two evacuation routes out of the neighborhood:",
            "  Route A: __________",
            "  Route B: __________",
            "Two ways out of each room (note escape ladder rooms): __________",
          ]} />

          <TemplateSection title="Communication plan" items={[
            "Check-in order: __________",
            "Everyone texts the out-of-area contact: ☐ yes",
            "Preferred channel when lines are busy: ☐ text / ☐ email / ☐ other: __________",
          ]} />

          <TemplateSection title="Household needs" items={[
            "Person 1 needs: __________",
            "Person 2 needs: __________",
            "Medical / prescriptions / powered equipment: __________",
            "Pets / service animals (food, water, leash, meds, photo): __________",
            "Dietary needs: __________",
          ]} />

          <TemplateSection title="72-hour and home kit" items={[
            "Water: 1 gal/person/day → 3-day supply for the go-bag, 2-week supply for home. Quantity needed: __________",
            "Food for 3 days (go-bag) and 2 weeks (home): __________",
            "First aid kit, medications (7-day), flashlight, hand-crank/NOAA radio, extra batteries, multi-purpose tool, hygiene items, cash, documents, maps, blanket, whistle: ☐ all packed",
            "Kit review date (every 6 months): __________",
          ]} />

          <TemplateSection title="Practice schedule" items={[
            "Fire drill (twice a year): dates __________",
            "Evacuation / communication drill (twice a year): dates __________",
            "Kit review (every 6 months): dates __________",
          ]} />
        </div>

        {/* ═══ Closing ═══ */}
        <h2 style={{ ...h2, marginTop: 40 }}>Make your plan, then make it real</h2>
        <p style={p}>Writing the plan is the fast part. The durable part is updating it twice a year, rehearsing the drills, sizing the kit to the people in your house, and keeping a paper copy where a dead phone can't reach. Do that once and your family has a real answer for the moment they're apart.</p>
        <p style={p}>PrepVault can carry the same plan forward in encrypted, offline form, score your readiness, and tell you in advance which of the 13 scenarios your household is prepared for.</p>

        <div style={{ marginTop: 32, padding: "32px", borderRadius: 16, background: "rgba(200,85,58,0.04)", border: "1px solid rgba(200,85,58,0.12)", textAlign: "center" }}>
          <a href="/" style={{ display: "inline-block", padding: "14px 36px", borderRadius: 10, background: "linear-gradient(135deg,#c8553a,#a3412d)", color: "#fff", textDecoration: "none", fontSize: 15, fontWeight: 700, fontFamily: "inherit", boxShadow: "0 4px 20px rgba(200,85,58,0.3)" }}>Start your plan at PrepVault</a>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: M, marginTop: 12 }}>No credit card · Works offline · Your data stays yours</div>
        </div>
      </article>

      {/* Footer */}
      <div style={{ padding: "20px 28px 30px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/" style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: M, textDecoration: "none" }}>PrepVault — Personal Continuity System</a>
        <div style={{ display: "flex", gap: 20, fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: M }}>
          <span>AES-256-GCM</span><span>Offline-First</span><span>Zero Telemetry</span>
        </div>
      </div>
    </div>
  );
}

function TemplateSection({ title, items }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, margin: "0 0 8px", color: "#fff" }}>{title}</h3>
      <ul style={{ paddingLeft: 4, margin: 0, listStyle: "none" }}>
        {items.map((line, i) => (
          <li key={i} style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.9, fontFamily: M, whiteSpace: "pre-wrap" }}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
