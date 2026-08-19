import { useEffect } from "react";

const ROUTE_PATH = "/guides/days-of-supply-per-person";

const GUIDE_TITLE = "Days of Supply per Person: How Much Food and Water to Store for Your Household";
const GUIDE_DESCRIPTION =
  "How many days of food and water should you store per person? The per-person answer: 1 gallon of water and 2,000–2,400 calories of food per day, for any number of days — plus a have-vs-need gap-closing step.";

const WATER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 470" role="img" aria-labelledby="w-title w-desc">
  <title id="w-title">Water to store per person, by days of supply</title>
  <desc id="w-desc">At 1 gallon per person per day: 3 days = 3 gallons (minimum), 7 days = 7 gallons, 14 days = 14 gallons (two-week target), 30 days = 30 gallons, 90 days = 90 gallons.</desc>
  <rect width="840" height="470" fill="#ffffff"/>
  <text x="420" y="42" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" fill="#1B5E20">Water to store per person, by days of supply</text>
  <text x="420" y="64" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#666666">1 gallon per person per day, from Ready.gov and CDC</text>

  <text x="270" y="96" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="17" fill="#333333">3 days</text>
  <rect x="280" y="78" width="18" height="30" fill="#E65100"/>
  <text x="306" y="97" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#333333">3 gallons — 72-hour minimum</text>

  <text x="270" y="172" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="17" fill="#333333">7 days</text>
  <rect x="280" y="154" width="42" height="30" fill="#8BC34A"/>
  <text x="330" y="173" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#333333">7 gallons — 1 week</text>

  <text x="270" y="248" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="17" fill="#333333">14 days</text>
  <rect x="280" y="230" width="84" height="30" fill="#1B5E20"/>
  <text x="372" y="249" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#1B5E20">14 gallons — two-week target</text>

  <text x="270" y="324" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="17" fill="#333333">30 days</text>
  <rect x="280" y="306" width="180" height="30" fill="#4CAF50"/>
  <text x="468" y="325" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#333333">30 gallons — 1 month</text>

  <text x="270" y="400" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="17" fill="#333333">90 days</text>
  <rect x="280" y="382" width="540" height="30" fill="#2E7D32"/>
  <text x="828" y="401" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#333333">90 gallons — 3 months</text>

  <line x1="364" y1="70" x2="364" y2="420" stroke="#999999" stroke-dasharray="5 5"/>
  <text x="372" y="440" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#666666">Dashed line: the 14-gallon two-week target per person</text>
</svg>`;

const METHOD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 460" role="img" aria-labelledby="f-title f-desc">
  <title id="f-title">The days-of-supply-per-person method</title>
  <desc id="f-desc">Water: days times 1 gallon per person per day equals gallons per person. Food: days times 2,000 to 2,400 calories per person per day equals calories per person. Then multiply each result by the number of people in your household.</desc>
  <rect width="840" height="460" fill="#ffffff"/>

  <rect x="40" y="30" width="760" height="130" rx="12" fill="#F1F8E9" stroke="#1B5E20" stroke-width="2"/>
  <text x="70" y="70" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" fill="#1B5E20">Water</text>
  <text x="70" y="105" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold" fill="#1B5E20">Days × 1 gallon per person per day = gallons per person</text>
  <text x="70" y="138" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#555555">Covers drinking, cooking, and basic hygiene (Ready.gov, CDC).</text>

  <rect x="40" y="190" width="760" height="130" rx="12" fill="#FFF8E1" stroke="#B26A00" stroke-width="2"/>
  <text x="70" y="230" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" fill="#B26A00">Food</text>
  <text x="70" y="265" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold" fill="#B26A00">Days × 2,000–2,400 calories per day = calories per person</text>
  <text x="70" y="298" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#555555">Then divide by the calories per serving on the labels of the food you actually store.</text>

  <rect x="40" y="350" width="760" height="80" rx="12" fill="#1B5E20"/>
  <text x="420" y="390" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" fill="#ffffff">Then multiply the per-person result by the number of people in your household</text>
  <text x="420" y="416" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#C8E6C9">That final number is your household's days of supply per person.</text>
</svg>`;

