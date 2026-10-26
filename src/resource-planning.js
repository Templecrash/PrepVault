import { computeRationing } from './rationing.js';

// Inventory quantities retain their recorded units. Energy and runtime models
// below are illustrative assumptions, not measured equipment performance.
const quantity = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};
const totalQuantity = items => items.reduce((sum, item) => sum + quantity(item.quantity), 0);
const BTU_PER_KWH = 3412;
const PROPANE_BTU_PER_GALLON = 91452;

export const CONVERSIONS = {
  propane_heat: { input: "1 gal propane", output: "91,452 BTU", equiv: "~5.1 hrs heat (18,000 BTU portable heater)", rate: 5.1, unit: "hrs heat" },
  propane_cook: { input: "1 gal propane", output: "91,452 BTU", equiv: "~11 hrs cooking (8,000 BTU camp stove)", rate: 11, unit: "hrs cooking" },
  gasoline_gen: { input: "1 gal gasoline", output: "~5.5 hrs generator", equiv: "Illustrative generator: 1kW average load, 5.5 hours per gallon", rate: 5.5, unit: "hrs gen" },
  firewood_heat: { input: "1 cord hardwood", output: "~24M BTU", equiv: "~30 days home heating (non-catalytic stove)", rate: 30, unit: "days heat" },
  battery_aa: { input: "1 AA battery", output: "~3,000 mAh", equiv: "~20 hrs flashlight / 8 hrs radio", rate: 20, unit: "hrs light" },
  solar_100w: { input: "100W solar panel", output: "~500 Wh/day", equiv: "Assumes a 100W panel and 5 effective sun hours per day", rate: 5, unit: "hrs/day" },
  water_per_person: { input: "1 gal water", output: "1 person-day", equiv: "FEMA minimum — drinking + basic sanitation", rate: 1, unit: "person-days" },
  rice_cal: { input: "1 lb rice", output: "~1,650 cal", equiv: "~82% of daily need (1 person)", rate: 1650, unit: "calories" },
  beans_cal: { input: "1 lb beans", output: "~1,540 cal", equiv: "~77% of daily need (1 person)", rate: 1540, unit: "calories" },
  kwh_comms: { input: "1 kWh", output: "~50 hrs HAM radio", equiv: "Assumes 20W average electrical load", rate: 50, unit: "hrs comms" },
  kwh_light: { input: "1 kWh", output: "~100 hrs LED light", equiv: "10W LED × 100hrs", rate: 100, unit: "hrs light" },
  kwh_heat: { input: "1 kWh", output: "3,412 BTU", equiv: "~0.67 hrs space heater (1500W)", rate: 0.67, unit: "hrs e-heat" },
};

export function computeResourcePools(items = [], people, climateConfig = {}) {
  const climMod = climateConfig.firewoodMod || 1;
  const p = people || 4;
  const rationing = computeRationing(items, p, 2000);
  // Gasoline quantity is already gallons; the optional gallons field must not
  // multiply that stock a second time. Cordwood quantity is likewise in cords.
  const fuelGals = totalQuantity(items.filter(item => item.category === "fuel" && item.subType === "gasoline"));
  const propaneGals = totalQuantity(items.filter(item => item.category === "fuel" && item.subType === "propane")) * 4.6;
  const firewoodCords = totalQuantity(items.filter(item => item.category === "firewood" && item.subType === "cordwood"));
  const waterGals = rationing.totalWaterGal;
  const totalCals = rationing.totalCalories;
  const batteries = totalQuantity(items.filter(item => item.category === "batteries"));
  const solarPanels = totalQuantity(items.filter(item => (item.category === "power" && item.subType === "solarPanel") || (item.category === "electronics" && item.subType === "solarDevice")));

  // Illustrative pools: generator at 1kW average load, 100W panels at 5 sun
  // hours/day, and AA-equivalent cells at 3Wh each. Propane thermal energy stays
  // separate: only an explicit heat-to-power scenario converts it to electricity.
  const genKwh = fuelGals * 5.5;
  const propaneKwh = propaneGals * PROPANE_BTU_PER_GALLON / BTU_PER_KWH;
  const solarDailyKwh = solarPanels * 0.5;
  const batteryKwh = batteries * 0.003;

  return { fuelGals, propaneGals, firewoodCords, waterGals, batteries, solarPanels, totalCals, genKwh, propaneKwh, solarDailyKwh, batteryKwh, totalKwh: genKwh + batteryKwh, climMod, people: p };
}

