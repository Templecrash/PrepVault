import { useEffect } from "react";

const M = "'JetBrains Mono',monospace";
const ACCENT = "#c8553a";

const SOURCES = [
  ["FCC — Family Radio Service", "https://www.fcc.gov/wireless/bureau-divisions/mobility-division/family-radio-service-frs"],
  ["FCC — Multi-Use Radio Service", "https://www.fcc.gov/wireless/bureau-divisions/mobility-division/multi-use-radio-service-murs"],
  ["FCC — Citizens Band Radio Service", "https://www.fcc.gov/wireless/bureau-divisions/mobility-division/citizens-band-radio-service-cbrs"],
  ["Wikipedia — Family Radio Service", "https://en.wikipedia.org/wiki/Family_Radio_Service"],
  ["Wikipedia — Multi-Use Radio Service", "https://en.wikipedia.org/wiki/Multi-Use_Radio_Service"],
  ["Wikipedia — General Mobile Radio Service", "https://en.wikipedia.org/wiki/General_Mobile_Radio_Service"],
  ["Wikipedia — CB radio in the United States", "https://en.wikipedia.org/wiki/CB_radio_in_the_United_States"],
  ["Wikipedia — NOAA Weather Radio", "https://en.wikipedia.org/wiki/NOAA_Weather_Radio"],
  ["Wikipedia — Specific Area Message Encoding", "https://en.wikipedia.org/wiki/Specific_Area_Message_Encoding"],
  ["Wikipedia — Amateur radio frequency allocations", "https://en.wikipedia.org/wiki/Amateur_radio_frequency_allocations"],
  ["NOAA — NWR station listing", "https://www.weather.gov/nwr/station_listing"],
  ["NOAA/NWS — SAME programming basics", "https://www.weather.gov/iln/nwr_same"],
  ["NOAA/NWS — FIPS codes", "https://www.weather.gov/hnx/fips"],
  ["ARRL — band plan", "http://www.arrl.org/band-plan-1"],
  ["ARRL — ARES", "http://www.arrl.org/ares"],
  ["Wikipedia — International distress frequency", "https://en.wikipedia.org/wiki/International_distress_frequency"],
  ["RepeaterBook — repeaters", "https://www.repeaterbook.com/repeaters"],
  ["RadioReference — FRS/GMRS chart and repeater search", "https://www.radioreference.com/"],
  ["FCC rule, 2017 FRS/GMRS power redesign", "https://docs.fcc.gov/public/attachments/FCC-17-57A1.pdf"],
];

const LICENSE_TABLE = [
  ["FRS (Family Radio Service)", "No (licensed by rule)", "22 channels, 462–467 MHz", "2 W ERP", "Family/neighbor chatter, no license, cheap radios"],
  ["MURS (Multi-Use Radio Service)", "No (licensed by rule)", "5 channels, VHF 151–154 MHz", "2 W", "Better reach than FRS on VHF, license-free"],
  ["CB (Citizens Band)", "No (licensed by rule)", "40 channels, 26–27 MHz", "4 W AM", "Vehicles, channel 9 emergencies, license-free"],
  ["GMRS (General Mobile Radio Service)", "Yes, individual FCC license (fee, no exam)", "30 channels, 462–467 MHz", "50 W", "Repeaters and far-reaching family comms"],
  ["Amateur (\u201cham\u201d) Radio", "Yes, FCC license plus exam", "Many bands (2 m, 70 cm and more)", "100 W+", "Long-range nets, emergency services, real skill"],
  ["NOAA Weather Radio", "Receive-only", "7 channels, 162.400–162.550 MHz", "—", "Automated weather and all-hazards alerts"],
];