const LOOP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 560" role="img" aria-labelledby="g-title g-desc">
  <title id="g-title">Close the gap between what you have and what you need</title>
  <desc id="g-desc">Four steps in a loop: pick your day count; do the per-person math; compare what you have against what you need per category; then rotate by expiry date and restock to close the gap. Repeat each season.</desc>
  <rect width="840" height="560" fill="#ffffff"/>
  <defs>
    <marker id="arrowG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#1B5E20"/>
    </marker>
  </defs>

  <rect x="60" y="40" width="300" height="110" rx="12" fill="#F1F8E9" stroke="#1B5E20" stroke-width="2"/>
  <text x="210" y="80" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" fill="#1B5E20">1. Pick your day count</text>
  <text x="210" y="108" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#555555">3 days, 2 weeks, 30, 90+</text>
  <text x="210" y="132" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#777777">Start at the 72-hour minimum</text>

  <rect x="480" y="40" width="300" height="110" rx="12" fill="#FFF8E1" stroke="#B26A00" stroke-width="2"/>
  <text x="630" y="80" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" fill="#B26A00">2. Do the per-person math</text>
  <text x="630" y="108" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#555555">Water: 1 gallon per day</text>
  <text x="630" y="132" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#555555">Food: 2,000–2,400 calories per day</text>

  <rect x="480" y="310" width="300" height="110" rx="12" fill="#E3F2FD" stroke="#1565C0" stroke-width="2"/>
  <text x="630" y="350" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" fill="#1565C0">3. Compare have vs. need</text>
  <text x="630" y="378" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#555555">Per supply category</text>
  <text x="630" y="402" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#555555">Per person, for your day count</text>

  <rect x="60" y="310" width="300" height="110" rx="12" fill="#E8F5E9" stroke="#2E7D32" stroke-width="2"/>
  <text x="210" y="350" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" fill="#2E7D32">4. Rotate and close the gap</text>
  <text x="210" y="378" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#555555">Restock by expiry date</text>
  <text x="210" y="402" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#555555">Track what you actually consume</text>

  <text x="420" y="240" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="bold" fill="#1B5E20">Days of supply per person</text>
  <text x="420" y="268" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#666666">Repeat every season — plans age as people and supplies do.</text>

  <path d="M 360 95 C 400 62, 435 62, 468 92" fill="none" stroke="#1B5E20" stroke-width="2.5" marker-end="url(#arrowG)"/>
  <path d="M 630 160 L 630 300" fill="none" stroke="#1B5E20" stroke-width="2.5" marker-end="url(#arrowG)"/>
  <path d="M 480 365 L 370 365" fill="none" stroke="#1B5E20" stroke-width="2.5" marker-end="url(#arrowG)"/>
  <path d="M 210 300 L 210 160" fill="none" stroke="#1B5E20" stroke-width="2.5" marker-end="url(#arrowG)"/>