export function buildResourceSystems(items, resources) {
  const stocked = items.filter(item => quantity(item.quantity) > 0);
  return [
  { id: "water", label: "Water", icon: "💧", color: "#0ea5e9",
    nodes: [
      { id: "storage", label: "Storage", val: resources.waterGals, unit: "gal", status: resources.waterGals >= resources.people * 14 ? "green" : resources.waterGals >= resources.people * 3 ? "yellow" : "red" },
      { id: "filtration", label: "Filtration", val: stocked.filter((i) => i.category === "water" && i.subType === "purificationDevice").reduce((s, i) => s + quantity(i.quantity), 0), unit: "filters", status: stocked.filter((i) => i.category === "water" && i.subType === "purificationDevice").length > 0 ? "green" : "red" },
      { id: "purification", label: "Purification", val: stocked.filter((i) => i.category === "water" && i.subType === "purificationTablets").reduce((s, i) => s + quantity(i.quantity), 0), unit: "tabs", status: stocked.filter((i) => i.category === "water" && i.subType === "purificationTablets").length > 0 ? "green" : "red" },
      { id: "energy", label: "Pump Energy", val: resources.genKwh > 0 || resources.solarDailyKwh > 0 ? "Yes" : "No", unit: "", status: resources.genKwh > 0 || resources.solarDailyKwh > 0 ? "green" : "red" },
    ]
  },
  { id: "heat", label: "Heat", icon: "🔥", color: "#f97316",
    nodes: [
      { id: "fuel", label: "Fuel", val: resources.firewoodCords.toFixed(1) + " cord + " + resources.propaneGals.toFixed(0) + " gal", unit: "", status: resources.firewoodCords > 0 || resources.propaneGals > 0 ? "green" : "red" },
      { id: "ignition", label: "Ignition", val: stocked.filter((i) => (i.category === "recreational" && i.subType === "lighters") || (i.category === "equipment" && i.name?.toLowerCase().includes("lighter"))).reduce((s, i) => s + quantity(i.quantity), 0), unit: "sources", status: stocked.filter((i) => i.category === "recreational" && i.subType === "lighters").length > 0 ? "green" : "red" },
      { id: "ventilation", label: "Ventilation", val: "Manual", unit: "", status: resources.firewoodCords > 0 ? "green" : "yellow" },
      { id: "backup", label: "Backup", val: new Set([resources.firewoodCords > 0 ? "wood" : null, resources.propaneGals > 0 ? "propane" : null, resources.fuelGals > 0 ? "gas" : null].filter(Boolean)).size, unit: "sources", status: new Set([resources.firewoodCords > 0 ? "wood" : null, resources.propaneGals > 0 ? "propane" : null].filter(Boolean)).size >= 2 ? "green" : "yellow" },
    ]
  },
  { id: "power", label: "Power", icon: "⚡", color: "#eab308",
    nodes: [
      { id: "solar", label: "Solar", val: resources.solarPanels, unit: "panels", status: resources.solarPanels > 0 ? "green" : "red" },
      { id: "generator", label: "Generator", val: resources.fuelGals.toFixed(0), unit: "gal fuel", status: resources.fuelGals > 0 ? "green" : "red" },
      { id: "battery", label: "Battery Bank", val: resources.batteries, unit: "cells", status: resources.batteries >= 20 ? "green" : resources.batteries > 0 ? "yellow" : "red" },
      { id: "inverter", label: "Inverter/UPS", val: stocked.filter((i) => i.category === "power" || (i.category === "electronics" && i.name?.toLowerCase().includes("inverter"))).length > 0 ? "Yes" : "No", unit: "", status: "yellow" },
    ]
  },
  { id: "comms", label: "Communications", icon: "📡", color: "#a855f7",
    nodes: [
      { id: "primary", label: "Primary", val: "Cellular", unit: "", status: stocked.filter((i) => i.category === "electronics" && i.subType === "cellPhone").length > 0 ? "green" : "red" },
      { id: "secondary", label: "Secondary", val: "HAM/GMRS", unit: "", status: stocked.filter((i) => i.category === "electronics" && i.subType === "radio").length > 0 || stocked.filter((i) => i.category === "comms").length > 0 ? "green" : "red" },
      { id: "tertiary", label: "Tertiary", val: "Satellite", unit: "", status: stocked.filter((i) => i.category === "electronics" && i.subType === "satPhone").length > 0 ? "green" : "red" },
      { id: "power_dep", label: "Power Dep.", val: resources.totalKwh > 0 ? "Backed" : "Grid-only", unit: "", status: resources.totalKwh > 0 ? "green" : "red" },
    ]
  },
  { id: "food", label: "Food", icon: "🍽️", color: "#22c55e",
    nodes: [
      { id: "stored", label: "Stored Cal", val: Math.round(resources.totalCals).toLocaleString(), unit: "cal", status: resources.totalCals / Math.max(resources.people * 2000, 1) >= 30 ? "green" : resources.totalCals > 0 ? "yellow" : "red" },
      { id: "production", label: "Production", val: stocked.filter((i) => i.category === "farm" && i.subType === "seedPacket").length, unit: "crops", status: stocked.filter((i) => i.category === "farm").length > 0 ? "green" : "red" },
      { id: "protein", label: "Protein", val: stocked.filter((i) => i.category === "fishing").length + stocked.filter((i) => i.category === "firearms").length, unit: "sources", status: stocked.filter((i) => i.category === "fishing").length > 0 ? "green" : "yellow" },
      { id: "preservation", label: "Preservation", val: stocked.filter((i) => i.category === "food" && (i.subType === "freezeDried" || i.subType === "cannedGoods")).reduce((s, i) => s + quantity(i.quantity), 0), unit: "items", status: stocked.filter((i) => i.category === "food" && ["freezeDried", "cannedGoods"].includes(i.subType)).length > 0 ? "green" : "yellow" },
    ]
  },
];
}