const FRS_TABLE = [
  ["1", "462.5625", "2 W", "12", "467.6625", "0.5 W"],
  ["2", "462.5875", "2 W", "13", "467.6875", "0.5 W"],
  ["3", "462.6125", "2 W", "14", "467.7125", "0.5 W"],
  ["4", "462.6375", "2 W", "15", "462.5500", "2 W"],
  ["5", "462.6625", "2 W", "16", "462.5750", "2 W"],
  ["6", "462.6875", "2 W", "17", "462.6000", "2 W"],
  ["7", "462.7125", "2 W", "18", "462.6250", "2 W"],
  ["8", "467.5625", "0.5 W", "19", "462.6500", "2 W"],
  ["9", "467.5875", "0.5 W", "20", "462.6750", "2 W"],
  ["10", "467.6125", "0.5 W", "21", "462.7000", "2 W"],
  ["11", "467.6375", "0.5 W", "22", "462.7250", "2 W"],
];

const MURS_TABLE = [
  ["1", "151.820", "11.25 kHz", "2 W"],
  ["2", "151.880", "11.25 kHz", "2 W"],
  ["3", "151.940", "11.25 kHz", "2 W"],
  ["4 (\u201cBlue Dot\u201d)", "154.570", "20.00 kHz", "2 W"],
  ["5 (\u201cGreen Dot\u201d)", "154.600", "20.00 kHz", "2 W"],
];

const CB_TABLE = [
  ["1", "26.965", "21", "27.215"],
  ["2", "26.975", "22", "27.225"],
  ["3", "26.985", "23", "27.255"],
  ["4", "27.005", "24", "27.235"],
  ["5", "27.015", "25", "27.245"],
  ["6", "27.025", "26", "27.265"],
  ["7", "27.035", "27", "27.275"],
  ["8", "27.055", "28", "27.285"],
  ["9", "27.065", "29", "27.295"],
  ["10", "27.075", "30", "27.305"],
  ["11", "27.085", "31", "27.315"],
  ["12", "27.105", "32", "27.325"],
  ["13", "27.115", "33", "27.335"],
  ["14", "27.125", "34", "27.345"],
  ["15", "27.135", "35", "27.355"],
  ["16", "27.155", "36", "27.365"],
  ["17", "27.165", "37", "27.375"],
  ["18", "27.175", "38", "27.385"],
  ["19", "27.185", "39", "27.395"],
  ["20", "27.205", "40", "27.405"],
];

const GMRS_TABLE = [
  ["15", "462.550", "467.550", "50 W"],
  ["16", "462.575", "467.575", "50 W"],
  ["17", "462.600", "467.600", "50 W"],
  ["18", "462.625", "467.625", "50 W"],
  ["19", "462.650", "467.650", "50 W"],
  ["20", "462.675", "467.675", "50 W"],
  ["21", "462.700", "467.700", "50 W"],
  ["22", "462.725", "467.725", "50 W"],
];

const NOAA_TABLE = [
  ["162.400", "36B"],
  ["162.425", "96B"],
  ["162.450", "37B"],
  ["162.475", "97B"],
  ["162.500", "38B"],
  ["162.525", "98B"],
  ["162.550", "39B"],
];

const HAM_TABLE = [
  ["146.520", "2 m national simplex calling frequency (US & Canada)"],
  ["446.000", "70 cm national simplex calling frequency"],
  ["144.200", "2 m sideband calling frequency"],
  ["52.525", "6 m FM simplex calling"],
];