</svg>`;

const BRAND_GREEN = "#1B5E20";
const BRAND_GREEN_DARK = "#14401a";

function Figure({ svg, caption }) {
  return (
    <figure className="g-figure">
      <div className="g-figure-box" dangerouslySetInnerHTML={{ __html: svg }} />
      {caption ? <figcaption className="g-caption">{caption}</figcaption> : null}
    </figure>
  );
}

export default function GuideDaysOfSupply() {
  useEffect(() => {
    const previousTitle = document.title;
    const origin = window.location.origin;
    const url = origin + ROUTE_PATH;

    document.title = GUIDE_TITLE;

    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", GUIDE_DESCRIPTION);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", url);

    const jsonld = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Article",
          headline: GUIDE_TITLE,
          description: GUIDE_DESCRIPTION,
          author: { "@type": "Organization", name: "PrepVault" },
          publisher: { "@type": "Organization", name: "PrepVault" },
          datePublished: "2026-08-19",
          dateModified: "2026-08-19",
          inLanguage: "en-US",
          mainEntityOfPage: url,
          url: url,
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "PrepVault", item: origin + "/" },
            { "@type": "ListItem", position: 2, name: "Days of Supply per Person", item: url },
          ],
        },
      ],
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "prepvault-guide-jsonld";
    script.textContent = JSON.stringify(jsonld);
    document.head.appendChild(script);

    return () => {
      document.title = previousTitle;
      const s = document.getElementById("prepvault-guide-jsonld");
      if (s) s.remove();
    };
  }, []);

  return (
    <div className="g-guide">
      <style>{`
        .g-guide { min-height: 100vh; background: #ffffff; color: #1f2937; font-family: 'Outfit', 'DM Sans', 'Segoe UI', -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }
        .g-guide * { box-sizing: border-box; }
        .g-guide a { text-decoration: none; }
        .g-article a:hover, .g-sources a:hover, .g-crumb a:hover, .g-footer a:hover { text-decoration: underline; }
        .g-article a { color: ${BRAND_GREEN}; }
        .g-sources a { color: ${BRAND_GREEN}; }
        .g-top { position: sticky; top: 0; z-index: 100; background: #ffffff; border-bottom: 1px solid #e5e7eb; }
        .g-top-inner { max-width: 860px; margin: 0 auto; padding: 14px 20px; display: flex; align-items: center; gap: 10px; }
        .g-logo { display: flex; align-items: center; gap: 9px; color: #111827; text-decoration: none; font-weight: 800; font-size: 15px; }
        .g-logo:hover { text-decoration: none; }
        .g-logo-mark { width: 30px; height: 30px; border-radius: 8px; background: linear-gradient(135deg, ${BRAND_GREEN}, ${BRAND_GREEN_DARK}); display: inline-flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 13px; font-family: 'Geist Mono', 'JetBrains Mono', monospace; }
        .g-top-right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
        .g-back { font-size: 13px; font-weight: 600; color: #374151; }
        .g-cta { font-size: 13px; font-weight: 700; color: #fff; background: linear-gradient(135deg, ${BRAND_GREEN}, ${BRAND_GREEN_DARK}); padding: 8px 16px; border-radius: 8px; }
        .g-cta:hover { text-decoration: none; }
        .g-wrap { max-width: 860px; margin: 0 auto; padding: 32px 20px 72px; }
        .g-crumb { font-size: 12px; color: #6b7280; margin-bottom: 20px; }
        .g-crumb a { color: ${BRAND_GREEN}; }
        .g-crumb span { margin: 0 6px; color: #9ca3af; }
        .g-title { font-size: clamp(28px, 5vw, 40px); line-height: 1.15; letter-spacing: -0.5px; font-weight: 800; color: #111827; margin: 0 0 14px; }
        .g-meta { font-size: 13px; color: #6b7280; margin-bottom: 28px; }
        .g-meta b { color: #374151; }
        .g-article { font-size: 17px; line-height: 1.75; }
        .g-article p { margin: 0 0 20px; color: #374151; }
        .g-article h2 { font-size: 24px; font-weight: 800; color: #111827; margin: 40px 0 14px; letter-spacing: -0.3px; }
        .g-article h3 { font-size: 18px; font-weight: 700; color: #111827; margin: 28px 0 10px; }
        .g-article ul, .g-article ol { margin: 0 0 20px; padding-left: 24px; color: #374151; }
        .g-article li { margin-bottom: 8px; }
        .g-article strong { color: #111827; }
        .g-lead { font-size: 19px; line-height: 1.65; color: #1f2937; }
        .g-table { width: 100%; border-collapse: collapse; margin: 0 0 24px; font-size: 15px; }
        .g-table th, .g-table td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        .g-table th { background: #f3faf3; color: ${BRAND_GREEN}; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
        .g-table tr:last-child td { border-bottom: none; }
        .g-figure { margin: 28px 0; }
        .g-figure-box { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 8px; overflow-x: auto; }
        .g-figure-box svg { display: block; width: 100%; height: auto; }
        .g-caption { display: block; margin-top: 10px; font-size: 13px; color: #6b7280; font-style: italic; }
        .g-example { background: #f6fbf6; border: 1px solid #dbeadd; border-left: 4px solid ${BRAND_GREEN}; border-radius: 10px; padding: 18px 20px; margin: 0 0 20px; }
        .g-example h4 { margin: 0 0 8px; font-size: 15px; font-weight: 700; color: ${BRAND_GREEN_DARK}; }
        .g-example ul { margin: 0; padding-left: 18px; }
        .g-example li { margin-bottom: 6px; font-size: 15px; }
        .g-cta-box { margin: 36px 0; padding: 26px 28px; border-radius: 14px; background: linear-gradient(135deg, ${BRAND_GREEN}, ${BRAND_GREEN_DARK}); color: #fff; }
        .g-cta-box h3 { color: #fff; margin: 0 0 8px; font-size: 20px; font-weight: 800; }
        .g-cta-box p { color: rgba(255,255,255,0.85); margin: 0 0 18px; font-size: 15px; line-height: 1.6; }
        .g-cta-box a { display: inline-block; background: #ffffff; color: ${BRAND_GREEN_DARK}; font-weight: 700; font-size: 14px; padding: 11px 22px; border-radius: 8px; }
        .g-cta-box a:hover { text-decoration: none; }
        .g-sources { background: #fafafa; border: 1px solid #ececec; border-radius: 10px; padding: 20px 22px; margin: 24px 0; font-size: 14px; }
        .g-sources ul { margin: 0; padding-left: 18px; }
        .g-sources li { margin-bottom: 6px; word-break: break-word; }
        .g-note { font-size: 14px; color: #6b7280; margin: 8px 0 0; }
        .g-footer { border-top: 1px solid #e5e7eb; padding: 22px 20px 32px; text-align: center; font-size: 13px; color: #6b7280; }
        .g-footer a { color: ${BRAND_GREEN}; font-weight: 600; }
        @media (max-width: 640px) {
          .g-top-right .g-back { display: none; }
          .g-article { font-size: 16px; }
          .g-figure-box { padding: 4px; }
        }
      `}</style>

      <div className="g-top">
        <div className="g-top-inner">
          <a className="g-logo" href="/">
            <span className="g-logo-mark">P</span>
            PrepVault
          </a>
          <div className="g-top-right">
            <a className="g-back" href="/">← Back to PrepVault</a>
            <a className="g-cta" href="/">Get PrepVault</a>
          </div>
        </div>
      </div>

      <div className="g-wrap">
        <div className="g-crumb">
          <a href="/">PrepVault</a>
          <span>/</span>
          Guides
          <span>/</span>
          Days of Supply per Person
        </div>

        <article className="g-article">
          <h1 className="g-title">{GUIDE_TITLE}</h1>
          <div className="g-meta">
            <b>PrepVault</b> · Updated August 19, 2026 · {`5 min read`}
          </div>

          <h2>How many days of food and water should you store per person?</h2>
          <p className="g-lead">
            The question that starts every stockpile — <em>how much food storage do I need?</em> — has a stable, checkable answer, and it is built from two per-person numbers:
          </p>
          <ul>
            <li><strong>Water:</strong> 1 gallon per person per day.</li>
            <li><strong>Food:</strong> 2,000–2,400 calories per person per day.</li>
          </ul>
          <p>
            Multiply each rate by the number of days you want to cover, then by the number of people in your household. That is your <strong>days of supply per person</strong>, and it is all the arithmetic you need to size food and water for a 3-day / 72-hour supply, a 2-week supply, 30 days, or longer.
          </p>
          <p>
            Emergency-management agencies set the floor: a <strong>3-day (72-hour) minimum</strong> and a <strong>2-week supply if you can</strong>, which works out to <strong>14 gallons of water per person</strong> (<a href="https://www.ready.gov/water" target="_blank" rel="noopener noreferrer">Ready.gov</a>, <a href="https://www.cdc.gov/water-emergency/about/how-to-create-and-store-an-emergency-water-supply.html" target="_blank" rel="noopener noreferrer">CDC</a>, <a href="https://www.canada.ca/en/health-canada/services/food-drinking-water-safe-emergency.html" target="_blank" rel="noopener noreferrer">Canada.ca</a>). Beyond that minimum, the same multiplication extends the plan to any horizon you choose — which is exactly the gap this guide fills.
          </p>

          <h2>What "days of supply per person" means</h2>
          <p>
            A "days of supply" number is simply <em>how long your stored food and water would last your household at a defined per-person consumption rate</em>. It is the unit that makes a two-person apartment and a six-person homestead comparable: both are described as "14 days of supply per person," even though the totals differ.
          </p>
          <p>
            The phrase rarely appears on agency pages (they give flat minimums instead) and most calculators skip it too — which is why doing the per-person math yourself is worth it. Two rates do all the work:
          </p>

          <h2>Water: 1 gallon per person per day</h2>
          <p>
            Water is the one settled number in emergency planning. <strong>1 gallon per person per day</strong> is consistent across <a href="https://www.ready.gov/water" target="_blank" rel="noopener noreferrer">Ready.gov</a>, the <a href="https://www.cdc.gov/water-emergency/about/how-to-create-and-store-an-emergency-water-supply.html" target="_blank" rel="noopener noreferrer">CDC</a>, and FEMA's guidance as relayed by secondary sources. That gallon covers drinking, cooking, and basic hygiene (CDC). The minimum is 3 days; the realistic target is <strong>a 2-week supply — 14 gallons per person</strong> (Ready.gov).
          </p>
          <table className="g-table">
            <thead>
              <tr>
                <th>Supply length</th>
                <th>Water per person</th>
                <th>Household of 4</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>3 days (72-hour minimum)</td><td>3 gallons</td><td>12 gallons</td></tr>
              <tr><td>1 week</td><td>7 gallons</td><td>28 gallons</td></tr>
              <tr><td>2 weeks (target)</td><td>14 gallons</td><td>56 gallons</td></tr>
              <tr><td>1 month</td><td>30 gallons</td><td>120 gallons</td></tr>
              <tr><td>3 months</td><td>90 gallons</td><td>360 gallons</td></tr>
            </tbody>
          </table>
          <p>
            These are straight multiplications of the settled rate: <em>days × 1 gallon × people</em>. Utilities and public-health agencies that publish water-storage guidance reinforce the same arithmetic (<a href="https://www.eweb.org/outages-and-safety/preparing-for-emergencies/your-water-plan" target="_blank" rel="noopener noreferrer">EWEB</a>, <a href="https://www.portland.gov/water/store-emergency-water" target="_blank" rel="noopener noreferrer">Portland.gov</a>). Australian guidance uses a similar per-person litre basis (10 L per person), the metric version of the same per-person logic.
          </p>
          <Figure
            svg={WATER_SVG}
            caption="One settled rate, five time horizons — at 1 gallon per person per day, your per-person total is just the number of days."
          />

          <h2>Food: 2,000–2,400 calories per person per day</h2>
          <p>
            Food is where sources diverge, so plan with a range, not a fact. Planning figures observed across university extension and vendor guidance fall between <strong>2,000 and 2,400 calories per person per day</strong>, with higher figures for very active adults (<a href="https://llu.edu/campus-spiritual-life/emergency/emergency-food" target="_blank" rel="noopener noreferrer">Loma Linda University</a>; Protocol Survival and Battlbox figures cited in roundups). Treat <strong>2,000–2,400 calories/person/day</strong> as your planning band:
          </p>
          <ul>
            <li>Use the <strong>lower end</strong> for a typical household of adults and children.</li>
            <li>Budget <strong>more</strong> for very active adults, hard physical labor, or cold weather.</li>
          </ul>
          <p>
            For the longest horizons, a <strong>one-year basis</strong> is the classic benchmark: roughly 2,000–2,400 calories per person per day over 365 days (<a href="https://llu.edu/campus-spiritual-life/emergency/emergency-food" target="_blank" rel="noopener noreferrer">Loma Linda University</a>; <a href="https://www.fcs.uga.edu/extension/preparing-an-emergency-food-supply-long-term-food-storage" target="_blank" rel="noopener noreferrer">UGA Extension long-term food storage</a>; <a href="https://www.churchofjesuschrist.org/study/ensign/2006/03/random-sampler/food-storage-for-one-year?lang=eng" target="_blank" rel="noopener noreferrer">LDS Ensign 2006</a>).
          </p>
          <p>
            <strong>Food storage rule of thumb:</strong> if you want a 2-week supply, store 14 days of food per person; for 30 days, 30 days of food per person. The calorie math below tells you how much <em>food</em> that is.
          </p>

          <h2>How much food to store per person, worked out</h2>
          <p>
            Here is the per-person method this guide adds to the flat minimums — a calculable way to size <strong>any</strong> day count:
          </p>
          <ul>
            <li><strong>Water per person:</strong> days × 1 gallon per person per day = gallons of water per person</li>
            <li><strong>Food per person:</strong> days × 2,000–2,400 calories per person per day = calories of food per person</li>
          </ul>
          <p>Then multiply both by the number of people in your household.</p>
          <Figure
            svg={METHOD_SVG}
            caption="The whole method is two rates and one multiplication."
          />

          <div className="g-example">
            <h4>Worked example — household of four, 2-week supply:</h4>
            <ul>
              <li><strong>Water:</strong> 14 days × 1 gallon = 14 gallons per person → <strong>56 gallons</strong> for four people.</li>
              <li><strong>Food:</strong> 14 days × 2,200 calories (midpoint of 2,000–2,400) = 30,800 calories per person → <strong>about 123,000 calories</strong> for the household.</li>
              <li><strong>From calories to groceries:</strong> if the food you store averages 400 calories a serving, that is roughly 5.5 servings per person per day — about 77 servings per person, or <strong>about 308 servings for two weeks</strong> for four people. Use the calories-per-serving figure printed on the labels of the food you actually buy; the math is the same.</li>
            </ul>
          </div>

          <div className="g-example">
            <h4>Worked example — household of two, 30-day supply:</h4>
            <ul>
              <li><strong>Water:</strong> 30 gallons per person → <strong>60 gallons</strong> total.</li>
              <li><strong>Food:</strong> 30 days × 2,200 calories = 66,000 calories per person → <strong>132,000 calories</strong> total.</li>
            </ul>
          </div>

          <p>
            For a 90-day or one-year plan, run the same multiplication with 90 or 365 — and buy in calories, not just in bulk. Stock the foods you already eat so rotation is natural (UGA Extension recommends a long-term supply built from shelf-stable staples; LDS one-year guidance uses the same per-person daily baseline).
          </p>

          <h2>What to do with the number: close the gap, don't just hit it</h2>
          <p>
            A days-of-supply number only protects you if your pantry actually contains it. The step most calculators skip is <strong>comparing what you have against what you need</strong> and keeping the difference closed over time:
          </p>
          <ol>
            <li><strong>Pick your day count</strong> — start at the 72-hour minimum, move to 2 weeks, then scale to 30 or 90 days as storage allows.</li>
            <li><strong>Do the per-person math</strong> — the formulas above, once per person, once per category.</li>
            <li><strong>Compare have vs. need</strong> — category by category, note where you're short. This is where most plans fail: people know the target but not their current gap.</li>
            <li><strong>Rotate and close the gap</strong> — restock by expiry date, eat through what's nearest to expiring, and track what you actually consume so next season's number is based on your real household, not a guess.</li>
          </ol>
          <Figure
            svg={LOOP_SVG}
            caption="The sizing math only works if you verify what you have and keep rotating it."
          />

          <p>
            This is where the arithmetic stops being an exercise. PrepVault is built around the same per-person continuity math — it converts your stored calories and gallons into <strong>days of supply</strong> using daily per-person rates (2,000 cal/day and 1 gallon/day, adjusted for household size and climate), tracks expiry dates across 22 supply categories, and flags items that are expiring or expired so rotation happens on a schedule instead of by memory. Because it runs offline with AES-256 encrypted storage on your own device and no cloud dependency, the plan stays usable when power and connectivity don't — and it's a one-time purchase rather than a subscription. After you size your stockpile with the method in this guide, that "have vs. need" step in step 4 is exactly what PrepVault tracks for you.
          </p>

          <div className="g-cta-box">
            <h3>Size it, then track it</h3>
            <p>PrepVault turns your stored gallons and calories into days of supply, tracks expiry dates across every category, and runs offline with encrypted local storage.</p>
            <a href="/">Get PrepVault →</a>
          </div>

          <h2>Sources and method notes</h2>
          <div className="g-sources">
            <h3>Primary sources read for this guide</h3>
            <ul>
              <li>Ready.gov — Water: <a href="https://www.ready.gov/water" target="_blank" rel="noopener noreferrer">https://www.ready.gov/water</a></li>
              <li>Ready.gov — Food: <a href="https://www.ready.gov/food" target="_blank" rel="noopener noreferrer">https://www.ready.gov/food</a></li>
              <li>CDC — How to create and store an emergency water supply: <a href="https://www.cdc.gov/water-emergency/about/how-to-create-and-store-an-emergency-water-supply.html" target="_blank" rel="noopener noreferrer">https://www.cdc.gov/water-emergency/about/how-to-create-and-store-an-emergency-water-supply.html</a></li>
              <li>Canada.ca — Food and drinking water safety during an emergency: <a href="https://www.canada.ca/en/health-canada/services/food-drinking-water-safe-emergency.html" target="_blank" rel="noopener noreferrer">https://www.canada.ca/en/health-canada/services/food-drinking-water-safe-emergency.html</a></li>
              <li>UGA Extension — Preparing an Emergency Food Supply: Long-Term Food Storage: <a href="https://www.fcs.uga.edu/extension/preparing-an-emergency-food-supply-long-term-food-storage" target="_blank" rel="noopener noreferrer">https://www.fcs.uga.edu/extension/preparing-an-emergency-food-supply-long-term-food-storage</a></li>
              <li>LDS Ensign (2006) — Food Storage for One Year: <a href="https://www.churchofjesuschrist.org/study/ensign/2006/03/random-sampler/food-storage-for-one-year?lang=eng" target="_blank" rel="noopener noreferrer">https://www.churchofjesuschrist.org/study/ensign/2006/03/random-sampler/food-storage-for-one-year?lang=eng</a></li>
              <li>Loma Linda University — Emergency Food: <a href="https://llu.edu/campus-spiritual-life/emergency/emergency-food" target="_blank" rel="noopener noreferrer">https://llu.edu/campus-spiritual-life/emergency/emergency-food</a> and Emergency Water: <a href="https://llu.edu/campus-spiritual-life/emergency/emergency-water" target="_blank" rel="noopener noreferrer">https://llu.edu/campus-spiritual-life/emergency/emergency-water</a></li>
              <li>EWEB — Your Water Plan: <a href="https://www.eweb.org/outages-and-safety/preparing-for-emergencies/your-water-plan" target="_blank" rel="noopener noreferrer">https://www.eweb.org/outages-and-safety/preparing-for-emergencies/your-water-plan</a></li>
              <li>Portland.gov — Store Emergency Water: <a href="https://www.portland.gov/water/store-emergency-water" target="_blank" rel="noopener noreferrer">https://www.portland.gov/water/store-emergency-water</a></li>
            </ul>
            <p className="g-note">
              <strong>Secondary attributions</strong> (seen inside other pages; not read directly — treat as corroborating, not primary): American Red Cross 3-day evacuation / 2-week home supply (via Augason Farms), FEMA 1 gallon/person/day (via ReadyWise), FEMA 2024 National Household Survey (via The Survival Mom), BYU one-year food storage list (via Reddit).
            </p>
            <h3 style={{ marginTop: 16 }}>Method notes (checked August 19, 2026)</h3>
            <ul>
              <li><strong>Water is the settled figure:</strong> 1 gallon per person per day, 3-day minimum, 2-week (14-gallon) target — consistent across all primary sources.</li>
              <li><strong>Food is a range, not a fact:</strong> per-person daily calorie guidance varies by source (2,000–2,400 most common; higher for very active adults). This guide presents a planning band and labels worked examples as illustrative.</li>
              <li>This guide presents the method and math — it is not a functioning on-page calculator at the time of writing.</li>
            </ul>
          </div>
        </article>
      </div>

      <div className="g-footer">
        <a href="/">← Back to PrepVault</a> · Encrypted. Offline. No cloud dependency.
      </div>
    </div>
  );
}
