export function computeScenarioScore({ items, people, climate, categories: CATEGORIES, scenarios: SCENARIOS, climates: CLIMATES }, scenKey, dur) {
    const scen = SCENARIOS[scenKey];
    const clim = CLIMATES[climate];
    if (!scen || !clim) return { score: 0, cats: {} };
    let tw = 0, tm = 0;
    const cs = {};
    Object.keys(CATEGORIES).forEach((cat) => {
      const catItems = items.filter((i) => i.category === cat);
      const subs = CATEGORIES[cat].subTypes;
      let dailyYield = 0, stored = 0;
      catItems.forEach((i) => {
        const sub = subs[i.subType];
        if (sub?.dailyYield) dailyYield += sub.dailyYield * i.quantity;
        if (sub?.consumable) stored += i.quantity;
        else if (!sub?.dailyYield) stored += i.quantity;
      });
      const w = scen.weights[cat] || 0;
      let score;
      if (cat === "water" || cat === "food") {
        const dailyNeed = people * (cat === "water" ? clim.waterMod : 1);
        const storedDays = dailyNeed > 0 ? stored / dailyNeed : 0;
        const yieldDays = dailyYield >= dailyNeed ? dur : (dailyYield / Math.max(dailyNeed, 0.01)) * dur * 0.5;
        score = Math.min(100, ((storedDays + yieldDays) / dur) * 100);
      } else if (cat === "firewood") {
        /* Firewood: calculate cords needed based on fireplaces x climate modifier x duration */
        const fireplaces = catItems.filter((i) => i.subType === "fireplace");
        const totalCordsPerMonth = fireplaces.reduce((sum, fp) => sum + (parseFloat(fp.fields?.cordsPerMonth) || 0.5), 0) * clim.firewoodMod;
        const cordsNeeded = totalCordsPerMonth * (dur / 30);
        const cordsAvail = catItems.filter((i) => i.subType === "cordwood").reduce((sum, cw) => sum + (parseFloat(cw.fields?.cords) || 0) * cw.quantity, 0);
        score = cordsNeeded > 0 ? Math.min(100, (cordsAvail / cordsNeeded) * 100) : (cordsAvail > 0 ? 80 : 0);
      } else if (cat === "fuel") {
        const fuelGals = catItems.filter((i) => i.subType === "gasoline" || i.subType === "diesel" || i.subType === "kerosene").reduce((sum, f) => sum + (parseFloat(f.fields?.gallons) || 0), 0);
        const tanks = catItems.filter((i) => i.subType === "propane").reduce((sum, t) => sum + t.quantity, 0);
        score = Math.min(100, fuelGals * 1.5 + tanks * 10 + stored * 5);
      } else {
        score = (stored > 0 || dailyYield > 0) ? Math.min(100, stored * 10 + dailyYield * 20) : 0;
      }
      cs[cat] = score;
      tw += score * w;
      tm += 100 * w;
    });
    return { score: tm > 0 ? (tw / tm) * 100 : 0, cats: cs };
}