export function buildResourceRows(items, people, climateConfig) {
  const { people: p, waterGals: waterGal, totalCals, fuelGals: fuelGal,
    firewoodCords: cords, batteries, solarPanels } = computeResourcePools(items, people, climateConfig);
  const propTanks = totalQuantity(items.filter(item => item.category === "fuel" && item.subType === "propane"));
  const medItems = totalQuantity(items.filter(item => item.category === "medical"));
  const ammoRds = totalQuantity(items.filter(item => item.category === "firearms" && item.subType === "ammo"));
  const powerHrs = fuelGal * 5.5 + batteries * 0.3 + solarPanels * 5;
  return [
    { icon: "💧", id: "water", name: "Water", qty: waterGal, unit: "gal", days: waterGal / Math.max(p * 1, 0.1), target: 14, color: "#0ea5e9", detail: p + " gal/day for " + p + " people" },
    { icon: "🥫", id: "food", name: "Food", qty: Math.round(totalCals).toLocaleString() + " cal", days: totalCals / Math.max(p * 2000, 1), target: 30, color: "#f59e0b", detail: (p * 2000).toLocaleString() + " cal/day for " + p + " people" },
    { icon: "⛽", id: "gasoline", name: "Fuel (Gas)", qty: fuelGal.toFixed(1), unit: "gal", days: fuelGal > 0 ? fuelGal * 5.5 / 24 : 0, target: 7, color: "#f97316", detail: fuelGal.toFixed(0) + " gal at an assumed 5.5 generator hours per gallon" },
    { icon: "🔥", id: "propane", name: "Propane", qty: propTanks, unit: "tanks", days: propTanks * 3, target: 14, color: "#ef4444", detail: "Assumes 20 lb per tank and 3 days of use per tank" },
    { icon: "⚡", id: "power", name: "Power Reserve", qty: powerHrs.toFixed(1), unit: "hrs", days: powerHrs / 24, target: 3, color: "#eab308", detail: "Assumes 5.5 generator hours/gal, 0.3 hours/AA cell and one day of 5-hour/100W solar output" },
    { icon: "🪵", id: "firewood", name: "Firewood", qty: cords.toFixed(1), unit: "cords", days: cords * 30, target: 120, color: "#a16207", detail: "Assumes 30 days heating per recorded cord; not adjusted for climate" },
    { icon: "💊", id: "medical", name: "Medical", qty: medItems, unit: "items", days: null, target: null, color: "#ef4444", detail: medItems + " medical supply items" },
    { icon: "🎯", id: "ammunition", name: "Ammunition", qty: ammoRds.toLocaleString(), unit: "rds", days: null, target: null, color: "#6b7280", detail: ammoRds.toLocaleString() + " rounds total" },
  ];
}

export function buildStockConversions(resources) {
  return [
    { id: "gasoline", label: "Gasoline", val: resources.fuelGals.toFixed(1) + " gal", conv: (resources.fuelGals * 5.5).toFixed(1) + " hrs generator", icon: "⛽", color: "#f59e0b" },
    { id: "propane", label: "Propane", val: resources.propaneGals.toFixed(1) + " gal", conv: (resources.propaneGals * 5.1).toFixed(0) + " hrs heat", icon: "🔥", color: "#f97316" },
    { id: "firewood", label: "Firewood", val: resources.firewoodCords.toFixed(1) + " cords", conv: (resources.firewoodCords * 30).toFixed(0) + " days heat", icon: "🪵", color: "#92400e" },
    { id: "water", label: "Water", val: resources.waterGals + " gal", conv: (resources.waterGals / Math.max(resources.people, 1)).toFixed(1) + " household days", icon: "💧", color: "#0ea5e9" },
    { id: "food", label: "Food", val: Math.round(resources.totalCals).toLocaleString() + " cal", conv: (resources.totalCals / Math.max(resources.people * 2000, 1)).toFixed(1) + " days (" + resources.people + " ppl)", icon: "🍽️", color: "#22c55e" },
    { id: "batteries", label: "Batteries", val: resources.batteries + " cells", conv: (resources.batteries * 20).toFixed(0) + " hrs light", icon: "🔋", color: "#eab308" },
  ];
}

