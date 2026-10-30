// Inventory signals used by the dependency checklist. A positive stock record
// is a possible match, not verification of capacity, charge, fuel or compatibility.
export function summarizeDependencies(checks = []) {
  const priorities = ['critical', 'high', 'medium', 'low'].map(id => {
    const rows = checks.filter(check => check.risk === id);
    return { id, total: rows.length, missing: rows.filter(check => !check.backup).length };
  });
  return {
    total: checks.length,
    missing: checks.filter(check => !check.backup).length,
    possible: checks.filter(check => Boolean(check.backup)).length,
    criticalMissing: priorities[0].missing,
    hiddenMissing: checks.filter(check => check.hidden && !check.backup).length,
    priorities,
  };
}

export function buildDependencyChecks(items = []) {
  const stocked = items.filter(item => item && ['number', 'string'].includes(typeof item.quantity)
    && Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0);
  const hasSolar = stocked.some(i => (i.category === "power" && i.subType === "solarPanel")
    || (i.category === "electronics" && ["solarDevice", "solarGadget"].includes(i.subType)));
  const hasGen = stocked.some(i => i.category === "power" && i.subType === "generator");
  const hasPowerStation = stocked.some(i => i.category === "power" && i.subType === "batteryBackup");
  const hasUps = stocked.some(i => i.category === "power" && i.subType === "ups");
  const deviceBackup = hasPowerStation ? "Battery backup / power station" : hasUps ? "UPS" : null;
  const hasBattery = stocked.some(i => i.category === "batteries" && !["battCharger", "solarCharger"].includes(i.subType));
  const hasFirewood = stocked.some(i => i.category === "firewood" && parseFloat(i.fields?.cords) > 0);
  const hasHAM = stocked.some(i => (i.category === "electronics" && i.subType === "radio") || i.category === "comms");
  const hasSat = stocked.some(i => i.category === "electronics" && i.subType === "satPhone");
  const hasPurificationDevice = stocked.some(i => i.category === "water" && ["purificationDevice", "filter"].includes(i.subType));
  const hasPurificationTablets = stocked.some(i => i.category === "water" && i.subType === "purificationTablets");
  const waterBackup = hasPurificationDevice ? "Purification device · check type" : hasPurificationTablets ? "Purification tablets" : null;
  return [
    { id: "garage", name: "Garage Door", icon: "🚗", depends: "Grid Power", dep: "grid", backup: hasGen ? "Generator" : null, hidden: true, risk: "high", desc: "Electric garage door opener fails silently during outage.", fix: "Install manual release. Keep vehicles outside during storm warnings." },
    { id: "wellpump", name: "Well Water Pump", icon: "💧", depends: "Grid Power", dep: "grid", backup: hasGen ? "Generator" : hasSolar ? "Solar" : null, hidden: true, risk: "critical", desc: "Submersible well pump draws 500-1500W. No power = no water.", fix: hasGen ? "Generator recorded. Check pump starting load, connections and fuel before relying on it." : hasSolar ? "Solar equipment recorded. Check the inverter, storage and pump power requirements before relying on it." : "No matching generator or solar equipment recorded. Review backup power and stored water." },
    { id: "fridge", name: "Refrigerator", icon: "🧊", depends: "Grid Power", dep: "grid", backup: hasGen ? "Generator" : null, hidden: false, risk: "high", desc: "Food spoils in 4hrs (open) or 24-48hrs (closed) without power.", fix: "Run generator 4-6hrs/day. Minimize door openings. Freeze water jugs." },
    { id: "furnace", name: "Furnace Blower", icon: "🌡️", depends: "Grid Power", dep: "grid", backup: hasGen ? "Generator" : null, hidden: true, risk: "critical", desc: "Even gas furnaces need electric blower (300-600W).", fix: hasFirewood ? "Wood stove is grid-independent." : "Generator required for furnace blower." },
    { id: "stovefan", name: "Wood Stove Fan", icon: "🔥", depends: "Battery / Thermoelectric", dep: "battery", backup: hasBattery ? "Batteries" : null, hidden: true, risk: "low", desc: "Thermoelectric fans need no battery. Battery fans improve circulation.", fix: "Stovetop thermoelectric fans need no power." },
    { id: "sump", name: "Sump Pump", icon: "🏠", depends: "Grid Power", dep: "grid", backup: hasGen ? "Generator" : null, hidden: true, risk: "high", desc: "Sump pump (500W) prevents flooding. Silent failure = catastrophic.", fix: "Battery backup sump pump ($150-300). Generator as primary backup." },
    { id: "phone", name: "Cell Phone", icon: "📱", depends: "LTE Tower + Grid", dep: "grid+tower", backup: hasSat ? "Satellite Phone" : hasHAM ? "HAM Radio" : null, hidden: true, risk: "high", desc: "Cell towers have 4-8hr battery backup only.", fix: hasSat ? "Satellite phone is tower-independent." : hasHAM ? "HAM radio is grid-independent." : "Add satellite or HAM radio." },
    { id: "internet", name: "Internet / WiFi", icon: "🌐", depends: "Grid + ISP + Router", dep: "grid+isp", backup: hasSat ? "Satellite Phone data" : deviceBackup, hidden: false, risk: "medium", desc: "Router, modem, ISP all need power.", fix: "Check backup capacity, connections and tested runtime for your router and modem. Local power does not confirm that your internet provider is available." },
    { id: "security", name: "Security System", icon: "🚨", depends: "Grid + WiFi + Cloud", dep: "grid+cloud", backup: deviceBackup, hidden: true, risk: "medium", desc: "Smart security needs WiFi + cloud servers.", fix: "Check your alarm's backup requirements, tested runtime and network dependencies. Loose replacement cells do not confirm a system backup." },
    { id: "medical", name: "Medical Devices", icon: "💊", depends: "Grid Power", dep: "grid", backup: hasGen ? "Generator" : deviceBackup, hidden: true, risk: "critical", desc: "CPAP, oxygen concentrator — all grid-dependent. Life-threatening.", fix: "Confirm manufacturer-approved backup power and tested runtime for each critical medical device. A recorded generator, UPS or power station does not confirm compatibility." },
    { id: "waterFilter", name: "UV Water Purifier", icon: "🔬", depends: "Grid Power", dep: "grid", backup: waterBackup, hidden: true, risk: "high", desc: "UV purification needs electricity. Fails silently.", fix: hasPurificationDevice ? "A purification device is recorded. Check its power requirements, treatment capabilities and capacity; the record does not confirm a non-electric backup." : hasPurificationTablets ? "Purification tablets are recorded. Check their label, expiry and treatment limits before relying on them." : "Consider a suitable non-electric purification backup and verify its treatment capabilities." },
    { id: "septic", name: "Septic Pump", icon: "🚽", depends: "Grid Power", dep: "grid", backup: null, hidden: true, risk: "high", desc: "Pump systems: no power = tank fills, sewage backup.", fix: "Know your septic type. Gravity systems work without power." },
    { id: "co_detector", name: "CO / Smoke Detectors", icon: "🔋", depends: "Battery", dep: "battery", backup: hasBattery ? "Replacement batteries" : null, hidden: true, risk: "critical", desc: "No working CO detector during generator use is lethal.", fix: "Replace batteries every 6 months. Keep spare 9V batteries." },
  ];
}