const th = { padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", borderBottom: "1px solid rgba(255,255,255,0.08)", fontFamily: M, letterSpacing: 0.3, whiteSpace: "nowrap" };
const td = { padding: "10px 12px", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.85)" };
const tdM = { ...td, fontFamily: M, color: "#c8553a" };

function Table({ head, rows, monoCols = [] }) {
  return (
    <div style={{ overflowX: "auto", margin: "18px 0 24px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
        <thead>
          <tr>
            {head.map((h, i) => <th key={i} style={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent" }}>
              {r.map((c, ci) => <td key={ci} style={monoCols.includes(ci) ? tdM : td}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function H2({ children, id }) {
  return <h2 id={id} style={{ fontSize: 22, fontWeight: 800, margin: "40px 0 14px", letterSpacing: -0.5, color: "#fff" }}>{children}</h2>;
}

function H3({ children }) {
  return <h3 style={{ fontSize: 17, fontWeight: 700, margin: "28px 0 10px", color: "#fff" }}>{children}</h3>;
}

function P({ children }) {
  return <p style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.72)", margin: "0 0 16px" }}>{children}</p>;
}

function Li({ children }) {
  return <li style={{ fontSize: 14, lineHeight: 1.65, color: "rgba(255,255,255,0.72)", margin: "0 0 8px" }}>{children}</li>;
}

function SourceLink({ label, href }) {
  return (
    <li style={{ fontSize: 12, lineHeight: 1.5, margin: "0 0 8px", color: "rgba(255,255,255,0.55)" }}>
      {label}:{" "}
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.85)", textDecoration: "underline", wordBreak: "break-all" }}>{href}</a>
    </li>
  );
}

export default function RadioFrequenciesGuide({ onBack }) {
  useEffect(() => {
    document.title = "Emergency Radio Frequencies: The Complete Multi-Service Reference | PrepVault";
    const meta = document.querySelector('meta[name="description"]');
    const desc = "GMRS, FRS, MURS, CB, ham and NOAA Weather Radio frequencies in one offline printable reference for preparedness — with a license decision table, scanner tips, and a zip-code local-frequency lookup.";
    if (meta) meta.setAttribute("content", desc);
    return () => { document.title = "PrepVault"; };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#fff", fontFamily: "'Outfit','DM Sans','Segoe UI',sans-serif", paddingBottom: 80 }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Nav bar */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(10,12,16,0.8)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={onBack}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#c8553a,#8b2e1a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, fontFamily: M, color: "#fff" }}>P</div>
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.5 }}>PrepVault</span>
        </div>
        <button onClick={onBack} style={{ padding: "8px 18px", borderRadius: 8, background: "none", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>← Back to app</button>
      </nav>

      {/* Article */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "56px 20px 20px" }}>
        <div style={{ display: "inline-block", padding: "6px 14px", borderRadius: 20, background: "rgba(200,85,58,0.08)", border: "1px solid rgba(200,85,58,0.15)", fontSize: 11, color: "#c8553a", fontWeight: 700, fontFamily: M, marginBottom: 24, letterSpacing: 1 }}>PREPPING REFERENCE</div>
        <h1 style={{ fontSize: "clamp(30px, 5vw, 44px)", fontWeight: 900, margin: "0 0 16px", lineHeight: 1.1, letterSpacing: -1 }}>
          Emergency Radio Frequencies: The Complete Multi-Service Reference for Preparedness
        </h1>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", fontFamily: M, marginBottom: 32 }}>Frequencies checked 2026-08-12 · Offline &amp; printable</p>

        <P>When the cell tower is down and the power is out, radio is the one communications layer that keeps working. It does not need a network, a subscription, or a working grid — just a battery, an antenna, and a channel you can both hear and be heard on. The hard part is knowing which frequencies to set, which ones need a license, and how to find the channels that actually serve your area. This guide puts GMRS, FRS, MURS, CB, ham, and NOAA Weather Radio into one reference so you can program a set of radios today and print a copy for the go-bag.</P>

        <P>Start with the decision table, then read the sections that match the radios you own or plan to buy.</P>

        <H2>Do you need a license? One decision table for all six services</H2>
        <P>The single biggest confusion is which services are license-free and which require an FCC license. This table settles it. All sources are US FCC; checked 2026-08-12.</P>
        <Table head={["Service", "License required?", "Channels/Freqs", "Max power (typical handheld)", "Best for"]} rows={LICENSE_TABLE} monoCols={[3]} />
        <P>FRS, MURS, and CB are all licensed by rule — you may operate them without an individual license. GMRS requires one paid FCC license per family (no exam) that covers your whole household. Amateur radio requires a license earned by passing a written exam at one of three license classes.</P>

        <H2>License-free today: FRS, MURS, and CB</H2>
        <P>Use these the moment you open the box — no application, no exam, no wait.</P>

        <H3>FRS — the 22-channel family radio service</H3>
        <P>FRS radios are the inexpensive walkie-talkies sold everywhere. All 22 channels are shared with GMRS; as an FRS user you may operate at the ERP limits below. Channels 8–14 must be handheld sets with built-in antennas at 0.5 W ERP. FCC FRS page; Wikipedia Family Radio Service; RadioReference FRS/GMRS chart.</P>
        <Table head={["Ch", "MHz", "FRS max ERP", "Ch", "MHz", "FRS max ERP"]} rows={FRS_TABLE} monoCols={[1, 4]} />

        <H3>MURS — five license-free VHF channels with better reach</H3>
        <P>MURS sits on VHF (151–154 MHz), which generally travels farther than UHF in many terrain settings, and it is license-free at up to 2 W. Only five channels. FCC MURS page; Wikipedia Multi-Use Radio Service.</P>
        <Table head={["Channel", "MHz", "Bandwidth", "Max power"]} rows={MURS_TABLE} monoCols={[1]} />

        <H3>CB — forty channels, and channel 9 is reserved for emergencies</H3>
        <P>CB works with zero licensing. The FCC reserves Channel 9 (27.065 MHz) for emergency communications and traveler assistance, and any CB channel may be used for emergencies. FCC Citizens Band Radio Service; Wikipedia CB radio in the United States.</P>
        <Table head={["Ch", "MHz", "Ch", "MHz"]} rows={CB_TABLE} monoCols={[1, 3]} />

        <H2>GMRS — the licensed service that reaches far in one budget</H2>
        <P>A single paid GMRS license covers your entire household (no exam). GMRS shares the 22 FRS channels and adds licensed-only power and repeater access up to 50 W. That repeater access is the reason serious family comms often choose GMRS.</P>
        <Table head={["Ch", "Output / simplex (MHz)", "Repeater input (MHz)", "Max power"]} rows={GMRS_TABLE} monoCols={[1, 2]} />
        <P>Two details matter when you program a GMRS radio. First, on channels 1–7 (462.5625–462.7125) GMRS is limited to 5 W ERP for simplex, and channels 8–14 (467.5625–467.7125) are handheld-only at 0.5 W ERP — the same limits FRS users face there. Second, the repeater input is always 5 MHz above the output: a repeater transmits on 462.550 (the output you listen to) and receives you on 467.550 (the input you transmit on). Radios give you the ±5.0 MHz offset automatically once you set the "repeater" or "offset" mode. The 0.5 W channels 8–14 are handheld-only.</P>

        <H2>NOAA Weather Radio — the always-on alert layer you set once</H2>
        <P>NOAA Weather Radio is receive-only and runs the same seven VHF frequencies nationwide, so any weather alert radio works anywhere in the US (Mexico's SARMEX uses the same seven). Frequencies (NOAA station listing; Wikipedia NOAA Weather Radio):</P>
        <Table head={["NOAA freq (MHz)", "Marine channel"]} rows={NOAA_TABLE} monoCols={[0]} />
        <P>Two programming concepts trip people up. First, consumer radios number presets inconsistently: NOAA's own WX designations are WX1=162.550, WX2=162.400, WX3=162.475, WX4=162.425, WX5=162.450, WX6=162.500, WX7=162.525, but many radios number presets 1–7 by ascending frequency instead. Set frequencies by MHz, not by the preset number, and check the manual once. Second, SAME (Specific Area Message Encoding) lets you program 6-digit FIPS county codes so the radio alarms only for counties you actually care about instead of the whole broadcast area. That per-county alerting is what makes the radio usable instead of a nuisance at 3 a.m.</P>

        <H2>Amateur (ham) radio — the licensed backbone for long emergency nets</H2>
        <P>Ham radio requires a real license earned by passing a written exam, and in exchange it opens long-range nets and the formal emergency services (ARES and RACES) that cities and counties actually call on. If you are preparing for a community or long-distance role, this is the service to study for. Beginners build nets on the 2-meter (144–148 MHz) and 70-centimeter (420–450 MHz) bands. The calling frequencies worth knowing (ARRL band plan; Wikipedia International distress frequency):</P>
        <Table head={["MHz", "What it is"]} rows={HAM_TABLE} monoCols={[0]} />
        <P>The 2-meter repeater plan places most repeater outputs at 146.61–146.97 and 147.00–147.39 MHz, with simplex in the 146.40–146.58 range.</P>

        <H2>Scanner and programming tips: what to set, in what order</H2>
        <P>Packing the frequencies is only half the job; a radio full of the wrong channels is clutter. Tips that produce an actually useful radio:</P>
        <ul style={{ margin: "0 0 16px", paddingLeft: 20 }}>
          <Li>Program NOAA first. The seven weather channels are identical nationwide, take minutes to set, and give you the highest-value alerts with the least effort.</Li>
          <Li>Program the license-free service you can legally transmit on right now: pick FRS or MURS by which radios you already own, then add those channels.</Li>
          <Li>If you get a ham license, add the calling frequencies (146.520, 446.000) and your local repeaters. Where your radios already include them, learn the national calling frequencies from the table above.</Li>
          <Li>Write down repeater inputs from the GMRS table when you program a repeater-capable radio; the transmit frequency is 5 MHz above the output.</Li>
          <Li>Keep one group of channels for simplex (direct radio-to-radio) and a separate group for repeaters so you never guess which mode you are in during an emergency.</Li>
          <Li>Label by what the channel is for (family, weather, ARES net), not just the number. Under stress you will forget what channel 19 was meant for.</Li>
        </ul>

        <H2>How to find the frequencies for your area by zip code</H2>
        <P>"Local" channels can't be found in any single national table, because the FCC does not assign channels by zip code. A zip code is a postal convenience, not a geographic entity the FCC recognizes. A working zip lookup maps three layers: zip to county, county to weather alerts, and county/area to community repeaters and local nets.</P>
        <ol style={{ margin: "0 0 16px", paddingLeft: 20 }}>
          <Li><strong style={{ color: "rgba(255,255,255,0.85)" }}>Zip to county.</strong> Enter your zip in any USPS/federal county-finder to get your county and county name.</Li>
          <Li><strong style={{ color: "rgba(255,255,255,0.85)" }}>County to NOAA SAME codes.</strong> Weather-alert radios program 6-digit FIPS county codes, published by NWS/FEMA. Entering your state+county codes makes the radio alert for your county. Example: Tulare County, CA programs as 006107 (state 006, county 107).</Li>
          <Li><strong style={{ color: "rgba(255,255,255,0.85)" }}>County/area to ham and GMRS repeaters.</strong> Repeater directories are community-maintained, not FCC data — hams and GMRS groups self-coordinate repeaters. RepeaterBook and RadioReference let you search by state, county, or proximity with a radius, and RepeaterBook hosts a separate GMRS repeater database.</Li>
          <Li><strong style={{ color: "rgba(255,255,255,0.85)" }}>Area to local emergency nets.</strong> Amateur Emergency Service (ARES) and RACES nets are organized by local county/section and activated through local officials, not published in a national file. After you are licensed, your local ARES leadership and club publish the net schedules and repeater channels.</Li>
        </ol>
        <P>The honest limit: a zip lookup can get you to county-keyed weather alerts and to community repeater directories, but local emergency-net details only surface from the local licensed community once you are part of it.</P>

        <H2>What to do this week</H2>
        <P>Program the seven NOAA channels and one license-free service (FRS or MURS) into the radios you already own. If handheld family comms matter to you and you can reach a repeater in your area, get a GMRS license and program the repeater channels. If you want a community or long-distance role, book the entry-level amateur exam and join your local club or ARES group for net times. Then print this reference — it is built to work offline, with no cloud dependency between you and the frequencies you need when nothing else is working.</P>

        <div style={{ margin: "40px 0 0", padding: "24px 26px", borderRadius: 14, background: "rgba(200,85,58,0.04)", border: "1px solid rgba(200,85,58,0.12)" }}>
          <P>This reference comes from PrepVault, an offline-first, encrypted preparedness dashboard for households and property managers. PrepVault is about a survival plan that works when nothing else does — which is exactly why this guide is made to print, keep, and use off the grid.</P>
        </div>

        <H2>Sources (all checked 2026-08-12)</H2>
        <ul style={{ margin: "0", paddingLeft: 20, listStyle: "none" }}>
          {SOURCES.map(([label, href], i) => <SourceLink key={i} label={label} href={href} />)}
        </ul>
      </div>
    </div>
  );
}