export function computeResourceTradeoff(items, resources, divertFrom, divertTo, divertPct) {
  const systems = {
    power: { label: "Power", icon: "⚡", totalKwh: resources.totalKwh + resources.solarDailyKwh * 7, uses: { light: resources.totalKwh * 100, comms: resources.totalKwh * 50, devices: resources.totalKwh * 20 } },
    heat: { label: "Heat", icon: "🔥", totalBtu: resources.firewoodCords * 24000000 + resources.propaneGals * 91452, days: (resources.firewoodCords * 30) + ((resources.propaneGals * 91452) / (50000 * 12)) },
    water: { label: "Water", icon: "💧", totalGal: resources.waterGals, days: resources.waterGals / Math.max(resources.people * resources.climMod, 0.1) },
    food: { label: "Food", icon: "🍽️", totalCal: resources.totalCals, days: resources.totalCals / Math.max(resources.people * 2000, 1) },
    comms: { label: "Comms", icon: "📡", hrs: resources.totalKwh * 50, channels: items.filter((i) => i.category === "electronics" && ["satPhone", "radio", "cellPhone"].includes(i.subType)).length },
  };

  // Simulate diversion
  const pct = divertPct / 100;

  let fromLoss = "", toGain = "", fromNewDays = 0, toNewDays = 0, fromOrigDays = 0, toOrigDays = 0;

  if (divertFrom === "power" && divertTo === "heat") {
    const kwDiverted = (resources.totalKwh * pct);
    const btuGained = kwDiverted * BTU_PER_KWH;
    fromOrigDays = resources.totalKwh > 0 ? (resources.totalKwh / 2) : 0; // ~2kWh/day usage
    fromNewDays = ((resources.totalKwh * (1 - pct)) / 2);
    toOrigDays = systems.heat.days;
    toNewDays = toOrigDays + (btuGained / (50000 * 12));
    fromLoss = `−${kwDiverted.toFixed(1)} kWh (${(pct * 100).toFixed(0)}% of power budget)`;
    toGain = `+${(btuGained / 1000).toFixed(0)}k BTU → +${(toNewDays - toOrigDays).toFixed(1)} days heat`;
  } else if (divertFrom === "power" && divertTo === "comms") {
    const kwDiverted = resources.totalKwh * pct;
    fromOrigDays = resources.totalKwh > 0 ? (resources.totalKwh / 2) : 0;
    fromNewDays = (resources.totalKwh * (1 - pct)) / 2;
    toOrigDays = resources.totalKwh * 50 / 24;
    toNewDays = toOrigDays + (kwDiverted * 50 / 24);
    fromLoss = `−${kwDiverted.toFixed(1)} kWh diverted`;
    toGain = `+${(kwDiverted * 50).toFixed(0)} hrs comms`;
  } else if (divertFrom === "heat" && divertTo === "power") {
    const propDiverted = resources.propaneGals * pct;
    const kwhGained = propDiverted * PROPANE_BTU_PER_GALLON / BTU_PER_KWH * 0.25; // gen efficiency ~25%
    fromOrigDays = systems.heat.days;
    fromNewDays = fromOrigDays * (1 - pct * (resources.propaneGals / Math.max(resources.propaneGals + resources.firewoodCords * 100, 1)));
    toOrigDays = resources.totalKwh / 2;
    toNewDays = toOrigDays + kwhGained / 2;
    fromLoss = `−${propDiverted.toFixed(1)} gal propane from heat`;
    toGain = `+${kwhGained.toFixed(1)} kWh generated`;
  } else {
    fromOrigDays = systems[divertFrom]?.days || 0;
    fromNewDays = fromOrigDays * (1 - pct);
    toOrigDays = systems[divertTo]?.days || 0;
    toNewDays = toOrigDays * (1 + pct * 0.3);
    fromLoss = `−${(pct * 100).toFixed(0)}% ${systems[divertFrom]?.label} capacity`;
    toGain = `+${(pct * 30).toFixed(0)}% ${systems[divertTo]?.label} boost`;
  }

  return { fromLoss, toGain, fromOrigDays, fromNewDays, toOrigDays, toNewDays };
}
