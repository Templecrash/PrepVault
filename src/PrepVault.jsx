import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, lazy, Suspense } from "react";
import { supabase, supabaseConfigured } from "./supabase.js";
import { SyncEngine } from "./sync-engine.js";
import "leaflet/dist/leaflet.css";
import WorkspaceShell from "./WorkspaceShell.jsx";
import { buildNavigationHealth } from "./navigation-health.js";
import Welcome from "./Welcome.jsx";
import AccountAuth from "./AccountAuth.jsx";
import { getAccountSession, signOutAccount, ACCOUNT_SESSION_EVENT } from "./account-auth-client.js";
import { switchAccountWorkspace, readWorkspaceOwner, isWorkspaceSettingKey } from "./account-workspace.js";
import HouseholdSetup from "./HouseholdSetup.jsx";
import BugOutPlan from "./BugOutPlan.jsx";
import PlanNotice from "./PlanNotice.jsx";
import { categoryUpgradeNotices } from "./plan-limits.js";
import Overview from "./Overview.jsx";
import InventoryView from "./InventoryView.jsx";
import DependenciesView from "./DependenciesView.jsx";
import ManualsView from "./ManualsView.jsx";
import CodesView from "./CodesView.jsx";
import FarmingView from "./FarmingView.jsx";
import CommunicationsView from "./CommunicationsView.jsx";
import CategoryDetailView from "./CategoryDetailView.jsx";
import { buildEssentialPlanning } from "./essential-planning.js";
import PropertyView from "./PropertyView.jsx";
import { getDefensePositions, patchPositionAssignment } from "./defense-positions.js";
import AuthPanel from "./ProviderConnectionPanel.jsx";
import ScenarioView from "./ScenarioView.jsx";
import "./legacy-details.css";
import ResourcePlanningView from "./ResourcePlanningView.jsx";
import ResourceOpportunitiesView from "./ResourceOpportunitiesView.jsx";
import { computeResourcePools } from "./resource-planning.js";
import PeopleDirectory from "./PeopleDirectory.jsx";
import LiveTracker from "./LiveTracker.jsx";
import Surveillance from "./Surveillance.jsx";
import { buildAdvisorContext, readAdvisorDeviceContext } from "./advisor-context.js";
import { HANDBOOKS } from "./handbooks.js";
import RationingPlanner from "./RationingPlanner.jsx";
import { buildFoodWaterRoster } from "./food-water-household.js";
import HandbookLibrary from "./HandbookLibrary.jsx";
import PropertyMapWorkspace from "./PropertyMapWorkspace.jsx";
import { Icon } from "./brand.jsx";
import { useDialogFocus } from "./useDialogFocus.js";
import { validateSnapshot } from "./storage.js";
import { encryptBackup as encryptData, decryptBackup as decryptData } from "./crypto-backup.js";

const MessageBoard = lazy(() => import('./MessageBoard.jsx'));

/* ═══════════════════════════════════════════════════════════
   DATA CONSTANTS
   ═══════════════════════════════════════════════════════════ */
const M = "'DM Sans',sans-serif";

const CATEGORIES = {
  water: {
    label: "Water", icon: "💧", color: "#0ea5e9", desc: "Water sources, storage, purification",
    subTypes: {
      well: { label: "Well", icon: "🪣", fields: ["depth", "gpm", "hasPump", "pumpType"], dailyYield: 50, unit: "wells" },
      freshwater: { label: "Lake/River/Stream", icon: "🏞️", fields: ["distance", "flowRate", "seasonalReliability"], dailyYield: 100, unit: "sources" },
      rainCollection: { label: "Rainwater Collection", icon: "🌧️", fields: ["capacity", "filterType"], dailyYield: 5, unit: "sys" },
      storedWater: { label: "Stored Water", icon: "🫙", fields: ["capacity", "lastRefreshed", "containerType"], unit: "gal", consumable: true },
      purificationTablets: { label: "Purification Tabs", icon: "💊", fields: ["gallonsPerTab", "expiryDate"], unit: "tabs", consumable: true },
      purificationDevice: { label: "Purification Device", icon: "🔬", fields: ["filterType", "lifespanGallons", "gallonsUsed"], dailyYield: 20, unit: "devices" },
      springAccess: { label: "Natural Spring", icon: "⛲", fields: ["distance", "flowRate"], dailyYield: 30, unit: "sources" },
    },
  },
  food: {
    label: "Food", icon: "🥫", color: "#f59e0b", desc: "Food stores and production",
    subTypes: {
      cannedGoods: { label: "Canned Goods", icon: "🥫", fields: ["calories", "servings", "expiryDate"], unit: "cans", consumable: true },
      freezeDried: { label: "Freeze-Dried", icon: "📦", fields: ["calories", "servings", "expiryDate"], unit: "pouches", consumable: true },
      rice: { label: "Rice/Grains", icon: "🌾", fields: ["weightLbs", "calories", "servings", "expiryDate"], unit: "lbs", consumable: true },
      livestock: { label: "Livestock", icon: "🐔", fields: ["animalType", "count"], dailyYield: 4, unit: "animals" },
      huntingFishing: { label: "Hunting/Fishing", icon: "🎣", fields: ["gearType"], dailyYield: 3, unit: "kits" },
      preserves: { label: "Preserves", icon: "🍯", fields: ["expiryDate"], unit: "jars", consumable: true },
      frozenMeat: { label: "Frozen Meat", icon: "🥩", fields: ["weightLbs", "expiryDate"], unit: "lbs", consumable: true },
      dryGoods: { label: "Dry Goods (beans, pasta)", icon: "🫘", fields: ["weightLbs", "calories", "servings", "expiryDate"], unit: "lbs", consumable: true },
    },
  },
  medical: {
    label: "Medical", icon: "💊", color: "#ef4444", desc: "Medical supplies",
    subTypes: {
      firstAidKit: { label: "First Aid Kit", icon: "🩹", fields: ["kitLevel", "expiryDate"], unit: "kits" },
      prescription: { label: "Prescriptions", icon: "💊", fields: ["medication", "daysSupply", "expiryDate"], unit: "Rx", consumable: true },
      antibiotics: { label: "Antibiotics", icon: "🧬", fields: ["type", "expiryDate"], unit: "courses", consumable: true },
      surgical: { label: "Trauma Kit", icon: "🔪", fields: ["kitLevel"], unit: "kits" },
      tourniquets: { label: "Tourniquets", icon: "🩸", fields: ["expiryDate"], unit: "items", consumable: true },
      training: { label: "Training", icon: "📚", fields: ["certLevel"], unit: "resources" },
    },
  },
  firewood: {
    label: "Firewood", icon: "🪵", color: "#a16207", desc: "Wood supply, fireplaces, chainsaw maintenance",
    subTypes: {
      cordwood: { label: "Cordwood", icon: "🪵", fields: ["cords", "seasoned", "woodSpecies"], unit: "cords", consumable: true },
      kindling: { label: "Kindling / Starter", icon: "🔥", fields: [], unit: "bags", consumable: true },
      fireplace: { label: "Fireplace / Stove", icon: "🏠", fields: ["btuRating", "cordsPerMonth", "lastInspection"], unit: "units" },
      chainsaw: { label: "Chainsaw", icon: "⛓️", fields: ["chainsawBrand", "lastService", "barLength", "chainsCount"], unit: "saws" },
      splitter: { label: "Splitter / Maul", icon: "🪓", fields: ["splitterType"], unit: "tools" },
      chimneyKit: { label: "Chimney Sweep Kit", icon: "🧹", fields: ["lastSwept"], unit: "kits" },
    },
  },
  fuel: {
    label: "Fuel", icon: "⛽", color: "#f97316", desc: "Propane, gasoline, diesel, kerosene",
    subTypes: {
      propane: { label: "Propane", icon: "🔵", fields: ["tankSize"], unit: "tanks", consumable: true },
      gasoline: { label: "Gasoline", icon: "⛽", fields: ["gallons", "stabilized", "lastRotated"], unit: "gal", consumable: true },
      diesel: { label: "Diesel", icon: "🛢️", fields: ["gallons", "stabilized", "lastRotated"], unit: "gal", consumable: true },
      kerosene: { label: "Kerosene", icon: "🪔", fields: ["gallons"], unit: "gal", consumable: true },
      campStove: { label: "Camp Stove", icon: "⛺", fields: ["fuelType"], unit: "stoves" },
      matches: { label: "Fire Starting", icon: "🔥", fields: [], unit: "kits", consumable: true },
    },
  },
  shelter: {
    label: "Shelter", icon: "🏕️", color: "#8b5cf6", desc: "Shelter structures",
    subTypes: {
      primaryHome: { label: "Primary Dwelling", icon: "🏠", fields: ["type", "sqft"], unit: "structures" },
      tent: { label: "Tent", icon: "⛺", fields: ["capacity"], unit: "tents" },
      sleepingBag: { label: "Sleeping Bags", icon: "🛏️", fields: ["tempRating"], unit: "bags" },
      bunker: { label: "Bunker", icon: "🏗️", fields: ["capacity", "airFiltration"], unit: "structures" },
      bugOutLocation: { label: "Bug-Out", icon: "📍", fields: ["distance"], unit: "locations" },
    },
  },
  tools: {
    label: "Tools", icon: "🔧", color: "#06b6d4", desc: "Essential tools",
    subTypes: {
      multiTool: { label: "Multi-Tool", icon: "🔪", fields: [], unit: "tools" },
      axe: { label: "Axe", icon: "🪓", fields: [], unit: "tools" },
      saw: { label: "Saw", icon: "🪚", fields: ["type"], unit: "saws" },
      rope: { label: "Rope", icon: "🪢", fields: ["lengthFt"], unit: "ft", consumable: true },
      maps: { label: "Maps/Compass", icon: "🗺️", fields: [], unit: "sets" },
    },
  },
  comms: {
    label: "Comms", icon: "📡", color: "#10b981", desc: "Communications",
    subTypes: {
      hamRadio: { label: "HAM Radio", icon: "📻", fields: ["licensed", "bands"], unit: "radios" },
      walkieTalkie: { label: "Walkie-Talkies", icon: "📱", fields: ["range"], unit: "pairs" },
      satPhone: { label: "Sat Phone", icon: "🛰️", fields: ["provider"], unit: "phones" },
      faradayCage: { label: "Faraday Cage", icon: "🔲", fields: ["contents"], unit: "cages" },
    },
  },
  defense: {
    label: "Defense", icon: "🛡️", color: "#6b7280", desc: "Perimeter security, traps, barriers",
    subTypes: {
      roadSpikes: { label: "Road Spikes", icon: "⚠️", fields: ["spikeType"], unit: "sets" },
      tripWire: { label: "Trip Wire / Alarm", icon: "🔔", fields: ["wireLength"], unit: "kits" },
      barricade: { label: "Barricade", icon: "🚧", fields: ["barricadeType"], unit: "units" },
      perimeter: { label: "Perimeter System", icon: "🚨", fields: ["type"], unit: "systems" },
      bodyArmor: { label: "Body Armor", icon: "🦺", fields: ["level"], unit: "vests" },
      nightVision: { label: "Night Vision", icon: "🌙", fields: [], unit: "devices" },
      trap: { label: "Snare / Trap", icon: "🪤", fields: ["trapType"], unit: "traps" },
      concealedCam: { label: "Concealed Camera", icon: "📹", fields: [], unit: "cams" },
    },
  },
  firearms: {
    label: "Firearms", icon: "🔫", color: "#dc2626", desc: "Guns, ammunition, accessories",
    subTypes: {
      rifle: { label: "Rifle", icon: "🔫", fields: ["caliber", "firearmAction", "optic"], unit: "rifles" },
      shotgun: { label: "Shotgun", icon: "🔫", fields: ["gauge", "firearmAction"], unit: "shotguns" },
      handgun: { label: "Handgun", icon: "🔫", fields: ["caliber", "firearmAction"], unit: "handguns" },
      ammunition: { label: "Ammunition", icon: "🎯", fields: ["caliber", "rounds", "ammoType"], unit: "rds", consumable: true },
      magazine: { label: "Magazines", icon: "📎", fields: ["caliber", "magCapacity"], unit: "mags" },
      cleaningKit: { label: "Cleaning Kit", icon: "🧹", fields: ["caliber"], unit: "kits" },
      optics: { label: "Optic / Scope", icon: "🔭", fields: ["magnification"], unit: "optics" },
      holster: { label: "Holster / Case", icon: "💼", fields: [], unit: "items" },
    },
  },
  vehicles: {
    label: "Vehicles", icon: "🚗", color: "#3b82f6", desc: "Vehicles, maintenance, spare parts",
    subTypes: {
      atv: { label: "ATV / UTV", icon: "🏎️", fields: ["vMake", "vModel", "vYear", "lastOilChange", "oilInterval", "nextService"], unit: "vehicles" },
      dirtBike: { label: "Dirt Bike", icon: "🏍️", fields: ["vMake", "vModel", "vYear", "lastOilChange", "oilInterval", "nextService"], unit: "vehicles" },
      tractor: { label: "Tractor", icon: "🚜", fields: ["vMake", "vModel", "vYear", "lastOilChange", "oilInterval", "nextService", "hoursOnEngine"], unit: "vehicles" },
      truck: { label: "Truck / SUV", icon: "🛻", fields: ["vMake", "vModel", "vYear", "lastOilChange", "oilInterval", "nextService", "mileage"], unit: "vehicles" },
      boat: { label: "Boat", icon: "🚤", fields: ["vMake", "vModel", "vYear", "lastOilChange", "oilInterval"], unit: "vehicles" },
      snowmobile: { label: "Snowmobile", icon: "🛷", fields: ["vMake", "vModel", "vYear", "lastOilChange", "oilInterval"], unit: "vehicles" },
      spareParts: { label: "Spare Parts", icon: "🔩", fields: ["partFor", "partDesc"], unit: "parts" },
      fluids: { label: "Fluids / Oils", icon: "🫗", fields: ["fluidType", "gallons"], unit: "gal", consumable: true },
      tires: { label: "Tires / Tracks", icon: "⭕", fields: ["tireSize", "tireCondition"], unit: "sets" },
    },
  },
  equipment: {
    label: "Equipment", icon: "📦", color: "#78716c", desc: "Filters, spare parts, misc gear",
    subTypes: {
      airFilter: { label: "Air Filters", icon: "💨", fields: ["filterSize", "filterQty", "expiryDate"], unit: "filters", consumable: true },
      waterFilter: { label: "Water Filters", icon: "🚰", fields: ["filterType", "lifespanGallons", "gallonsUsed"], unit: "filters", consumable: true },
      hvacFilter: { label: "HVAC / Furnace Filters", icon: "🌬️", fields: ["filterSize", "filterQty", "lastReplaced"], unit: "filters", consumable: true },
      fuelFilter: { label: "Fuel / Oil Filters", icon: "⛽", fields: ["partFor", "filterQty"], unit: "filters", consumable: true },
      tarp: { label: "Tarps / Covers", icon: "🏗️", fields: ["dimensions"], unit: "items" },
      container: { label: "Containers / Bins", icon: "📦", fields: ["capacity"], unit: "items" },
      hardware: { label: "Hardware / Fasteners", icon: "🔩", fields: [], unit: "kits" },
      clothing: { label: "Clothing / Gear", icon: "👕", fields: ["clothingType"], unit: "items" },
      lighting: { label: "Lanterns / Lights", icon: "💡", fields: [], unit: "items" },
      cookware: { label: "Cookware / Utensils", icon: "🍳", fields: [], unit: "sets" },
      packs: { label: "Bags / Packs", icon: "🎒", fields: ["packCapacity"], unit: "packs" },
      documents: { label: "Documents / Cash", icon: "📄", fields: ["docType"], unit: "items" },
      miscGear: { label: "Other / Misc", icon: "🗃️", fields: ["miscDesc"], unit: "items" },
    },
  },
  farm: {
    label: "Farm", icon: "🌾", color: "#65a30d", desc: "Seeds, soil, greenhouse, growing inputs",
    subTypes: {
      seedPacket: { label: "Seed Packet", icon: "🌱", fields: ["cropName", "seedVariety", "plantMonth", "harvestMonth", "daysToHarvest", "expiryDate"], unit: "packs" },
      seedling: { label: "Seedlings / Starts", icon: "🌿", fields: ["cropName", "plantMonth", "harvestMonth"], unit: "trays" },
      soil: { label: "Soil / Compost", icon: "🪴", fields: ["soilType", "weightLbs"], unit: "bags", consumable: true },
      fertilizer: { label: "Fertilizer / Amendments", icon: "🧪", fields: ["fertilizerType", "weightLbs", "expiryDate"], unit: "bags", consumable: true },
      greenhouse: { label: "Greenhouse / Cold Frame", icon: "🏡", fields: ["sqft", "heatedGreenhouse"], unit: "structures" },
      raisedBed: { label: "Raised Bed / Plot", icon: "🟫", fields: ["sqft", "soilType", "cropName"], dailyYield: 1, unit: "beds" },
      irrigation: { label: "Irrigation System", icon: "💧", fields: ["irrigationType"], unit: "systems" },
      pestControl: { label: "Pest Control", icon: "🐛", fields: ["pestControlType", "expiryDate"], unit: "items", consumable: true },
      tools: { label: "Garden Tools", icon: "🧑‍🌾", fields: ["miscDesc"], unit: "tools" },
      harvest: { label: "Harvest / Produce", icon: "🍅", fields: ["cropName", "weightLbs"], unit: "lbs", consumable: true },
    },
  },
  hygiene: {
    label: "Hygiene", icon: "🧼", color: "#ec4899", desc: "Sanitation",
    subTypes: {
      soap: { label: "Soap", icon: "🧴", fields: ["expiryDate"], unit: "items", consumable: true },
      toiletPaper: { label: "TP", icon: "🧻", fields: [], unit: "rolls", consumable: true },
      bleach: { label: "Bleach", icon: "🧪", fields: ["expiryDate"], unit: "gal", consumable: true },
      trashBags: { label: "Trash Bags", icon: "🗑️", fields: [], unit: "rolls", consumable: true },
      portableToilet: { label: "Toilet", icon: "🚽", fields: [], unit: "units" },
    },
  },
  power: {
    label: "Power", icon: "⚡", color: "#eab308", desc: "Power generation & lighting",
    subTypes: {
      solarPanel: { label: "Solar", icon: "☀️", fields: ["watts", "inverter"], dailyYield: 8, unit: "panels" },
      generator: { label: "Generator", icon: "⚙️", fields: ["watts", "fuelType", "runtimeHours"], dailyYield: 24, unit: "gen" },
      powerBank: { label: "Power Bank", icon: "🪫", fields: ["mah", "isRechargeable", "runtimeHours"], unit: "units" },
      headlamp: { label: "Flashlights", icon: "🔦", fields: [], unit: "lights" },
      candles: { label: "Candles", icon: "🕯️", fields: [], unit: "items", consumable: true },
    },
  },
  batteries: {
    label: "Batteries", icon: "🔋", color: "#a3e635", desc: "Battery stock by type, rechargeable tracking",
    subTypes: {
      aa: { label: "AA", icon: "🔋", fields: ["batteryBrand", "batteryCount", "isRechargeable", "batteryChemistry"], unit: "cells", consumable: true },
      aaa: { label: "AAA", icon: "🔋", fields: ["batteryBrand", "batteryCount", "isRechargeable", "batteryChemistry"], unit: "cells", consumable: true },
      cr123a: { label: "CR123A", icon: "🔋", fields: ["batteryBrand", "batteryCount", "isRechargeable", "batteryChemistry"], unit: "cells", consumable: true },
      eighteen650: { label: "18650", icon: "🔋", fields: ["batteryBrand", "batteryCount", "isRechargeable", "batteryMah"], unit: "cells", consumable: true },
      dCell: { label: "D Cell", icon: "🔋", fields: ["batteryBrand", "batteryCount", "isRechargeable", "batteryChemistry"], unit: "cells", consumable: true },
      cCell: { label: "C Cell", icon: "🔋", fields: ["batteryBrand", "batteryCount", "isRechargeable"], unit: "cells", consumable: true },
      nineVolt: { label: "9V", icon: "🔋", fields: ["batteryBrand", "batteryCount", "isRechargeable"], unit: "cells", consumable: true },
      coin: { label: "Coin / Button Cell", icon: "🪙", fields: ["batteryBrand", "batteryCount", "coinCellType"], unit: "cells", consumable: true },
      liPo: { label: "LiPo Pack", icon: "⚡", fields: ["batteryBrand", "batteryMah", "batteryVoltage", "isRechargeable"], unit: "packs" },
      battCharger: { label: "Battery Charger", icon: "🔌", fields: ["chargerType", "chargerSlots"], unit: "chargers" },
      solarCharger: { label: "Solar Charger", icon: "☀️", fields: ["watts", "chargerType"], unit: "chargers" },
    },
  },
  electronics: {
    label: "Electronics", icon: "💻", color: "#818cf8", desc: "Devices, subscriptions, charging status",
    subTypes: {
      satPhone: { label: "Sat Phone", icon: "🛰️", fields: ["deviceBrand", "deviceModel", "deviceSerial", "isRechargeable", "hasPlan", "planExpiry", "planProvider", "deviceLocation"], unit: "phones" },
      cellPhone: { label: "Cell Phone", icon: "📱", fields: ["deviceBrand", "deviceModel", "isRechargeable", "hasPlan", "planExpiry", "planProvider", "deviceLocation"], unit: "phones" },
      laptop: { label: "Laptop", icon: "💻", fields: ["deviceBrand", "deviceModel", "isRechargeable", "deviceLocation"], unit: "devices" },
      tablet: { label: "Tablet", icon: "📱", fields: ["deviceBrand", "deviceModel", "isRechargeable", "hasPlan", "planExpiry", "deviceLocation"], unit: "devices" },
      gps: { label: "GPS Device", icon: "📍", fields: ["deviceBrand", "deviceModel", "isRechargeable", "hasPlan", "planExpiry", "planProvider", "deviceLocation"], unit: "devices" },
      radio: { label: "Radio (HAM/GMRS/FRS)", icon: "📻", fields: ["deviceBrand", "deviceModel", "isRechargeable", "licensed", "deviceLocation"], unit: "radios" },
      weatherRadio: { label: "Weather Radio", icon: "🌤️", fields: ["deviceBrand", "isRechargeable", "deviceLocation"], unit: "radios" },
      nightVisionElec: { label: "Night Vision / Thermal", icon: "🌙", fields: ["deviceBrand", "deviceModel", "isRechargeable", "deviceLocation"], unit: "devices" },
      drone: { label: "Drone", icon: "🚁", fields: ["deviceBrand", "deviceModel", "isRechargeable", "deviceLocation"], unit: "drones" },
      trailCamElec: { label: "Trail Camera", icon: "📷", fields: ["deviceBrand", "deviceModel", "hasPlan", "planExpiry", "planProvider", "deviceLocation"], unit: "cameras" },
      solarDevice: { label: "Solar Gadget", icon: "☀️", fields: ["deviceBrand", "deviceModel", "watts", "isRechargeable", "deviceLocation"], unit: "devices" },
      faradayStored: { label: "Faraday-Stored Device", icon: "🔲", fields: ["deviceBrand", "deviceModel", "deviceLocation", "bobItemNotes"], unit: "devices" },
      miscElec: { label: "Other Electronics", icon: "🔌", fields: ["deviceBrand", "deviceModel", "isRechargeable", "hasPlan", "planExpiry", "deviceLocation"], unit: "devices" },
    },
  },
  bugout: {
    label: "Bug-Out Bags", icon: "🎒", color: "#d97706", desc: "Go-bags, contents, readiness checklists",
    subTypes: {
      bag: { label: "Bug-Out Bag", icon: "🎒", fields: ["bagOwner", "bagWeight", "packCapacity", "lastAudited"], unit: "bags" },
      bobWater: { label: "Water / Filter", icon: "💧", fields: ["bobItemQty", "bobItemNotes"], unit: "items" },
      bobFood: { label: "Food / Rations", icon: "🥫", fields: ["bobItemQty", "bobItemNotes", "expiryDate"], unit: "items", consumable: true },
      bobShelter: { label: "Shelter / Warmth", icon: "🏕️", fields: ["bobItemQty", "bobItemNotes"], unit: "items" },
      bobFirstAid: { label: "First Aid", icon: "🩹", fields: ["bobItemQty", "bobItemNotes", "expiryDate"], unit: "kits" },
      bobFireKit: { label: "Fire Kit", icon: "🔥", fields: ["bobItemQty", "bobItemNotes"], unit: "kits" },
      bobTools: { label: "Tools / Knife", icon: "🔪", fields: ["bobItemQty", "bobItemNotes"], unit: "items" },
      bobNav: { label: "Navigation / Maps", icon: "🧭", fields: ["bobItemQty", "bobItemNotes"], unit: "items" },
      bobComms: { label: "Radio / Comms", icon: "📻", fields: ["bobItemQty", "bobItemNotes"], unit: "items" },
      bobClothing: { label: "Clothing / Rain Gear", icon: "🧥", fields: ["bobItemQty", "bobItemNotes"], unit: "items" },
      bobHygiene: { label: "Hygiene / Sanitation", icon: "🧼", fields: ["bobItemQty", "bobItemNotes"], unit: "items" },
      bobDocs: { label: "Documents / Cash", icon: "📄", fields: ["bobItemQty", "bobItemNotes"], unit: "items" },
      bobDefense: { label: "Defense / Protection", icon: "🛡️", fields: ["bobItemQty", "bobItemNotes"], unit: "items" },
      bobLight: { label: "Flashlight / Headlamp", icon: "🔦", fields: ["bobItemQty", "bobItemNotes"], unit: "items" },
      bobPower: { label: "Power Bank / Batteries", icon: "🔋", fields: ["bobItemQty", "bobItemNotes"], unit: "items" },
      bobMisc: { label: "Other / Misc", icon: "📦", fields: ["bobItemQty", "bobItemNotes"], unit: "items" },
    },
  },
  kids: {
    label: "Kids", icon: "👶", color: "#f472b6", desc: "Children's supplies, baby gear, kid meds",
    subTypes: {
      diapers: { label: "Diapers / Pull-Ups", icon: "🧷", fields: ["kidName", "kidAge", "diaperSize", "bobItemQty"], unit: "packs", consumable: true },
      wipes: { label: "Wipes", icon: "🧻", fields: ["bobItemQty"], unit: "packs", consumable: true },
      formula: { label: "Formula / Milk", icon: "🍼", fields: ["kidName", "formulaType", "bobItemQty", "expiryDate"], unit: "cans", consumable: true },
      babyFood: { label: "Baby Food / Snacks", icon: "🥣", fields: ["kidName", "bobItemQty", "expiryDate"], unit: "jars", consumable: true },
      kidMeds: { label: "Kids Medications", icon: "💊", fields: ["kidName", "medication", "daysSupply", "expiryDate"], unit: "items", consumable: true },
      kidClothing: { label: "Clothing (seasonal)", icon: "👕", fields: ["kidName", "kidAge", "clothingType", "kidSize"], unit: "items" },
      kidShoes: { label: "Shoes / Boots", icon: "👟", fields: ["kidName", "kidAge", "kidSize"], unit: "pairs" },
      blankets: { label: "Blankets / Sleep", icon: "🛏️", fields: ["kidName", "bobItemNotes"], unit: "items" },
      carSeat: { label: "Car Seat / Carrier", icon: "🚗", fields: ["kidName", "kidAge", "bobItemNotes"], unit: "items" },
      toys: { label: "Comfort Items / Toys", icon: "🧸", fields: ["kidName", "bobItemNotes"], unit: "items" },
      kidHygiene: { label: "Hygiene (shampoo, cream)", icon: "🧴", fields: ["kidName", "bobItemQty", "expiryDate"], unit: "items", consumable: true },
      sipCup: { label: "Bottles / Sip Cups", icon: "🥤", fields: ["bobItemQty"], unit: "items" },
      stroller: { label: "Stroller / Wagon", icon: "🛒", fields: ["kidName", "bobItemNotes"], unit: "items" },
      kidDocs: { label: "ID / Medical Records", icon: "📋", fields: ["kidName", "bobItemNotes"], unit: "docs" },
    },
  },
  boat: {
    label: "Boat", icon: "⛵", color: "#0284c7", desc: "Watercraft, safety gear, engine maintenance",
    subTypes: {
      vessel: { label: "Boat / Canoe / Kayak", icon: "🚤", fields: ["boatType", "boatLength", "boatMotor", "boatHullMat", "boatReg", "deviceLocation"], unit: "vessels" },
      outboard: { label: "Outboard Motor", icon: "⚙️", fields: ["vMake", "vModel", "boatHP", "boatEngineHours", "lastOilChange", "oilInterval", "nextService", "fuelType"], unit: "motors" },
      trolling: { label: "Trolling Motor", icon: "🔋", fields: ["vMake", "boatHP", "batteryVoltage", "deviceLocation"], unit: "motors" },
      lifeJacket: { label: "Life Jacket / PFD", icon: "🦺", fields: ["pfdType", "pfdSize", "bobItemQty"], unit: "PFDs" },
      throwBag: { label: "Throw Bag / Ring", icon: "🟠", fields: ["bobItemQty"], unit: "items" },
      paddle: { label: "Paddles / Oars", icon: "🏄", fields: ["bobItemQty", "bobItemNotes"], unit: "items" },
      anchor: { label: "Anchor / Line", icon: "⚓", fields: ["bobItemNotes", "lengthFt"], unit: "sets" },
      boatFuel: { label: "Marine Fuel", icon: "⛽", fields: ["gallons", "fuelType", "stabilized"], unit: "gal", consumable: true },
      boatOil: { label: "Engine Oil / Gear Lube", icon: "🫗", fields: ["fluidType", "bobItemQty"], unit: "qt", consumable: true },
      boatSafety: { label: "Safety Kit (flares, horn)", icon: "🚨", fields: ["expiryDate", "bobItemNotes"], unit: "kits" },
      boatCover: { label: "Boat Cover / Tarp", icon: "🏗️", fields: ["dimensions"], unit: "covers" },
      boatTrailer: { label: "Trailer", icon: "🚛", fields: ["vMake", "vModel", "boatReg", "bobItemNotes"], unit: "trailers" },
      boatRepair: { label: "Repair / Spare Parts", icon: "🔩", fields: ["partDesc", "bobItemNotes"], unit: "items" },
    },
  },
  fishing: {
    label: "Fishing", icon: "🐟", color: "#0891b2", desc: "Rods, reels, tackle, bait, nets",
    subTypes: {
      rod: { label: "Rod & Reel", icon: "🎣", fields: ["fishRodType", "fishLineWeight", "fishReelType", "deviceLocation"], unit: "combos" },
      tackle: { label: "Tackle Box", icon: "🧰", fields: ["fishTackleContents", "deviceLocation"], unit: "boxes" },
      hooks: { label: "Hooks", icon: "🪝", fields: ["fishHookSize", "bobItemQty"], unit: "packs", consumable: true },
      lures: { label: "Lures / Jigs", icon: "✨", fields: ["fishLureType", "bobItemQty"], unit: "items" },
      bait: { label: "Live / Prepared Bait", icon: "🪱", fields: ["fishBaitType", "bobItemQty"], unit: "items", consumable: true },
      line: { label: "Fishing Line", icon: "🧵", fields: ["fishLineWeight", "lengthFt"], unit: "spools", consumable: true },
      net: { label: "Net / Landing Net", icon: "🥅", fields: ["bobItemNotes"], unit: "nets" },
      trap: { label: "Fish Trap / Minnow Trap", icon: "🪤", fields: ["bobItemNotes"], unit: "traps" },
      iceFishing: { label: "Ice Fishing Gear", icon: "🧊", fields: ["bobItemNotes", "deviceLocation"], unit: "kits" },
      filletKnife: { label: "Fillet Knife / Board", icon: "🔪", fields: ["bobItemNotes"], unit: "sets" },
      fishProcessing: { label: "Smoker / Dehydrator", icon: "🔥", fields: ["bobItemNotes", "deviceLocation"], unit: "units" },
      fishLicense: { label: "Fishing License", icon: "📄", fields: ["planExpiry", "bobItemNotes"], unit: "licenses" },
    },
  },
  alcohol: {
    label: "Alcohol", icon: "🥃", color: "#b45309", desc: "Spirits, wine, beer — barter & morale",
    subTypes: {
      whiskey: { label: "Whiskey / Bourbon", icon: "🥃", fields: ["alcBrand", "alcVolume", "alcABV", "bobItemQty", "deviceLocation"], unit: "bottles" },
      vodka: { label: "Vodka", icon: "🍸", fields: ["alcBrand", "alcVolume", "alcABV", "bobItemQty", "deviceLocation"], unit: "bottles" },
      rum: { label: "Rum", icon: "🏴‍☠️", fields: ["alcBrand", "alcVolume", "alcABV", "bobItemQty", "deviceLocation"], unit: "bottles" },
      tequila: { label: "Tequila / Mezcal", icon: "🌵", fields: ["alcBrand", "alcVolume", "alcABV", "bobItemQty", "deviceLocation"], unit: "bottles" },
      gin: { label: "Gin", icon: "🫒", fields: ["alcBrand", "alcVolume", "alcABV", "bobItemQty", "deviceLocation"], unit: "bottles" },
      wine: { label: "Wine", icon: "🍷", fields: ["alcBrand", "alcVolume", "alcWineType", "bobItemQty", "deviceLocation"], unit: "bottles" },
      beer: { label: "Beer / Cider", icon: "🍺", fields: ["alcBrand", "alcVolume", "bobItemQty", "deviceLocation"], unit: "cans/bottles", consumable: true },
      moonshine: { label: "Moonshine / Everclear", icon: "⚗️", fields: ["alcBrand", "alcVolume", "alcABV", "bobItemQty", "deviceLocation"], unit: "bottles" },
      brewKit: { label: "Homebrew Kit", icon: "🍺", fields: ["bobItemNotes", "deviceLocation"], unit: "kits" },
      medAlcohol: { label: "Isopropyl / Rubbing", icon: "🧴", fields: ["alcVolume", "bobItemQty", "deviceLocation"], unit: "bottles", consumable: true },
    },
  },
  recreational: {
    label: "Recreational", icon: "🚬", color: "#737373", desc: "Tobacco, cannabis, personal items — barter & morale",
    subTypes: {
      cigarettes: { label: "Cigarettes", icon: "🚬", fields: ["recBrand", "bobItemQty", "expiryDate", "deviceLocation"], unit: "packs", consumable: true },
      tobacco: { label: "Loose Tobacco", icon: "🍂", fields: ["recBrand", "recWeight", "bobItemQty", "deviceLocation"], unit: "pouches", consumable: true },
      rollingPapers: { label: "Rolling Papers / Tubes", icon: "📜", fields: ["bobItemQty", "deviceLocation"], unit: "packs", consumable: true },
      cigars: { label: "Cigars", icon: "🚬", fields: ["recBrand", "bobItemQty", "deviceLocation"], unit: "cigars", consumable: true },
      cannabis: { label: "Cannabis", icon: "🌿", fields: ["recStrain", "recForm", "recWeight", "bobItemQty", "deviceLocation"], unit: "items", consumable: true },
      edibles: { label: "Edibles", icon: "🍪", fields: ["recBrand", "recDosage", "bobItemQty", "expiryDate", "deviceLocation"], unit: "items", consumable: true },
      vape: { label: "Vape / Cartridges", icon: "💨", fields: ["recBrand", "bobItemQty", "deviceLocation"], unit: "items", consumable: true },
      lighter: { label: "Lighters / Matches", icon: "🔥", fields: ["bobItemQty", "deviceLocation"], unit: "items", consumable: true },
      accessories: { label: "Pipes / Accessories", icon: "🪈", fields: ["bobItemNotes", "deviceLocation"], unit: "items" },
      caffeine: { label: "Coffee / Tea / Caffeine", icon: "☕", fields: ["recBrand", "bobItemQty", "expiryDate", "deviceLocation"], unit: "items", consumable: true },
    },
  },
  books: {
    label: "Books", icon: "📚", color: "#92400e", desc: "Reference books, field guides, manuals",
    subTypes: {
      medical: { label: "Medical / First Aid", icon: "🩺", fields: ["bookAuthor", "bookEdition", "deviceLocation"], unit: "books" },
      ediblePlants: { label: "Edible Plants / Foraging", icon: "🌿", fields: ["bookAuthor", "bookRegion", "deviceLocation"], unit: "books" },
      survival: { label: "Survival / Bushcraft", icon: "🏕️", fields: ["bookAuthor", "deviceLocation"], unit: "books" },
      farming: { label: "Farming / Gardening", icon: "🌱", fields: ["bookAuthor", "deviceLocation"], unit: "books" },
      repair: { label: "Repair / Mechanical", icon: "🔧", fields: ["bookAuthor", "bookSubject", "deviceLocation"], unit: "books" },
      firearms: { label: "Firearms / Reloading", icon: "🎯", fields: ["bookAuthor", "deviceLocation"], unit: "books" },
      maps: { label: "Maps / Navigation", icon: "🗺️", fields: ["bookRegion", "bookScale", "deviceLocation"], unit: "items" },
      cooking: { label: "Cooking / Preservation", icon: "🍳", fields: ["bookAuthor", "deviceLocation"], unit: "books" },
      radio: { label: "HAM / Communications", icon: "📻", fields: ["bookAuthor", "deviceLocation"], unit: "books" },
      nuclear: { label: "CBRN / Nuclear", icon: "☢️", fields: ["bookAuthor", "deviceLocation"], unit: "books" },
      water: { label: "Water / Sanitation", icon: "💧", fields: ["bookAuthor", "deviceLocation"], unit: "books" },
      childCare: { label: "Childcare / Pediatric", icon: "👶", fields: ["bookAuthor", "deviceLocation"], unit: "books" },
      religious: { label: "Religious / Spiritual", icon: "📖", fields: ["bobItemNotes", "deviceLocation"], unit: "books" },
      fiction: { label: "Fiction / Morale", icon: "📕", fields: ["bookAuthor", "bobItemNotes", "deviceLocation"], unit: "books" },
      misc: { label: "Other Reference", icon: "📘", fields: ["bookAuthor", "bookSubject", "deviceLocation"], unit: "books" },
    },
  },
  nbc: {
    label: "CBRN / Nuclear", icon: "☢️", color: "#fbbf24", desc: "Respirators, hazmat, decon, dosimetry, KI",
    subTypes: {
      respirator: { label: "Respirator / Gas Mask", icon: "😷", fields: ["nbcBrand", "nbcModel", "nbcSize", "nbcFilterThread", "bobItemQty", "deviceLocation"], unit: "masks" },
      filters: { label: "Replacement Filters", icon: "🔄", fields: ["nbcFilterType", "nbcFilterThread", "expiryDate", "bobItemQty", "deviceLocation"], unit: "filters", consumable: true },
      hazmatSuit: { label: "Hazmat / Tyvek Suit", icon: "🦺", fields: ["nbcSize", "nbcRating", "bobItemQty", "deviceLocation"], unit: "suits", consumable: true },
      gloves: { label: "Chemical Gloves", icon: "🧤", fields: ["nbcSize", "nbcMaterial", "bobItemQty", "deviceLocation"], unit: "pairs", consumable: true },
      boots: { label: "Chemical Boots / Overboots", icon: "🥾", fields: ["nbcSize", "bobItemQty", "deviceLocation"], unit: "pairs" },
      kiTablets: { label: "Potassium Iodide (KI)", icon: "💊", fields: ["nbcDosage", "bobItemQty", "expiryDate", "deviceLocation"], unit: "tablets", consumable: true },
      dosimeter: { label: "Dosimeter / Geiger Counter", icon: "📟", fields: ["nbcBrand", "nbcModel", "isRechargeable", "deviceLocation"], unit: "devices" },
      radDetector: { label: "RAD Detector Card", icon: "📋", fields: ["bobItemQty", "expiryDate", "deviceLocation"], unit: "cards", consumable: true },
      deconKit: { label: "Decon Kit / Supplies", icon: "🧴", fields: ["bobItemNotes", "bobItemQty", "deviceLocation"], unit: "kits" },
      plasticSheeting: { label: "Plastic Sheeting / Tape", icon: "📦", fields: ["dimensions", "bobItemQty", "deviceLocation"], unit: "rolls", consumable: true },
      sealantTape: { label: "Duct Tape / Sealing Tape", icon: "🔲", fields: ["bobItemQty", "deviceLocation"], unit: "rolls", consumable: true },
      bodyBag: { label: "Body Bags / Disposal", icon: "⬛", fields: ["bobItemQty", "deviceLocation"], unit: "bags", consumable: true },
      prussianBlue: { label: "Prussian Blue (cesium)", icon: "💙", fields: ["nbcDosage", "bobItemQty", "expiryDate", "deviceLocation"], unit: "doses", consumable: true },
      shelterSupply: { label: "Shelter-in-Place Kit", icon: "🏠", fields: ["bobItemNotes", "deviceLocation"], unit: "kits" },
      contSuit: { label: "Full Containment Suit", icon: "🛡️", fields: ["nbcBrand", "nbcSize", "nbcRating", "deviceLocation"], unit: "suits" },
    },
  },
  clothing: {
    label: "Clothing", icon: "👕", color: "#6366f1", desc: "Apparel, footwear, cold & warm weather gear",
    subTypes: {
      underwear: { label: "Underwear", icon: "🩲", fields: ["clothSize", "bobItemQty", "deviceLocation"], unit: "items", consumable: true },
      socks: { label: "Socks", icon: "🧦", fields: ["clothSize", "clothMaterial", "bobItemQty", "deviceLocation"], unit: "pairs", consumable: true },
      thermalBase: { label: "Thermal Base Layers", icon: "🧥", fields: ["clothSize", "clothMaterial", "deviceLocation"], unit: "sets" },
      coldWeather: { label: "Cold Weather Gear", icon: "🧣", fields: ["clothType", "clothSize", "tempRating", "deviceLocation"], unit: "items" },
      warmWeather: { label: "Warm Weather Gear", icon: "☀️", fields: ["clothType", "clothSize", "deviceLocation"], unit: "items" },
      rainGear: { label: "Rain Gear", icon: "🌧️", fields: ["clothType", "clothSize", "deviceLocation"], unit: "items" },
      boots: { label: "Boots / Footwear", icon: "🥾", fields: ["clothType", "clothSize", "deviceLocation"], unit: "pairs" },
      gloves: { label: "Gloves / Mittens", icon: "🧤", fields: ["clothType", "clothSize", "tempRating", "deviceLocation"], unit: "pairs" },
      hats: { label: "Hats / Head Coverings", icon: "🧢", fields: ["clothType", "deviceLocation"], unit: "items" },
      tactical: { label: "Tactical / Work Wear", icon: "🦺", fields: ["clothType", "clothSize", "deviceLocation"], unit: "items" },
    },
  },
  pets: {
    label: "Pets", icon: "🐕", color: "#f472b6", desc: "Pet food, meds, supplies & evacuation gear",
    subTypes: {
      petFood: { label: "Pet Food", icon: "🦴", fields: ["petAnimal", "petFoodType", "weightLbs", "expiryDate", "deviceLocation"], unit: "bags", consumable: true },
      petMeds: { label: "Pet Medications", icon: "💊", fields: ["petAnimal", "petMedName", "daysSupply", "expiryDate", "deviceLocation"], unit: "items", consumable: true },
      petFirstAid: { label: "Pet First Aid", icon: "🩹", fields: ["petAnimal", "bobItemNotes", "deviceLocation"], unit: "kits" },
      petCarrier: { label: "Carrier / Crate", icon: "📦", fields: ["petAnimal", "petCarrierSize", "deviceLocation"], unit: "carriers" },
      petLeash: { label: "Leash / Harness / Collar", icon: "🦮", fields: ["petAnimal", "bobItemNotes", "deviceLocation"], unit: "items" },
      petWater: { label: "Pet Water / Bowls", icon: "🥣", fields: ["petAnimal", "capacity", "deviceLocation"], unit: "items" },
      petBedding: { label: "Bedding / Shelter", icon: "🛏️", fields: ["petAnimal", "bobItemNotes", "deviceLocation"], unit: "items" },
      petDocs: { label: "Vet Records / Tags", icon: "📋", fields: ["petAnimal", "petName", "bobItemNotes", "deviceLocation"], unit: "docs" },
    },
  },
  lighting: {
    label: "Lighting", icon: "🕯️", color: "#fcd34d", desc: "Flashlights, headlamps, lanterns, candles & fuel",
    subTypes: {
      flashlight: { label: "Flashlights", icon: "🔦", fields: ["lightBrand", "lightLumens", "lightBattery", "deviceLocation"], unit: "lights" },
      headlamp: { label: "Headlamps", icon: "⛑️", fields: ["lightBrand", "lightLumens", "lightBattery", "deviceLocation"], unit: "lamps" },
      lantern: { label: "Lanterns", icon: "🏮", fields: ["lightBrand", "lightFuel", "lightBurnTime", "deviceLocation"], unit: "lanterns" },
      candle: { label: "Candles", icon: "🕯️", fields: ["lightBurnTime", "bobItemQty", "deviceLocation"], unit: "candles", consumable: true },
      oilLamp: { label: "Oil Lamps", icon: "🪔", fields: ["lightFuel", "lightBurnTime", "deviceLocation"], unit: "lamps" },
      lampFuel: { label: "Lamp Oil / Fuel", icon: "🛢️", fields: ["lightFuel", "alcVolume", "deviceLocation"], unit: "bottles", consumable: true },
      bulbs: { label: "Replacement Bulbs", icon: "💡", fields: ["lightBulbType", "bobItemQty", "deviceLocation"], unit: "bulbs", consumable: true },
      chemlights: { label: "Chemlights / Glow Sticks", icon: "✨", fields: ["lightChemColor", "bobItemQty", "expiryDate", "deviceLocation"], unit: "sticks", consumable: true },
    },
  },
  bullion: {
    label: "Bullion", icon: "🪙", color: "#eab308", desc: "Gold, silver, precious metals — barter & store of value",
    subTypes: {
      goldCoin: { label: "Gold Coins", icon: "🥇", fields: ["bullionMetal", "bullionWeight", "bullionPurity", "bullionMint", "bullionPurchasePrice", "deviceLocation"], unit: "coins" },
      silverCoin: { label: "Silver Coins", icon: "🥈", fields: ["bullionMetal", "bullionWeight", "bullionPurity", "bullionMint", "bullionPurchasePrice", "deviceLocation"], unit: "coins" },
      goldBar: { label: "Gold Bars", icon: "🏅", fields: ["bullionMetal", "bullionWeight", "bullionPurity", "bullionMint", "bullionPurchasePrice", "deviceLocation"], unit: "bars" },
      silverBar: { label: "Silver Bars", icon: "🪨", fields: ["bullionMetal", "bullionWeight", "bullionPurity", "bullionMint", "bullionPurchasePrice", "deviceLocation"], unit: "bars" },
      goldback: { label: "Goldbacks", icon: "💵", fields: ["bullionGoldbackState", "bullionGoldbackDenom", "bullionPurchasePrice", "deviceLocation"], unit: "notes" },
      platinumCoin: { label: "Platinum / Palladium", icon: "⬜", fields: ["bullionMetal", "bullionWeight", "bullionPurity", "bullionMint", "bullionPurchasePrice", "deviceLocation"], unit: "coins" },
      junkSilver: { label: "Junk Silver (90%)", icon: "🪙", fields: ["bullionJunkType", "bullionFaceValue", "bullionPurchasePrice", "deviceLocation"], unit: "coins" },
    },
  },
  livestock: {
    label: "Livestock", icon: "🐔", color: "#a16207", desc: "Animals, feed, breeding, slaughter & preservation",
    subTypes: {
      chickens: { label: "Chickens", icon: "🐔", fields: ["animalCount", "animalStatus", "animalFeedType", "animalFeedLbs", "animalNotes", "deviceLocation"], unit: "birds" },
      goats: { label: "Goats", icon: "🐐", fields: ["animalCount", "animalStatus", "animalFeedType", "animalFeedLbs", "animalNotes", "deviceLocation"], unit: "head" },
      cattle: { label: "Cattle", icon: "🐄", fields: ["animalCount", "animalStatus", "animalFeedType", "animalFeedLbs", "animalNotes", "deviceLocation"], unit: "head" },
      pigs: { label: "Pigs", icon: "🐖", fields: ["animalCount", "animalStatus", "animalFeedType", "animalFeedLbs", "animalNotes", "deviceLocation"], unit: "head" },
      sheep: { label: "Sheep", icon: "🐑", fields: ["animalCount", "animalStatus", "animalFeedType", "animalFeedLbs", "animalNotes", "deviceLocation"], unit: "head" },
      rabbits: { label: "Rabbits", icon: "🐇", fields: ["animalCount", "animalStatus", "animalFeedType", "animalFeedLbs", "animalNotes", "deviceLocation"], unit: "head" },
      ducks: { label: "Ducks", icon: "🦆", fields: ["animalCount", "animalStatus", "animalFeedType", "animalFeedLbs", "animalNotes", "deviceLocation"], unit: "birds" },
      turkeys: { label: "Turkeys", icon: "🦃", fields: ["animalCount", "animalStatus", "animalFeedType", "animalFeedLbs", "animalNotes", "deviceLocation"], unit: "birds" },
      horses: { label: "Horses", icon: "🐴", fields: ["animalCount", "animalStatus", "animalFeedType", "animalFeedLbs", "animalNotes", "deviceLocation"], unit: "head" },
      bees: { label: "Bees", icon: "🐝", fields: ["animalCount", "animalNotes", "deviceLocation"], unit: "hives" },
      feed: { label: "Animal Feed", icon: "🌾", fields: ["animalFeedType", "weightLbs", "expiryDate", "deviceLocation"], unit: "lbs", consumable: true },
      hay: { label: "Hay / Straw", icon: "🟫", fields: ["weightLbs", "animalNotes", "deviceLocation"], unit: "bales", consumable: true },
      fencing: { label: "Fencing / Enclosures", icon: "🔲", fields: ["lengthFt", "animalNotes", "deviceLocation"], unit: "ft" },
      vetSupplies: { label: "Vet Supplies", icon: "💊", fields: ["animalNotes", "expiryDate", "deviceLocation"], unit: "kits" },
    },
  },
};

const SCENARIOS = {
  economic: { label: "Economic Collapse", icon: "📉", desc: "Supply chains fail, banks close", weights: { water: 0.8, food: 1, medical: 0.6, firewood: 0.5, fuel: 0.6, shelter: 0.3, tools: 0.7, comms: 0.4, defense: 0.7, firearms: 0.8, hygiene: 0.3, power: 0.5, batteries: 0.4, electronics: 0.3, vehicles: 0.5, equipment: 0.3, farm: 0.9, bugout: 0.6, kids: 0.7, boat: 0.3, fishing: 0.7, alcohol: 0.5, recreational: 0.2, books: 0.5, nbc: 0.2, clothing: 0.6, pets: 0.5, lighting: 0.4, bullion: 0.9, livestock: 0.9 }, defaultDur: 180 },
  emp: { label: "EMP Attack", icon: "⚡", desc: "Electronics disabled, grid down", weights: { water: 1, food: 1, medical: 0.8, firewood: 0.9, fuel: 0.7, shelter: 0.5, tools: 0.9, comms: 1, defense: 0.6, firearms: 0.7, hygiene: 0.4, power: 1, batteries: 0.9, electronics: 0.2, vehicles: 0.3, equipment: 0.4, farm: 1, bugout: 0.8, kids: 0.8, boat: 0.2, fishing: 0.8, alcohol: 0.4, recreational: 0.1, books: 0.7, nbc: 0.3, clothing: 0.7, pets: 0.6, lighting: 0.9, bullion: 0.3, livestock: 1.0 }, defaultDur: 365 },
  wildfire: { label: "Wildfire", icon: "🌲", desc: "Evacuation, dangerous air", weights: { water: 0.9, food: 0.7, medical: 0.9, firewood: 0.1, fuel: 0.8, shelter: 1, tools: 0.6, comms: 0.8, defense: 0.2, firearms: 0.2, hygiene: 0.5, power: 0.6, batteries: 0.5, electronics: 0.6, vehicles: 0.9, equipment: 0.4, farm: 0.1, bugout: 1, kids: 1, boat: 0.4, fishing: 0.1, alcohol: 0.1, recreational: 0.1, books: 0.2, nbc: 0.3, clothing: 0.8, pets: 0.9, lighting: 0.5, bullion: 0.1, livestock: 0.3 }, defaultDur: 30 },
  nuclear: { label: "Nuclear", icon: "☢️", desc: "Radiation fallout, shelter-in-place", weights: { water: 1, food: 1, medical: 1, firewood: 0.5, fuel: 0.5, shelter: 1, tools: 0.5, comms: 0.7, defense: 0.3, firearms: 0.4, hygiene: 0.8, power: 0.8, batteries: 0.6, electronics: 0.4, vehicles: 0.3, equipment: 0.5, farm: 0.3, bugout: 0.7, kids: 0.9, boat: 0.1, fishing: 0.2, alcohol: 0.3, recreational: 0.1, books: 0.6, nbc: 1.0, clothing: 0.6, pets: 0.4, lighting: 0.7, bullion: 0.2, livestock: 0.4 }, defaultDur: 90 },
  pandemic: { label: "Pandemic", icon: "🦠", desc: "Quarantine, supply disruptions", weights: { water: 0.7, food: 0.9, medical: 1, firewood: 0.3, fuel: 0.4, shelter: 0.2, tools: 0.3, comms: 0.5, defense: 0.2, firearms: 0.3, hygiene: 1, power: 0.4, batteries: 0.3, electronics: 0.4, vehicles: 0.3, equipment: 0.2, farm: 0.7, bugout: 0.3, kids: 0.9, boat: 0.1, fishing: 0.4, alcohol: 0.3, recreational: 0.2, books: 0.4, nbc: 0.6, clothing: 0.3, pets: 0.7, lighting: 0.3, bullion: 0.4, livestock: 0.7 }, defaultDur: 120 },
  grid: { label: "Grid Failure", icon: "🔌", desc: "Blackout, no heat/cooling", weights: { water: 1, food: 0.8, medical: 0.5, firewood: 1, fuel: 0.9, shelter: 0.6, tools: 0.7, comms: 0.6, defense: 0.3, firearms: 0.4, hygiene: 0.4, power: 1, batteries: 0.8, electronics: 0.5, vehicles: 0.4, equipment: 0.4, farm: 0.5, bugout: 0.5, kids: 0.7, boat: 0.2, fishing: 0.5, alcohol: 0.3, recreational: 0.1, books: 0.5, nbc: 0.1, clothing: 0.5, pets: 0.5, lighting: 1.0, bullion: 0.2, livestock: 0.6 }, defaultDur: 60 },
  winter: { label: "Winter Storm", icon: "🌨️", desc: "Blizzard, ice storm, roads impassable", weights: { water: 0.8, food: 0.8, medical: 0.6, firewood: 1, fuel: 1, shelter: 0.8, tools: 0.7, comms: 0.5, defense: 0.1, firearms: 0.1, hygiene: 0.3, power: 0.9, batteries: 0.7, electronics: 0.4, vehicles: 0.6, equipment: 0.5, farm: 0.1, bugout: 0.3, kids: 0.8, boat: 0.0, fishing: 0.1, alcohol: 0.2, recreational: 0.2, books: 0.3, nbc: 0.0, clothing: 1.0, pets: 0.6, lighting: 0.8, bullion: 0.1, livestock: 0.5 }, defaultDur: 14 },
  solarFlare: { label: "Solar Flare", icon: "☀️", desc: "Carrington-class event, grid & satellites down", weights: { water: 1, food: 1, medical: 0.7, firewood: 0.8, fuel: 0.7, shelter: 0.4, tools: 0.9, comms: 1, defense: 0.5, firearms: 0.6, hygiene: 0.3, power: 1, batteries: 0.9, electronics: 0.1, vehicles: 0.4, equipment: 0.4, farm: 0.9, bugout: 0.6, kids: 0.7, boat: 0.2, fishing: 0.7, alcohol: 0.4, recreational: 0.1, books: 0.8, nbc: 0.1, clothing: 0.6, pets: 0.5, lighting: 0.9, bullion: 0.3, livestock: 0.9 }, defaultDur: 365 },
  waterCrisis: { label: "Water Disruption", icon: "🚱", desc: "Municipal water contamination or failure", weights: { water: 1, food: 0.5, medical: 0.6, firewood: 0.2, fuel: 0.3, shelter: 0.2, tools: 0.4, comms: 0.3, defense: 0.2, firearms: 0.2, hygiene: 0.7, power: 0.4, batteries: 0.2, electronics: 0.2, vehicles: 0.5, equipment: 0.6, farm: 0.4, bugout: 0.4, kids: 0.8, boat: 0.3, fishing: 0.2, alcohol: 0.1, recreational: 0.1, books: 0.3, nbc: 0.2, clothing: 0.2, pets: 0.4, lighting: 0.3, bullion: 0.1, livestock: 0.5 }, defaultDur: 30 },
  supplyChain: { label: "Supply Chain Shock", icon: "📦", desc: "Ports closed, shelves empty, delivery halt", weights: { water: 0.6, food: 1, medical: 0.8, firewood: 0.3, fuel: 0.7, shelter: 0.2, tools: 0.5, comms: 0.3, defense: 0.4, firearms: 0.5, hygiene: 0.6, power: 0.3, batteries: 0.5, electronics: 0.2, vehicles: 0.4, equipment: 0.4, farm: 1, bugout: 0.3, kids: 0.9, boat: 0.2, fishing: 0.8, alcohol: 0.6, recreational: 0.3, books: 0.3, nbc: 0.1, clothing: 0.7, pets: 0.6, lighting: 0.5, bullion: 0.7, livestock: 0.9 }, defaultDur: 180 },
  russiaWar: { label: "Russia Conflict", icon: "🇷🇺", desc: "NATO conflict escalation, nuclear threat", weights: { water: 0.9, food: 0.9, medical: 0.8, firewood: 0.7, fuel: 0.8, shelter: 0.8, tools: 0.6, comms: 0.8, defense: 0.7, firearms: 0.7, hygiene: 0.5, power: 0.7, batteries: 0.6, electronics: 0.5, vehicles: 0.5, equipment: 0.5, farm: 0.7, bugout: 0.8, kids: 0.9, boat: 0.3, fishing: 0.5, alcohol: 0.4, recreational: 0.2, books: 0.6, nbc: 0.9, clothing: 0.7, pets: 0.5, lighting: 0.6, bullion: 0.5, livestock: 0.7 }, defaultDur: 365 },
  chinaWar: { label: "China Conflict", icon: "🇨🇳", desc: "Pacific conflict, trade collapse, cyber attacks", weights: { water: 0.7, food: 1, medical: 0.7, firewood: 0.4, fuel: 0.8, shelter: 0.3, tools: 0.6, comms: 0.7, defense: 0.5, firearms: 0.5, hygiene: 0.4, power: 0.6, batteries: 0.7, electronics: 0.3, vehicles: 0.4, equipment: 0.5, farm: 0.9, bugout: 0.5, kids: 0.8, boat: 0.2, fishing: 0.7, alcohol: 0.5, recreational: 0.2, books: 0.4, nbc: 0.4, clothing: 0.6, pets: 0.5, lighting: 0.5, bullion: 0.6, livestock: 0.8 }, defaultDur: 365 },
  aiDisrupt: { label: "AI Disruption", icon: "🤖", desc: "Mass unemployment, infrastructure failures, social collapse", weights: { water: 0.5, food: 0.7, medical: 0.5, firewood: 0.3, fuel: 0.4, shelter: 0.2, tools: 0.5, comms: 0.4, defense: 0.6, firearms: 0.6, hygiene: 0.2, power: 0.5, batteries: 0.3, electronics: 0.3, vehicles: 0.3, equipment: 0.3, farm: 0.8, bugout: 0.4, kids: 0.6, boat: 0.2, fishing: 0.5, alcohol: 0.5, recreational: 0.3, books: 0.7, nbc: 0.1, clothing: 0.4, pets: 0.4, lighting: 0.4, bullion: 0.8, livestock: 0.7 }, defaultDur: 365 },
};

const CLIMATES = {
  arctic: { label: "Arctic", firewoodMod: 2.5, fuelMod: 2, waterMod: 0.7, icon: "🧊" },
  cold: { label: "Cold Continental", firewoodMod: 1.8, fuelMod: 1.5, waterMod: 0.8, icon: "❄️" },
  temperate: { label: "Temperate", firewoodMod: 1, fuelMod: 1, waterMod: 1, icon: "🌤️" },
  hot_dry: { label: "Hot & Dry", firewoodMod: 0.3, fuelMod: 0.8, waterMod: 1.8, icon: "🏜️" },
  tropical: { label: "Tropical", firewoodMod: 0.1, fuelMod: 0.6, waterMod: 1.3, icon: "🌴" },
  coastal: { label: "Coastal", firewoodMod: 0.5, fuelMod: 0.8, waterMod: 1.1, icon: "🌊" },
};

/* ── Growing Zones — frost dates + season length per climate ── */
const GROWING_ZONES = {
  arctic:    { lastFrostMonth: 5, lastFrostDay: 31, firstFrostMonth: 8,  firstFrostDay: 15, seasonWeeks: 10 },
  cold:      { lastFrostMonth: 4, lastFrostDay: 25, firstFrostMonth: 9,  firstFrostDay: 25, seasonWeeks: 20 },
  temperate: { lastFrostMonth: 3, lastFrostDay: 25, firstFrostMonth: 10, firstFrostDay: 25, seasonWeeks: 28 },
  hot_dry:   { lastFrostMonth: 2, lastFrostDay: 15, firstFrostMonth: 11, firstFrostDay: 15, seasonWeeks: 36 },
  tropical:  { lastFrostMonth: 0, lastFrostDay: 0,  firstFrostMonth: 0,  firstFrostDay: 0,  seasonWeeks: 52 },
  coastal:   { lastFrostMonth: 2, lastFrostDay: 28, firstFrostMonth: 11, firstFrostDay: 10, seasonWeeks: 34 },
};

/* ── Crop Database — ~30 crops with per-zone growing data ── */
const CROP_DATABASE = [
  { id: "tomato", name: "Tomato", icon: "🍅", cat: "vegetable", spacingSqFt: 4, companions: ["basil","carrot","pepper","onion"], avoid: ["cabbage","fennel","corn"],
    zones: { arctic: { indoorWeeks: 10, directSowWeeks: null, daysToHarvest: 85, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 6, storageLife: 14 }, cold: { indoorWeeks: 8, directSowWeeks: null, daysToHarvest: 75, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 10, storageLife: 14 }, temperate: { indoorWeeks: 6, directSowWeeks: null, daysToHarvest: 70, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 12, storageLife: 14 }, hot_dry: { indoorWeeks: 4, directSowWeeks: null, daysToHarvest: 65, waterFreq: "2x daily", fertSchedule: "every 2 weeks", yieldPerPlant: 10, storageLife: 10 }, tropical: { indoorWeeks: 0, directSowWeeks: 0, daysToHarvest: 60, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 14, storageLife: 7 }, coastal: { indoorWeeks: 5, directSowWeeks: null, daysToHarvest: 70, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 11, storageLife: 12 } },
    pestInfo: "Hornworms, aphids, blight. Use BT spray for hornworms, neem oil for aphids. Rotate beds yearly.", harvestTip: "Firm, fully colored, slight give when squeezed. Pick before first frost." },
  { id: "lettuce", name: "Lettuce", icon: "🥬", cat: "vegetable", spacingSqFt: 1, companions: ["carrot","radish","strawberry","onion"], avoid: ["celery"],
    zones: { arctic: { indoorWeeks: 6, directSowWeeks: 0, daysToHarvest: 55, waterFreq: "daily", fertSchedule: "every 3 weeks", yieldPerPlant: 0.5, storageLife: 10 }, cold: { indoorWeeks: 4, directSowWeeks: -2, daysToHarvest: 50, waterFreq: "daily", fertSchedule: "every 3 weeks", yieldPerPlant: 0.5, storageLife: 10 }, temperate: { indoorWeeks: 3, directSowWeeks: -3, daysToHarvest: 45, waterFreq: "daily", fertSchedule: "every 3 weeks", yieldPerPlant: 0.5, storageLife: 10 }, hot_dry: { indoorWeeks: 6, directSowWeeks: null, daysToHarvest: 40, waterFreq: "2x daily", fertSchedule: "every 3 weeks", yieldPerPlant: 0.4, storageLife: 7 }, tropical: { indoorWeeks: 0, directSowWeeks: 0, daysToHarvest: 35, waterFreq: "daily", fertSchedule: "every 3 weeks", yieldPerPlant: 0.4, storageLife: 5 }, coastal: { indoorWeeks: 3, directSowWeeks: -2, daysToHarvest: 45, waterFreq: "daily", fertSchedule: "every 3 weeks", yieldPerPlant: 0.5, storageLife: 10 } },
    pestInfo: "Slugs, aphids. Use diatomaceous earth for slugs, companion plant with chives.", harvestTip: "Cut outer leaves when 4-6 inches. Harvest head types when firm." },
  { id: "carrot", name: "Carrot", icon: "🥕", cat: "root", spacingSqFt: 1, companions: ["tomato","lettuce","onion","peas","rosemary"], avoid: ["dill"],
    zones: { arctic: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 80, waterFreq: "3x week", fertSchedule: "monthly", yieldPerPlant: 0.25, storageLife: 120 }, cold: { indoorWeeks: null, directSowWeeks: -2, daysToHarvest: 75, waterFreq: "3x week", fertSchedule: "monthly", yieldPerPlant: 0.3, storageLife: 120 }, temperate: { indoorWeeks: null, directSowWeeks: -3, daysToHarvest: 70, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 0.3, storageLife: 120 }, hot_dry: { indoorWeeks: null, directSowWeeks: -2, daysToHarvest: 65, waterFreq: "daily", fertSchedule: "monthly", yieldPerPlant: 0.25, storageLife: 90 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 60, waterFreq: "daily", fertSchedule: "monthly", yieldPerPlant: 0.2, storageLife: 60 }, coastal: { indoorWeeks: null, directSowWeeks: -3, daysToHarvest: 70, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 0.3, storageLife: 120 } },
    pestInfo: "Carrot fly, wireworms. Use row covers. Companion plant with onions to deter flies.", harvestTip: "Shoulders visible above soil, 1/2-3/4 inch diameter. Twist and pull gently." },
  { id: "potato", name: "Potato", icon: "🥔", cat: "root", spacingSqFt: 4, companions: ["beans","corn","cabbage","horseradish"], avoid: ["tomato","squash"],
    zones: { arctic: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 100, waterFreq: "2x week", fertSchedule: "at planting + midseason", yieldPerPlant: 3, storageLife: 180 }, cold: { indoorWeeks: null, directSowWeeks: -2, daysToHarvest: 90, waterFreq: "2x week", fertSchedule: "at planting + midseason", yieldPerPlant: 4, storageLife: 180 }, temperate: { indoorWeeks: null, directSowWeeks: -3, daysToHarvest: 85, waterFreq: "2x week", fertSchedule: "at planting + midseason", yieldPerPlant: 5, storageLife: 180 }, hot_dry: { indoorWeeks: null, directSowWeeks: -4, daysToHarvest: 80, waterFreq: "3x week", fertSchedule: "at planting + midseason", yieldPerPlant: 3, storageLife: 120 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 75, waterFreq: "2x week", fertSchedule: "at planting + midseason", yieldPerPlant: 3, storageLife: 90 }, coastal: { indoorWeeks: null, directSowWeeks: -3, daysToHarvest: 85, waterFreq: "2x week", fertSchedule: "at planting + midseason", yieldPerPlant: 4, storageLife: 150 } },
    pestInfo: "Colorado potato beetle, blight. Rotate yearly. Hill soil as plants grow.", harvestTip: "Harvest 2-3 weeks after foliage dies. Cure in dark, cool place for 2 weeks." },
  { id: "beans", name: "Beans", icon: "🫘", cat: "vegetable", spacingSqFt: 1, companions: ["corn","squash","carrot","cucumber"], avoid: ["onion","garlic","pepper"],
    zones: { arctic: { indoorWeeks: 4, directSowWeeks: 1, daysToHarvest: 65, waterFreq: "2x week", fertSchedule: "at planting only", yieldPerPlant: 0.5, storageLife: 365 }, cold: { indoorWeeks: null, directSowWeeks: 1, daysToHarvest: 60, waterFreq: "2x week", fertSchedule: "at planting only", yieldPerPlant: 0.5, storageLife: 365 }, temperate: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 55, waterFreq: "2x week", fertSchedule: "at planting only", yieldPerPlant: 0.5, storageLife: 365 }, hot_dry: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 50, waterFreq: "3x week", fertSchedule: "at planting only", yieldPerPlant: 0.4, storageLife: 365 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 50, waterFreq: "2x week", fertSchedule: "at planting only", yieldPerPlant: 0.5, storageLife: 365 }, coastal: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 55, waterFreq: "2x week", fertSchedule: "at planting only", yieldPerPlant: 0.5, storageLife: 365 } },
    pestInfo: "Bean beetles, aphids. Handpick beetles. Beans fix nitrogen — minimal fertilizer needed.", harvestTip: "Bush: pick when pods snap cleanly. Pole: harvest regularly to keep producing." },
  { id: "peas", name: "Peas", icon: "🟢", cat: "vegetable", spacingSqFt: 1, companions: ["carrot","radish","beans","corn"], avoid: ["onion","garlic"],
    zones: { arctic: { indoorWeeks: null, directSowWeeks: -2, daysToHarvest: 65, waterFreq: "2x week", fertSchedule: "at planting only", yieldPerPlant: 0.3, storageLife: 365 }, cold: { indoorWeeks: null, directSowWeeks: -4, daysToHarvest: 60, waterFreq: "2x week", fertSchedule: "at planting only", yieldPerPlant: 0.3, storageLife: 365 }, temperate: { indoorWeeks: null, directSowWeeks: -6, daysToHarvest: 58, waterFreq: "2x week", fertSchedule: "at planting only", yieldPerPlant: 0.3, storageLife: 365 }, hot_dry: { indoorWeeks: null, directSowWeeks: -6, daysToHarvest: 55, waterFreq: "3x week", fertSchedule: "at planting only", yieldPerPlant: 0.2, storageLife: 365 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 55, waterFreq: "2x week", fertSchedule: "at planting only", yieldPerPlant: 0.2, storageLife: 365 }, coastal: { indoorWeeks: null, directSowWeeks: -5, daysToHarvest: 58, waterFreq: "2x week", fertSchedule: "at planting only", yieldPerPlant: 0.3, storageLife: 365 } },
    pestInfo: "Aphids, powdery mildew. Good air circulation. Peas fix nitrogen in soil.", harvestTip: "Snap peas: pick when plump. Shell peas: pods rounded and firm. Pick often to keep producing." },
  { id: "pepper", name: "Pepper", icon: "🌶️", cat: "vegetable", spacingSqFt: 2, companions: ["tomato","basil","carrot","onion"], avoid: ["fennel","beans"],
    zones: { arctic: { indoorWeeks: 12, directSowWeeks: null, daysToHarvest: 80, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 4, storageLife: 14 }, cold: { indoorWeeks: 10, directSowWeeks: null, daysToHarvest: 75, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 5, storageLife: 14 }, temperate: { indoorWeeks: 8, directSowWeeks: null, daysToHarvest: 68, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 6, storageLife: 14 }, hot_dry: { indoorWeeks: 6, directSowWeeks: null, daysToHarvest: 65, waterFreq: "2x daily", fertSchedule: "every 2 weeks", yieldPerPlant: 5, storageLife: 10 }, tropical: { indoorWeeks: 0, directSowWeeks: 0, daysToHarvest: 60, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 8, storageLife: 10 }, coastal: { indoorWeeks: 7, directSowWeeks: null, daysToHarvest: 68, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 6, storageLife: 14 } },
    pestInfo: "Aphids, hornworms, blossom end rot. Consistent watering prevents end rot. Use calcium if needed.", harvestTip: "Green when firm and full-sized. Color peppers: wait for full color change." },
  { id: "cucumber", name: "Cucumber", icon: "🥒", cat: "vegetable", spacingSqFt: 4, companions: ["beans","peas","corn","radish"], avoid: ["potato","melon"],
    zones: { arctic: { indoorWeeks: 6, directSowWeeks: 2, daysToHarvest: 60, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 5, storageLife: 10 }, cold: { indoorWeeks: 4, directSowWeeks: 1, daysToHarvest: 55, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 6, storageLife: 10 }, temperate: { indoorWeeks: 3, directSowWeeks: 1, daysToHarvest: 55, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 8, storageLife: 10 }, hot_dry: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 50, waterFreq: "2x daily", fertSchedule: "every 2 weeks", yieldPerPlant: 6, storageLife: 7 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 45, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 8, storageLife: 7 }, coastal: { indoorWeeks: 3, directSowWeeks: 1, daysToHarvest: 55, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 7, storageLife: 10 } },
    pestInfo: "Cucumber beetles, powdery mildew. Use row covers early. Spray neem for beetles.", harvestTip: "Pick at 6-8 inches for slicing, 2-4 for pickling. Don't let them get yellow." },
  { id: "zucchini", name: "Zucchini", icon: "🥒", cat: "vegetable", spacingSqFt: 4, companions: ["corn","beans","radish","peas"], avoid: ["potato"],
    zones: { arctic: { indoorWeeks: 4, directSowWeeks: 1, daysToHarvest: 55, waterFreq: "3x week", fertSchedule: "every 2 weeks", yieldPerPlant: 8, storageLife: 14 }, cold: { indoorWeeks: 3, directSowWeeks: 1, daysToHarvest: 50, waterFreq: "3x week", fertSchedule: "every 2 weeks", yieldPerPlant: 10, storageLife: 14 }, temperate: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 48, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 12, storageLife: 14 }, hot_dry: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 45, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 10, storageLife: 10 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 42, waterFreq: "3x week", fertSchedule: "every 2 weeks", yieldPerPlant: 14, storageLife: 7 }, coastal: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 48, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 11, storageLife: 14 } },
    pestInfo: "Squash vine borers, squash bugs, powdery mildew. Check stems for borers weekly.", harvestTip: "Pick at 6-8 inches for best flavor. Check daily — they grow fast!" },
  { id: "winter_squash", name: "Winter Squash", icon: "🎃", cat: "vegetable", spacingSqFt: 9, companions: ["corn","beans","radish"], avoid: ["potato"],
    zones: { arctic: { indoorWeeks: 6, directSowWeeks: null, daysToHarvest: 110, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 6, storageLife: 180 }, cold: { indoorWeeks: 4, directSowWeeks: 1, daysToHarvest: 100, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 8, storageLife: 180 }, temperate: { indoorWeeks: 3, directSowWeeks: 1, daysToHarvest: 95, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 10, storageLife: 180 }, hot_dry: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 90, waterFreq: "3x week", fertSchedule: "monthly", yieldPerPlant: 8, storageLife: 150 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 85, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 10, storageLife: 120 }, coastal: { indoorWeeks: 3, directSowWeeks: 1, daysToHarvest: 95, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 9, storageLife: 180 } },
    pestInfo: "Squash vine borers, squash bugs. Wrap stems with foil. Check for eggs under leaves.", harvestTip: "Rind hard, stem dry and corky. Cure in sun 1-2 weeks before storage." },
  { id: "corn", name: "Corn", icon: "🌽", cat: "vegetable", spacingSqFt: 1, companions: ["beans","squash","peas","cucumber"], avoid: ["tomato"],
    zones: { arctic: { indoorWeeks: 4, directSowWeeks: 1, daysToHarvest: 85, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 1, storageLife: 7 }, cold: { indoorWeeks: null, directSowWeeks: 1, daysToHarvest: 80, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 1, storageLife: 7 }, temperate: { indoorWeeks: null, directSowWeeks: 1, daysToHarvest: 75, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 1.5, storageLife: 7 }, hot_dry: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 70, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 1, storageLife: 5 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 65, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 1.5, storageLife: 5 }, coastal: { indoorWeeks: null, directSowWeeks: 1, daysToHarvest: 75, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 1.5, storageLife: 7 } },
    pestInfo: "Corn earworm, armyworm. Apply mineral oil to silk tips. Plant in blocks for pollination.", harvestTip: "Silk brown and dry, kernels milky when punctured. Eat within hours for best sweetness." },
  { id: "beet", name: "Beet", icon: "🟣", cat: "root", spacingSqFt: 1, companions: ["onion","lettuce","cabbage"], avoid: ["beans"],
    zones: { arctic: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 60, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 0.25, storageLife: 120 }, cold: { indoorWeeks: null, directSowWeeks: -2, daysToHarvest: 55, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 0.3, storageLife: 120 }, temperate: { indoorWeeks: null, directSowWeeks: -3, daysToHarvest: 55, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 0.3, storageLife: 120 }, hot_dry: { indoorWeeks: null, directSowWeeks: -3, daysToHarvest: 50, waterFreq: "3x week", fertSchedule: "monthly", yieldPerPlant: 0.25, storageLife: 90 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 50, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 0.2, storageLife: 60 }, coastal: { indoorWeeks: null, directSowWeeks: -3, daysToHarvest: 55, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 0.3, storageLife: 120 } },
    pestInfo: "Leaf miners, flea beetles. Row covers help. Greens are also edible and nutritious.", harvestTip: "Golf ball to tennis ball size. Smaller = sweeter. Greens harvested separately." },
  { id: "radish", name: "Radish", icon: "🔴", cat: "root", spacingSqFt: 1, companions: ["lettuce","peas","cucumber","carrot"], avoid: [],
    zones: { arctic: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 30, waterFreq: "3x week", fertSchedule: "none", yieldPerPlant: 0.1, storageLife: 30 }, cold: { indoorWeeks: null, directSowWeeks: -3, daysToHarvest: 28, waterFreq: "2x week", fertSchedule: "none", yieldPerPlant: 0.1, storageLife: 30 }, temperate: { indoorWeeks: null, directSowWeeks: -4, daysToHarvest: 25, waterFreq: "2x week", fertSchedule: "none", yieldPerPlant: 0.1, storageLife: 30 }, hot_dry: { indoorWeeks: null, directSowWeeks: -4, daysToHarvest: 22, waterFreq: "daily", fertSchedule: "none", yieldPerPlant: 0.08, storageLife: 21 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 22, waterFreq: "daily", fertSchedule: "none", yieldPerPlant: 0.08, storageLife: 14 }, coastal: { indoorWeeks: null, directSowWeeks: -4, daysToHarvest: 25, waterFreq: "2x week", fertSchedule: "none", yieldPerPlant: 0.1, storageLife: 30 } },
    pestInfo: "Flea beetles. Use row covers. Fast grower — great for succession planting every 2 weeks.", harvestTip: "Pull when shoulders are 1 inch across. Don't let them get woody." },
  { id: "onion", name: "Onion", icon: "🧅", cat: "root", spacingSqFt: 1, companions: ["carrot","beet","lettuce","tomato","pepper"], avoid: ["beans","peas"],
    zones: { arctic: { indoorWeeks: 12, directSowWeeks: null, daysToHarvest: 110, waterFreq: "2x week", fertSchedule: "every 3 weeks", yieldPerPlant: 0.5, storageLife: 180 }, cold: { indoorWeeks: 10, directSowWeeks: null, daysToHarvest: 100, waterFreq: "2x week", fertSchedule: "every 3 weeks", yieldPerPlant: 0.5, storageLife: 180 }, temperate: { indoorWeeks: 8, directSowWeeks: null, daysToHarvest: 100, waterFreq: "2x week", fertSchedule: "every 3 weeks", yieldPerPlant: 0.5, storageLife: 180 }, hot_dry: { indoorWeeks: 6, directSowWeeks: null, daysToHarvest: 90, waterFreq: "3x week", fertSchedule: "every 3 weeks", yieldPerPlant: 0.5, storageLife: 120 }, tropical: { indoorWeeks: 0, directSowWeeks: 0, daysToHarvest: 85, waterFreq: "2x week", fertSchedule: "every 3 weeks", yieldPerPlant: 0.4, storageLife: 90 }, coastal: { indoorWeeks: 8, directSowWeeks: null, daysToHarvest: 100, waterFreq: "2x week", fertSchedule: "every 3 weeks", yieldPerPlant: 0.5, storageLife: 150 } },
    pestInfo: "Onion maggots, thrips. Rotate beds. Use row covers against maggots.", harvestTip: "Tops fall over naturally. Pull, cure in dry shade for 2-4 weeks before storage." },
  { id: "garlic", name: "Garlic", icon: "🧄", cat: "root", spacingSqFt: 1, companions: ["tomato","pepper","beet","carrot"], avoid: ["beans","peas"],
    zones: { arctic: { indoorWeeks: null, directSowWeeks: -8, daysToHarvest: 240, waterFreq: "weekly", fertSchedule: "early spring + midseason", yieldPerPlant: 0.15, storageLife: 270 }, cold: { indoorWeeks: null, directSowWeeks: -8, daysToHarvest: 240, waterFreq: "weekly", fertSchedule: "early spring + midseason", yieldPerPlant: 0.15, storageLife: 270 }, temperate: { indoorWeeks: null, directSowWeeks: -8, daysToHarvest: 210, waterFreq: "weekly", fertSchedule: "early spring + midseason", yieldPerPlant: 0.15, storageLife: 270 }, hot_dry: { indoorWeeks: null, directSowWeeks: -6, daysToHarvest: 180, waterFreq: "weekly", fertSchedule: "early spring + midseason", yieldPerPlant: 0.12, storageLife: 180 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 150, waterFreq: "weekly", fertSchedule: "early spring + midseason", yieldPerPlant: 0.1, storageLife: 120 }, coastal: { indoorWeeks: null, directSowWeeks: -7, daysToHarvest: 210, waterFreq: "weekly", fertSchedule: "early spring + midseason", yieldPerPlant: 0.15, storageLife: 240 } },
    pestInfo: "Few pests. Excellent companion plant. Plant fall for spring harvest.", harvestTip: "Lower 3-4 leaves brown. Cure hanging in dry, airy location for 3-4 weeks." },
  { id: "spinach", name: "Spinach", icon: "🥬", cat: "vegetable", spacingSqFt: 1, companions: ["strawberry","peas","beans","onion"], avoid: [],
    zones: { arctic: { indoorWeeks: null, directSowWeeks: -1, daysToHarvest: 45, waterFreq: "3x week", fertSchedule: "every 3 weeks", yieldPerPlant: 0.3, storageLife: 10 }, cold: { indoorWeeks: null, directSowWeeks: -4, daysToHarvest: 42, waterFreq: "2x week", fertSchedule: "every 3 weeks", yieldPerPlant: 0.3, storageLife: 10 }, temperate: { indoorWeeks: null, directSowWeeks: -5, daysToHarvest: 40, waterFreq: "2x week", fertSchedule: "every 3 weeks", yieldPerPlant: 0.3, storageLife: 10 }, hot_dry: { indoorWeeks: null, directSowWeeks: -6, daysToHarvest: 35, waterFreq: "daily", fertSchedule: "every 3 weeks", yieldPerPlant: 0.2, storageLife: 7 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 35, waterFreq: "daily", fertSchedule: "every 3 weeks", yieldPerPlant: 0.2, storageLife: 5 }, coastal: { indoorWeeks: null, directSowWeeks: -5, daysToHarvest: 40, waterFreq: "2x week", fertSchedule: "every 3 weeks", yieldPerPlant: 0.3, storageLife: 10 } },
    pestInfo: "Leaf miners, downy mildew. Bolts in heat — grow as spring/fall cool-season crop.", harvestTip: "Harvest outer leaves when 3-4 inches. Cut whole plant before bolting." },
  { id: "kale", name: "Kale", icon: "🥗", cat: "vegetable", spacingSqFt: 2, companions: ["beet","onion","potato","celery"], avoid: ["strawberry"],
    zones: { arctic: { indoorWeeks: 4, directSowWeeks: 0, daysToHarvest: 60, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 1, storageLife: 14 }, cold: { indoorWeeks: null, directSowWeeks: -3, daysToHarvest: 55, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 1, storageLife: 14 }, temperate: { indoorWeeks: null, directSowWeeks: -4, daysToHarvest: 55, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 1.5, storageLife: 14 }, hot_dry: { indoorWeeks: null, directSowWeeks: -4, daysToHarvest: 50, waterFreq: "3x week", fertSchedule: "monthly", yieldPerPlant: 0.8, storageLife: 10 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 50, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 0.8, storageLife: 7 }, coastal: { indoorWeeks: null, directSowWeeks: -4, daysToHarvest: 55, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 1.2, storageLife: 14 } },
    pestInfo: "Cabbage worms, aphids. BT spray for worms. Frost improves sweetness.", harvestTip: "Pick lower leaves first, leave center to keep growing. Sweetens after light frost." },
  { id: "broccoli", name: "Broccoli", icon: "🥦", cat: "vegetable", spacingSqFt: 4, companions: ["onion","celery","potato","beet"], avoid: ["tomato","strawberry"],
    zones: { arctic: { indoorWeeks: 8, directSowWeeks: null, daysToHarvest: 70, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 1, storageLife: 14 }, cold: { indoorWeeks: 6, directSowWeeks: null, daysToHarvest: 65, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 1, storageLife: 14 }, temperate: { indoorWeeks: 5, directSowWeeks: null, daysToHarvest: 60, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 1.5, storageLife: 14 }, hot_dry: { indoorWeeks: 6, directSowWeeks: null, daysToHarvest: 55, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 0.8, storageLife: 10 }, tropical: { indoorWeeks: 0, directSowWeeks: 0, daysToHarvest: 50, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 0.8, storageLife: 7 }, coastal: { indoorWeeks: 5, directSowWeeks: null, daysToHarvest: 60, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 1.2, storageLife: 14 } },
    pestInfo: "Cabbage worms, aphids, clubroot. Use BT spray. Rotate brassicas yearly.", harvestTip: "Cut main head when buds tight and dark green, before flowering. Side shoots follow." },
  { id: "cabbage", name: "Cabbage", icon: "🥬", cat: "vegetable", spacingSqFt: 4, companions: ["onion","celery","potato","beet"], avoid: ["strawberry","tomato"],
    zones: { arctic: { indoorWeeks: 8, directSowWeeks: null, daysToHarvest: 80, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 3, storageLife: 120 }, cold: { indoorWeeks: 6, directSowWeeks: null, daysToHarvest: 75, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 3, storageLife: 120 }, temperate: { indoorWeeks: 5, directSowWeeks: null, daysToHarvest: 70, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 4, storageLife: 120 }, hot_dry: { indoorWeeks: 6, directSowWeeks: null, daysToHarvest: 65, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 2, storageLife: 60 }, tropical: { indoorWeeks: 0, directSowWeeks: 0, daysToHarvest: 60, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 2, storageLife: 30 }, coastal: { indoorWeeks: 5, directSowWeeks: null, daysToHarvest: 70, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 3.5, storageLife: 90 } },
    pestInfo: "Cabbage worms, slugs, clubroot. BT spray for worms. Rotate beds. Excellent for fermenting.", harvestTip: "Head firm when squeezed. Cut at base. Can store whole heads in cold root cellar." },
  { id: "eggplant", name: "Eggplant", icon: "🍆", cat: "vegetable", spacingSqFt: 4, companions: ["pepper","tomato","basil","beans"], avoid: ["fennel"],
    zones: { arctic: null, cold: { indoorWeeks: 10, directSowWeeks: null, daysToHarvest: 80, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 4, storageLife: 10 }, temperate: { indoorWeeks: 8, directSowWeeks: null, daysToHarvest: 75, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 5, storageLife: 10 }, hot_dry: { indoorWeeks: 6, directSowWeeks: null, daysToHarvest: 70, waterFreq: "2x daily", fertSchedule: "every 2 weeks", yieldPerPlant: 6, storageLife: 7 }, tropical: { indoorWeeks: 0, directSowWeeks: 0, daysToHarvest: 65, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 8, storageLife: 7 }, coastal: { indoorWeeks: 7, directSowWeeks: null, daysToHarvest: 75, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 5, storageLife: 10 } },
    pestInfo: "Flea beetles, Colorado potato beetle. Use row covers. Needs very warm soil.", harvestTip: "Glossy, firm skin, bounces back when pressed. Dull skin = overripe and bitter." },
  { id: "watermelon", name: "Watermelon", icon: "🍉", cat: "fruit", spacingSqFt: 16, companions: ["corn","radish","beans"], avoid: ["potato"],
    zones: { arctic: null, cold: { indoorWeeks: 6, directSowWeeks: null, daysToHarvest: 90, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 15, storageLife: 21 }, temperate: { indoorWeeks: 4, directSowWeeks: 1, daysToHarvest: 85, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 20, storageLife: 21 }, hot_dry: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 80, waterFreq: "3x week", fertSchedule: "every 2 weeks", yieldPerPlant: 18, storageLife: 14 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 75, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 22, storageLife: 14 }, coastal: { indoorWeeks: 4, directSowWeeks: 1, daysToHarvest: 85, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 18, storageLife: 21 } },
    pestInfo: "Cucumber beetles, vine borers, fusarium wilt. Mulch heavily. Use row covers until flowering.", harvestTip: "Ground spot turns yellow, tendril nearest fruit turns brown, hollow sound when thumped." },
  { id: "strawberry", name: "Strawberry", icon: "🍓", cat: "fruit", spacingSqFt: 1, companions: ["lettuce","spinach","onion","beans"], avoid: ["cabbage","broccoli"],
    zones: { arctic: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 90, waterFreq: "3x week", fertSchedule: "early spring + after harvest", yieldPerPlant: 0.5, storageLife: 5 }, cold: { indoorWeeks: null, directSowWeeks: -2, daysToHarvest: 60, waterFreq: "3x week", fertSchedule: "early spring + after harvest", yieldPerPlant: 0.75, storageLife: 5 }, temperate: { indoorWeeks: null, directSowWeeks: -3, daysToHarvest: 60, waterFreq: "3x week", fertSchedule: "early spring + after harvest", yieldPerPlant: 1, storageLife: 5 }, hot_dry: { indoorWeeks: null, directSowWeeks: -3, daysToHarvest: 50, waterFreq: "daily", fertSchedule: "early spring + after harvest", yieldPerPlant: 0.75, storageLife: 3 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 45, waterFreq: "daily", fertSchedule: "monthly", yieldPerPlant: 0.5, storageLife: 3 }, coastal: { indoorWeeks: null, directSowWeeks: -3, daysToHarvest: 55, waterFreq: "3x week", fertSchedule: "early spring + after harvest", yieldPerPlant: 0.8, storageLife: 5 } },
    pestInfo: "Slugs, birds, gray mold. Use straw mulch. Net for birds. Avoid overhead watering.", harvestTip: "Fully red with no white. Pick with cap attached. Best eaten same day." },
  { id: "basil", name: "Basil", icon: "🌿", cat: "herb", spacingSqFt: 1, companions: ["tomato","pepper","oregano"], avoid: ["sage"],
    zones: { arctic: { indoorWeeks: 8, directSowWeeks: 2, daysToHarvest: 30, waterFreq: "daily", fertSchedule: "every 3 weeks", yieldPerPlant: 0.5, storageLife: 5 }, cold: { indoorWeeks: 6, directSowWeeks: 1, daysToHarvest: 28, waterFreq: "daily", fertSchedule: "every 3 weeks", yieldPerPlant: 0.5, storageLife: 5 }, temperate: { indoorWeeks: 4, directSowWeeks: 1, daysToHarvest: 25, waterFreq: "daily", fertSchedule: "every 3 weeks", yieldPerPlant: 0.5, storageLife: 5 }, hot_dry: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 22, waterFreq: "2x daily", fertSchedule: "every 3 weeks", yieldPerPlant: 0.4, storageLife: 3 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 20, waterFreq: "daily", fertSchedule: "every 3 weeks", yieldPerPlant: 0.5, storageLife: 3 }, coastal: { indoorWeeks: 4, directSowWeeks: 1, daysToHarvest: 25, waterFreq: "daily", fertSchedule: "every 3 weeks", yieldPerPlant: 0.5, storageLife: 5 } },
    pestInfo: "Aphids, fusarium wilt. Pinch flowers to extend harvest. Loves heat and sun.", harvestTip: "Pinch above leaf nodes for bushier growth. Harvest before flowering for best flavor." },
  { id: "cilantro", name: "Cilantro", icon: "🌿", cat: "herb", spacingSqFt: 1, companions: ["tomato","beans","peas"], avoid: ["fennel"],
    zones: { arctic: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 30, waterFreq: "3x week", fertSchedule: "none", yieldPerPlant: 0.2, storageLife: 7 }, cold: { indoorWeeks: null, directSowWeeks: -2, daysToHarvest: 28, waterFreq: "2x week", fertSchedule: "none", yieldPerPlant: 0.2, storageLife: 7 }, temperate: { indoorWeeks: null, directSowWeeks: -3, daysToHarvest: 25, waterFreq: "2x week", fertSchedule: "none", yieldPerPlant: 0.2, storageLife: 7 }, hot_dry: { indoorWeeks: null, directSowWeeks: -4, daysToHarvest: 22, waterFreq: "daily", fertSchedule: "none", yieldPerPlant: 0.15, storageLife: 5 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 20, waterFreq: "daily", fertSchedule: "none", yieldPerPlant: 0.15, storageLife: 5 }, coastal: { indoorWeeks: null, directSowWeeks: -3, daysToHarvest: 25, waterFreq: "2x week", fertSchedule: "none", yieldPerPlant: 0.2, storageLife: 7 } },
    pestInfo: "Few pests. Bolts quickly in heat — succession sow every 3 weeks. Let some bolt for coriander seed.", harvestTip: "Cut outer stems at base. Harvest before bolt. Seeds (coriander) harvested when brown." },
  { id: "parsley", name: "Parsley", icon: "🌿", cat: "herb", spacingSqFt: 1, companions: ["tomato","carrot","onion"], avoid: ["lettuce"],
    zones: { arctic: { indoorWeeks: 10, directSowWeeks: 0, daysToHarvest: 40, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 0.3, storageLife: 14 }, cold: { indoorWeeks: 8, directSowWeeks: -2, daysToHarvest: 35, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 0.3, storageLife: 14 }, temperate: { indoorWeeks: 6, directSowWeeks: -3, daysToHarvest: 30, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 0.3, storageLife: 14 }, hot_dry: { indoorWeeks: 4, directSowWeeks: -3, daysToHarvest: 28, waterFreq: "3x week", fertSchedule: "monthly", yieldPerPlant: 0.25, storageLife: 10 }, tropical: { indoorWeeks: 0, directSowWeeks: 0, daysToHarvest: 25, waterFreq: "daily", fertSchedule: "monthly", yieldPerPlant: 0.2, storageLife: 7 }, coastal: { indoorWeeks: 6, directSowWeeks: -3, daysToHarvest: 30, waterFreq: "2x week", fertSchedule: "monthly", yieldPerPlant: 0.3, storageLife: 14 } },
    pestInfo: "Parsley worm (swallowtail caterpillar). Consider sharing — they become butterflies.", harvestTip: "Cut outer stems at base. Biennial — bolts in second year." },
  { id: "dill", name: "Dill", icon: "🌿", cat: "herb", spacingSqFt: 1, companions: ["cabbage","onion","lettuce","cucumber"], avoid: ["carrot"],
    zones: { arctic: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 40, waterFreq: "2x week", fertSchedule: "none", yieldPerPlant: 0.2, storageLife: 10 }, cold: { indoorWeeks: null, directSowWeeks: -1, daysToHarvest: 35, waterFreq: "2x week", fertSchedule: "none", yieldPerPlant: 0.2, storageLife: 10 }, temperate: { indoorWeeks: null, directSowWeeks: -2, daysToHarvest: 30, waterFreq: "2x week", fertSchedule: "none", yieldPerPlant: 0.2, storageLife: 10 }, hot_dry: { indoorWeeks: null, directSowWeeks: -2, daysToHarvest: 28, waterFreq: "3x week", fertSchedule: "none", yieldPerPlant: 0.15, storageLife: 7 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 25, waterFreq: "daily", fertSchedule: "none", yieldPerPlant: 0.15, storageLife: 7 }, coastal: { indoorWeeks: null, directSowWeeks: -2, daysToHarvest: 30, waterFreq: "2x week", fertSchedule: "none", yieldPerPlant: 0.2, storageLife: 10 } },
    pestInfo: "Attracts beneficial insects. Self-seeds readily. Bolts in heat.", harvestTip: "Snip fronds as needed. Harvest seeds when flower heads turn brown." },
  { id: "mint", name: "Mint", icon: "🌿", cat: "herb", spacingSqFt: 2, companions: ["cabbage","tomato","peas"], avoid: ["parsley"],
    zones: { arctic: { indoorWeeks: 6, directSowWeeks: 0, daysToHarvest: 30, waterFreq: "3x week", fertSchedule: "monthly", yieldPerPlant: 0.5, storageLife: 7 }, cold: { indoorWeeks: null, directSowWeeks: -2, daysToHarvest: 28, waterFreq: "3x week", fertSchedule: "monthly", yieldPerPlant: 0.5, storageLife: 7 }, temperate: { indoorWeeks: null, directSowWeeks: -3, daysToHarvest: 25, waterFreq: "3x week", fertSchedule: "monthly", yieldPerPlant: 0.5, storageLife: 7 }, hot_dry: { indoorWeeks: null, directSowWeeks: -2, daysToHarvest: 25, waterFreq: "daily", fertSchedule: "monthly", yieldPerPlant: 0.4, storageLife: 5 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 20, waterFreq: "daily", fertSchedule: "monthly", yieldPerPlant: 0.5, storageLife: 5 }, coastal: { indoorWeeks: null, directSowWeeks: -3, daysToHarvest: 25, waterFreq: "3x week", fertSchedule: "monthly", yieldPerPlant: 0.5, storageLife: 7 } },
    pestInfo: "Very few pests. VERY invasive — always grow in containers or it will take over.", harvestTip: "Cut stems above first set of leaves. Cut regularly to prevent flowering." },
  { id: "rosemary", name: "Rosemary", icon: "🌿", cat: "herb", spacingSqFt: 4, companions: ["beans","cabbage","carrot","sage"], avoid: [],
    zones: { arctic: null, cold: { indoorWeeks: 14, directSowWeeks: null, daysToHarvest: 90, waterFreq: "weekly", fertSchedule: "none", yieldPerPlant: 0.3, storageLife: 21 }, temperate: { indoorWeeks: 10, directSowWeeks: null, daysToHarvest: 80, waterFreq: "weekly", fertSchedule: "none", yieldPerPlant: 0.5, storageLife: 21 }, hot_dry: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 70, waterFreq: "weekly", fertSchedule: "none", yieldPerPlant: 0.5, storageLife: 21 }, tropical: { indoorWeeks: null, directSowWeeks: 0, daysToHarvest: 60, waterFreq: "2x week", fertSchedule: "none", yieldPerPlant: 0.5, storageLife: 14 }, coastal: { indoorWeeks: 8, directSowWeeks: null, daysToHarvest: 80, waterFreq: "weekly", fertSchedule: "none", yieldPerPlant: 0.5, storageLife: 21 } },
    pestInfo: "Very pest-resistant. Overwater is the main enemy. Needs good drainage.", harvestTip: "Snip 4-6 inch sprigs. Never cut more than 1/3 of the plant. Perennial in zones 7+." },
  { id: "cauliflower", name: "Cauliflower", icon: "🤍", cat: "vegetable", spacingSqFt: 4, companions: ["onion","celery","beet"], avoid: ["tomato","strawberry"],
    zones: { arctic: { indoorWeeks: 8, directSowWeeks: null, daysToHarvest: 75, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 2, storageLife: 14 }, cold: { indoorWeeks: 6, directSowWeeks: null, daysToHarvest: 70, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 2, storageLife: 14 }, temperate: { indoorWeeks: 5, directSowWeeks: null, daysToHarvest: 65, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 2.5, storageLife: 14 }, hot_dry: { indoorWeeks: 6, directSowWeeks: null, daysToHarvest: 60, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 1.5, storageLife: 10 }, tropical: { indoorWeeks: 0, directSowWeeks: 0, daysToHarvest: 55, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 1.5, storageLife: 7 }, coastal: { indoorWeeks: 5, directSowWeeks: null, daysToHarvest: 65, waterFreq: "2x week", fertSchedule: "every 2 weeks", yieldPerPlant: 2, storageLife: 14 } },
    pestInfo: "Same as broccoli — cabbage worms, aphids. Blanch curds by tying leaves over head.", harvestTip: "Head tight and white (6-8 inches). Cut before florets separate." },
  { id: "celery", name: "Celery", icon: "🥬", cat: "vegetable", spacingSqFt: 1, companions: ["onion","cabbage","tomato","beans"], avoid: ["carrot","parsley"],
    zones: { arctic: null, cold: { indoorWeeks: 12, directSowWeeks: null, daysToHarvest: 120, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 1.5, storageLife: 21 }, temperate: { indoorWeeks: 10, directSowWeeks: null, daysToHarvest: 110, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 2, storageLife: 21 }, hot_dry: { indoorWeeks: 10, directSowWeeks: null, daysToHarvest: 100, waterFreq: "2x daily", fertSchedule: "every 2 weeks", yieldPerPlant: 1, storageLife: 14 }, tropical: { indoorWeeks: 0, directSowWeeks: 0, daysToHarvest: 90, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 1.5, storageLife: 14 }, coastal: { indoorWeeks: 10, directSowWeeks: null, daysToHarvest: 110, waterFreq: "daily", fertSchedule: "every 2 weeks", yieldPerPlant: 1.5, storageLife: 21 } },
    pestInfo: "Celery leaf tier, slugs. Heavy feeder — needs rich soil and constant moisture.", harvestTip: "Cut individual outer stalks at base, or harvest whole plant. Blanch by mounding soil." },
];

const CALORIES_PER_LB = { tomato: 82, lettuce: 65, carrot: 186, potato: 354, beans: 556, peas: 364, pepper: 90, cucumber: 68, zucchini: 77, winter_squash: 196, corn: 390, beet: 196, radish: 73, onion: 182, garlic: 677, spinach: 104, kale: 225, broccoli: 154, cauliflower: 113, cabbage: 113, eggplant: 113, watermelon: 136, strawberry: 145, basil: 100, cilantro: 104, parsley: 163, dill: 195, mint: 318, rosemary: 131, celery: 64 };

const FIELD_META = {
  depth: { label: "Depth", type: "text", placeholder: "120 ft" }, gpm: { label: "GPM", type: "number", placeholder: "5" },
  hasPump: { label: "Pump", type: "select", options: ["Manual", "Electric", "Solar", "None"] },
  pumpType: { label: "Backup", type: "select", options: ["None", "Manual", "Generator"] },
  distance: { label: "Distance", type: "text", placeholder: "0.5 mi" },
  flowRate: { label: "Flow", type: "select", options: ["Year-round", "Seasonal", "Intermittent"] },
  seasonalReliability: { label: "Winter", type: "select", options: ["Year-round", "Freezes", "Dries up"] },
  capacity: { label: "Capacity", type: "number", placeholder: "55" },
  filterType: { label: "Filter", type: "select", options: ["Ceramic", "Carbon", "UV", "RO", "LifeStraw", "Berkey", "None"] },
  lastRefreshed: { label: "Refreshed", type: "date" }, containerType: { label: "Container", type: "select", options: ["Barrel", "Glass", "IBC", "Jugs", "WaterBrick", "Bladder"] },
  gallonsPerTab: { label: "Gal/Tab", type: "number", placeholder: "1" }, expiryDate: { label: "Expiry", type: "date" },
  lifespanGallons: { label: "Life (gal)", type: "number", placeholder: "3000" }, gallonsUsed: { label: "Used", type: "number", placeholder: "0" },
  calories: { label: "Cal", type: "number", placeholder: "250" }, weightLbs: { label: "Lbs", type: "number", placeholder: "25" },
  sqft: { label: "SqFt", type: "number", placeholder: "200" }, season: { label: "Season", type: "select", options: ["Spring/Summer", "Year-round", "3-season"] },
  varieties: { label: "Varieties", type: "number", placeholder: "15" }, animalType: { label: "Animal", type: "select", options: ["Chickens", "Goats", "Rabbits", "Cattle", "Ducks"] },
  count: { label: "Count", type: "number", placeholder: "6" }, gearType: { label: "Gear", type: "text", placeholder: "Rod, bow" },
  kitLevel: { label: "Level", type: "select", options: ["Basic", "Intermediate", "Advanced", "Professional"] },
  medication: { label: "Med", type: "text", placeholder: "Lisinopril" }, daysSupply: { label: "Supply remaining (days)", type: "number", placeholder: "90", help: "Total days remaining for this medication entry at its prescribed use, across the quantity recorded." },
  type: { label: "Type", type: "text", placeholder: "..." }, certLevel: { label: "Training", type: "select", options: ["First aid", "Wilderness", "EMT", "Doctor", "Books"] },
  cords: { label: "Cords", type: "number", placeholder: "2" }, seasoned: { label: "Seasoned", type: "select", options: ["Well seasoned", "Partial", "Green"] },
  woodSpecies: { label: "Species", type: "select", options: ["Oak", "Maple", "Birch", "Ash", "Cherry", "Hickory", "Pine", "Mixed hardwood", "Mixed"] },
  cordsPerMonth: { label: "Cords/Month", type: "number", placeholder: "0.5" },
  lastInspection: { label: "Inspected", type: "date" },
  chainsawBrand: { label: "Brand", type: "text", placeholder: "Stihl" },
  lastService: { label: "Last Service", type: "date" },
  barLength: { label: "Bar Length", type: "select", options: ["14\"", "16\"", "18\"", "20\"", "24\"", "28\""] },
  chainsCount: { label: "Spare Chains", type: "number", placeholder: "2" },
  splitterType: { label: "Type", type: "select", options: ["Hydraulic", "Manual maul", "Kinetic", "Wedge"] },
  lastSwept: { label: "Last Swept", type: "date" },
  tankSize: { label: "Tank", type: "select", options: ["1lb", "20lb", "40lb", "100lb", "250+gal"] },
  gallons: { label: "Gallons", type: "number", placeholder: "10" }, stabilized: { label: "Stabilized", type: "select", options: ["Yes", "No"] },
  lastRotated: { label: "Rotated", type: "date" }, btuRating: { label: "BTU", type: "text", placeholder: "40000" },
  fuelType: { label: "Fuel", type: "select", options: ["Propane", "Gas", "Diesel", "Wood", "Multi", "Solar"] },
  tempRating: { label: "Rating", type: "text", placeholder: "0°F" }, airFiltration: { label: "Air", type: "select", options: ["HEPA/NBC", "Basic", "None"] },
  lengthFt: { label: "Feet", type: "number", placeholder: "100" }, licensed: { label: "License", type: "select", options: ["Tech", "General", "Extra", "No"] },
  bands: { label: "Bands", type: "text", placeholder: "2m,70cm" }, range: { label: "Range", type: "text", placeholder: "5mi" },
  provider: { label: "Provider", type: "text" }, contents: { label: "Contents", type: "text" },
  caliber: { label: "Caliber", type: "text", placeholder: "9mm" }, rounds: { label: "Rounds", type: "number", placeholder: "500" },
  level: { label: "Level", type: "select", options: ["II", "IIIA", "III", "IV"] },
  watts: { label: "Watts", type: "number", placeholder: "200" }, inverter: { label: "Inverter", type: "select", options: ["Yes", "Separate", "None"] },
  mah: { label: "mAh", type: "number", placeholder: "20000" },
  runtimeHours: { label: "Backup runtime (hours)", type: "number", placeholder: "24", help: "Total hours this entry can support your planned devices with its current fuel or charge. Include all units once; use a tested or manufacturer-rated runtime at that load. Overview uses the longest recorded backup, not a sum of separate sources." },
  /* Firearms */
  firearmAction: { label: "Action", type: "select", options: ["Semi-auto", "Bolt", "Pump", "Lever", "Revolver", "Break-action", "Full-auto"] },
  gauge: { label: "Gauge", type: "select", options: ["12ga", "20ga", "410", ".410"] },
  optic: { label: "Optic", type: "text", placeholder: "Red dot, scope..." },
  ammoType: { label: "Ammo Type", type: "select", options: ["FMJ", "HP", "Buckshot", "Slug", "Birdshot", "Match", "Tracer", "AP", "Subsonic"] },
  magCapacity: { label: "Capacity", type: "number", placeholder: "30" },
  magnification: { label: "Magnification", type: "text", placeholder: "3-9x40" },
  /* Defense */
  spikeType: { label: "Type", type: "select", options: ["Caltrops", "Spike strips", "Chain", "DIY"] },
  wireLength: { label: "Length (ft)", type: "number", placeholder: "200" },
  barricadeType: { label: "Type", type: "select", options: ["Jersey barrier", "Logs", "Vehicle", "Earth berm", "Sandbags", "Wire"] },
  trapType: { label: "Type", type: "select", options: ["Snare", "Deadfall", "Pit", "Net", "Cage", "Alarm only"] },
  /* Vehicles */
  vMake: { label: "Make", type: "text", placeholder: "Honda" },
  vModel: { label: "Model", type: "text", placeholder: "Foreman 520" },
  vYear: { label: "Year", type: "number", placeholder: "2022" },
  lastOilChange: { label: "Last Oil Change", type: "date" },
  oilInterval: { label: "Oil Interval", type: "select", options: ["Every 50hrs", "Every 100hrs", "Every 3mo", "Every 5000mi", "Every 6mo", "Every 10000mi", "Annually"] },
  nextService: { label: "Next Service", type: "date" },
  hoursOnEngine: { label: "Engine Hours", type: "number", placeholder: "450" },
  mileage: { label: "Mileage", type: "number", placeholder: "85000" },
  partFor: { label: "For Vehicle", type: "text", placeholder: "ATV" },
  partDesc: { label: "Part", type: "text", placeholder: "Belt, filter..." },
  fluidType: { label: "Fluid", type: "select", options: ["Motor oil", "Hydraulic", "Transmission", "Coolant", "Brake fluid", "2-stroke mix", "Grease", "Marine 4-stroke", "Gear lube", "Power trim"] },
  dimensions: { label: "Dimensions", type: "text", placeholder: "16x8ft, 20x10..." },
  tireSize: { label: "Size", type: "text", placeholder: "25x8-12" },
  tireCondition: { label: "Condition", type: "select", options: ["New", "Good", "Worn", "Needs replace"] },
  /* Equipment */
  clothingType: { label: "Type", type: "select", options: ["Winter", "Rain", "Boots", "Gloves", "Tactical", "Work", "Thermal", "Camo"] },
  packCapacity: { label: "Capacity (L)", type: "number", placeholder: "72" },
  docType: { label: "Type", type: "select", options: ["Passport", "Title/Deed", "Insurance", "Cash", "Maps", "Medical records", "Other"] },
  miscDesc: { label: "Description", type: "text", placeholder: "..." },
  /* Filters */
  filterSize: { label: "Size", type: "text", placeholder: "20x25x1" },
  filterQty: { label: "Quantity", type: "number", placeholder: "4" },
  lastReplaced: { label: "Last Replaced", type: "date" },
  /* Farm */
  cropName: { label: "Crop", type: "text", placeholder: "Tomato, lettuce..." },
  seedVariety: { label: "Variety", type: "text", placeholder: "Roma, Beefsteak..." },
  plantMonth: { label: "Plant Month", type: "select", options: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] },
  harvestMonth: { label: "Harvest Month", type: "select", options: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] },
  daysToHarvest: { label: "Days to Harvest", type: "number", placeholder: "75" },
  soilType: { label: "Soil", type: "select", options: ["Topsoil", "Potting mix", "Compost", "Raised bed mix", "Garden soil", "Peat", "Coco coir"] },
  fertilizerType: { label: "Type", type: "select", options: ["10-10-10", "Organic compost", "Blood meal", "Bone meal", "Fish emulsion", "Manure", "Worm castings", "Lime", "Sulfur"] },
  heatedGreenhouse: { label: "Heated", type: "select", options: ["Yes", "No", "Passive solar"] },
  irrigationType: { label: "Type", type: "select", options: ["Drip", "Sprinkler", "Soaker hose", "Hand water", "Rain barrel gravity"] },
  pestControlType: { label: "Type", type: "select", options: ["Neem oil", "Diatomaceous earth", "BT spray", "Row cover", "Companion planting", "Insecticidal soap", "Slug bait", "Fencing"] },
  /* Bug-Out Bag */
  bagOwner: { label: "Owner", type: "text", placeholder: "Dad, Mom, Kid 1..." },
  bagWeight: { label: "Weight (lbs)", type: "number", placeholder: "35" },
  lastAudited: { label: "Last Audited", type: "date" },
  bobItemQty: { label: "Qty", type: "number", placeholder: "1" },
  bobItemNotes: { label: "Details", type: "text", placeholder: "Brand, notes..." },
  /* Kids */
  kidName: { label: "Child", type: "text", placeholder: "Name" },
  kidAge: { label: "Age", type: "text", placeholder: "2yr, 6mo..." },
  kidSize: { label: "Size", type: "text", placeholder: "4T, 7, 10..." },
  diaperSize: { label: "Diaper Size", type: "select", options: ["Newborn", "Size 1", "Size 2", "Size 3", "Size 4", "Size 5", "Size 6", "Pull-Ups S", "Pull-Ups M", "Pull-Ups L"] },
  formulaType: { label: "Type", type: "select", options: ["Powder", "Ready-to-feed", "Concentrate", "Breast milk (frozen)", "Whole milk", "Toddler formula", "Soy", "Hypoallergenic"] },
  /* Batteries */
  batteryBrand: { label: "Brand", type: "text", placeholder: "Eneloop, Duracell..." },
  batteryCount: { label: "Count", type: "number", placeholder: "8" },
  isRechargeable: { label: "Rechargeable", type: "select", options: ["Yes", "No"] },
  batteryChemistry: { label: "Chemistry", type: "select", options: ["Alkaline", "NiMH", "Lithium", "Li-ion", "LiFePO4", "Zinc-Carbon"] },
  batteryMah: { label: "mAh", type: "number", placeholder: "3500" },
  batteryVoltage: { label: "Voltage", type: "text", placeholder: "3.7V" },
  coinCellType: { label: "Type", type: "select", options: ["CR2032", "CR2025", "CR2016", "CR1632", "LR44", "CR123", "Other"] },
  chargerType: { label: "Charges", type: "select", options: ["AA/AAA", "18650", "CR123A", "Universal", "USB", "Solar to USB", "12V car"] },
  chargerSlots: { label: "Slots", type: "number", placeholder: "4" },
  /* Electronics */
  deviceBrand: { label: "Brand", type: "text", placeholder: "Garmin, Apple..." },
  deviceModel: { label: "Model", type: "text", placeholder: "inReach Mini 2" },
  deviceSerial: { label: "Serial #", type: "text", placeholder: "SN..." },
  deviceLocation: { label: "Location", type: "text", placeholder: "Office, BOB..." },
  hasPlan: { label: "Has Plan", type: "select", options: ["Yes — active", "Yes — expired", "No plan needed"] },
  planExpiry: { label: "Plan Expires", type: "date" },
  planProvider: { label: "Provider", type: "text", placeholder: "Iridium, Garmin..." },
  /* Boat */
  boatType: { label: "Type", type: "select", options: ["Aluminum fishing", "Bass boat", "Pontoon", "Jon boat", "Canoe", "Kayak", "Inflatable", "Sailboat", "Rowboat"] },
  boatLength: { label: "Length (ft)", type: "number", placeholder: "16" },
  boatMotor: { label: "Motor", type: "text", placeholder: "Mercury 25hp" },
  boatHullMat: { label: "Hull", type: "select", options: ["Aluminum", "Fiberglass", "Polyethylene", "Inflatable", "Wood", "Composite"] },
  boatHP: { label: "HP", type: "number", placeholder: "25" },
  boatEngineHours: { label: "Engine Hours", type: "number", placeholder: "120" },
  boatReg: { label: "Registration #", type: "text", placeholder: "ON 1234 AB" },
  pfdType: { label: "Type", type: "select", options: ["Type I — Offshore", "Type II — Near-shore", "Type III — Flotation", "Type IV — Throwable", "Type V — Special use", "Inflatable"] },
  pfdSize: { label: "Size", type: "select", options: ["Infant", "Child (30-50lb)", "Youth (50-90lb)", "Adult S/M", "Adult L/XL", "Adult XXL", "Universal"] },
  /* Fishing */
  fishRodType: { label: "Type", type: "select", options: ["Spinning", "Baitcasting", "Fly", "Trolling", "Ice", "Telescopic", "Surf"] },
  fishLineWeight: { label: "Line (lb test)", type: "text", placeholder: "10lb mono" },
  fishReelType: { label: "Reel", type: "select", options: ["Spinning", "Baitcast", "Fly", "Spincast", "Trolling"] },
  fishTackleContents: { label: "Contents", type: "text", placeholder: "Hooks, sinkers, swivels..." },
  fishHookSize: { label: "Size", type: "text", placeholder: "#6, 1/0, 3/0..." },
  fishLureType: { label: "Type", type: "select", options: ["Crankbait", "Spinnerbait", "Jig", "Soft plastic", "Spoon", "Topwater", "Fly", "Ice jig", "Mixed"] },
  fishBaitType: { label: "Bait", type: "select", options: ["Worms", "Minnows", "Leeches", "PowerBait", "Corn", "Crickets", "Cut bait", "Frozen shrimp"] },
  /* Alcohol */
  alcBrand: { label: "Brand", type: "text", placeholder: "Jack Daniel's..." },
  alcVolume: { label: "Volume", type: "select", options: ["50ml", "200ml", "375ml", "750ml", "1L", "1.75L", "26oz", "40oz", "Case (24)", "Keg"] },
  alcABV: { label: "ABV %", type: "number", placeholder: "40" },
  alcWineType: { label: "Type", type: "select", options: ["Red", "White", "Rosé", "Sparkling", "Port/Sherry", "Cooking wine"] },
  /* Recreational */
  recBrand: { label: "Brand / Type", type: "text", placeholder: "..." },
  recWeight: { label: "Weight (g/oz)", type: "text", placeholder: "28g, 1oz..." },
  recStrain: { label: "Strain", type: "text", placeholder: "Blue Dream..." },
  recForm: { label: "Form", type: "select", options: ["Flower", "Pre-roll", "Concentrate", "Oil / Tincture", "Capsule", "Topical"] },
  recDosage: { label: "Dosage", type: "text", placeholder: "10mg, 25mg..." },
  /* Books */
  bookAuthor: { label: "Author", type: "text", placeholder: "Last, First" },
  bookEdition: { label: "Edition", type: "text", placeholder: "4th, 2023..." },
  bookRegion: { label: "Region", type: "text", placeholder: "Eastern NA, Ontario..." },
  bookSubject: { label: "Subject", type: "text", placeholder: "Engines, knots..." },
  bookScale: { label: "Scale", type: "text", placeholder: "1:50,000" },
  /* CBRN / Nuclear */
  nbcBrand: { label: "Brand", type: "text", placeholder: "MIRA, 3M, Avon..." },
  nbcModel: { label: "Model", type: "text", placeholder: "CM-6M, FR-S1..." },
  nbcSize: { label: "Size", type: "select", options: ["XS", "S", "M", "L", "XL", "XXL", "Universal"] },
  nbcFilterThread: { label: "Thread", type: "select", options: ["40mm NATO (STANAG)", "Bayonet", "P100", "Proprietary", "Other"] },
  nbcFilterType: { label: "Filter Type", type: "select", options: ["CBRN (A2B2E2K2-P3)", "NBC-77 SOF", "P100 particulate", "OV/AG/P100", "Organic vapor", "HEPA", "Combination"] },
  nbcRating: { label: "Rating", type: "select", options: ["Level A — full encapsulated", "Level B — splash + SCBA", "Level C — splash + APR", "Level D — minimal", "Tyvek (disposable)", "Military MOPP 1-4"] },
  nbcMaterial: { label: "Material", type: "select", options: ["Butyl rubber", "Nitrile", "Neoprene", "Viton", "Silver Shield", "Latex"] },
  nbcDosage: { label: "Dosage", type: "text", placeholder: "130mg, 65mg..." },
  /* Bullion / Precious Metals */
  bullionMetal: { label: "Metal", type: "select", options: ["Gold", "Silver", "Platinum", "Palladium"] },
  bullionWeight: { label: "Weight (troy oz)", type: "select", options: ["1/10 oz", "1/4 oz", "1/2 oz", "1 oz", "2 oz", "5 oz", "10 oz", "100 oz", "1 kg"] },
  bullionPurity: { label: "Purity", type: "select", options: [".999 Fine", ".9999 Fine", ".925 Sterling", ".900 (90%)", ".9167 (22k)", ".800"] },
  bullionMint: { label: "Mint / Brand", type: "text", placeholder: "US Mint, RCM, PAMP..." },
  bullionPurchasePrice: { label: "Purchase Price ($)", type: "number", placeholder: "2000" },
  bullionGoldbackState: { label: "State", type: "select", options: ["Nevada", "New Hampshire", "Utah", "Wyoming", "South Dakota", "Alpha (Any state)"] },
  bullionGoldbackDenom: { label: "Denomination", type: "select", options: ["1 Goldback", "5 Goldback", "10 Goldback", "25 Goldback", "50 Goldback"] },
  bullionJunkType: { label: "Coin Type", type: "select", options: ["Roosevelt Dime", "Mercury Dime", "Washington Quarter", "Walking Liberty Half", "Franklin Half", "Kennedy Half (pre-65)", "Morgan Dollar", "Peace Dollar"] },
  bullionFaceValue: { label: "Face Value ($)", type: "number", placeholder: "1.00" },
  /* Clothing */
  clothSize: { label: "Size", type: "select", options: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "Youth S", "Youth M", "Youth L"] },
  clothMaterial: { label: "Material", type: "select", options: ["Merino wool", "Cotton", "Synthetic", "Down", "Fleece", "Gore-Tex", "Nylon", "Polypro", "Blend"] },
  clothType: { label: "Type", type: "text", placeholder: "Parka, cargo pants..." },
  /* Pets */
  petAnimal: { label: "Animal", type: "select", options: ["Dog", "Cat", "Bird", "Rabbit", "Fish", "Reptile", "Horse", "Chicken", "Other"] },
  petFoodType: { label: "Food Type", type: "select", options: ["Dry kibble", "Wet/canned", "Raw", "Freeze-dried", "Treats", "Prescription", "Hay/feed"] },
  petMedName: { label: "Medication", type: "text", placeholder: "Heartgard, flea meds..." },
  petCarrierSize: { label: "Size", type: "select", options: ["Small (up to 15lb)", "Medium (15-30lb)", "Large (30-70lb)", "XL (70lb+)", "Cat carrier", "Bird cage"] },
  petName: { label: "Pet Name", type: "text", placeholder: "Buddy, Max..." },
  /* Lighting */
  lightBrand: { label: "Brand", type: "text", placeholder: "Fenix, Petzl, Olight..." },
  lightLumens: { label: "Lumens", type: "number", placeholder: "1000" },
  lightBattery: { label: "Battery", type: "select", options: ["AA", "AAA", "18650", "CR123A", "Built-in USB", "CR2032", "D-cell", "Solar"] },
  lightFuel: { label: "Fuel", type: "select", options: ["Lamp oil", "Kerosene", "Propane", "Butane", "Battery", "Solar", "Hand crank", "Beeswax", "Paraffin"] },
  lightBurnTime: { label: "Burn Time (hrs)", type: "number", placeholder: "8" },
  lightBulbType: { label: "Type", type: "select", options: ["LED", "Incandescent", "Halogen", "Fluorescent", "Lantern mantle", "Wick"] },
  lightChemColor: { label: "Color", type: "select", options: ["Green", "Red", "Blue", "Yellow", "White", "IR (infrared)", "Mixed"] },
  /* Food calorie helpers */
  totalCalories: { label: "Total Calories", type: "number", placeholder: "2400" },
  caloriesPerServing: { label: "Cal/Serving", type: "number", placeholder: "250" },
  servings: { label: "Servings", type: "number", placeholder: "8" },
  volume: { label: "Volume (ml)", type: "number", placeholder: "750" },
  fuelGallons: { label: "Gallons", type: "number", placeholder: "5" },
};

/* ── Bullion spot price reference (static — update periodically) ── */
const SPOT_PRICES = { gold: 2950, silver: 33, platinum: 1020, palladium: 980 };

function bullionTroyOz(item) {
  const wMap = { "1/10 oz": 0.1, "1/4 oz": 0.25, "1/2 oz": 0.5, "1 oz": 1, "2 oz": 2, "5 oz": 5, "10 oz": 10, "100 oz": 100, "1 kg": 32.15 };
  if (item.subType === "goldback") {
    const dMap = { "1 Goldback": 1/1000, "5 Goldback": 5/1000, "10 Goldback": 10/1000, "25 Goldback": 25/1000, "50 Goldback": 50/1000 };
    return { oz: (dMap[item.fields?.bullionGoldbackDenom] || 0) * (item.quantity || 1), metal: "gold" };
  }
  if (item.subType === "junkSilver") {
    const fv = parseFloat(item.fields?.bullionFaceValue || 0) * (item.quantity || 1);
    return { oz: fv * 0.715, metal: "silver" };
  }
  const w = wMap[item.fields?.bullionWeight] || 0;
  const metal = (item.fields?.bullionMetal || "gold").toLowerCase();
  return { oz: w * (item.quantity || 1), metal };
}

const MAP_LAYERS = {
  buildings: { label: "Buildings", icon: "🏠", color: "#94a3b8" },
  flora: { label: "Flora & Food", icon: "🌿", color: "#22c55e" },
  water: { label: "Water Sources", icon: "💧", color: "#0ea5e9" },
  wildlife: { label: "Wildlife", icon: "🦌", color: "#f59e0b" },
  trails: { label: "Trails & Roads", icon: "🛤️", color: "#a78bfa" },
  caches: { label: "Caches & Supplies", icon: "📦", color: "#f97316" },
  defense: { label: "Defense", icon: "🛡️", color: "#ef4444" },
};

const MAP_PIN_TYPES = {
  buildings: [{ v: "house", l: "Main House", i: "🏠" }, { v: "barn", l: "Barn", i: "🏚️" }, { v: "shed", l: "Shed", i: "🛖" }, { v: "bunker", l: "Bunker", i: "🏗️" }, { v: "garage", l: "Garage", i: "🚗" }, { v: "greenhouse", l: "Greenhouse", i: "🌿" }],
  flora: [{ v: "fruit_tree", l: "Fruit Tree", i: "🍎" }, { v: "nut_tree", l: "Nut Tree", i: "🌰" }, { v: "berry_bush", l: "Berry Bush", i: "🫐" }, { v: "edible_plant", l: "Edible Plant", i: "🌿" }, { v: "garden", l: "Garden", i: "🌱" }, { v: "medicinal", l: "Medicinal", i: "🌼" }, { v: "mushroom", l: "Mushroom", i: "🍄" }],
  water: [{ v: "well", l: "Well", i: "🪣" }, { v: "creek", l: "Creek", i: "🏞️" }, { v: "pond", l: "Pond", i: "🌊" }, { v: "spring", l: "Spring", i: "⛲" }, { v: "rain_barrel", l: "Rain Barrel", i: "🌧️" }],
  wildlife: [{ v: "deer", l: "Deer", i: "🦌" }, { v: "turkey", l: "Turkey", i: "🦃" }, { v: "rabbit", l: "Rabbit", i: "🐇" }, { v: "bear", l: "Bear ⚠", i: "🐻" }, { v: "coyote", l: "Coyote", i: "🐺" }, { v: "fish", l: "Fish", i: "🐟" }, { v: "tracks", l: "Tracks", i: "🐾" }],
  trails: [{ v: "main_road", l: "Main Road", i: "🛣️" }, { v: "dirt_road", l: "Dirt Road", i: "🟤" }, { v: "trail", l: "Trail", i: "🥾" }, { v: "atv_trail", l: "ATV Trail", i: "🏍️" }, { v: "fence_gate", l: "Gate", i: "🚧" }, { v: "bridge", l: "Bridge", i: "🌉" }],
  caches: [{ v: "supply_cache", l: "Supply Cache", i: "📦" }, { v: "ammo_cache", l: "Ammo Cache", i: "🎯" }, { v: "medical_cache", l: "Medical", i: "🩹" }, { v: "buried", l: "Buried", i: "⬛" }, { v: "trap", l: "Trap/Snare", i: "🪤" }],
  defense: [{ v: "observation", l: "Observation", i: "🔭" }, { v: "fighting_pos", l: "Fighting Pos", i: "🎯" }, { v: "sniper", l: "Overwatch", i: "🔫" }, { v: "fallback", l: "Fallback", i: "🔙" }, { v: "rally", l: "Rally Pt", i: "🚩" }, { v: "obstacle", l: "Obstacle", i: "🪨" }, { v: "alarm_trip", l: "Tripwire", i: "🔔" }, { v: "safe_room", l: "Safe Room", i: "🔒" }],
};

const SAMPLE_MAP_PINS = [
  { id: "mp1", layer: "buildings", type: "house", x: 48, y: 42, label: "Main House", notes: "2-story, basement" },
  { id: "mp2", layer: "buildings", type: "barn", x: 62, y: 35, label: "Barn", notes: "Livestock, hay" },
  { id: "mp3", layer: "buildings", type: "shed", x: 38, y: 50, label: "Tool Shed", notes: "Workshop, fuel" },
  { id: "mp4", layer: "buildings", type: "garage", x: 45, y: 48, label: "Garage", notes: "Vehicles, generator" },
  { id: "mp5", layer: "buildings", type: "greenhouse", x: 55, y: 55, label: "Greenhouse", notes: "Year-round" },
  { id: "mp6", layer: "flora", type: "fruit_tree", x: 65, y: 50, label: "Apple Trees (6)", notes: "Harvest Sept-Oct" },
  { id: "mp7", layer: "flora", type: "berry_bush", x: 72, y: 42, label: "Blueberry Patch", notes: "July" },
  { id: "mp8", layer: "flora", type: "garden", x: 52, y: 58, label: "Raised Beds", notes: "Tomatoes, beans" },
  { id: "mp9", layer: "flora", type: "nut_tree", x: 30, y: 30, label: "Walnut Trees", notes: "Oct-Nov" },
  { id: "mp10", layer: "flora", type: "mushroom", x: 20, y: 60, label: "Morel Area", notes: "Spring" },
  { id: "mp11", layer: "water", type: "well", x: 42, y: 45, label: "Main Well", notes: "85ft, hand pump backup" },
  { id: "mp12", layer: "water", type: "creek", x: 15, y: 50, label: "East Creek", notes: "Year-round, 0.3mi" },
  { id: "mp13", layer: "water", type: "rain_barrel", x: 50, y: 40, label: "Rain Barrels (4)", notes: "200gal total" },
  { id: "mp14", layer: "water", type: "pond", x: 25, y: 70, label: "Stock Pond", notes: "Creek-fed, fish" },
  { id: "mp15", layer: "wildlife", type: "deer", x: 18, y: 35, label: "Deer Trail", notes: "Dawn/dusk, 3-5 daily" },
  { id: "mp16", layer: "wildlife", type: "turkey", x: 75, y: 25, label: "Turkey Roost", notes: "Flock ~12" },
  { id: "mp17", layer: "wildlife", type: "bear", x: 10, y: 20, label: "Bear Sign ⚠", notes: "Spring 2025" },
  { id: "mp18", layer: "wildlife", type: "fish", x: 22, y: 68, label: "Fishing Spot", notes: "Bass, trout" },
  { id: "mp19", layer: "trails", type: "main_road", x: 50, y: 15, label: "County Road 22", notes: "Paved, main access" },
  { id: "mp20", layer: "trails", type: "dirt_road", x: 80, y: 50, label: "Back Access Rd", notes: "4WD" },
  { id: "mp21", layer: "trails", type: "trail", x: 15, y: 40, label: "Creek Trail", notes: "East property line" },
  { id: "mp22", layer: "trails", type: "fence_gate", x: 50, y: 10, label: "Front Gate", notes: "Code: ****" },
  { id: "mp23", layer: "caches", type: "supply_cache", x: 12, y: 55, label: "Cache Alpha", notes: "Filter, MREs, fire kit" },
  { id: "mp24", layer: "caches", type: "buried", x: 70, y: 65, label: "Cache Bravo", notes: "Ammo, cash, radio" },
  { id: "mp25", layer: "caches", type: "trap", x: 28, y: 58, label: "Snare Line", notes: "Rabbit run" },
  { id: "mp26", layer: "defense", type: "observation", x: 85, y: 15, label: "OP North", notes: "360° view", assignee: "Dave" },
  { id: "mp27", layer: "defense", type: "fighting_pos", x: 45, y: 20, label: "FP Gate", notes: "Covers road", assignee: "Mike" },
  { id: "mp28", layer: "defense", type: "sniper", x: 60, y: 28, label: "Overwatch Loft", notes: "Covers south", assignee: "You" },
  { id: "mp29", layer: "defense", type: "fallback", x: 48, y: 55, label: "Fallback", notes: "If perimeter breached" },
  { id: "mp30", layer: "defense", type: "rally", x: 35, y: 70, label: "Emergency Rally", notes: "Head to creek" },
  { id: "mp31", layer: "defense", type: "alarm_trip", x: 40, y: 15, label: "Tripwire N", notes: "Fishing line + cans" },
];

const DEFENSE_ROLES = [
  { id: "d1", name: "You", role: "Overwatch / Sniper", position: "Barn Loft", weapon: "Rifle .308", avatar: "👤" },
  { id: "d2", name: "Dave", role: "Observation / Comms", position: "OP North Ridge", weapon: "AR-15 + Radio", avatar: "👨" },
  { id: "d3", name: "Mike", role: "Gate Defense", position: "FP Gate", weapon: "Shotgun 12ga", avatar: "🧑" },
  { id: "d4", name: "Sarah", role: "Medical / Reserve", position: "Main House", weapon: "Handgun 9mm", avatar: "👩" },
  { id: "d5", name: "Lisa", role: "Rear Security", position: "Creek Trail", weapon: "Handgun .45", avatar: "👩‍🦰" },
];

const SAMPLE_MEMBERS = [
  { id: "p1", name: "You", avatar: "👤", role: "Lead", status: "home", lat: 45.421, lng: -75.690, lastPing: "Now", battery: 87, sharing: true, color: "#22c55e" },
  { id: "p2", name: "Sarah", avatar: "👩", role: "Medical (RN)", status: "nearby", lat: 45.418, lng: -75.685, lastPing: "2m", battery: 64, sharing: true, color: "#0ea5e9" },
  { id: "p3", name: "Dave", avatar: "👨", role: "Security", status: "away", lat: 45.390, lng: -75.710, lastPing: "8m", battery: 42, sharing: true, color: "#f59e0b" },
  { id: "p4", name: "Mike", avatar: "🧑", role: "Engineer", status: "home", lat: 45.423, lng: -75.688, lastPing: "1m", battery: 91, sharing: true, color: "#10b981" },
  { id: "p5", name: "Lisa", avatar: "👩‍🦰", role: "Agriculture", status: "away", lat: 45.450, lng: -75.650, lastPing: "15m", battery: 33, sharing: true, color: "#ec4899" },
  { id: "p6", name: "Tom", avatar: "🧔", role: "HAM Operator", status: "offline", lat: null, lng: null, lastPing: "2h", battery: 0, sharing: false, color: "#6b7280" },
];

const SAMPLE_CHAT = [
  { id: "c1", from: "p3", text: "Perimeter check done. North fence needs repair — wire sagging at post 14.", ts: "2:41 PM" },
  { id: "c2", from: "p2", text: "Med supplies arriving Thursday. Need someone at the gate to receive.", ts: "2:38 PM" },
  { id: "c3", from: "p4", text: "Generator ran 4hrs today. Oil temp looks good. Next oil change in ~30hrs runtime.", ts: "1:55 PM" },
  { id: "c4", from: "p1", text: "Good copy. Dave, can you patch that fence section tomorrow AM?", ts: "2:42 PM" },
  { id: "c5", from: "p3", text: "Roger. I'll grab the fencing kit from the barn.", ts: "2:43 PM" },
  { id: "c6", from: "p5", text: "Greenhouse seedlings looking strong. Tomatoes should be ready to transplant next week.", ts: "12:30 PM" },
  { id: "c7", from: "p1", text: "Lisa — perfect timing. I'll prep the raised beds this weekend.", ts: "12:45 PM" },
  { id: "c8", from: "p4", text: "Heads up: trail camera on back road caught an unfamiliar vehicle at 9:15 AM. Plate not readable.", ts: "10:20 AM" },
  { id: "c9", from: "p3", text: "Copy. I'll swing by that area on my next patrol and check for tracks.", ts: "10:25 AM" },
  { id: "c10", from: "p2", text: "Reminder: rotate the first aid kits this month. I'll check expiry dates tonight.", ts: "9:15 AM" },
];

const SAMPLE_CONTACTS = [
  { id: "ct1", name: "Sarah Mitchell", group: "Your Group", role: "Medical (RN)", phone: "613-555-0142", address: "Lot 4, Rideau Lake Rd", age: 38, bloodType: "O+", medical: "None", allergies: "Penicillin", skills: "Trauma care, IV, suturing", notes: "24/7 medical contact. Has portable med kit." },
  { id: "ct2", name: "Dave Kowalski", group: "Your Group", role: "Security", phone: "613-555-0198", address: "12 Cedar Lane", age: 45, bloodType: "A+", medical: "Knee replacement (L)", allergies: "None", skills: "Military vet, firearms, tactics", notes: "Former infantry. Handles perimeter security." },
  { id: "ct3", name: "Mike Chen", group: "Your Group", role: "Engineer", phone: "613-555-0267", address: "8 Pine Crescent", age: 34, bloodType: "B+", medical: "Asthma (mild)", allergies: "None", skills: "Electrical, solar, welding, engines", notes: "Go-to for generator and solar issues. Has welding rig." },
  { id: "ct4", name: "Lisa Tremblay", group: "Your Group", role: "Agriculture", phone: "613-555-0311", address: "22 Farm View Rd", age: 41, bloodType: "AB-", medical: "None", allergies: "Bee stings (EpiPen)", skills: "Farming, seed saving, canning, herbalism", notes: "Manages greenhouse. Carries EpiPen at all times." },
  { id: "ct5", name: "Tom Baker", group: "Your Group", role: "HAM Operator", phone: "613-555-0455", address: "19 Old Mill Rd", age: 62, bloodType: "O-", medical: "Type 2 diabetes, high BP", allergies: "Sulfa drugs", skills: "HAM radio, electronics repair", notes: "Call sign VE3TBK. Needs insulin — 90 day supply on hand." },
  { id: "ct6", name: "Jean-Pierre Gagnon", group: "Rideau Creek Co-op", role: "Leader", phone: "613-555-0533", address: "Rideau Creek Rd, km 4.2", age: 52, bloodType: "A-", medical: "None", allergies: "None", skills: "Farming, leadership, French/English", notes: "Primary trade contact. HAM 146.520 or runner." },
  { id: "ct7", name: "Karen Whitfield", group: "Cedar Hill Homestead", role: "Leader", phone: "N/A — HAM only", address: "Cedar Hill, km 7.8 NW", age: 47, bloodType: "Unknown", medical: "Hypothyroid (Synthroid)", allergies: "None", skills: "Forestry, chainsaw, livestock", notes: "HAM 146.520. Needs Synthroid resupply quarterly." },
  { id: "ct8", name: "Rob Fournier", group: "Lakeside Compound", role: "Contact", phone: "N/A — runner only", address: "Lakeside, km 12.1 E", age: 39, bloodType: "Unknown", medical: "Unknown", allergies: "Unknown", skills: "Fishing, boat repair, diving", notes: "Neutral — meet at crossroads only. Do not approach compound." },
  { id: "ct9", name: "Dr. Amara Singh", group: "Rideau Creek Co-op", role: "Doctor (retired)", phone: "613-555-0601", address: "Rideau Creek Rd", age: 67, bloodType: "B+", medical: "Arthritis", allergies: "None", skills: "General practice, surgery (field)", notes: "Retired GP. Available for emergencies. Has surgical kit." },
];

/* ── Comms Plan ── */
const COMMS_PLAN = {
  primaryFreq: { freq: "146.520 MHz", mode: "FM Simplex", name: "Local Net", use: "Day-to-day group check-ins", power: "5W handheld" },
  emergencyFreq: { freq: "146.550 MHz", mode: "FM Simplex", name: "Emergency", use: "Life-threatening emergencies ONLY", power: "Max available" },
  altFreqs: [
    { freq: "462.5625 MHz", mode: "GMRS Ch 1", name: "GMRS Backup", use: "If HAM compromised", power: "2W" },
    { freq: "151.625 MHz", mode: "MURS Ch 1", name: "MURS Fallback", use: "License-free backup", power: "2W" },
    { freq: "27.185 MHz", mode: "CB Ch 19", name: "CB Long-range", use: "Vehicle convoy / long distance", power: "4W" },
  ],
  schedule: [
    { time: "07:00", desc: "Morning roll call — all stations check in with status", duration: "5 min", mandatory: true },
    { time: "12:00", desc: "Midday intel — weather, threat, resource updates", duration: "10 min", mandatory: false },
    { time: "19:00", desc: "Evening debrief — day summary, next-day tasking", duration: "10 min", mandatory: true },
    { time: "22:00", desc: "Night watch handoff — security rotation confirmed", duration: "3 min", mandatory: true },
  ],
  codeWords: [
    { code: "BLACKOUT", meaning: "Total grid failure confirmed", action: "Execute crisis protocol" },
    { code: "OVERWATCH", meaning: "Unknown persons approaching", action: "Secure perimeter, report bearing + count" },
    { code: "EXODUS", meaning: "Bug-out order", action: "Grab bags, rally point Alpha within 30 min" },
    { code: "SHELTER", meaning: "Shelter in place — NBC or severe weather", action: "Seal windows, activate NBC protocol" },
    { code: "ANGEL", meaning: "Medical emergency", action: "Nearest medic respond, state location" },
    { code: "IRON", meaning: "Armed threat confirmed", action: "Armed response team deploy, civilians to safe room" },
    { code: "RIVER", meaning: "Water supply compromised", action: "Switch to stored water only, do not use taps" },
    { code: "PHOENIX", meaning: "All clear — resume normal ops", action: "Stand down alert posture" },
  ],
  rallyPoints: [
    { id: "rp1", name: "Alpha — Primary", location: "Intersection of Cedar Lane & Route 15", coords: "45.421°N, 75.690°W", use: "Default rally for bug-out", marker: "Large red oak tree, east side", supplies: "2 cached water jugs, fire starter" },
    { id: "rp2", name: "Bravo — Secondary", location: "Old stone bridge, Rideau Creek km 2.1", coords: "45.418°N, 75.695°W", use: "If Alpha compromised", marker: "Bridge NW abutment, white paint mark", supplies: "None cached" },
    { id: "rp3", name: "Charlie — Long-range", location: "Fire tower, Provincial Park lot", coords: "45.435°N, 75.720°W", use: "Extended evacuation (>24h)", marker: "Tower base, combination lock box", supplies: "3-day food cache, tarp, water tabs" },
  ],
  callSigns: [
    { person: "You (Leader)", sign: "BASE" },
    { person: "Sarah Mitchell", sign: "MEDIC" },
    { person: "Dave Kowalski", sign: "SENTINEL" },
    { person: "Mike Chen", sign: "SPARK" },
    { person: "Lisa Tremblay", sign: "HARVEST" },
    { person: "Tom Baker (VE3TBK)", sign: "TOWER" },
  ],
  duress: "If captured or under duress, append 'COPY THAT, ALL STATIONS' to any transmission — this phrase is NEVER used in normal comms and signals distress.",
};

/* ── Challenge / Response Authentication Pairs ── */
const CHALLENGE_RESPONSE_PAIRS = [
  { challenge: "FLASH", response: "THUNDER" },
  { challenge: "CRIMSON", response: "FALCON" },
  { challenge: "IRON", response: "FORGE" },
  { challenge: "CEDAR", response: "RIDGE" },
  { challenge: "STORM", response: "HARBOR" },
  { challenge: "PINE", response: "NEEDLE" },
  { challenge: "WOLF", response: "CANYON" },
  { challenge: "EMBER", response: "FROST" },
  { challenge: "RAVEN", response: "SUMMIT" },
  { challenge: "DELTA", response: "BRIDGE" },
  { challenge: "COPPER", response: "SHIELD" },
  { challenge: "SHADOW", response: "LANTERN" },
  { challenge: "GRANITE", response: "COMPASS" },
  { challenge: "TIMBER", response: "CREEK" },
  { challenge: "FLINT", response: "ANVIL" },
  { challenge: "SCARLET", response: "ARROW" },
  { challenge: "ATLAS", response: "BEACON" },
  { challenge: "COBALT", response: "DAGGER" },
  { challenge: "VIPER", response: "ECHO" },
  { challenge: "TUNDRA", response: "MOSS" },
  { challenge: "RAPTOR", response: "SABLE" },
  { challenge: "MARBLE", response: "DRIFT" },
  { challenge: "ONYX", response: "RIVER" },
  { challenge: "BRAVO", response: "STEEL" },
];

/* ── Emergency Frequency Database ── */
const EMERGENCY_FREQUENCIES = [
  // NOAA Weather Radio
  { freq: "162.400", name: "NOAA Weather 1 (WX1)", mode: "NFM", use: "Continuous weather broadcasts & alerts", license: "none", band: "noaa", priority: "high" },
  { freq: "162.425", name: "NOAA Weather 2 (WX2)", mode: "NFM", use: "Continuous weather broadcasts & alerts", license: "none", band: "noaa", priority: "high" },
  { freq: "162.450", name: "NOAA Weather 3 (WX3)", mode: "NFM", use: "Continuous weather broadcasts & alerts", license: "none", band: "noaa", priority: "high" },
  { freq: "162.475", name: "NOAA Weather 4 (WX4)", mode: "NFM", use: "Continuous weather broadcasts & alerts", license: "none", band: "noaa", priority: "med" },
  { freq: "162.500", name: "NOAA Weather 5 (WX5)", mode: "NFM", use: "Continuous weather broadcasts & alerts", license: "none", band: "noaa", priority: "med" },
  { freq: "162.525", name: "NOAA Weather 6 (WX6)", mode: "NFM", use: "Continuous weather broadcasts & alerts", license: "none", band: "noaa", priority: "med" },
  { freq: "162.550", name: "NOAA Weather 7 (WX7)", mode: "NFM", use: "Continuous weather broadcasts & alerts", license: "none", band: "noaa", priority: "med" },
  // HAM 2-Meter Band
  { freq: "146.520", name: "2m National Calling", mode: "FM Simplex", use: "National simplex calling frequency", license: "ham", band: "ham2m", priority: "high" },
  { freq: "146.550", name: "2m Simplex Emergency", mode: "FM Simplex", use: "Emergency simplex traffic", license: "ham", band: "ham2m", priority: "emergency" },
  { freq: "146.580", name: "2m Simplex", mode: "FM Simplex", use: "General simplex communications", license: "ham", band: "ham2m", priority: "low" },
  { freq: "147.000", name: "2m Repeater Output", mode: "FM Repeater", use: "Common repeater output frequency", license: "ham", band: "ham2m", priority: "med" },
  { freq: "147.360", name: "2m Repeater Output", mode: "FM Repeater", use: "Local area repeater", license: "ham", band: "ham2m", priority: "med" },
  { freq: "145.050", name: "2m Packet/APRS", mode: "Digital", use: "Packet radio / APRS tracking", license: "ham", band: "ham2m", priority: "low" },
  { freq: "144.200", name: "2m SSB Calling", mode: "USB", use: "SSB calling frequency — weak signal", license: "ham", band: "ham2m", priority: "low" },
  // HAM 70cm Band
  { freq: "446.000", name: "70cm National Calling", mode: "FM Simplex", use: "UHF simplex calling frequency", license: "ham", band: "ham70cm", priority: "med" },
  { freq: "446.500", name: "70cm Simplex", mode: "FM Simplex", use: "General UHF simplex", license: "ham", band: "ham70cm", priority: "low" },
  { freq: "449.950", name: "70cm Repeater", mode: "FM Repeater", use: "UHF repeater output", license: "ham", band: "ham70cm", priority: "low" },
  // HAM HF Bands
  { freq: "7.200", name: "40m Phone Net", mode: "LSB", use: "Regional nets, ARES/RACES traffic", license: "ham", band: "hamhf", priority: "med" },
  { freq: "3.860", name: "75m Phone Net", mode: "LSB", use: "Regional emergency nets (night)", license: "ham", band: "hamhf", priority: "med" },
  { freq: "14.300", name: "20m Emergency", mode: "USB", use: "Intl. emergency / SATERN / Hurricane Net", license: "ham", band: "hamhf", priority: "high" },
  { freq: "7.030", name: "40m CW QRP", mode: "CW", use: "Low-power CW calling", license: "ham", band: "hamhf", priority: "low" },
  // GMRS
  { freq: "462.5625", name: "GMRS Ch 1", mode: "NFM", use: "General communications", license: "gmrs", band: "gmrs", priority: "med" },
  { freq: "462.5875", name: "GMRS Ch 2", mode: "NFM", use: "General communications", license: "gmrs", band: "gmrs", priority: "low" },
  { freq: "462.6125", name: "GMRS Ch 3", mode: "NFM", use: "General communications", license: "gmrs", band: "gmrs", priority: "low" },
  { freq: "462.6375", name: "GMRS Ch 4", mode: "NFM", use: "General communications", license: "gmrs", band: "gmrs", priority: "low" },
  { freq: "462.6625", name: "GMRS Ch 5", mode: "NFM", use: "General communications", license: "gmrs", band: "gmrs", priority: "low" },
  { freq: "462.6875", name: "GMRS Ch 6", mode: "NFM", use: "General communications", license: "gmrs", band: "gmrs", priority: "low" },
  { freq: "462.7125", name: "GMRS Ch 7", mode: "NFM", use: "General communications", license: "gmrs", band: "gmrs", priority: "low" },
  { freq: "462.7375", name: "GMRS Ch 8", mode: "NFM", use: "General communications", license: "gmrs", band: "gmrs", priority: "low" },
  { freq: "462.5500", name: "GMRS Repeater 15R", mode: "NFM Rpt", use: "GMRS repeater pair — extended range", license: "gmrs", band: "gmrs", priority: "med" },
  { freq: "462.5750", name: "GMRS Emergency Ch 20", mode: "NFM", use: "Recognized GMRS emergency channel", license: "gmrs", band: "gmrs", priority: "high" },
  // FRS
  { freq: "462.5625", name: "FRS Ch 1", mode: "NFM 12.5kHz", use: "Family/group — shared with GMRS", license: "none", band: "frs", priority: "med" },
  { freq: "467.5625", name: "FRS Ch 8", mode: "NFM 12.5kHz", use: "FRS only channel (0.5W limit)", license: "none", band: "frs", priority: "low" },
  { freq: "462.5625", name: "FRS/GMRS Ch 1", mode: "NFM", use: "Most common FRS channel", license: "none", band: "frs", priority: "med" },
  // MURS
  { freq: "151.820", name: "MURS Ch 1", mode: "NFM 11.25kHz", use: "License-free VHF — business/personal", license: "none", band: "murs", priority: "med" },
  { freq: "151.880", name: "MURS Ch 2", mode: "NFM 11.25kHz", use: "License-free VHF — business/personal", license: "none", band: "murs", priority: "low" },
  { freq: "151.940", name: "MURS Ch 3", mode: "NFM 11.25kHz", use: "License-free VHF — business/personal", license: "none", band: "murs", priority: "low" },
  { freq: "154.570", name: "MURS Ch 4", mode: "FM 20kHz", use: "License-free VHF (wider bandwidth)", license: "none", band: "murs", priority: "low" },
  { freq: "154.600", name: "MURS Ch 5", mode: "FM 20kHz", use: "License-free VHF (wider bandwidth)", license: "none", band: "murs", priority: "low" },
  // CB
  { freq: "27.065", name: "CB Ch 9 — Emergency", mode: "AM", use: "Official CB emergency channel", license: "none", band: "cb", priority: "emergency" },
  { freq: "27.185", name: "CB Ch 19 — Highway", mode: "AM", use: "Trucker/highway info channel", license: "none", band: "cb", priority: "high" },
  { freq: "27.025", name: "CB Ch 4", mode: "AM", use: "Road conditions / local traffic", license: "none", band: "cb", priority: "low" },
  { freq: "27.255", name: "CB Ch 23", mode: "AM", use: "General communications", license: "none", band: "cb", priority: "low" },
  // Marine VHF
  { freq: "156.800", name: "Marine Ch 16 — Distress", mode: "FM", use: "International distress & calling", license: "marine", band: "marine", priority: "emergency" },
  { freq: "156.450", name: "Marine Ch 9 — Alt Calling", mode: "FM", use: "Non-commercial calling channel", license: "marine", band: "marine", priority: "med" },
  { freq: "157.100", name: "Marine Ch 22A — Coast Guard", mode: "FM", use: "US Coast Guard liaison", license: "marine", band: "marine", priority: "high" },
  { freq: "156.650", name: "Marine Ch 13 — Bridge", mode: "FM 1W", use: "Bridge-to-bridge navigation safety", license: "marine", band: "marine", priority: "med" },
];

const CRISIS_TYPES = [
  { id: "natural_disaster", name: "Natural Disaster", icon: "🌪️", color: "#0ea5e9", actions: ["Shelter in place or evacuate per local guidance", "Fill all water containers immediately", "Charge all devices and batteries now", "Move critical supplies to ground level (flood) or interior room (tornado/hurricane)", "Activate weather radio monitoring on all NOAA channels"] },
  { id: "grid_failure", name: "Grid Failure / Blackout", icon: "⚡", color: "#f59e0b", actions: ["Start generator — load-shed to essentials only", "Minimize fridge/freezer openings (stays cold 24-48h sealed)", "Switch to wood/propane heat if available", "Conserve water — well pump requires power", "Activate HAM radio check-in schedule with contacts"] },
  { id: "civil_unrest", name: "Civil Unrest", icon: "🚨", color: "#ef4444", actions: ["Lock down property perimeter immediately", "Account for all family members — establish check-in", "Avoid travel on main roads and through urban areas", "Monitor police/fire scanner frequencies continuously", "Stage bug-out bags at door in case evacuation needed"] },
  { id: "pandemic", name: "Pandemic / Quarantine", icon: "🦠", color: "#a855f7", actions: ["Activate quarantine protocols — limit outside contact", "Inventory all medical supplies and PPE immediately", "Set up decontamination zone at entry points", "Establish daily communication schedule with allies", "Begin water and food rationing plan for extended duration"] },
  { id: "economic", name: "Economic Collapse", icon: "📉", color: "#f97316", actions: ["Secure cash reserves — ATMs and banks may go offline", "Inventory all barter-worthy supplies (fuel, ammo, food)", "Accelerate any pending critical supply purchases now", "Coordinate with community trade network", "Lock down fuel storage — prices spike first in crisis"] },
  { id: "nuclear_chemical", name: "Nuclear / Chemical / NBC", icon: "☢️", color: "#eab308", actions: ["Shelter in place — DO NOT go outside under any circumstances", "Seal all windows and doors with plastic sheeting and tape", "Take potassium iodide if nuclear (130mg adult dose)", "Activate NBC air filtration system if available", "Monitor official emergency channels for all-clear signal"] },
  { id: "cyber_attack", name: "Cyber Attack / Infrastructure", icon: "💻", color: "#6366f1", actions: ["Disconnect from internet — air-gap all critical devices", "Switch to offline comms immediately (HAM radio, satellite)", "Verify banking and financial accounts if still accessible", "Activate manual overrides for any smart-home systems", "Assume all digital infrastructure is compromised"] },
  { id: "supply_chain", name: "Supply Chain Disruption", icon: "🚚", color: "#14b8a6", actions: ["Inventory all consumables — begin rationing plan immediately", "Prioritize acquiring fuel before shortages worsen", "Activate community mutual aid and resource sharing", "Begin garden production if growing season permits", "Identify local alternative supply sources and barter options"] },
];

const NATO_PHONETIC = [
  { letter: "A", word: "Alpha" }, { letter: "B", word: "Bravo" }, { letter: "C", word: "Charlie" },
  { letter: "D", word: "Delta" }, { letter: "E", word: "Echo" }, { letter: "F", word: "Foxtrot" },
  { letter: "G", word: "Golf" }, { letter: "H", word: "Hotel" }, { letter: "I", word: "India" },
  { letter: "J", word: "Juliet" }, { letter: "K", word: "Kilo" }, { letter: "L", word: "Lima" },
  { letter: "M", word: "Mike" }, { letter: "N", word: "November" }, { letter: "O", word: "Oscar" },
  { letter: "P", word: "Papa" }, { letter: "Q", word: "Quebec" }, { letter: "R", word: "Romeo" },
  { letter: "S", word: "Sierra" }, { letter: "T", word: "Tango" }, { letter: "U", word: "Uniform" },
  { letter: "V", word: "Victor" }, { letter: "W", word: "Whiskey" }, { letter: "X", word: "X-ray" },
  { letter: "Y", word: "Yankee" }, { letter: "Z", word: "Zulu" },
];

const PROWORDS = [
  { word: "MAYDAY", meaning: "Grave and imminent danger — life at risk", use: "Say 3 times, then your call sign and situation", severity: "critical" },
  { word: "PAN-PAN", meaning: "Urgent situation — no immediate danger to life", use: "Say 3 times, then describe situation", severity: "amber" },
  { word: "SECURITE", meaning: "Safety message — weather or navigation hazard", use: "Say 3 times before broadcasting safety info", severity: "info" },
  { word: "ROGER", meaning: "Message received and understood", use: "Acknowledge receipt only — does NOT mean yes", severity: "info" },
  { word: "WILCO", meaning: "Will comply with instructions", use: "Acknowledges AND confirms you will act", severity: "info" },
  { word: "SAY AGAIN", meaning: "Repeat your last transmission", use: "Never say 'repeat' — it means fire again in military", severity: "info" },
  { word: "BREAK", meaning: "Pause between portions of a message", use: "Used when message is long or changing topics", severity: "info" },
  { word: "OUT", meaning: "End of transmission, no reply expected", use: "Final word of conversation. Never say 'over and out'", severity: "info" },
  { word: "OVER", meaning: "End of my turn, expecting reply", use: "Signals you are done talking, awaiting response", severity: "info" },
  { word: "RADIO CHECK", meaning: "How do you read my signal?", use: "Used to verify radio is working and signal strength", severity: "info" },
  { word: "COPY", meaning: "I have received and understood", use: "Similar to Roger — confirms comprehension", severity: "info" },
  { word: "AFFIRMATIVE", meaning: "Yes", use: "Use instead of 'yes' for clarity", severity: "info" },
  { word: "NEGATIVE", meaning: "No", use: "Use instead of 'no' for clarity", severity: "info" },
];

/* ── Multi-Property ── */
const DEFAULT_PROPERTIES = [
  { id: "prop1", name: "Primary Residence", type: "home", icon: "🏠", active: true },
  { id: "prop2", name: "Bug-Out Cabin", type: "cabin", icon: "🏕️", active: false },
  { id: "prop3", name: "Cache Site Alpha", type: "cache", icon: "📦", active: false },
];

/* ── Property Profile (Quick Start Questionnaire) ── */
const DEFAULT_PROPERTY_PROFILE = {
  heatSource: [], powerSource: [], gridStatus: null, hasGenerator: null, generatorFuel: [],
  waterSource: [], freshwaterAccess: [], sewage: null,
  populationDensity: null, nearestTownKm: null, propertyAcres: null, geoRisks: [],
  specialNeeds: [], pets: [],
  foodStorage: [], medicalTraining: [], commsCapability: [], defensivePosture: [],
  completedAt: null,
};

const SAMPLE_ITEMS = [
  { id: "w1", category: "water", subType: "well", name: "Back well", quantity: 1, location: "Backyard", fields: { depth: "85ft", gpm: "6", hasPump: "Electric", pumpType: "Manual" }, addedDate: "2025-01-15" },
  { id: "w2", category: "water", subType: "storedWater", name: "55gal drums (4)", quantity: 220, location: "Garage", fields: { capacity: "55", lastRefreshed: "2025-09-01", containerType: "Barrel" }, addedDate: "2025-02-01" },
  { id: "w3", category: "water", subType: "purificationDevice", name: "Berkey Filter", quantity: 1, location: "Kitchen", fields: { filterType: "Berkey", lifespanGallons: "3000", gallonsUsed: "450" }, addedDate: "2025-01-10" },
  { id: "w4", category: "water", subType: "freshwater", name: "Creek 0.3mi", quantity: 1, location: "East", fields: { distance: "0.3mi", flowRate: "Year-round" }, addedDate: "2025-01-01" },
  { id: "f1", category: "food", subType: "cannedGoods", name: "Canned goods", quantity: 120, location: "Pantry", fields: { calories: "250", servings: "2", expiryDate: "2027-06-15" }, addedDate: "2025-02-01" },
  { id: "f2", category: "food", subType: "freezeDried", name: "Mountain House", quantity: 96, location: "Basement", fields: { calories: "280", servings: "2.5", expiryDate: "2050-01-01" }, addedDate: "2025-01-20" },
  { id: "f3", category: "food", subType: "dryGoods", name: "Beans & pasta", quantity: 40, location: "Pantry", fields: { weightLbs: "40", calories: "1650", servings: "1", expiryDate: "2028-01-01" }, addedDate: "2025-03-15" },
  { id: "m1i", category: "medical", subType: "firstAidKit", name: "FA Kit", quantity: 2, location: "Hall", fields: { kitLevel: "Intermediate", expiryDate: "2027-08-01" }, addedDate: "2025-01-20" },
  { id: "fi1", category: "firewood", subType: "cordwood", name: "Split oak", quantity: 4, location: "Wood shed", fields: { cords: "4", seasoned: "Well seasoned", woodSpecies: "Oak" }, addedDate: "2025-01-01" },
  { id: "fi2", category: "firewood", subType: "fireplace", name: "Living room stove", quantity: 1, location: "Living room", fields: { btuRating: "55000", cordsPerMonth: "0.8", lastInspection: "2025-09-15" }, addedDate: "2025-01-01" },
  { id: "fi3", category: "firewood", subType: "chainsaw", name: "Stihl MS 261", quantity: 1, location: "Garage", fields: { chainsawBrand: "Stihl", lastService: "2025-10-01", barLength: "20\"", chainsCount: "3" }, addedDate: "2025-03-01" },
  { id: "fu1", category: "fuel", subType: "gasoline", name: "Stabilized gas", quantity: 25, location: "Shed", fields: { gallons: "25", stabilized: "Yes", lastRotated: "2025-08-15" }, addedDate: "2025-03-01" },
  { id: "fu2", category: "fuel", subType: "propane", name: "Propane tanks", quantity: 3, location: "Shed", fields: { tankSize: "20lb" }, addedDate: "2025-02-01" },
  { id: "fa1", category: "firearms", subType: "rifle", name: "AR-15", quantity: 1, location: "Safe", fields: { caliber: "5.56", firearmAction: "Semi-auto", optic: "LPVO 1-6x" }, addedDate: "2025-01-15" },
  { id: "fa2", category: "firearms", subType: "shotgun", name: "Mossberg 590", quantity: 1, location: "Safe", fields: { gauge: "12ga", firearmAction: "Pump" }, addedDate: "2025-01-15" },
  { id: "fa3", category: "firearms", subType: "ammunition", name: "5.56 FMJ", quantity: 1000, location: "Safe", fields: { caliber: "5.56", rounds: "1000", ammoType: "FMJ" }, addedDate: "2025-02-01" },
  { id: "fa4", category: "firearms", subType: "ammunition", name: "12ga buckshot", quantity: 200, location: "Safe", fields: { caliber: "12ga", rounds: "200", ammoType: "Buckshot" }, addedDate: "2025-02-01" },
  { id: "v1", category: "vehicles", subType: "atv", name: "Honda Foreman 520", quantity: 1, location: "Barn", fields: { vMake: "Honda", vModel: "Foreman 520", vYear: "2021", lastOilChange: "2025-09-01", oilInterval: "Every 100hrs", nextService: "2026-03-01" }, addedDate: "2025-01-01" },
  { id: "v2", category: "vehicles", subType: "tractor", name: "Kubota B2601", quantity: 1, location: "Barn", fields: { vMake: "Kubota", vModel: "B2601", vYear: "2019", lastOilChange: "2025-07-15", oilInterval: "Every 100hrs", nextService: "2026-01-15", hoursOnEngine: "620" }, addedDate: "2025-01-01" },
  { id: "v3", category: "vehicles", subType: "truck", name: "F-250 Diesel", quantity: 1, location: "Driveway", fields: { vMake: "Ford", vModel: "F-250", vYear: "2020", lastOilChange: "2025-11-01", oilInterval: "Every 10000mi", nextService: "2026-05-01", mileage: "68000" }, addedDate: "2025-01-01" },
  { id: "v4", category: "vehicles", subType: "fluids", name: "Motor oil 15W-40", quantity: 10, location: "Garage", fields: { fluidType: "Motor oil", gallons: "10" }, addedDate: "2025-03-01" },
  { id: "d1", category: "defense", subType: "tripWire", name: "Perimeter alarm kit", quantity: 2, location: "Garage", fields: { wireLength: "200" }, addedDate: "2025-02-20" },
  { id: "d2", category: "defense", subType: "bodyArmor", name: "Level III plates", quantity: 2, location: "Closet", fields: { level: "III" }, addedDate: "2025-01-15" },
  { id: "eq1", category: "equipment", subType: "tarp", name: "Heavy duty tarps", quantity: 4, location: "Barn", fields: { dimensions: "10x12 ft" }, addedDate: "2025-02-01" },
  { id: "eq2", category: "equipment", subType: "packs", name: "Bug-out bags", quantity: 2, location: "Hall closet", fields: { packCapacity: "72" }, addedDate: "2025-01-15" },
  { id: "eq3", category: "equipment", subType: "documents", name: "Emergency docs", quantity: 1, location: "Safe", fields: { docType: "Insurance" }, addedDate: "2025-01-01" },
  { id: "eq4", category: "equipment", subType: "airFilter", name: "MERV-13 furnace filters", quantity: 6, location: "Garage", fields: { filterSize: "20x25x1", filterQty: "6" }, addedDate: "2025-02-01" },
  { id: "eq5", category: "equipment", subType: "waterFilter", name: "Berkey replacement", quantity: 2, location: "Kitchen", fields: { filterType: "Ceramic", lifespanGallons: "3000", gallonsUsed: "800" }, addedDate: "2025-01-15" },
  { id: "eq6", category: "equipment", subType: "fuelFilter", name: "Honda oil filters", quantity: 4, location: "Garage", fields: { partFor: "Honda EU2200i", filterQty: "4" }, addedDate: "2025-03-01" },
  { id: "fm1", category: "farm", subType: "seedPacket", name: "Tomato — Roma", quantity: 3, location: "Greenhouse", fields: { cropName: "Tomato", seedVariety: "Roma", plantMonth: "Apr", harvestMonth: "Aug", daysToHarvest: "75", expiryDate: "2027-12-01" }, addedDate: "2025-02-01" },
  { id: "fm2", category: "farm", subType: "seedPacket", name: "Lettuce — Butterhead", quantity: 5, location: "Greenhouse", fields: { cropName: "Lettuce", seedVariety: "Butterhead", plantMonth: "Mar", harvestMonth: "Jun", daysToHarvest: "55" }, addedDate: "2025-02-01" },
  { id: "fm3", category: "farm", subType: "seedPacket", name: "Potato — Yukon Gold", quantity: 4, location: "Garage", fields: { cropName: "Potato", seedVariety: "Yukon Gold", plantMonth: "May", harvestMonth: "Sep", daysToHarvest: "90" }, addedDate: "2025-02-01" },
  { id: "fm4", category: "farm", subType: "seedPacket", name: "Beans — Pole", quantity: 6, location: "Greenhouse", fields: { cropName: "Beans", seedVariety: "Kentucky Wonder", plantMonth: "May", harvestMonth: "Aug", daysToHarvest: "65" }, addedDate: "2025-02-01" },
  { id: "fm5", category: "farm", subType: "raisedBed", name: "Raised beds — veggie", quantity: 3, location: "Backyard", fields: { sqft: "180", soilType: "Raised bed mix", cropName: "Mixed vegetables" }, addedDate: "2025-03-15" },
  { id: "fm6", category: "farm", subType: "greenhouse", name: "Greenhouse 12x16", quantity: 1, location: "Backyard", fields: { sqft: "192", heatedGreenhouse: "Passive solar" }, addedDate: "2025-01-01" },
  { id: "fm7", category: "farm", subType: "soil", name: "Pro-Mix potting soil", quantity: 8, location: "Greenhouse", fields: { soilType: "Potting mix", weightLbs: "30" }, addedDate: "2025-03-01" },
  { id: "fm8", category: "farm", subType: "fertilizer", name: "Worm castings", quantity: 4, location: "Barn", fields: { fertilizerType: "Worm castings", weightLbs: "25" }, addedDate: "2025-03-01" },
  { id: "fm9", category: "farm", subType: "irrigation", name: "Drip system — beds", quantity: 1, location: "Backyard", fields: { irrigationType: "Drip" }, addedDate: "2025-04-01" },
  { id: "fm10", category: "farm", subType: "seedPacket", name: "Carrot — Nantes", quantity: 4, location: "Greenhouse", fields: { cropName: "Carrot", seedVariety: "Nantes", plantMonth: "Apr", harvestMonth: "Aug", daysToHarvest: "75" }, addedDate: "2025-02-01" },
  { id: "fm11", category: "farm", subType: "seedPacket", name: "Basil — Genovese", quantity: 3, location: "Greenhouse", fields: { cropName: "Basil", seedVariety: "Genovese", plantMonth: "May", harvestMonth: "Sep", daysToHarvest: "28" }, addedDate: "2025-02-01" },
  { id: "fm12", category: "farm", subType: "seedPacket", name: "Pepper — Jalapeño", quantity: 2, location: "Greenhouse", fields: { cropName: "Pepper", seedVariety: "Jalapeño", plantMonth: "May", harvestMonth: "Aug", daysToHarvest: "75" }, addedDate: "2025-02-15" },
  { id: "fm13", category: "farm", subType: "seedPacket", name: "Cucumber — Marketmore", quantity: 3, location: "Greenhouse", fields: { cropName: "Cucumber", seedVariety: "Marketmore", plantMonth: "May", harvestMonth: "Aug", daysToHarvest: "55" }, addedDate: "2025-02-15" },
  { id: "fm14", category: "farm", subType: "seedPacket", name: "Zucchini — Black Beauty", quantity: 2, location: "Greenhouse", fields: { cropName: "Zucchini", seedVariety: "Black Beauty", plantMonth: "May", harvestMonth: "Aug", daysToHarvest: "50" }, addedDate: "2025-02-15" },
  { id: "fm15", category: "farm", subType: "seedPacket", name: "Kale — Lacinato", quantity: 4, location: "Greenhouse", fields: { cropName: "Kale", seedVariety: "Lacinato", plantMonth: "Apr", harvestMonth: "Nov", daysToHarvest: "55" }, addedDate: "2025-02-01" },
  { id: "fm16", category: "farm", subType: "seedPacket", name: "Radish — Cherry Belle", quantity: 5, location: "Greenhouse", fields: { cropName: "Radish", seedVariety: "Cherry Belle", plantMonth: "Apr", harvestMonth: "May", daysToHarvest: "28" }, addedDate: "2025-02-01" },
  { id: "fm17", category: "farm", subType: "seedPacket", name: "Spinach — Bloomsdale", quantity: 3, location: "Greenhouse", fields: { cropName: "Spinach", seedVariety: "Bloomsdale", plantMonth: "Mar", harvestMonth: "Jun", daysToHarvest: "42" }, addedDate: "2025-02-01" },
  { id: "c1i", category: "comms", subType: "hamRadio", name: "Baofeng x2", quantity: 2, location: "Office", fields: { licensed: "Tech", bands: "2m,70cm" }, addedDate: "2025-02-20" },
  { id: "p1i", category: "power", subType: "solarPanel", name: "200W panels", quantity: 2, location: "Garage", fields: { watts: "200", inverter: "Separate" }, addedDate: "2025-02-20" },
  { id: "p2i", category: "power", subType: "generator", name: "Honda EU2200i", quantity: 1, location: "Garage", fields: { watts: "2200", fuelType: "Gas" }, addedDate: "2025-01-15" },
  { id: "bt1", category: "batteries", subType: "aa", name: "Eneloop AA (rechargeable)", quantity: 24, location: "Garage", fields: { batteryBrand: "Eneloop", batteryCount: "24", isRechargeable: "Yes", batteryChemistry: "NiMH" }, addedDate: "2025-02-01" },
  { id: "bt2", category: "batteries", subType: "aa", name: "Duracell AA (disposable)", quantity: 48, location: "Garage", fields: { batteryBrand: "Duracell", batteryCount: "48", isRechargeable: "No", batteryChemistry: "Alkaline" }, addedDate: "2025-02-01" },
  { id: "bt3", category: "batteries", subType: "aaa", name: "Eneloop AAA", quantity: 16, location: "Garage", fields: { batteryBrand: "Eneloop", batteryCount: "16", isRechargeable: "Yes", batteryChemistry: "NiMH" }, addedDate: "2025-02-01" },
  { id: "bt4", category: "batteries", subType: "cr123a", name: "SureFire CR123A", quantity: 12, location: "Safe", fields: { batteryBrand: "SureFire", batteryCount: "12", isRechargeable: "No", batteryChemistry: "Lithium" }, addedDate: "2025-02-01" },
  { id: "bt5", category: "batteries", subType: "eighteen650", name: "Samsung 30Q 18650", quantity: 8, location: "Office", fields: { batteryBrand: "Samsung", batteryCount: "8", isRechargeable: "Yes", batteryMah: "3000" }, addedDate: "2025-02-01" },
  { id: "bt6", category: "batteries", subType: "dCell", name: "D-Cell alkaline", quantity: 12, location: "Garage", fields: { batteryBrand: "Energizer", batteryCount: "12", isRechargeable: "No", batteryChemistry: "Alkaline" }, addedDate: "2025-02-01" },
  { id: "bt7", category: "batteries", subType: "battCharger", name: "Nitecore D4 charger", quantity: 1, location: "Office", fields: { chargerType: "Universal", chargerSlots: "4" }, addedDate: "2025-02-01" },
  { id: "bt8", category: "batteries", subType: "solarCharger", name: "BigBlue 28W solar panel", quantity: 1, location: "BOB", fields: { watts: "28", chargerType: "Solar to USB" }, addedDate: "2025-02-01" },
  { id: "el1", category: "electronics", subType: "satPhone", name: "Garmin inReach Mini 2", quantity: 1, location: "Office", fields: { deviceBrand: "Garmin", deviceModel: "inReach Mini 2", isRechargeable: "Yes", hasPlan: "Yes — active", planExpiry: "2026-09-15", planProvider: "Garmin", deviceLocation: "Office" }, addedDate: "2025-01-01" },
  { id: "el2", category: "electronics", subType: "gps", name: "Garmin GPSMAP 67i", quantity: 1, location: "BOB", fields: { deviceBrand: "Garmin", deviceModel: "GPSMAP 67i", isRechargeable: "Yes", hasPlan: "Yes — active", planExpiry: "2026-09-15", planProvider: "Garmin", deviceLocation: "Dad's BOB" }, addedDate: "2025-01-01" },
  { id: "el3", category: "electronics", subType: "radio", name: "Baofeng UV-5R (x3)", quantity: 3, location: "Office", fields: { deviceBrand: "Baofeng", deviceModel: "UV-5R", isRechargeable: "Yes", licensed: "Tech", deviceLocation: "Office shelf" }, addedDate: "2025-01-15" },
  { id: "el4", category: "electronics", subType: "weatherRadio", name: "Midland ER310", quantity: 1, location: "Kitchen", fields: { deviceBrand: "Midland", isRechargeable: "Yes", deviceLocation: "Kitchen counter" }, addedDate: "2025-01-15" },
  { id: "el5", category: "electronics", subType: "laptop", name: "MacBook Pro", quantity: 1, location: "Office", fields: { deviceBrand: "Apple", deviceModel: "MacBook Pro 14\"", isRechargeable: "Yes", deviceLocation: "Office" }, addedDate: "2025-01-01" },
  { id: "el6", category: "electronics", subType: "trailCamElec", name: "Tactacam Reveal X Pro (x6)", quantity: 6, location: "Field", fields: { deviceBrand: "Tactacam", deviceModel: "Reveal X Pro", hasPlan: "Yes — active", planExpiry: "2026-06-01", planProvider: "Tactacam", deviceLocation: "Perimeter cameras" }, addedDate: "2025-01-01" },
  { id: "el7", category: "electronics", subType: "drone", name: "DJI Mini 3 Pro", quantity: 1, location: "Office", fields: { deviceBrand: "DJI", deviceModel: "Mini 3 Pro", isRechargeable: "Yes", deviceLocation: "Office" }, addedDate: "2025-03-01" },
  { id: "el8", category: "electronics", subType: "faradayStored", name: "Backup radio + charger", quantity: 1, location: "Faraday cage", fields: { deviceBrand: "Baofeng", deviceModel: "UV-5R + solar charger", deviceLocation: "Basement Faraday cage", bobItemNotes: "Sealed in EMP bag inside steel ammo can" }, addedDate: "2025-01-01" },
  { id: "bo1", category: "bugout", subType: "bag", name: "Dad's BOB", quantity: 1, location: "Hall closet", fields: { bagOwner: "Dad", bagWeight: "38", packCapacity: "72", lastAudited: "2025-11-01" }, addedDate: "2025-01-01" },
  { id: "bo2", category: "bugout", subType: "bag", name: "Mom's BOB", quantity: 1, location: "Hall closet", fields: { bagOwner: "Mom", bagWeight: "28", packCapacity: "55", lastAudited: "2025-11-01" }, addedDate: "2025-01-01" },
  { id: "bo3", category: "bugout", subType: "bobWater", name: "Sawyer Mini + 2L bladders", quantity: 2, location: "Dad's BOB", fields: { bobItemQty: "2", bobItemNotes: "Sawyer Squeeze + backup tabs" }, addedDate: "2025-01-01" },
  { id: "bo4", category: "bugout", subType: "bobFood", name: "72hr rations", quantity: 4, location: "Dad's BOB", fields: { bobItemQty: "4", bobItemNotes: "Datrex 3600cal bars", expiryDate: "2030-01-01" }, addedDate: "2025-01-01" },
  { id: "bo5", category: "bugout", subType: "bobFirstAid", name: "IFAK", quantity: 2, location: "Both BOBs", fields: { bobItemQty: "2", bobItemNotes: "Tourniquet, QuikClot, Israeli bandage" }, addedDate: "2025-01-01" },
  { id: "bo6", category: "bugout", subType: "bobShelter", name: "Bivvy + tarp", quantity: 2, location: "Both BOBs", fields: { bobItemQty: "2", bobItemNotes: "SOL emergency bivvy + 8x10 tarp" }, addedDate: "2025-01-01" },
  { id: "bo7", category: "bugout", subType: "bobFireKit", name: "Fire kit", quantity: 2, location: "Both BOBs", fields: { bobItemQty: "2", bobItemNotes: "Ferro rod, lighter, tinder" }, addedDate: "2025-01-01" },
  { id: "bo8", category: "bugout", subType: "bobTools", name: "Morakniv + multitool", quantity: 2, location: "Both BOBs", fields: { bobItemQty: "2", bobItemNotes: "Mora Companion + Leatherman Wave" }, addedDate: "2025-01-01" },
  { id: "bo9", category: "bugout", subType: "bobNav", name: "Topo maps + compass", quantity: 1, location: "Dad's BOB", fields: { bobItemQty: "1", bobItemNotes: "Local 1:50k topos, Silva compass" }, addedDate: "2025-01-01" },
  { id: "bo10", category: "bugout", subType: "bobDocs", name: "Doc packet + cash", quantity: 2, location: "Both BOBs", fields: { bobItemQty: "2", bobItemNotes: "$500 small bills, ID copies, insurance" }, addedDate: "2025-01-01" },
  { id: "bo11", category: "bugout", subType: "bobComms", name: "Baofeng UV-5R", quantity: 1, location: "Dad's BOB", fields: { bobItemQty: "1", bobItemNotes: "Programmed local repeaters + FRS" }, addedDate: "2025-01-01" },
  { id: "k1", category: "kids", subType: "diapers", name: "Huggies Size 4", quantity: 6, location: "Nursery", fields: { kidName: "Baby", kidAge: "18mo", diaperSize: "Size 4", bobItemQty: "6" }, addedDate: "2025-02-01" },
  { id: "k2", category: "kids", subType: "wipes", name: "Water Wipes", quantity: 8, location: "Nursery", fields: { bobItemQty: "8" }, addedDate: "2025-02-01" },
  { id: "k3", category: "kids", subType: "formula", name: "Enfamil powder", quantity: 4, location: "Pantry", fields: { kidName: "Baby", formulaType: "Powder", bobItemQty: "4", expiryDate: "2026-08-01" }, addedDate: "2025-02-01" },
  { id: "k4", category: "kids", subType: "kidMeds", name: "Infant Tylenol", quantity: 3, location: "Medicine cabinet", fields: { kidName: "Baby", medication: "Acetaminophen", daysSupply: "30", expiryDate: "2027-06-01" }, addedDate: "2025-02-01" },
  { id: "k5", category: "kids", subType: "kidMeds", name: "Children's Benadryl", quantity: 2, location: "Medicine cabinet", fields: { kidName: "All kids", medication: "Diphenhydramine", daysSupply: "20", expiryDate: "2027-03-01" }, addedDate: "2025-02-01" },
  { id: "k6", category: "kids", subType: "kidClothing", name: "Winter snowsuit", quantity: 2, location: "Closet", fields: { kidName: "Baby", kidAge: "18mo", clothingType: "Winter", kidSize: "18-24mo" }, addedDate: "2025-01-15" },
  { id: "k7", category: "kids", subType: "blankets", name: "Fleece sleep sacks", quantity: 3, location: "Nursery", fields: { kidName: "Baby", bobItemNotes: "TOG 2.5 for cold weather" }, addedDate: "2025-01-15" },
  { id: "k8", category: "kids", subType: "carSeat", name: "Graco 4Ever DLX", quantity: 1, location: "F-250", fields: { kidName: "Baby", kidAge: "18mo", bobItemNotes: "Rear-facing, expires 2035" }, addedDate: "2025-01-01" },
  { id: "k9", category: "kids", subType: "sipCup", name: "Bottles + nipples", quantity: 6, location: "Kitchen", fields: { bobItemQty: "6" }, addedDate: "2025-02-01" },
  { id: "k10", category: "kids", subType: "babyFood", name: "Pouches — mixed fruit/veg", quantity: 24, location: "Pantry", fields: { kidName: "Baby", bobItemQty: "24", expiryDate: "2026-12-01" }, addedDate: "2025-02-01" },
  { id: "k11", category: "kids", subType: "toys", name: "Comfort bear + books", quantity: 3, location: "BOB", fields: { kidName: "Baby", bobItemNotes: "Favourite stuffed bear, 2 board books" }, addedDate: "2025-01-01" },
  { id: "k12", category: "kids", subType: "kidDocs", name: "Medical records + ID", quantity: 1, location: "Safe", fields: { kidName: "Baby", bobItemNotes: "Health card, birth cert copy, vaccination record" }, addedDate: "2025-01-01" },
  /* Boat */
  { id: "bo1b", category: "boat", subType: "vessel", name: "16ft Lund aluminum", quantity: 1, location: "Boat shed", fields: { boatType: "Aluminum fishing", boatLength: "16", boatMotor: "Mercury 25hp", boatHullMat: "Aluminum", boatReg: "ON 4821 AB", deviceLocation: "Boat shed" }, addedDate: "2025-01-01" },
  { id: "bo2b", category: "boat", subType: "outboard", name: "Mercury 25hp 4-stroke", quantity: 1, location: "Boat shed", fields: { vMake: "Mercury", vModel: "25hp EFI", boatHP: "25", boatEngineHours: "142", lastOilChange: "2025-09-15", oilInterval: "100", nextService: "2026-04-01", fuelType: "Gas" }, addedDate: "2025-01-01" },
  { id: "bo3b", category: "boat", subType: "lifeJacket", name: "Adult PFDs (Type III)", quantity: 4, location: "Boat shed", fields: { pfdType: "Type III — Flotation", pfdSize: "Adult L/XL", bobItemQty: "4" }, addedDate: "2025-01-01" },
  { id: "bo4b", category: "boat", subType: "lifeJacket", name: "Child PFDs", quantity: 2, location: "Boat shed", fields: { pfdType: "Type III — Flotation", pfdSize: "Child (30-50lb)", bobItemQty: "2" }, addedDate: "2025-01-01" },
  { id: "bo5b", category: "boat", subType: "throwBag", name: "Throwable cushion", quantity: 1, location: "Boat", fields: { bobItemQty: "1" }, addedDate: "2025-01-01" },
  { id: "bo6b", category: "boat", subType: "boatFuel", name: "Marine gas (stabilized)", quantity: 20, location: "Boat shed", fields: { gallons: "20", fuelType: "Gas", stabilized: "Yes — Sta-Bil" }, addedDate: "2025-02-01" },
  { id: "bo7b", category: "boat", subType: "boatOil", name: "Mercury 4-stroke oil", quantity: 4, location: "Garage", fields: { fluidType: "Mercury 25W-40 marine", bobItemQty: "4" }, addedDate: "2025-02-01" },
  { id: "bo8b", category: "boat", subType: "boatSafety", name: "Safety kit — flares, horn, whistle", quantity: 1, location: "Boat", fields: { expiryDate: "2027-06-01", bobItemNotes: "3 flares, air horn, pealess whistle, mirror" }, addedDate: "2025-01-01" },
  { id: "bo9b", category: "boat", subType: "anchor", name: "8lb fluke anchor + 100ft line", quantity: 1, location: "Boat", fields: { bobItemNotes: "Fluke anchor w/ chain leader", lengthFt: "100" }, addedDate: "2025-01-01" },
  { id: "bo10b", category: "boat", subType: "boatTrailer", name: "EZ Loader trailer", quantity: 1, location: "Driveway", fields: { vMake: "EZ Loader", vModel: "16-18ft roller", boatReg: "ON T-8821", bobItemNotes: "Bearings repacked 2025-06" }, addedDate: "2025-01-01" },
  { id: "bo11b", category: "boat", subType: "paddle", name: "Emergency oars", quantity: 2, location: "Boat", fields: { bobItemQty: "2", bobItemNotes: "48\" aluminum" }, addedDate: "2025-01-01" },
  /* Fishing */
  { id: "fi1", category: "fishing", subType: "rod", name: "Spinning combo — medium", quantity: 2, location: "Garage", fields: { fishRodType: "Spinning", fishLineWeight: "10lb mono", fishReelType: "Spinning", deviceLocation: "Garage rod rack" }, addedDate: "2025-01-01" },
  { id: "fi2", category: "fishing", subType: "rod", name: "Baitcaster — heavy", quantity: 1, location: "Garage", fields: { fishRodType: "Baitcasting", fishLineWeight: "20lb braid", fishReelType: "Baitcast", deviceLocation: "Garage rod rack" }, addedDate: "2025-01-01" },
  { id: "fi3", category: "fishing", subType: "rod", name: "Ice rod combo", quantity: 2, location: "Garage", fields: { fishRodType: "Ice", fishLineWeight: "6lb mono", fishReelType: "Spinning", deviceLocation: "Garage shelf" }, addedDate: "2025-01-01" },
  { id: "fi4", category: "fishing", subType: "tackle", name: "Main tackle box", quantity: 1, location: "Garage", fields: { fishTackleContents: "Hooks, sinkers, swivels, bobbers, leaders, pliers", deviceLocation: "Garage shelf" }, addedDate: "2025-01-01" },
  { id: "fi5", category: "fishing", subType: "hooks", name: "Assorted hooks (#6 to 3/0)", quantity: 200, location: "Tackle box", fields: { fishHookSize: "#6, #4, #2, 1/0, 3/0", bobItemQty: "200" }, addedDate: "2025-02-01" },
  { id: "fi6", category: "fishing", subType: "lures", name: "Crankbaits + jigs (mixed)", quantity: 30, location: "Tackle box", fields: { fishLureType: "Mixed", bobItemQty: "30" }, addedDate: "2025-01-01" },
  { id: "fi7", category: "fishing", subType: "line", name: "10lb mono (1000yd spool)", quantity: 2, location: "Garage", fields: { fishLineWeight: "10lb mono", lengthFt: "3000" }, addedDate: "2025-02-01" },
  { id: "fi8", category: "fishing", subType: "net", name: "Landing net — rubber mesh", quantity: 1, location: "Boat", fields: { bobItemNotes: "Rubber-coated, telescoping handle" }, addedDate: "2025-01-01" },
  { id: "fi9", category: "fishing", subType: "iceFishing", name: "Auger + ice shelter", quantity: 1, location: "Garage", fields: { bobItemNotes: "Strikemaster Lite-Flite auger + Otter flip-over", deviceLocation: "Garage" }, addedDate: "2025-01-01" },
  { id: "fi10", category: "fishing", subType: "filletKnife", name: "Rapala fillet knife set", quantity: 1, location: "Kitchen", fields: { bobItemNotes: "6\" and 8\" flexible + cutting board" }, addedDate: "2025-01-01" },
  { id: "fi11", category: "fishing", subType: "trap", name: "Minnow traps (x3)", quantity: 3, location: "Boat shed", fields: { bobItemNotes: "Galvanized steel, spring-loaded" }, addedDate: "2025-01-01" },
  { id: "fi12", category: "fishing", subType: "fishLicense", name: "Ontario outdoors card + sport license", quantity: 1, location: "Wallet", fields: { planExpiry: "2026-12-31", bobItemNotes: "Sport fishing + conservation" }, addedDate: "2025-01-01" },
  /* Alcohol */
  { id: "al1", category: "alcohol", subType: "whiskey", name: "Jack Daniel's", quantity: 3, location: "Basement", fields: { alcBrand: "Jack Daniel's", alcVolume: "750ml", alcABV: "40", bobItemQty: "3", deviceLocation: "Basement bar" }, addedDate: "2025-01-01" },
  { id: "al2", category: "alcohol", subType: "whiskey", name: "Crown Royal", quantity: 2, location: "Basement", fields: { alcBrand: "Crown Royal", alcVolume: "750ml", alcABV: "40", bobItemQty: "2", deviceLocation: "Basement bar" }, addedDate: "2025-01-01" },
  { id: "al3", category: "alcohol", subType: "vodka", name: "Smirnoff", quantity: 2, location: "Basement", fields: { alcBrand: "Smirnoff", alcVolume: "1.75L", alcABV: "40", bobItemQty: "2", deviceLocation: "Basement bar" }, addedDate: "2025-01-01" },
  { id: "al4", category: "alcohol", subType: "rum", name: "Captain Morgan", quantity: 1, location: "Basement", fields: { alcBrand: "Captain Morgan", alcVolume: "750ml", alcABV: "35", bobItemQty: "1", deviceLocation: "Basement bar" }, addedDate: "2025-01-01" },
  { id: "al5", category: "alcohol", subType: "wine", name: "Red wine (assorted)", quantity: 6, location: "Basement", fields: { alcBrand: "Mixed", alcVolume: "750ml", alcWineType: "Red", bobItemQty: "6", deviceLocation: "Wine rack" }, addedDate: "2025-01-01" },
  { id: "al6", category: "alcohol", subType: "beer", name: "Budweiser case", quantity: 2, location: "Garage fridge", fields: { alcBrand: "Budweiser", alcVolume: "Case (24)", bobItemQty: "2", deviceLocation: "Garage fridge" }, addedDate: "2025-02-01" },
  { id: "al7", category: "alcohol", subType: "moonshine", name: "Everclear 190 proof", quantity: 2, location: "Basement", fields: { alcBrand: "Everclear", alcVolume: "750ml", alcABV: "95", bobItemQty: "2", deviceLocation: "Locked cabinet" }, addedDate: "2025-01-01" },
  { id: "al8", category: "alcohol", subType: "medAlcohol", name: "Isopropyl 99%", quantity: 4, location: "Medical shelf", fields: { alcVolume: "1L", bobItemQty: "4", deviceLocation: "Medical shelf" }, addedDate: "2025-02-01" },
  /* Recreational */
  { id: "rc1", category: "recreational", subType: "cigarettes", name: "Marlboro Red (carton)", quantity: 2, location: "Basement", fields: { recBrand: "Marlboro Red", bobItemQty: "2", deviceLocation: "Locked cabinet" }, addedDate: "2025-02-01" },
  { id: "rc2", category: "recreational", subType: "cigars", name: "Padron 1964 (box)", quantity: 10, location: "Basement", fields: { recBrand: "Padron 1964 Anniversary", bobItemQty: "10", deviceLocation: "Humidor" }, addedDate: "2025-01-01" },
  { id: "rc3", category: "recreational", subType: "cannabis", name: "Indica flower", quantity: 2, location: "Basement", fields: { recStrain: "Pink Kush", recForm: "Flower", recWeight: "28g", bobItemQty: "2", deviceLocation: "Locked cabinet" }, addedDate: "2025-02-01" },
  { id: "rc4", category: "recreational", subType: "edibles", name: "THC gummies", quantity: 3, location: "Basement", fields: { recBrand: "Wana", recDosage: "10mg", bobItemQty: "3", expiryDate: "2027-03-01", deviceLocation: "Locked cabinet" }, addedDate: "2025-02-01" },
  { id: "rc5", category: "recreational", subType: "lighter", name: "Bic lighters (bulk)", quantity: 20, location: "Various", fields: { bobItemQty: "20", deviceLocation: "Drawer, BOBs, garage" }, addedDate: "2025-02-01" },
  { id: "rc6", category: "recreational", subType: "caffeine", name: "Folgers ground coffee", quantity: 4, location: "Pantry", fields: { recBrand: "Folgers", bobItemQty: "4", expiryDate: "2027-06-01", deviceLocation: "Pantry" }, addedDate: "2025-02-01" },
  { id: "rc7", category: "recreational", subType: "caffeine", name: "Caffeine pills (200mg)", quantity: 2, location: "Medical shelf", fields: { recBrand: "No-Doz", bobItemQty: "2", expiryDate: "2027-12-01", deviceLocation: "Medical shelf" }, addedDate: "2025-02-01" },
  /* Books */
  { id: "bk1", category: "books", subType: "medical", name: "Where There Is No Doctor", quantity: 1, location: "Office", fields: { bookAuthor: "Hesperian", bookEdition: "2022", deviceLocation: "Office shelf" }, addedDate: "2025-01-01" },
  { id: "bk2", category: "books", subType: "medical", name: "Emergency War Surgery (NATO)", quantity: 1, location: "Office", fields: { bookAuthor: "US DoD", bookEdition: "5th", deviceLocation: "Office shelf" }, addedDate: "2025-01-01" },
  { id: "bk3", category: "books", subType: "ediblePlants", name: "Peterson Field Guide — Edible Wild Plants", quantity: 1, location: "BOB", fields: { bookAuthor: "Peterson, Lee Allen", bookRegion: "Eastern/Central NA", deviceLocation: "Dad's BOB" }, addedDate: "2025-01-01" },
  { id: "bk4", category: "books", subType: "ediblePlants", name: "Foraging Ontario", quantity: 1, location: "Kitchen", fields: { bookAuthor: "Various", bookRegion: "Ontario", deviceLocation: "Kitchen shelf" }, addedDate: "2025-01-01" },
  { id: "bk5", category: "books", subType: "survival", name: "SAS Survival Handbook", quantity: 1, location: "BOB", fields: { bookAuthor: "Wiseman, John", deviceLocation: "Dad's BOB" }, addedDate: "2025-01-01" },
  { id: "bk6", category: "books", subType: "farming", name: "The Vegetable Gardener's Bible", quantity: 1, location: "Office", fields: { bookAuthor: "Smith, Edward C.", deviceLocation: "Office shelf" }, addedDate: "2025-01-01" },
  { id: "bk7", category: "books", subType: "repair", name: "Kubota B2601 Service Manual", quantity: 1, location: "Garage", fields: { bookAuthor: "Kubota", bookSubject: "Tractor repair", deviceLocation: "Garage workbench" }, addedDate: "2025-01-01" },
  { id: "bk8", category: "books", subType: "maps", name: "NTS Topo Maps — local area", quantity: 4, location: "Office", fields: { bookRegion: "Eastern Ontario", bookScale: "1:50,000", deviceLocation: "Office drawer" }, addedDate: "2025-01-01" },
  { id: "bk9", category: "books", subType: "cooking", name: "Ball Complete Book of Home Preserving", quantity: 1, location: "Kitchen", fields: { bookAuthor: "Kingry, Devine", deviceLocation: "Kitchen shelf" }, addedDate: "2025-01-01" },
  { id: "bk10", category: "books", subType: "nuclear", name: "Nuclear War Survival Skills", quantity: 1, location: "Basement", fields: { bookAuthor: "Kearny, Cresson", deviceLocation: "Basement shelf" }, addedDate: "2025-01-01" },
  { id: "bk11", category: "books", subType: "radio", name: "ARRL Ham Radio License Manual", quantity: 1, location: "Office", fields: { bookAuthor: "ARRL", deviceLocation: "Office shelf" }, addedDate: "2025-01-01" },
  { id: "bk12", category: "books", subType: "firearms", name: "The ABCs of Reloading", quantity: 1, location: "Office", fields: { bookAuthor: "Matunas, Philip", deviceLocation: "Office shelf" }, addedDate: "2025-01-01" },
  /* CBRN / Nuclear */
  { id: "nb1", category: "nbc", subType: "respirator", name: "MIRA CM-6M gas mask", quantity: 2, location: "Basement", fields: { nbcBrand: "MIRA Safety", nbcModel: "CM-6M", nbcSize: "M", nbcFilterThread: "40mm NATO (STANAG)", bobItemQty: "2", deviceLocation: "Basement shelf" }, addedDate: "2025-01-01" },
  { id: "nb2", category: "nbc", subType: "filters", name: "NBC-77 SOF filters", quantity: 6, location: "Basement", fields: { nbcFilterType: "NBC-77 SOF", nbcFilterThread: "40mm NATO (STANAG)", expiryDate: "2040-01-01", bobItemQty: "6", deviceLocation: "Sealed — basement" }, addedDate: "2025-01-01" },
  { id: "nb3", category: "nbc", subType: "hazmatSuit", name: "Tyvek suits (disposable)", quantity: 6, location: "Basement", fields: { nbcSize: "L", nbcRating: "Tyvek (disposable)", bobItemQty: "6", deviceLocation: "Basement shelf" }, addedDate: "2025-01-01" },
  { id: "nb4", category: "nbc", subType: "gloves", name: "Butyl rubber gloves", quantity: 4, location: "Basement", fields: { nbcSize: "L", nbcMaterial: "Butyl rubber", bobItemQty: "4", deviceLocation: "Basement shelf" }, addedDate: "2025-01-01" },
  { id: "nb5", category: "nbc", subType: "kiTablets", name: "Potassium Iodide 130mg", quantity: 60, location: "Medical shelf", fields: { nbcDosage: "130mg", bobItemQty: "60", expiryDate: "2030-06-01", deviceLocation: "Medical shelf" }, addedDate: "2025-01-01" },
  { id: "nb6", category: "nbc", subType: "dosimeter", name: "GQ GMC-500+ Geiger counter", quantity: 1, location: "Office", fields: { nbcBrand: "GQ Electronics", nbcModel: "GMC-500+", isRechargeable: "Yes", deviceLocation: "Office" }, addedDate: "2025-01-01" },
  { id: "nb7", category: "nbc", subType: "plasticSheeting", name: "6mil poly sheeting", quantity: 3, location: "Basement", fields: { dimensions: "10x25ft rolls", bobItemQty: "3", deviceLocation: "Basement" }, addedDate: "2025-01-01" },
  { id: "nb8", category: "nbc", subType: "sealantTape", name: "Gorilla duct tape", quantity: 6, location: "Basement", fields: { bobItemQty: "6", deviceLocation: "Basement + BOBs" }, addedDate: "2025-01-01" },
  { id: "nb9", category: "nbc", subType: "deconKit", name: "RSDL decon kits", quantity: 3, location: "Basement", fields: { bobItemNotes: "Reactive Skin Decon Lotion — single use per kit", bobItemQty: "3", deviceLocation: "Basement + Dad's BOB" }, addedDate: "2025-01-01" },
  { id: "nb10", category: "nbc", subType: "shelterSupply", name: "Shelter-in-place kit", quantity: 1, location: "Basement", fields: { bobItemNotes: "Pre-cut sheeting for all windows/doors, tape, towels for gaps, battery radio, 72hr water", deviceLocation: "Basement entry" }, addedDate: "2025-01-01" },
  /* Bullion */
  { id: "bu1", category: "bullion", subType: "goldCoin", name: "American Gold Eagle 1oz", quantity: 3, location: "Safe", fields: { bullionMetal: "Gold", bullionWeight: "1 oz", bullionPurity: ".9167 (22k)", bullionMint: "US Mint", bullionPurchasePrice: "1950", deviceLocation: "Fireproof safe" }, addedDate: "2025-01-15" },
  { id: "bu2", category: "bullion", subType: "silverCoin", name: "Canadian Maple Leaf 1oz", quantity: 40, location: "Safe", fields: { bullionMetal: "Silver", bullionWeight: "1 oz", bullionPurity: ".9999 Fine", bullionMint: "RCM", bullionPurchasePrice: "28", deviceLocation: "Fireproof safe" }, addedDate: "2025-02-01" },
  { id: "bu3", category: "bullion", subType: "goldBar", name: "PAMP Suisse 1oz Bar", quantity: 1, location: "Safe", fields: { bullionMetal: "Gold", bullionWeight: "1 oz", bullionPurity: ".9999 Fine", bullionMint: "PAMP Suisse", bullionPurchasePrice: "2050", deviceLocation: "Fireproof safe" }, addedDate: "2025-03-01" },
  { id: "bu4", category: "bullion", subType: "goldback", name: "Nevada Goldback 1s", quantity: 50, location: "BOB", fields: { bullionGoldbackState: "Nevada", bullionGoldbackDenom: "1 Goldback", bullionPurchasePrice: "5", deviceLocation: "Bug-out bag" }, addedDate: "2025-02-15" },
  { id: "bu5", category: "bullion", subType: "junkSilver", name: "Pre-65 Washington Quarters", quantity: 40, location: "Safe", fields: { bullionJunkType: "Washington Quarter", bullionFaceValue: "0.25", bullionPurchasePrice: "7", deviceLocation: "Fireproof safe" }, addedDate: "2025-01-20" },
  { id: "bu6", category: "bullion", subType: "silverBar", name: "Sunshine Mint 10oz Bar", quantity: 5, location: "Safe", fields: { bullionMetal: "Silver", bullionWeight: "10 oz", bullionPurity: ".999 Fine", bullionMint: "Sunshine Mint", bullionPurchasePrice: "280", deviceLocation: "Fireproof safe" }, addedDate: "2025-03-10" },
  /* Clothing */
  { id: "cl1", category: "clothing", subType: "underwear", name: "Cotton Boxer Briefs", quantity: 12, location: "Closet", fields: { clothSize: "L", deviceLocation: "Master closet" }, addedDate: "2025-01-10" },
  { id: "cl2", category: "clothing", subType: "socks", name: "Merino Wool Hiking Socks", quantity: 8, location: "Closet", fields: { clothSize: "L", clothMaterial: "Merino wool", deviceLocation: "Master closet" }, addedDate: "2025-01-10" },
  { id: "cl3", category: "clothing", subType: "thermalBase", name: "Thermal Base Layer Set", quantity: 2, location: "Closet", fields: { clothSize: "L", clothMaterial: "Polypro", deviceLocation: "Master closet" }, addedDate: "2025-02-01" },
  { id: "cl4", category: "clothing", subType: "coldWeather", name: "Insulated Parka", quantity: 1, location: "Closet", fields: { clothType: "Parka", clothSize: "L", tempRating: "-20°F", deviceLocation: "Hall closet" }, addedDate: "2025-01-15" },
  { id: "cl5", category: "clothing", subType: "boots", name: "Waterproof Hiking Boots", quantity: 2, location: "Garage", fields: { clothType: "Hiking boots", clothSize: "11", deviceLocation: "Garage shelf" }, addedDate: "2025-02-10" },
  { id: "cl6", category: "clothing", subType: "rainGear", name: "Rain Jacket & Pants", quantity: 2, location: "Closet", fields: { clothType: "Rain suit", clothSize: "L", deviceLocation: "Hall closet" }, addedDate: "2025-03-01" },
  /* Pets */
  { id: "pe1", category: "pets", subType: "petFood", name: "Dry Dog Kibble 30lb", quantity: 2, location: "Garage", fields: { petAnimal: "Dog", petFoodType: "Dry kibble", weightLbs: "30", expiryDate: "2026-06-01", deviceLocation: "Garage shelf" }, addedDate: "2025-01-20" },
  { id: "pe2", category: "pets", subType: "petMeds", name: "Heartgard Plus", quantity: 6, location: "Kitchen", fields: { petAnimal: "Dog", petMedName: "Heartgard Plus", daysSupply: "30", expiryDate: "2026-03-01", deviceLocation: "Kitchen cabinet" }, addedDate: "2025-02-01" },
  { id: "pe3", category: "pets", subType: "petFirstAid", name: "Pet First Aid Kit", quantity: 1, location: "Garage", fields: { petAnimal: "Dog", bobItemNotes: "Bandages, antiseptic, tweezers, muzzle", deviceLocation: "Garage shelf" }, addedDate: "2025-01-15" },
  { id: "pe4", category: "pets", subType: "petCarrier", name: "Large Dog Crate", quantity: 1, location: "Garage", fields: { petAnimal: "Dog", petCarrierSize: "Large (30-70lb)", deviceLocation: "Garage corner" }, addedDate: "2025-01-10" },
  { id: "pe5", category: "pets", subType: "petLeash", name: "Heavy Duty Leash & Harness", quantity: 2, location: "Mudroom", fields: { petAnimal: "Dog", bobItemNotes: "6ft leash + no-pull harness", deviceLocation: "Front entry hooks" }, addedDate: "2025-01-10" },
  { id: "pe6", category: "pets", subType: "petDocs", name: "Vet Records — Max", quantity: 1, location: "Safe", fields: { petAnimal: "Dog", petName: "Max", bobItemNotes: "Vaccination records, microchip info, vet contact", deviceLocation: "Filing cabinet" }, addedDate: "2025-02-15" },
  /* Lighting */
  { id: "li1", category: "lighting", subType: "flashlight", name: "Fenix PD36R Pro", quantity: 2, location: "Kitchen", fields: { lightBrand: "Fenix", lightLumens: "2800", lightBattery: "18650", deviceLocation: "Junk drawer" }, addedDate: "2025-01-10" },
  { id: "li2", category: "lighting", subType: "headlamp", name: "Petzl Actik Core", quantity: 3, location: "Garage", fields: { lightBrand: "Petzl", lightLumens: "600", lightBattery: "Built-in USB", deviceLocation: "Garage shelf" }, addedDate: "2025-01-15" },
  { id: "li3", category: "lighting", subType: "lantern", name: "Coleman Propane Lantern", quantity: 2, location: "Garage", fields: { lightBrand: "Coleman", lightFuel: "Propane", lightBurnTime: "14", deviceLocation: "Garage shelf" }, addedDate: "2025-02-01" },
  { id: "li4", category: "lighting", subType: "candle", name: "Emergency Candles 115hr", quantity: 24, location: "Pantry", fields: { lightBurnTime: "115", bobItemQty: "24", deviceLocation: "Pantry shelf" }, addedDate: "2025-01-20" },
  { id: "li5", category: "lighting", subType: "chemlights", name: "Green Chemlights 12hr", quantity: 20, location: "BOB", fields: { lightChemColor: "Green", bobItemQty: "20", expiryDate: "2028-01-01", deviceLocation: "Bug-out bag" }, addedDate: "2025-02-10" },
  { id: "li6", category: "lighting", subType: "lampFuel", name: "Lamp Oil 32oz", quantity: 4, location: "Garage", fields: { lightFuel: "Lamp oil", alcVolume: "32 oz", deviceLocation: "Garage shelf" }, addedDate: "2025-03-01" },
];

const SAMPLE_CODES = [
  { id: "c1", type: "gate", label: "Front Gate", code: "4782#", location: "Main entrance", notes: "Press # after", access: ["You", "Sarah", "Dave"], lastChanged: "2025-12-15" },
  { id: "c2", type: "safe", label: "Gun Safe", code: "24-8-16-32", location: "Master closet", notes: "Dial left first", access: ["You", "Sarah"], lastChanged: "2026-01-20" },
  { id: "c3", type: "alarm", label: "Alarm", code: "7391", location: "Garage panel", notes: "Duress: 9173", access: ["You", "Sarah", "Dave", "Mike"], lastChanged: "2026-02-01" },
  { id: "c4", type: "wifi", label: "WiFi", code: "PrepNet/S3cur3!", location: "Office", notes: "", access: ["You", "Sarah", "Dave", "Mike", "Lisa", "Tom"], lastChanged: "2025-11-10" },
];
const SAMPLE_MANUALS = [
  { id: "sm1", cat: "plumbing", title: "Water Heater Reset", desc: "Restart after power loss, flush tank.", file: "water-heater.pdf", priority: "high" },
  { id: "sm2", cat: "seasonal", title: "Winterization", desc: "Blow out lines, drain faucets, insulate, prep generator.", file: "winterize.pdf", priority: "high" },
  { id: "sm3", cat: "hvac", title: "Barn Boiler Ops", desc: "Ignite pilot, set temp, bleed lines.", file: "barn-boiler.pdf", priority: "medium" },
  { id: "sm4", cat: "electrical", title: "Generator Start", desc: "Honda EU2200i: fuel, choke, start, load management.", file: "generator.pdf", priority: "high" },
  { id: "sm5", cat: "vehicle", title: "Rmax 1000 — Service Manual", desc: "Yamaha RMAX 1000: oil change (10W-40, 3.2qt), belt inspection, CVT service, air filter, coolant flush.", file: "rmax1000-service.pdf", priority: "high" },
  { id: "sm6", cat: "vehicle", title: "Rmax 1000 — Owner's Manual", desc: "Yamaha RMAX 1000: break-in procedure, controls, towing capacity (2000lb), daily pre-ride checks.", file: "rmax1000-owner.pdf", priority: "medium" },
  { id: "sm7", cat: "vehicle", title: "1991 Land Rover Defender — Workshop Manual", desc: "200TDi engine: timing belt, head gasket, injector service, axle rebuild, transfer case, wiring diagrams.", file: "defender-workshop.pdf", priority: "high" },
  { id: "sm8", cat: "vehicle", title: "1991 Land Rover Defender — Parts Catalogue", desc: "Exploded diagrams, part numbers for all assemblies. Chassis, body, engine, drivetrain, electrics.", file: "defender-parts.pdf", priority: "medium" },
  { id: "sm9", cat: "vehicle", title: "Yamaha FZ — Service Manual", desc: "Yamaha FZ: valve clearance, chain tension, oil change (Yamalube 10W-40), carb sync, brake bleed.", file: "fz-service.pdf", priority: "high" },
  { id: "sm10", cat: "vehicle", title: "Yamaha Grizzly ATV — Service Manual", desc: "Yamaha Grizzly: oil change, air filter, CVT belt, differential fluid, winch maintenance, electrical.", file: "grizzly-service.pdf", priority: "high" },
  { id: "sm11", cat: "vehicle", title: "Yamaha Grizzly ATV — Owner's Manual", desc: "Yamaha Grizzly: break-in, controls, towing, snow plow attachment, seasonal storage procedure.", file: "grizzly-owner.pdf", priority: "medium" },
  { id: "sm12", cat: "vehicle", title: "Mercury 25hp Outboard — Service Manual", desc: "Mercury 25hp 4-stroke: oil change (25W-40), gear lube, impeller, thermostat, spark plugs, winterization.", file: "mercury25-service.pdf", priority: "high" },
];
const SAMPLE_ROUTES = [
  { id: "r1", priority: "primary", name: "Route Alpha — Hwy 7", dest: "Cabin", dist: "48mi", eta: "55min/2hr", desc: "Paved, fuel stops.", waypoints: "Gas at Junction 7", risks: "Congestion", supplies: "Bug-out bags" },
  { id: "r2", priority: "secondary", name: "Route Bravo — Back Rds", dest: "Cabin", dist: "62mi", eta: "1h20/3hr", desc: "4WD after mile 20.", waypoints: "Creek ford (18mi)", risks: "Mud, no cell", supplies: "4WD, chains" },
  { id: "r3", priority: "emergency", name: "Plan B — Frank's Farm", dest: "Eastville", dist: "22mi", eta: "30min/1hr", desc: "Root cellar, well, 40ac.", waypoints: "Route 9 then Elm", risks: "Through town", supplies: "Medical, food" },
];
const SAMPLE_AMENITIES = [
  { id: "a1", type: "gas", name: "Shell — Jct 7", dist: "6.2mi", dir: "N", notes: "Diesel, propane, 24hr", crisis: "high" },
  { id: "a2", type: "hospital", name: "St. Mary's", dist: "14mi", dir: "E", notes: "Full ER, trauma", crisis: "high" },
  { id: "a3", type: "hardware", name: "Tractor Supply", dist: "8.5mi", dir: "S", notes: "Lumber, feed, generators", crisis: "high" },
  { id: "a4", type: "water", name: "Town Well", dist: "5.1mi", dir: "SE", notes: "Hand pump, free", crisis: "high" },
  { id: "a5", type: "ally", name: "Dave & Sarah", dist: "0.4mi", dir: "W", notes: "Ex-mil, RN, HAM", crisis: "high" },
];

const WEATHER_ADVISORIES = [
  { id: "wa1", type: "grid", severity: "warning", title: "Grid Strain Alert", desc: "Ontario IESO forecasts peak demand 24,500 MW tomorrow. Rolling brownouts possible in rural areas.", issued: "2h ago", expires: "Tomorrow 8PM", icon: "⚡", color: "#f59e0b" },
  { id: "wa2", type: "weather", severity: "watch", title: "Winter Storm Watch", desc: "20-30cm snowfall expected Thursday-Friday. Winds gusting to 60km/h. Blowing snow, near-zero visibility.", issued: "6h ago", expires: "Friday 6AM", icon: "🌨️", color: "#0ea5e9" },
  { id: "wa3", type: "fire", severity: "info", title: "Fire Weather Index — Moderate", desc: "FWI 12.4. Dry conditions persist. Open burning ban remains in effect for Lanark County.", issued: "Today 6AM", expires: "Until rain", icon: "🔥", color: "#f97316" },
  { id: "wa4", type: "water", severity: "advisory", title: "Boil Water Advisory — Twp of Rideau", desc: "E.coli detected at station 3. Boil all tap water 1 min before use. Affects Rideau Lake Rd area.", issued: "1d ago", expires: "Until cleared", icon: "🚱", color: "#ef4444" },
  { id: "wa5", type: "food", severity: "info", title: "Food Price Spike — Dairy & Eggs", desc: "Avian flu outbreak in US midwest. Egg prices up 40% week-over-week. Dairy expected to follow.", issued: "3d ago", expires: "Ongoing", icon: "📈", color: "#f59e0b" },
  { id: "wa6", type: "supply", severity: "watch", title: "Supply Chain — Port Strike Notice", desc: "ILWU contract expires March 1. West coast port slowdown expected. Stock up on imported goods.", issued: "1w ago", expires: "March 15", icon: "📦", color: "#a855f7" },
  { id: "wa7", type: "grid", severity: "info", title: "Hydro Maintenance — Planned Outage", desc: "Hydro One scheduled maintenance: March 3, 2-6AM. Affects Rural Route 7 area. 4hr window.", issued: "5d ago", expires: "March 3", icon: "🔧", color: "#6b7280" },
];

const SMART_HOME = {
  nest: { devices: [
    { n: "Front Door Lock", type: "lock", status: "Locked", bat: "Good" },
    { n: "Back Door Lock", type: "lock", status: "Locked", bat: "Good" },
    { n: "Garage Entry Lock", type: "lock", status: "Unlocked", bat: "Replace soon" },
    { n: "Hallway Protect", type: "smoke", bat: "Good", co: "0ppm" },
    { n: "Kitchen Protect", type: "smoke", bat: "Good", co: "0ppm" },
    { n: "Basement Protect", type: "smoke", bat: "Replace soon", co: "0ppm" },
    { n: "Living Room", type: "thermo", temp: "68°F", set: "70°F", hum: "38%", mode: "Heat" },
    { n: "Basement Zone", type: "thermo", temp: "62°F", set: "60°F", hum: "45%", mode: "Heat" },
  ] },
};

const RECS = {
  economic: { general: ["Stockpile cash in small bills — ATMs may be inaccessible", "Acquire barterable goods: ammo, alcohol, seeds, meds, fuel", "Build trade relationships with neighbors and farmers now", "Learn skills: sewing, food preservation, engine repair", "Reduce debt and diversify assets before it accelerates"], byCategory: { water: "Expand gravity-fed water sources. Municipal water may fail when workers stop showing up.", food: "Calorie-dense, long-shelf items. Start a garden. Expect stores empty within 72 hours.", medical: "Stockpile 6+ months prescriptions. Fish antibiotics as backup. Learn wound care.", firewood: "2+ years firewood for cold climate. Split and stack now while chainsaws can get fuel.", fuel: "Top off all fuel stores. Stabilize gasoline. Propane lasts indefinitely in sealed tanks.", defense: "Reinforce entries, establish watch rotations. Trip wires and perimeter alarms.", firearms: "Security is critical. Arm up, stockpile ammo. Caliber commonality reduces logistics.", comms: "HAM radio becomes primary. Practice now. Establish community check-in schedules.", power: "Solar + battery for long-term. Generator fuel will run out.", vehicles: "Maintain all vehicles — mechanics disappear fast. Stock spare belts, filters, fluids.", equipment: "Bug-out bags packed. Emergency docs secured. Stock replacement filters for water and air.", farm: "Your garden becomes your grocery store. Start seeds NOW. Expand beds. Save heirloom seeds — they reproduce.", bugout: "Audit every bag quarterly. Rotate food, check meds expiry. Each person needs their own bag packed.", kids: "6+ month supply of diapers, formula, meds. Kids outgrow clothes fast — stock next 2 sizes up.", batteries: "Stock deep on AA/AAA — everything runs on them. Rechargeable + solar charger is the long game.", electronics: "Renew sat phone and GPS plans NOW. Store backup electronics in Faraday bags.", boat: "Boat becomes transport and food source. Service engine now, stock spare parts and marine fuel.", fishing: "Fishing = sustainable protein. Stock deep on hooks, line, and lures. Get a net — gill nets feed families.", alcohol: "Top barter item after ammo and meds. Everclear doubles as disinfectant. Small bottles trade best.", recreational: "Cigarettes and coffee are currency in collapse. Stock lighters — worth their weight in gold.", nbc: "Low priority unless industrial accident risk nearby. Respirators useful for civil unrest (tear gas)." } },
  emp: { general: ["Fill bathtubs, sinks, every container with water immediately", "Vehicles with electronic ignition may be dead — need pre-1980s or bicycle", "Faraday cage contents are your lifeline: spare radio, solar charger, manuals", "Recovery could take 1-10 years. Plan for permanent grid-down", "Navigation: physical maps and compass only. GPS is gone."], byCategory: { water: "Electric pumps are dead. Hand pump backup essential. Berkey works without power.", food: "Freezer food must be consumed in 48hrs or preserved. Shift to hunting/foraging immediately.", medical: "Powered devices offline. Stock manual alternatives. Learn traditional medicine.", power: "Only shielded electronics survive. Solar panels may work but controllers vulnerable.", comms: "All digital comms destroyed. Faraday-protected HAM radio is the only option.", tools: "Power tools are paperweights. Hand tools become essential.", firewood: "No thermostat heating. Wood stove primary. 5+ cords per winter minimum.", fuel: "Fuel pumps are dead. Every gallon you have is priceless. Guard your supply.", vehicles: "Most modern vehicles are dead. Carbureted pre-1980s engines may still run.", firearms: "Security becomes paramount when rule of law breaks down. Ammo is currency.", farm: "Growing food is THE long-term survival skill. No powered irrigation — hand water or gravity drip. Save every seed.", bugout: "BOBs become critical if bugging out on foot. Ensure bags have manual navigation, no electronics dependency.", kids: "Stock washable cloth diapers as backup. Breast milk or powdered formula only — no refrigeration. Extra warm layers.", batteries: "Only Faraday-protected batteries survive. NiMH rechargeables + manual/solar charger are the only sustainable option.", electronics: "Most electronics are destroyed. Only Faraday-stored devices survive. Manual alternatives for everything.", boat: "Outboard ignition may be fried. Have oars and manual backup. Boat becomes critical for river transport.", fishing: "THE long-term protein strategy. No refrigeration — smoke or salt your catch immediately.", alcohol: "Distillation knowledge becomes invaluable. High-proof spirits have medical and fire-starting uses.", recreational: "Morale matters in long-term grid-down. Coffee and tobacco keep people functional.", nbc: "EMP may precede nuclear strike. Have CBRN gear staged and ready. Geiger counter in Faraday cage." } },
  wildfire: { general: ["Pre-pack vehicle with bags, documents, meds, irreplaceables", "Create 100ft defensible space — clear brush, trim trees", "N95 masks for smoke. Air quality hazardous for weeks", "Know ALL routes — primary may be blocked by fire", "Wet down roof and structures if time allows before evacuating"], byCategory: { water: "Fill every container before evacuating. Infrastructure may be damaged.", shelter: "Your home may not survive. Have pre-planned destination.", medical: "Burns, smoke inhalation are main risks. Stock burn dressings, eye wash.", comms: "Cell towers may burn. Battery radio for emergency broadcasts.", vehicles: "Keep vehicle fueled at all times. Pre-load essentials. Know multiple escape routes.", fuel: "Full fuel tanks save lives. Gas stations lose power in evacuations.", bugout: "Wildfire = grab and go. BOBs must be ready at ALL times. Stage near the door.", kids: "Pre-pack kids bag with 3 days diapers, formula, meds, comfort item. Car seat always installed.", boat: "Boat can be water evacuation. Hitch trailer, pre-load PFDs. Lake = firebreak.", fishing: "Low priority during active fire. Gear can be replaced.", alcohol: "Grab Everclear for disinfectant/fire starter. Leave the beer.", recreational: "Not a priority. Grab lighters for your BOB." } },
  nuclear: { general: ["Shelter in place — basement or interior room. Minimize exposure", "Seal windows/doors with plastic and duct tape", "Stay indoors minimum 48-72 hours. Radiation halves every 7 hours", "If exposed: remove outer clothing, shower, do NOT condition hair", "Potassium iodide (KI) within 4 hours protects thyroid"], byCategory: { water: "Sealed water is safe. Exposed sources contaminated. Filter and boil.", food: "Sealed/canned food safe. Do not eat fresh produce for weeks.", medical: "KI tablets critical. Antibiotics for secondary infections.", shelter: "Below-ground is best. Every inch of earth/concrete matters.", hygiene: "Decontamination critical. Bleach for surfaces. Change clothes entering shelter.", boat: "Stay off water during fallout. Boats are contamination collectors. Use only after decon.", fishing: "Do NOT eat fish from exposed water for months. Bioaccumulation risk.", alcohol: "High-proof spirits useful for wound cleaning and morale in shelter.", recreational: "Sheltering is boring and terrifying. Coffee, tobacco help people cope.", nbc: "This is what it's all for. Gas masks on, KI within 4 hours, seal the shelter, Geiger counter monitors exposure. Decon everything entering the shelter." } },
  pandemic: { general: ["Isolate early — don't wait for mandates", "Stock PPE: N95 masks, face shields, nitrile gloves, Tyvek suits", "Set up decontamination zone at all entry points", "Designate one person for supply runs", "Monitor health updates via radio if internet fails"], byCategory: { medical: "Priority #1. Antivirals, antibiotics, fever reducers, electrolytes.", hygiene: "Bleach, sanitizer, soap are lifesaving. Strict protocols.", food: "Expect 3-6 month supply chain disruption.", comms: "Information is survival. Multiple sources, HAM for local intel.", boat: "Solo fishing from boat = minimal contact. Safe activity during quarantine.", fishing: "Fishing is socially distanced protein. Lake/river beats grocery store.", alcohol: "Isopropyl for disinfection. Spirits for morale. Don't run out of either.", recreational: "Long quarantines destroy morale. Coffee, familiar comforts matter more than you think.", nbc: "Gas masks with P100 filters beat N95s. Tyvek suits for supply runs. Decon zone at all entry points." } },
  grid: { general: ["First 24hr: conserve phone, fill bathtubs, secure perishables", "Generator: 4hrs on, 4hrs off. Prioritize fridge/freezer", "After 48hrs: begin rationing if no timeline", "Pipes freeze without heating — drain or keep slow drip", "Fuel stations need power to pump. Top off vehicle tanks early."], byCategory: { water: "Well pumps need power. Switch to hand pump or stored water immediately.", power: "Generator buys time but fuel is finite. Solar is sustainable.", firewood: "Wood stove primary heat. In winter this is your survival line. Stock 5+ cords.", fuel: "Generator fuel will run out. Ration aggressively. Propane lasts longer.", food: "Eat fridge first (day 1-2), freezer (day 2-4), then shelf-stable.", vehicles: "Keep tanks full. Gas stations can't pump without power.", batteries: "Ration batteries aggressively. Solar charger + rechargeables are the long-term play.", electronics: "Conserve phone battery — airplane mode. Weather radio for updates. Charge devices during generator cycles.", boat: "Boat motor still works. Could be useful for water-based supply runs if roads are jammed.", fishing: "Ice fishing or open water — fresh protein without power. Smoke or salt for preservation.", alcohol: "Morale matters. Ration it. High-proof doubles as antiseptic.", recreational: "Coffee keeps the watch rotation awake. Ration caffeine." } },
  winter: { general: ["Stay indoors. Exposure kills in hours at extreme temps", "Open one faucet to slow drip to prevent pipe freeze", "Insulate pipes and windows with towels, blankets, plastic sheeting", "If power goes: move everyone to one room, body heat + wood stove", "Clear snow from exhaust vents, generator exhaust, dryer vent — CO kills silently"], byCategory: { firewood: "This is survival. Burn 24/7 if needed. 0.8 cords/week minimum in deep cold. Stage wood inside.", fuel: "Generator for well pump and fridge. Propane heaters as backup. Don't run out.", water: "Pipes freeze fast. Drain if unheated. Melt snow as backup — boil before drinking.", food: "Hot meals matter for morale and core temp. Stock soups, stews, hot cocoa.", power: "Generator is critical for well pump and heat backup. Run 4hr on/4hr off.", vehicles: "Keep gas tanks full. Battery blankets or trickle charger. Don't let diesel gel — use anti-gel additive.", kids: "Hypothermia risk is highest for children. Layer up. Warm sleeping bags rated to -30°C.", medical: "Frostbite and hypothermia are the main threats. Stock hand/toe warmers, emergency blankets." } },
  solarFlare: { general: ["Similar to EMP but potentially global and longer lasting", "Satellites down — no GPS, no sat phones, no weather data", "Power grid transformer damage could take 1-4 years to repair", "All digital financial systems potentially offline", "Pre-1980s vehicles and manual tools become essential"], byCategory: { power: "Grid transformers destroyed. Only off-grid solar + batteries survive. Stock spare charge controllers.", comms: "Satellites are fried. HAM radio on HF bands is the only long-range communication.", electronics: "Faraday-stored backup electronics are your lifeline. Manual alternatives for everything else.", farm: "Without powered supply chains, growing food is the long-term answer. Save every seed.", books: "Your reference library IS your internet now. Medical, farming, repair manuals are priceless.", batteries: "Only shielded batteries survive. Solar charger + rechargeables for sustainable power.", water: "Electric pumps dead. Hand pump, gravity fed, or manual carry from source.", fishing: "Sustainable protein source. Traditional methods — no fish finders, no trolling motors." } },
  waterCrisis: { general: ["Do NOT use tap water for anything — drinking, cooking, bathing, pets", "Switch immediately to stored water and filtration", "Fill every container before pressure drops to zero", "Boiling kills bacteria but won't remove chemical contamination", "Report to health authority and monitor for boil-water advisories"], byCategory: { water: "This is the crisis. Berkey, LifeStraw, purification tabs — use everything. Prioritize drinking water.", equipment: "Water filters become the most important equipment you own. Track filter life religiously.", kids: "Children dehydrate faster. Ensure clean water for formula, drinking, bathing. No tap water for anything.", hygiene: "Can't shower with contaminated water. Use wipes, hand sanitizer, bottled water for essential washing.", farm: "Don't irrigate with contaminated water. Rainwater collection becomes critical.", boat: "Boat access to clean water sources upstream could be lifesaving.", medical: "Waterborne illness is the secondary threat. Stock oral rehydration salts, anti-diarrheals." } },
  supplyChain: { general: ["Grocery stores empty within 72 hours of disruption", "Fuel shortages follow within 1-2 weeks", "Medication refills become impossible — stockpile now", "Cash becomes essential when electronic payments fail", "Community trade networks become your supply chain"], byCategory: { food: "This is the crisis. Shelf-stable calories are gold. Rotate stock, track expiry. Expect 6+ months.", farm: "Your garden is now your grocery store. Every seed packet matters. Start growing immediately.", fishing: "Fresh protein when stores are empty. Gill nets, trotlines for passive harvest.", alcohol: "Top barter currency. Small bottles of spirits trade better than cases of beer.", medical: "Prescription meds run out first. Stock 6+ months. Fish antibiotics as desperate backup.", kids: "Diapers, formula, and children's meds are the first things to disappear. Stock deep.", batteries: "No resupply. Ration aggressively. Rechargeable + solar is the only sustainable path.", recreational: "Cigarettes and coffee are currency. A carton of smokes buys a lot of goodwill." } },
  russiaWar: { general: ["NATO Article 5 activation means Canada is directly involved", "Expect cyber attacks on power grid, banking, communications first", "Nuclear escalation is the primary existential risk", "Conscription possible — plan for family members being called up", "Economic sanctions create supply chain disruption globally"], byCategory: { nbc: "Nuclear risk is real. Gas masks, KI tablets, dosimeter, shelter-in-place kit — all critical.", comms: "Cyber attacks hit communications first. HAM radio is the fallback. Faraday-protect backup electronics.", defense: "Increased security posture. Perimeter hardening, watch rotations, community defense coordination.", firearms: "Security matters more. Stockpile ammo — it won't be manufactured domestically.", fuel: "Energy prices spike immediately. Stockpile fuel, stabilize it, and ration from day one.", electronics: "Cyber attacks may brick devices. Faraday-stored backups are insurance.", bugout: "If near military targets, have evacuation plan ready. BOBs staged at the door.", books: "Nuclear survival manual becomes the most important book you own." } },
  chinaWar: { general: ["90% of consumer electronics come from China — supply halts immediately", "Pharmaceutical supply chain collapses — most generic drugs are Chinese-made", "Taiwan conflict means semiconductor shortage for years", "Pacific shipping routes disrupted — fuel and goods prices skyrocket", "Cyber warfare targets critical infrastructure"], byCategory: { food: "Global food trade disrupted. Grow your own. Stock deep on shelf-stable calories.", medical: "Drug supply chain collapses. 80% of antibiotic ingredients come from China. Stock 12+ months.", electronics: "No replacement electronics for years. Protect what you have. Repair skills matter.", farm: "Food independence is THE strategy. Expand gardens, save seeds, learn food preservation.", fishing: "Domestic protein source. Commercial fishing supply chain intact but consumer goods gone.", batteries: "Battery manufacturing concentrated in China. Stock deep on all sizes. Rechargeable + solar.", fuel: "Oil prices spike. Every gallon matters. Reduce vehicle use, prioritize essential trips.", equipment: "Replace filters, spare parts NOW while available. Supply of manufactured goods halts." } },
  aiDisrupt: { general: ["Mass unemployment cascades through economy within months", "Social unrest and crime increase as financial systems strain", "Government services become overwhelmed or automated poorly", "Power grid and water systems may be disrupted by AI-driven cyber incidents", "Cash economy and barter become important as digital systems become unreliable"], byCategory: { farm: "When jobs disappear, growing food saves your family. Self-sufficiency is the answer.", defense: "Social unrest increases. Community security networks matter more than individual prep.", firearms: "Property crime spikes with unemployment. Home security is non-negotiable.", alcohol: "Barter economy emerges. Spirits, cigarettes, and useful skills become currency.", fishing: "Free protein. When grocery money runs out, the lake feeds your family.", books: "Skills books become critical — repair, farming, medical. Knowledge you can't Google anymore.", comms: "Community networks replace institutional support. HAM radio for coordination.", power: "Grid may be unreliable. Solar independence protects against AI-managed utility failures." } },
};

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const SC = (s) => (s >= 80 ? "#22c55e" : s >= 60 ? "#84cc16" : s >= 40 ? "#eab308" : s >= 20 ? "#f97316" : "#ef4444");
const SL = (s) => (s >= 90 ? "FORTIFIED" : s >= 75 ? "PREPARED" : s >= 60 ? "MODERATE" : s >= 40 ? "VULNERABLE" : s >= 20 ? "AT RISK" : "CRITICAL");
const daysBetween = (a, b) => Math.ceil((new Date(a) - new Date(b)) / 864e5);
const parseVolMl = (v) => { if (!v) return 750; const s = String(v).toLowerCase(); const n = parseFloat(s); if (isNaN(n)) return 750; if (s.includes("l") && !s.includes("ml")) return n * 1000; if (s.includes("oz")) return n * 29.5735; if (s.includes("case")) return 24 * 355; if (s.includes("keg")) return 58670; return n; };

function getRefreshStatus(lr) {
  if (!lr) return { l: "Never refreshed", c: "#ef4444", u: true };
  const d = daysBetween(new Date(), new Date(lr));
  const r = 180 - d;
  if (r <= 0) return { l: `${Math.abs(r)}d overdue`, c: "#ef4444", u: true };
  if (r <= 30) return { l: `${r}d to refresh`, c: "#f59e0b", u: true };
  return { l: `${r}d`, c: "#22c55e", u: false };
}
function getExpiryStatus(e) {
  if (!e) return null;
  const d = daysBetween(new Date(e), new Date());
  if (d < 0) return { l: `Exp ${Math.abs(d)}d`, c: "#ef4444", u: true };
  if (d <= 90) return { l: `${d}d`, c: "#f59e0b", u: true };
  if (d <= 365) return { l: `${Math.floor(d / 30)}mo`, c: "#84cc16", u: false };
  return { l: `${(d / 365).toFixed(1)}yr`, c: "#22c55e", u: false };
}

const inp = { width: "100%", padding: "12px 14px", background: "rgba(47,76,39,0.04)", border: "1px solid #dce3d5", borderRadius: 10, color: "#243d30", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const labelSt = { display: "block", fontSize: 11, color: "rgba(36,61,48,0.58)", letterSpacing: 0.2, marginBottom: 7, fontWeight: 600 };
const btnSt = { padding: "10px 20px", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14, transition: "all 0.15s ease", fontFamily: "inherit" };
const cardSt = { background: "#ffffff", backdropFilter: "blur(12px)", border: "1px solid #e0e6da", borderRadius: 14, padding: 20 };

/* ═══════════════════════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════════════════════ */
function ScoreRing({ score, size = 160, strokeWidth = 10 }) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const o = c - (score / 100) * c;
  const col = SC(score);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(36,61,48,0.06)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={strokeWidth} strokeDasharray={c} strokeDashoffset={o} strokeLinecap="round" style={{ transition: "all 0.8s" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.26, fontWeight: 800, color: col, fontFamily: M }}>{Math.round(score)}</span>
        <span style={{ fontSize: size * 0.07, color: "rgba(36,61,48,0.58)", textTransform: "uppercase", letterSpacing: 2, fontWeight: 600 }}>{SL(score)}</span>
      </div>
    </div>
  );
}

function NewsTicker({ news, expanded, setExpanded }) {
  const [t, setT] = useState(0);
  useEffect(() => { const id = setInterval(() => setT((p) => (p + 1) % news.length), 5000); return () => clearInterval(id); }, [news.length]);
  const n = news[t];
  const sv = { high: "#ef4444", medium: "#f59e0b", low: "#6b7280" };
  return (
    <div style={{ position: "relative" }}>
      <div onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "5px 12px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)", borderRadius: 10, maxWidth: 440, overflow: "hidden" }}>
        <div style={{ width: 7, height: 7, borderRadius: 4, background: sv[n?.sev] || "#6b7280", flexShrink: 0, animation: "pulse 2s infinite" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(36,61,48,0.58)", flexShrink: 0 }}>INTEL</span>
        <span style={{ fontSize: 11, color: "rgba(36,61,48,0.65)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n?.headline}</span>
        <span style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 480, background: "#ffffff", border: "1px solid #dce3d5", borderRadius: 14, boxShadow: "0 20px 50px rgba(0,0,0,0.6)", zIndex: 999, maxHeight: 400, overflowY: "auto", padding: 4 }}>
          <div style={{ padding: "12px 16px 6px" }}><span style={{ fontSize: 12, fontWeight: 800, color: "#ef4444", textTransform: "uppercase", letterSpacing: 2 }}>Threat Intel</span></div>
          {news.map((item) => (
            <div key={item.id} style={{ padding: "10px 16px", borderBottom: "1px solid #e5eadd", display: "flex", gap: 10 }}>
              <div style={{ width: 7, height: 7, borderRadius: 4, background: sv[item.sev], marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "rgba(36,61,48,0.75)", lineHeight: 1.4, marginBottom: 4 }}>{item.headline}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {item.tags.map((tag, idx) => (<span key={idx} style={{ fontSize: 11, padding: "4px 5px", borderRadius: 3, background: tag.c + "15", color: tag.c, fontWeight: 700 }}>{tag.l}</span>))}
                  <span style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", marginLeft: "auto" }}>{item.time} ago</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   BARCODE PRODUCT DATABASE
   ═══════════════════════════════════════════════════════════ */
const BARCODE_DB = {
  "041000000191": { name: "Folgers Classic Roast Coffee", category: "recreational", subType: "caffeine", qty: 1, fields: { recBrand: "Folgers", deviceLocation: "" } },
  "037000185710": { name: "Duracell AA 24-pack", category: "batteries", subType: "aa", qty: 24, fields: { batteryBrand: "Duracell", batteryCount: "24", isRechargeable: "No", batteryChemistry: "Alkaline" } },
  "037000216216": { name: "Duracell AAA 16-pack", category: "batteries", subType: "aaa", qty: 16, fields: { batteryBrand: "Duracell", batteryCount: "16", isRechargeable: "No", batteryChemistry: "Alkaline" } },
  "039800109781": { name: "Energizer D Cell 4-pack", category: "batteries", subType: "dCell", qty: 4, fields: { batteryBrand: "Energizer", batteryCount: "4", isRechargeable: "No", batteryChemistry: "Alkaline" } },
  "036000291452": { name: "Huggies Little Movers Diapers", category: "kids", subType: "diapers", qty: 1, fields: { kidName: "", diaperSize: "Size 4" } },
  "030000318980": { name: "Mountain House Beef Stroganoff", category: "food", subType: "freezeDried", qty: 1, fields: { calories: "250", expiryDate: "" } },
  "041333662046": { name: "Berkey Black Filter (2-pack)", category: "equipment", subType: "waterFilter", qty: 2, fields: { filterType: "Berkey", lifespanGallons: "3000", gallonsUsed: "0" } },
  "075020044280": { name: "Bic Classic Lighter 5-pack", category: "recreational", subType: "lighter", qty: 5, fields: { bobItemQty: "5" } },
  "312547780063": { name: "Infant Tylenol (acetaminophen)", category: "kids", subType: "kidMeds", qty: 1, fields: { kidName: "", medication: "Acetaminophen" } },
  "312547781138": { name: "Children's Benadryl", category: "kids", subType: "kidMeds", qty: 1, fields: { kidName: "", medication: "Diphenhydramine" } },
  "300450552044": { name: "Band-Aid Variety Pack", category: "medical", subType: "firstAidKit", qty: 1, fields: { kitLevel: "Basic" } },
  "041457000014": { name: "Sta-Bil Fuel Stabilizer", category: "fuel", subType: "gasoline", qty: 1, fields: { stabilized: "Yes" } },
  "071641112148": { name: "Smirnoff Vodka 1.75L", category: "alcohol", subType: "vodka", qty: 1, fields: { alcBrand: "Smirnoff", alcVolume: "1.75L", alcABV: "40" } },
  "082000004806": { name: "Jack Daniel's Old No.7 750ml", category: "alcohol", subType: "whiskey", qty: 1, fields: { alcBrand: "Jack Daniel's", alcVolume: "750ml", alcABV: "40" } },
  "040000522805": { name: "Snickers Bar 6-pack", category: "food", subType: "cannedGoods", qty: 6, fields: { calories: "250" } },
  "036000465235": { name: "Cottonelle Wipes 168ct", category: "kids", subType: "wipes", qty: 1, fields: { bobItemQty: "1" } },
  "071641001275": { name: "Crown Royal 750ml", category: "alcohol", subType: "whiskey", qty: 1, fields: { alcBrand: "Crown Royal", alcVolume: "750ml", alcABV: "40" } },
  "013000006408": { name: "Spam Classic 12oz", category: "food", subType: "cannedGoods", qty: 1, fields: { calories: "180" } },
  "070382014063": { name: "Enfamil NeuroPro Powder", category: "kids", subType: "formula", qty: 1, fields: { formulaType: "Powder" } },
  "036000451351": { name: "Kleenex 3-pack", category: "hygiene", subType: "toiletPaper", qty: 3, fields: {} },
  "044000002718": { name: "Marlboro Red Kings", category: "recreational", subType: "cigarettes", qty: 1, fields: { recBrand: "Marlboro Red" } },
  "818290019710": { name: "MIRA Safety NBC-77 SOF Filter", category: "nbc", subType: "filters", qty: 1, fields: { nbcFilterType: "NBC-77 SOF", nbcFilterThread: "40mm NATO (STANAG)" } },
  "818290019703": { name: "MIRA Safety CM-6M Gas Mask", category: "nbc", subType: "respirator", qty: 1, fields: { nbcBrand: "MIRA Safety", nbcModel: "CM-6M", nbcFilterThread: "40mm NATO (STANAG)" } },
  "015706007269": { name: "SureFire CR123A 12-pack", category: "batteries", subType: "cr123a", qty: 12, fields: { batteryBrand: "SureFire", batteryCount: "12", isRechargeable: "No", batteryChemistry: "Lithium" } },
};

function BarcodeScanner({ onScan, onClose }) {
  const dialogRef = useDialogFocus(onClose);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [manualCode, setManualCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [lastScanned, setLastScanned] = useState(null);
  const [flash, setFlash] = useState(false);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const stopCamera = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
  };

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) { setCameraError("Camera not available — use manual entry below"); return; }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      setScanning(true);

      if ("BarcodeDetector" in window) {
        const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
        intervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              handleCode(code);
            }
          } catch (e) { /* scan frame error, continue */ }
        }, 300);
      } else {
        setCameraError("Auto-detect not supported in this browser — enter barcode manually");
      }
    } catch (e) {
      setCameraError("Camera access denied — enter barcode manually below");
    }
  };

  const handleCode = (code) => {
    const product = BARCODE_DB[code];
    setFlash(true);
    setTimeout(() => setFlash(false), 400);
    if (product) {
      setLastScanned({ code, ...product, found: true });
    } else {
      setLastScanned({ code, found: false });
    }
  };

  const confirmScan = () => {
    if (lastScanned?.found) { stopCamera(); onScan(lastScanned); }
  };

  const submitManual = () => {
    if (!manualCode.trim()) return;
    handleCode(manualCode.trim());
  };

  return (
    <div ref={dialogRef} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", zIndex: 1100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "30px 20px", overflowY: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#ffffff", border: "1px solid #dce3d5", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>📷</span> Barcode Scanner
          </h3>
          <button onClick={onClose} style={{ ...btnSt, background: "rgba(47,76,39,0.06)", color: "rgba(36,61,48,0.58)", fontSize: 16, padding: "4px 10px" }}>✕</button>
        </div>

        {/* Camera View */}
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", marginBottom: 14, background: "#000", border: "1px solid #e0e6da" }}>
          <video ref={videoRef} style={{ width: "100%", height: 240, objectFit: "cover", display: "block" }} muted playsInline />
          <canvas ref={canvasRef} style={{ display: "none" }} />
          {/* Scan overlay crosshairs */}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ width: "70%", height: 80, border: "2px solid rgba(33,76,57,0.6)", borderRadius: 8, position: "relative" }}>
              <div style={{ position: "absolute", top: -1, left: -1, width: 20, height: 20, borderTop: "3px solid #214c39", borderLeft: "3px solid #214c39", borderRadius: "4px 0 0 0" }} />
              <div style={{ position: "absolute", top: -1, right: -1, width: 20, height: 20, borderTop: "3px solid #214c39", borderRight: "3px solid #214c39", borderRadius: "0 4px 0 0" }} />
              <div style={{ position: "absolute", bottom: -1, left: -1, width: 20, height: 20, borderBottom: "3px solid #214c39", borderLeft: "3px solid #214c39", borderRadius: "0 0 0 4px" }} />
              <div style={{ position: "absolute", bottom: -1, right: -1, width: 20, height: 20, borderBottom: "3px solid #214c39", borderRight: "3px solid #214c39", borderRadius: "0 0 4px 0" }} />
              {scanning && <div style={{ position: "absolute", top: "50%", left: 8, right: 8, height: 2, background: "#214c39", borderRadius: 1, animation: "pulse 1.5s infinite" }} />}
            </div>
          </div>
          {flash && <div style={{ position: "absolute", inset: 0, background: "rgba(34,197,94,0.2)", transition: "opacity 0.3s" }} />}
          {scanning && <div style={{ position: "absolute", top: 8, left: 8, display: "flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.6)", padding: "5px 8px", borderRadius: 6 }}><div style={{ width: 6, height: 6, borderRadius: 3, background: "#ef4444", animation: "pulse 1s infinite" }} /><span style={{ fontSize: 11, color: "#243d30", fontWeight: 700 }}>SCANNING</span></div>}
        </div>

        {cameraError && <div style={{ fontSize: 11, color: "#f59e0b", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>{cameraError}</div>}

        {/* Manual Entry */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input value={manualCode} onChange={(e) => setManualCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitManual()} placeholder="Enter barcode manually (UPC/EAN)..." style={{ ...inp, flex: 1, margin: 0, fontSize: 12, fontFamily: M }} />
          <button onClick={submitManual} style={{ ...btnSt, background: "rgba(47,76,39,0.06)", color: "rgba(36,61,48,0.6)", fontSize: 11, padding: "8px 14px", flexShrink: 0 }}>Look Up</button>
        </div>

        {/* Scan Result */}
        {lastScanned && (
          <div style={{ ...cardSt, padding: 14, borderLeft: "3px solid " + (lastScanned.found ? "#22c55e" : "#f59e0b") }}>
            {lastScanned.found ? (<>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 22 }}>{CATEGORIES[lastScanned.category]?.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{lastScanned.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)" }}>{CATEGORIES[lastScanned.category]?.label} → {CATEGORIES[lastScanned.category]?.subTypes[lastScanned.subType]?.label}</div>
                </div>
                <span style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, background: "rgba(34,197,94,0.1)", color: "#22c55e", fontWeight: 700 }}>FOUND</span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", fontFamily: M, marginBottom: 10 }}>UPC: {lastScanned.code} · Qty: {lastScanned.qty}</div>
              <button onClick={confirmScan} style={{ ...btnSt, width: "100%", background: "#22c55e", color: "#000", fontWeight: 700, fontSize: 13, padding: "10px 0" }}>✓ Add to Inventory</button>
            </>) : (<>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>❓</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>Unknown Barcode</div>
                  <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", fontFamily: M }}>{lastScanned.code}</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)" }}>Not in product database. You can add it manually with + Supply.</div>
            </>)}
          </div>
        )}

        {/* Quick stats */}
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "rgba(36,61,48,0.58)" }}>
          {Object.keys(BARCODE_DB).length} products in database · Point camera at UPC barcode
        </div>
      </div>
    </div>
  );
}

function AddItemModal({ onAdd, onClose, editItem, initialCategory }) {
  const dialogRef = useDialogFocus(onClose);
  const [cat, setCat] = useState(editItem?.category || initialCategory || "water");
  const [sub, setSub] = useState(editItem?.subType || "");
  const [qty, setQty] = useState(editItem?.quantity?.toString() || "1");
  const [nm, setNm] = useState(editItem?.name || "");
  const [loc, setLoc] = useState(editItem?.location || "");
  const [flds, setFlds] = useState(editItem?.fields || {});
  const [notes, setNotes] = useState(editItem?.notes || "");

  const catData = CATEGORIES[cat];
  const subTypes = catData?.subTypes || {};
  const selSub = subTypes[sub];
  const subFields = selSub?.fields || [];

  useEffect(() => { if (!editItem) { setSub(Object.keys(subTypes)[0] || ""); setFlds({}); } }, [cat]);
  useEffect(() => { if (selSub && !editItem) setNm(selSub.label); }, [sub]);

  const save = () => {
    if (!sub || !Number.isFinite(Number(qty)) || Number(qty) < 0) return;
    onAdd({ ...editItem, id: editItem?.id || uid(), category: cat, subType: sub, name: nm || selSub?.label || "Item", quantity: Number(qty), location: loc, notes, fields: flds, addedDate: editItem?.addedDate || new Date().toISOString().split("T")[0] });
    onClose();
  };
  const uf = (k, v) => setFlds((f) => ({ ...f, [k]: v }));

  return (
    <div ref={dialogRef} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="supply-dialog-title" onClick={(e) => e.stopPropagation()} style={{ background: "#ffffff", border: "1px solid #dce3d5", borderRadius: 16, padding: 28, width: "100%", maxWidth: 560 }}>
        <h3 id="supply-dialog-title" style={{ margin: "0 0 18px", fontSize: 22, fontWeight: 600 }}>{editItem ? "Edit supply" : "Add a supply"}</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label htmlFor="supply-category" style={labelSt}>Category</label><select id="supply-category" style={inp} value={cat} onChange={e => { const next = e.target.value; setCat(next); setSub(Object.keys(CATEGORIES[next].subTypes)[0] || ""); setFlds({}); }}>{Object.entries(CATEGORIES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select><p style={{fontSize:12,color:"#78836e",margin:"6px 0 0"}}>{catData.desc}</p></div>
          <div><label htmlFor="supply-type" style={labelSt}>Type</label><select id="supply-type" style={inp} value={sub} onChange={(e) => { setSub(e.target.value); if (!editItem) setNm(subTypes[e.target.value]?.label || ""); }}>{Object.entries(subTypes).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}</select></div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <div><label htmlFor="supply-name" style={labelSt}>Name</label><input id="supply-name" style={inp} value={nm} onChange={(e) => setNm(e.target.value)} /></div>
            <div><label htmlFor="supply-qty" style={labelSt}>Quantity</label><input id="supply-qty" style={inp} type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          </div>
          {subFields.length > 0 && (
            <div style={{ background: "rgba(47,76,39,0.02)", borderRadius: 10, padding: 12, border: "1px solid #e5eadd" }}>
              <div style={{ display: "grid", gridTemplateColumns: subFields.length > 2 ? "1fr 1fr" : "1fr", gap: 10 }}>
                {subFields.map((fk) => { const meta = FIELD_META[fk]; if (!meta) return null; return meta.type === "select" ? (
                  <div key={fk}><label htmlFor={"supply-field-" + fk} style={labelSt}>{meta.label}</label><select id={"supply-field-" + fk} style={inp} value={flds[fk] ?? ""} onChange={(e) => uf(fk, e.target.value)}><option value="">...</option>{meta.options.map((o) => <option key={o}>{o}</option>)}</select></div>
                ) : (
                  <div key={fk}><label htmlFor={"supply-field-" + fk} style={labelSt}>{meta.label}</label><input id={"supply-field-" + fk} style={inp} type={meta.type} value={flds[fk] ?? ""} onChange={(e) => uf(fk, e.target.value)} placeholder={meta.placeholder || ""} aria-describedby={meta.help ? "supply-help-" + fk : undefined} />{meta.help && <p id={"supply-help-" + fk} style={{ fontSize: 11, color: "#687660", lineHeight: 1.6, margin: "6px 0 0" }}>{meta.help}</p>}</div>
                ); })}
              </div>
            </div>
          )}
          <div><label htmlFor="supply-location" style={labelSt}>Location</label><input id="supply-location" style={inp} value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="e.g. Pantry, shelf 2" /></div>
          <div><label style={labelSt}>Notes</label><textarea aria-label="Supply notes" style={inp} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything else worth remembering" rows={2}/></div>
          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            <button onClick={onClose} style={{ ...btnSt, flex: 1, background: "rgba(47,76,39,0.06)", color: "rgba(36,61,48,0.6)" }}>Cancel</button>
            <button onClick={save} style={{ ...btnSt, flex: 1, background: "#214c39", color: "#243d30", fontWeight: 700 }}>{editItem ? "Save" : "Add"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardTab({ items, setSelCat, openAdd, people, climate, allAlerts, showAlerts, setShowAlerts, crisisMode, setCrisisMode, setCrisisStart, setShowScanner, propAddress, alertsDismissed, alertsDismissedUntil, onDismissAlerts, members, codes, actionLog, setActionLog, propertyProfile, onOpenQuickStart, setActiveTab, dismissResetKey }) {
  const M = "'DM Sans',sans-serif";

  /* ── Live Weather State ── */
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState(null);
  const [weatherSource, setWeatherSource] = useState("sample"); // 'sample' | 'live' | 'cached'

  const [showActHistory, setShowActHistory] = useState(false);
  const [showAllActions, setShowAllActions] = useState(false);
  const [dismissedProfileCTA, setDismissedProfileCTA] = useState(() => localStorage.getItem("prepvault-dismiss-profile-cta") === "1");

  /* Reset dismiss flags when demo mode is re-entered */
  useEffect(() => {
    if (dismissResetKey > 0) {
      setDismissedProfileCTA(false);
      localStorage.removeItem("prepvault-dismiss-profile-cta");
    }
  }, [dismissResetKey]);

  /* ── Live News State ── */
  const [news, setNews] = useState(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsSource, setNewsSource] = useState("sample"); // 'sample' | 'live' | 'cached'

  /* ── Fetch Weather ── */
  useEffect(() => {
    let cancelled = false;
    async function fetchWeather() {
      // Try to get coordinates from propAddress or use geolocation
      let lat, lng;
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000, maximumAge: 300000 }));
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch { /* geolocation unavailable or denied */ }

      if (!lat || !lng) {
        // Check localStorage cache
        const cached = localStorage.getItem("pv-weather-cache");
        if (cached) { try { const c = JSON.parse(cached); if (Date.now() - new Date(c.fetchedAt).getTime() < 3600000) { setWeather(c); setWeatherSource("cached"); return; } } catch {} }
        return; // No location, keep sample data
      }

      setWeatherLoading(true);
      try {
        const apiBase = import.meta.env.VITE_API_URL || "";
        const res = await fetch(`${apiBase}/api/weather/current?lat=${lat}&lng=${lng}`);
        if (!res.ok) throw new Error("Weather API " + res.status);
        const data = await res.json();
        if (!cancelled) {
          setWeather(data);
          setWeatherSource("live");
          localStorage.setItem("pv-weather-cache", JSON.stringify(data));
        }
      } catch (err) {
        console.warn("Weather fetch failed:", err.message);
        // Try cache fallback
        const cached = localStorage.getItem("pv-weather-cache");
        if (cached && !cancelled) { try { setWeather(JSON.parse(cached)); setWeatherSource("cached"); } catch {} }
        else if (!cancelled) setWeatherError(err.message);
      } finally { if (!cancelled) setWeatherLoading(false); }
    }
    fetchWeather();
    const interval = setInterval(fetchWeather, 30 * 60 * 1000); // refresh every 30 min
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  /* ── Fetch News (with geolocation) ── */
  useEffect(() => {
    let cancelled = false;
    async function fetchNews() {
      try {
        // Get user's location for local news
        let locationParams = "";
        try {
          const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000, maximumAge: 600000 }));
          locationParams = `&lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`;
        } catch { /* geolocation unavailable, use defaults */ }

        const apiBase = import.meta.env.VITE_API_URL || "";
        const res = await fetch(`${apiBase}/api/news/feed?${locationParams}`);
        if (!res.ok) throw new Error("News API " + res.status);
        const data = await res.json();
        if (!cancelled && data.articles?.length > 0) {
          setNews(data.articles);
          setNewsSource("live");
          localStorage.setItem("pv-news-cache", JSON.stringify(data.articles));
        }
      } catch {
        // Try cache fallback
        const cached = localStorage.getItem("pv-news-cache");
        if (cached && !cancelled) { try { setNews(JSON.parse(cached)); setNewsSource("cached"); } catch {} }
      } finally { if (!cancelled) setNewsLoading(false); }
    }
    setNewsLoading(true);
    fetchNews();
    const interval = setInterval(fetchNews, 30 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  /* ── Sample fallback data ── */
  const sampleWeather = {
    current: { temp: -8, feels_like: -14, humidity: 78, wind_speed: 22, wind_dir: "NW", description: "Light Snow", icon: "🌨️", city: "Toronto, ON" },
    forecast: [
      { day: "Wed", icon: "🌨️", hi: -6, lo: -12 },
      { day: "Thu", icon: "❄️", hi: -9, lo: -18 },
      { day: "Fri", icon: "☁️", hi: -4, lo: -11 },
      { day: "Sat", icon: "🌤️", hi: -1, lo: -8 },
      { day: "Sun", icon: "☀️", hi: 2, lo: -5 },
    ],
    alerts: climate === "cold" ? [{ title: "Extreme cold warning", desc: "Wind chill to -25°C tonight. Check heating fuel and insulate pipes." }] : [],
  };
  const sampleNews = [
    { title: "Ontario hydro rates to increase 4.2% in March", source: "CBC News", time: "2h ago", severity: "amber", tag: "GRID", url: "https://www.cbc.ca/news/business/ontario-hydro-rates-increase" },
    { title: "Supply chain delays: canned goods prices up 12% nationally", source: "Globe & Mail", time: "6h ago", severity: "amber", tag: "FOOD", url: "https://www.theglobeandmail.com/business/article-supply-chain-canned-goods" },
    { title: "Environment Canada: lake-effect snow squalls through Thursday", source: "Weather Network", time: "8h ago", severity: "amber", tag: "WEATHER", url: "https://www.theweathernetwork.com/ca/alerts/ontario/snow-squalls" },
    { title: "Highway 401 closures this weekend — detour via Hwy 7", source: "CTV Toronto", time: "10h ago", severity: "info", tag: "ROUTES", url: "https://www.ctvnews.ca/toronto/highway-401-closures-weekend" },
  ];

  const w = weather || sampleWeather;
  const currentWeather = w.current || sampleWeather.current;
  const forecast = w.forecast || sampleWeather.forecast;
  const weatherAlerts = w.alerts || [];
  const newsItems = news || sampleNews;

  /* ── Continuity Metrics ── */
  const cont = useMemo(() => {
    const clim = CLIMATES[climate] || CLIMATES.temperate;
    const waterMod = clim.waterMod || 1;
    const fuelMod = clim.fuelMod || 1;
    const firewoodMod = clim.firewoodMod || 1;
    const p = people || 4;

    // Power Autonomy (hours)
    const fuelGals = items.filter((i) => i.category === "fuel" && i.subType === "gasoline").reduce((s, i) => s + (i.quantity || 0) * (parseFloat(i.fields?.fuelGallons || i.fields?.gallons) || 5), 0);
    const propaneTanks = items.filter((i) => i.category === "fuel" && i.subType === "propane").reduce((s, i) => s + (i.quantity || 0), 0);
    const batteries = items.filter((i) => i.category === "batteries").reduce((s, i) => s + (i.quantity || 0), 0);
    const solarPanels = items.filter((i) => (i.category === "power" && i.subType === "solarPanel") || (i.category === "electronics" && i.subType === "solarDevice")).reduce((s, i) => s + (i.quantity || 0), 0);
    const genHours = fuelGals * 5.5;
    const batteryHours = batteries * 0.3;
    const solarHrs = solarPanels * 5;
    const powerHrs = genHours + batteryHours + solarHrs;

    // Water Continuity (days)
    const waterStored = items.filter((i) => i.category === "water" && i.subType === "storedWater").reduce((s, i) => s + (i.quantity || 0), 0);
    const waterFilters = items.filter((i) => i.category === "water" && (i.subType === "purificationDevice" || i.subType === "purificationTablets")).reduce((s, i) => s + (i.quantity || 0), 0);
    const dailyWater = p * 1.0 * waterMod;
    const waterDays = (waterStored / Math.max(dailyWater, 0.1)) + (waterFilters * 3);

    // Heat Stability (days)
    const firewoodCords = items.filter((i) => i.category === "firewood").reduce((s, i) => s + (parseFloat(i.fields?.cords) || 0) * (i.quantity || 1), 0);
    const propaneHeatDays = (propaneTanks * 4.6 * 91452 / 18000) / 12; // 4.6gal × 91,452 BTU/gal ÷ 18,000 BTU heater ÷ 12hrs/day
    const firewoodDays = firewoodCords * 30;
    const heatDays = firewoodMod > 1 ? (firewoodDays + propaneHeatDays) / firewoodMod : firewoodDays + propaneHeatDays + 30;

    // Caloric Reserve (days)
    const totalCals = items.filter((i) => i.category === "food").reduce((s, i) => {
      const cal = parseFloat(i.fields?.totalCalories || i.fields?.caloriesPerServing || i.fields?.calories || 0);
      const serv = parseFloat(i.fields?.servings || 1);
      return s + (cal > 500 ? cal : cal * serv) * (i.quantity || 1);
    }, 0);
    const calDays = totalCals / Math.max(p * 2000, 1);

    // Communication Redundancy
    const commCh = new Set();
    items.filter((i) => i.category === "electronics").forEach((i) => {
      if (i.subType === "satPhone") commCh.add("Satellite");
      if (i.subType === "cellPhone") commCh.add("Cellular");
      if (i.subType === "radio") commCh.add("HAM/GMRS");
      if (i.subType === "weatherRadio") commCh.add("Weather Band");
    });
    items.filter((i) => i.category === "comms").forEach(() => commCh.add("HAM/GMRS"));

    // Fragilities
    const frag = [];
    const fuelSrc = new Set();
    if (firewoodCords > 0) fuelSrc.add("wood");
    if (propaneTanks > 0) fuelSrc.add("propane");
    if (fuelGals > 0) fuelSrc.add("gasoline");
    if (fuelSrc.size <= 1 && climate === "cold") frag.push({ icon: "🔥", msg: "Heat continuity depends on " + (fuelSrc.size === 0 ? "no fuel source" : "one fuel source") + ".", sev: fuelSrc.size === 0 ? "critical" : "warning" });
    if (waterFilters < 2) frag.push({ icon: "💧", msg: "Water purification lacks redundancy.", sev: waterFilters === 0 ? "critical" : "warning" });
    if (solarPanels > 0 && batteries < 10) frag.push({ icon: "🔋", msg: "Battery backup is weather-dependent.", sev: "warning" });
    if (commCh.size < 2) frag.push({ icon: "📡", msg: commCh.size === 0 ? "No communication backup exists." : "Single communication channel — no redundancy.", sev: commCh.size === 0 ? "critical" : "warning" });
    if (calDays < 7) frag.push({ icon: "🍽️", msg: `Caloric reserve below 7 days (${calDays.toFixed(1)}d).`, sev: "critical" });
    if (powerHrs < 24) frag.push({ icon: "⚡", msg: "Power autonomy under 24 hours.", sev: "warning" });

    // ── Profile-based adjustments ──
    let adjWater = waterDays, adjPower = powerHrs, adjHeat = heatDays, adjComm = commCh.size;
    if (propertyProfile?.completedAt) {
      const toArr = v => Array.isArray(v) ? v : v ? [v] : [];
      const pWater = toArr(propertyProfile.waterSource);
      const pFresh = toArr(propertyProfile.freshwaterAccess);
      const pPower = toArr(propertyProfile.powerSource);
      const pHeat = toArr(propertyProfile.heatSource);
      // Water: renewable sources (bonus per source type, not stacking duplicates)
      if (pWater.some(s => ["well", "spring", "lake_river"].includes(s))) adjWater += 7;
      if (pWater.includes("rain")) adjWater += 3;
      if (pFresh.some(s => ["lakefront", "river_adjacent"].includes(s))) adjWater += 5;
      // Power: renewables & generator infrastructure
      if (pPower.some(s => ["solar", "wind", "hybrid"].includes(s))) adjPower += 48;
      if (propertyProfile.hasGenerator) adjPower += 24;
      // Heat: infrastructure bonus (best applies)
      if (pHeat.includes("wood")) adjHeat += 10;
      if (pHeat.some(s => ["propane", "oil", "gas"].includes(s))) adjHeat += 5;
      // Comms: capability
      if (propertyProfile.commsCapability?.includes("ham")) adjComm += 1;
      if (propertyProfile.commsCapability?.includes("satellite")) adjComm += 1;
      if (propertyProfile.commsCapability?.includes("mesh")) adjComm += 1;
      // Fragilities from profile
      if (propertyProfile.populationDensity === "urban") frag.push({ icon: "🏙️", msg: "Urban location — high population risk in prolonged scenarios. Consider relocating to rural property.", sev: "warning" });
      if (pWater.length === 1 && pWater[0] === "municipal" && (pFresh.length === 0 || (pFresh.length === 1 && pFresh[0] === "none"))) frag.push({ icon: "🚱", msg: "Municipal water with no natural backup — vulnerable to infrastructure failure.", sev: "warning" });
      if (propertyProfile.gridStatus === "on_grid" && !propertyProfile.hasGenerator) frag.push({ icon: "🔌", msg: "Grid-dependent with no backup generator.", sev: "warning" });
      if (propertyProfile.geoRisks?.length >= 3) frag.push({ icon: "⚠️", msg: `Multiple geographic risks identified (${propertyProfile.geoRisks.length}).`, sev: "warning" });
      if (propertyProfile.specialNeeds?.length > 0) frag.push({ icon: "🩺", msg: "Household includes vulnerable members — plan for extended care needs.", sev: "info" });
    }

    return { powerHrs: adjPower, waterDays: adjWater, heatDays: adjHeat, calDays, commCount: adjComm, commChannels: [...commCh], frag };
  }, [items, people, climate, propertyProfile]);

  /* ── Overall Preparedness Score ── */
  const prepScore = useMemo(() => {
    let score = 0;
    // Water (25 pts) — 14 days = full marks
    score += Math.min(cont.waterDays / 14, 1) * 25;
    // Food (25 pts) — 30 days = full marks
    score += Math.min(cont.calDays / 30, 1) * 25;
    // Power (15 pts) — 72 hours = full marks
    score += Math.min(cont.powerHrs / 72, 1) * 15;
    // Heat (15 pts) — 30 days = full marks
    score += Math.min(cont.heatDays / 30, 1) * 15;
    // Comms (10 pts) — 3 channels = full marks
    score += Math.min(cont.commCount / 3, 1) * 10;
    // Category coverage (10 pts)
    const catsWithItems = new Set(items.map(i => i.category)).size;
    score += Math.min(catsWithItems / Object.keys(CATEGORIES).length, 1) * 10;
    return Math.round(score);
  }, [cont, items]);

  /* Planting calendar alerts */
  const now = new Date();
  const currentMonth = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][now.getMonth()];
  const farmItems = items.filter((i) => i.category === "farm" && i.subType === "seedPacket");
  const plantNow = farmItems.filter((i) => i.fields?.plantMonth === currentMonth);
  const harvestNow = farmItems.filter((i) => i.fields?.harvestMonth === currentMonth);

  /* Expiry soon count for banner badge */
  const expiringSoon = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 90);
    return items.filter(i => {
      if (!i.fields?.expiryDate) return false;
      const exp = new Date(i.fields.expiryDate);
      return exp <= cutoff && exp >= new Date(Date.now() - 30 * 864e5);
    }).length;
  }, [items]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* ── Quick Start Banner ── */}
      {!propertyProfile?.completedAt && onOpenQuickStart && !dismissedProfileCTA && (
        <div style={{ ...cardSt, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, background: "linear-gradient(135deg, rgba(33,76,57,0.06), rgba(33,76,57,0.02))", border: "1px solid rgba(33,76,57,0.15)", transition: "all 0.2s" }} onMouseOver={e => e.currentTarget.style.borderColor = "rgba(33,76,57,0.35)"} onMouseOut={e => e.currentTarget.style.borderColor = "rgba(33,76,57,0.15)"}>
          <div style={{ fontSize: 28, flexShrink: 0 }}>🏠</div>
          <div style={{ flex: 1, cursor: "pointer" }} onClick={onOpenQuickStart}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#214c39" }}>Complete Your Property Profile</div>
            <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", marginTop: 2 }}>Answer a few questions about your property infrastructure, water, and location to unlock personalized readiness insights.</div>
          </div>
          <div onClick={onOpenQuickStart} style={{ padding: "8px 16px", borderRadius: 8, background: "linear-gradient(135deg,#214c39,#183d2b)", color: "#243d30", fontSize: 11, fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap", cursor: "pointer" }}>Get Started</div>
          <button onClick={(e) => { e.stopPropagation(); setDismissedProfileCTA(true); localStorage.setItem("prepvault-dismiss-profile-cta", "1"); }} style={{ background: "none", border: "none", color: "rgba(36,61,48,0.58)", fontSize: 18, cursor: "pointer", padding: "0 0 0 4px", lineHeight: 1, flexShrink: 0 }} title="Dismiss">×</button>
        </div>
      )}

      {/* ── Readiness Overview ── */}
      <div style={{ ...cardSt, padding: 0, overflow: "hidden", background: "linear-gradient(135deg, rgba(33,76,57,0.04), rgba(33,76,57,0.01))", border: "1px solid rgba(33,76,57,0.1)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
          {[
            { icon: null, label: "Score", value: SL(prepScore), color: SC(prepScore), score: prepScore },
            { icon: "⚡", label: "Power", value: cont.powerHrs >= 24 ? cont.powerHrs.toFixed(0) + "h backup" : cont.powerHrs > 0 ? cont.powerHrs.toFixed(0) + "h backup" : "No backup", color: cont.powerHrs >= 72 ? "#22c55e" : cont.powerHrs >= 24 ? "#f59e0b" : "#ef4444" },
            { icon: "💧", label: "Water", value: cont.waterDays >= 14 ? cont.waterDays.toFixed(0) + " days" : cont.waterDays > 0 ? cont.waterDays.toFixed(1) + " days" : "No stored water", color: cont.waterDays >= 14 ? "#22c55e" : cont.waterDays >= 3 ? "#f59e0b" : "#ef4444" },
            { icon: "🔥", label: "Heat", value: cont.heatDays >= 999 ? "N/A" : cont.heatDays.toFixed(0) + " days", color: cont.heatDays >= 999 ? "rgba(36,61,48,0.3)" : cont.heatDays >= 30 ? "#22c55e" : cont.heatDays >= 7 ? "#f59e0b" : "#ef4444" },
            { icon: "🍽️", label: "Food", value: cont.calDays >= 30 ? cont.calDays.toFixed(0) + " days" : cont.calDays > 0 ? cont.calDays.toFixed(1) + " days" : "No stored food", color: cont.calDays >= 30 ? "#22c55e" : cont.calDays >= 7 ? "#f59e0b" : "#ef4444" },
          ].map((s, i) => (
            <div key={i} style={{ padding: "14px 16px", borderRight: i < 4 ? "1px solid #e5eadd" : "none", display: "flex", alignItems: "center", gap: 10 }}>
              {s.score != null ? (
                <div style={{ position: "relative", width: 32, height: 32, flexShrink: 0 }}>
                  <svg width="32" height="32" viewBox="0 0 32 32">
                    <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(36,61,48,0.06)" strokeWidth="3" />
                    <circle cx="16" cy="16" r="13" fill="none" stroke={s.color} strokeWidth="3" strokeDasharray={`${s.score / 100 * 81.7} 81.7`} strokeLinecap="round" transform="rotate(-90 16 16)" style={{ transition: "stroke-dasharray 0.8s ease" }} />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, fontFamily: M, color: s.color }}>{s.score}</div>
                </div>
              ) : (
                <div style={{ width: 32, height: 32, borderRadius: 8, background: s.color + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{s.icon}</div>
              )}
              <div>
                <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Private Surveillance ── */}
      <div style={{ ...cardSt, padding: "20px 24px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <Icon name="camera" size={25} />
        <div style={{ flex: 1, minWidth: 220 }}><div style={{ fontSize: 14, fontWeight: 700 }}>Your private surveillance</div><p style={{ fontSize: 12, color: "rgba(36,61,48,0.58)", margin: "6px 0 0", lineHeight: 1.6 }}>Connect REVEAL for camera photos and EyezOn for reported alarm states.</p></div>
        <button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => setActiveTab("surveillance")}>Open surveillance<Icon name="arrow" size={15} /></button>
      </div>

      {/* ── Action Items Center ── */}
      {(() => {
        const now = new Date();
        const tasks = [];
        // Expiring items
        items.forEach(i => { if (!i.fields?.expiryDate) return; const exp = new Date(i.fields.expiryDate); const d = Math.ceil((exp - now) / 864e5); if (d < 0) tasks.push({ id: "exp-" + i.id, icon: "⏰", desc: i.name + " expired " + Math.abs(d) + "d ago — rotate/replace", priority: "critical", assignee: null }); else if (d <= 90) tasks.push({ id: "exp-" + i.id, icon: "⏰", desc: i.name + " expires in " + d + "d", priority: d <= 30 ? "warning" : "info", assignee: null }); });
        // Code rotation
        (codes || []).forEach(c => { if (!c.lastChanged) return; const d = Math.floor((now - new Date(c.lastChanged)) / 864e5); if (d > 30) tasks.push({ id: "code-" + (c.id || c.label), icon: "🔑", desc: c.label + " code rotation overdue (" + d + "d)", priority: d > 45 ? "critical" : "warning", assignee: null }); });
        // Vehicle service
        items.filter(i => i.fields?.nextService).forEach(i => { const d = Math.ceil((new Date(i.fields.nextService) - now) / 864e5); if (d < 0) tasks.push({ id: "svc-" + i.id, icon: "🚗", desc: i.name + " service overdue " + Math.abs(d) + "d", priority: "critical", assignee: null }); else if (d <= 30) tasks.push({ id: "svc-" + i.id, icon: "🚗", desc: i.name + " service in " + d + "d", priority: "warning", assignee: null }); });
        // Equipment maintenance
        items.filter(i => i.subType === "chainsaw" && i.fields?.lastService).forEach(i => { const d = Math.ceil((now - new Date(i.fields.lastService)) / 864e5); if (d > 180) tasks.push({ id: "chain-" + i.id, icon: "⛓️", desc: i.name + " service overdue (" + d + "d)", priority: "warning", assignee: null }); });
        // Bug-out bag audit
        items.filter(i => i.subType === "bag" && i.fields?.lastAudited).forEach(i => { const d = Math.ceil((now - new Date(i.fields.lastAudited)) / 864e5); if (d > 90) tasks.push({ id: "bob-" + i.id, icon: "🎒", desc: i.name + " audit overdue (" + d + "d)" + (i.fields?.bagOwner ? " — " + i.fields.bagOwner : ""), priority: d > 180 ? "critical" : "warning", assignee: i.fields?.bagOwner || null }); });
        // Water refresh
        items.filter(i => i.fields?.lastRefreshed).forEach(i => { const d = Math.ceil((now - new Date(i.fields.lastRefreshed)) / 864e5); if (d > 150) tasks.push({ id: "water-" + i.id, icon: "💧", desc: i.name + " refresh " + (d > 180 ? "overdue" : "due soon") + " (" + d + "d)", priority: d > 180 ? "critical" : "warning", assignee: null }); });
        // Gas stabilization
        items.filter(i => i.category === "fuel" && i.subType === "gasoline").forEach(i => { if (!i.fields?.lastRotated && !i.addedDate) return; const d = Math.ceil((now - new Date(i.fields?.lastRotated || i.addedDate)) / 864e5); if (d > 180) tasks.push({ id: "fuel-" + i.id, icon: "⛽", desc: "Stabilize/rotate gas — " + i.name + " (" + d + "d old)", priority: "warning", assignee: null }); });
        // Air filter (HVAC) — check every 90d if any power/electronics items exist
        if (items.some(i => i.category === "power")) tasks.push({ id: "maint-airfilter", icon: "🌬️", desc: "Check/change HVAC air filters (quarterly)", priority: "info", assignee: null });
        // Crisis-active tasks
        if (crisisMode) { tasks.push({ id: "crisis-comms", icon: "📡", desc: "Comms check-in — verify all channels operational", priority: "critical", assignee: null }); tasks.push({ id: "crisis-headcount", icon: "👥", desc: "Headcount — confirm all members accounted for", priority: "critical", assignee: null }); }
        // Planting tasks from farm calendar
        if (plantNow.length > 0) tasks.push({ id: "farm-plant", icon: "🌱", desc: "Plant now: " + plantNow.map(s => s.fields?.cropName || s.name).join(", "), priority: "info", assignee: null });
        if (harvestNow.length > 0) tasks.push({ id: "farm-harvest", icon: "🍅", desc: "Harvest now: " + harvestNow.map(s => s.fields?.cropName || s.name).join(", "), priority: "warning", assignee: null });
        // Sort by priority
        const po = { critical: 0, warning: 1, info: 2 }; tasks.sort((a, b) => (po[a.priority] ?? 2) - (po[b.priority] ?? 2));
        const pending = tasks.filter(t => !(actionLog || []).some(l => l.taskId === t.id));
        const pColor = { critical: "#ef4444", warning: "#f59e0b", info: "#22c55e" };
        return (
          <div style={{ ...cardSt, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 11, color: "rgba(36,61,48,0.58)", textTransform: "uppercase", letterSpacing: 2 }}>Action Items ({pending.length})</h3>
              {(actionLog || []).length > 0 && <button onClick={() => setShowActHistory(h => !h)} style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid #dce3d5", background: "none", color: "rgba(36,61,48,0.58)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{showActHistory ? "Hide" : "Show"} History ({(actionLog || []).length})</button>}
            </div>
            {pending.length === 0 ? (
              <div style={{ textAlign: "center", padding: 20, color: "rgba(36,61,48,0.58)", fontSize: 11 }}>All caught up — no pending action items</div>
            ) : (
              <div style={{ display: "grid", gap: 4 }}>
                {(showAllActions ? pending : pending.slice(0, 3)).map(task => (
                  <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(47,76,39,0.01)", border: "1px solid #e5eadd", borderLeft: "3px solid " + (pColor[task.priority] || "#22c55e") }}>
                    <input type="checkbox" onChange={() => { const by = (members || [])[0]?.name || "You"; setActionLog(prev => [...(prev || []), { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), taskId: task.id, desc: task.desc, completedBy: by, completedAt: new Date().toISOString() }]); }} style={{ accentColor: pColor[task.priority] || "#22c55e", cursor: "pointer" }} />
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{task.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "rgba(36,61,48,0.6)" }}>{task.desc}</div>
                      {task.assignee && <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)" }}>Assigned: {task.assignee}</div>}
                    </div>
                    <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: (pColor[task.priority] || "#22c55e") + "15", color: pColor[task.priority] || "#22c55e", fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>{task.priority}</span>
                  </div>
                ))}
                {pending.length > 3 && (
                  <button onClick={() => setShowAllActions(a => !a)} style={{ padding: "8px 0", borderRadius: 8, border: "1px solid #e0e6da", background: "rgba(47,76,39,0.02)", color: "rgba(36,61,48,0.58)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "center" }}>
                    {showAllActions ? "Show Less" : "See More"}
                  </button>
                )}
              </div>
            )}
            {showActHistory && (actionLog || []).length > 0 && (
              <div style={{ marginTop: 12, borderTop: "1px solid #e0e6da", paddingTop: 10 }}>
                <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Completed History</div>
                {(actionLog || []).slice().reverse().map(log => (
                  <div key={log.id} style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 11, color: "rgba(36,61,48,0.58)", borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                    <span style={{ color: "#22c55e" }}>✓</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.desc}</span>
                    <span style={{ flexShrink: 0, fontWeight: 600 }}>{log.completedBy}</span>
                    <span style={{ flexShrink: 0, fontFamily: M }}>{new Date(log.completedAt).toLocaleDateString()}</span>
                  </div>
                ))}
                <button onClick={() => { if (confirm("Clear all completed history?")) setActionLog([]); }} style={{ marginTop: 8, padding: "4px 10px", borderRadius: 4, border: "1px solid rgba(239,68,68,0.1)", background: "none", color: "rgba(239,68,68,0.4)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Clear History</button>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Weather & Local News ── */}
      <div className="pcs-weather-news" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Local Weather */}
        <div style={{ ...cardSt, padding: 16, background: "linear-gradient(135deg, rgba(14,165,233,0.04), rgba(14,165,233,0.01))", border: "1px solid rgba(14,165,233,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 11, color: "rgba(36,61,48,0.58)", textTransform: "uppercase", letterSpacing: 2 }}>🌤️ Local Weather</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 7, padding: "2px 5px", borderRadius: 3, background: weatherSource === "live" ? "rgba(34,197,94,0.1)" : weatherSource === "cached" ? "rgba(14,165,233,0.1)" : "rgba(36,61,48,0.06)", color: weatherSource === "live" ? "#22c55e" : weatherSource === "cached" ? "#0ea5e9" : "rgba(36,61,48,0.2)", fontWeight: 700, letterSpacing: 0.5 }}>{weatherSource === "live" ? "LIVE" : weatherSource === "cached" ? "CACHED" : "SAMPLE"}</span>
              {currentWeather.city && <span style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", fontFamily: M }}>{currentWeather.city}</span>}
            </div>
          </div>
          {weatherLoading && !weather ? (
            <div style={{ textAlign: "center", padding: "20px 0", fontSize: 11, color: "rgba(36,61,48,0.58)" }}>⟳ Loading weather...</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 36, fontWeight: 800, fontFamily: M, color: "#0ea5e9", lineHeight: 1 }}>{currentWeather.temp}°</div>
                  <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", marginTop: 2 }}>Feels like {currentWeather.feels_like}°</div>
                </div>
                <div style={{ fontSize: 40, lineHeight: 1 }}>{currentWeather.icon || "🌤️"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(36,61,48,0.6)" }}>{currentWeather.description}</div>
                  <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", marginTop: 2 }}>Wind: {currentWeather.wind_dir} {currentWeather.wind_speed} km/h · Humidity: {currentWeather.humidity}%</div>
                </div>
              </div>
              {forecast.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(forecast.length, 5)}, 1fr)`, gap: 4 }}>
                  {forecast.slice(0, 5).map((d, i) => (
                    <div key={i} style={{ textAlign: "center", padding: "6px 2px", borderRadius: 8, background: "rgba(47,76,39,0.02)" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(36,61,48,0.58)" }}>{d.day}</div>
                      <div style={{ fontSize: 16, margin: "3px 0" }}>{d.icon}</div>
                      <div style={{ fontSize: 11, fontFamily: M, color: "rgba(36,61,48,0.58)" }}>{d.hi}°</div>
                      <div style={{ fontSize: 11, fontFamily: M, color: "rgba(36,61,48,0.58)" }}>{d.lo}°</div>
                    </div>
                  ))}
                </div>
              )}
              {weatherAlerts.length > 0 && weatherAlerts.map((alert, i) => (
                <div key={i} style={{ marginTop: 8, padding: "6px 10px", borderRadius: 6, background: "rgba(245,158,11,0.04)", borderLeft: "2px solid #f59e0b", fontSize: 11, color: "rgba(245,158,11,0.6)" }}>
                  ⚠ {alert.title || alert.desc || "Weather alert active"}
                  {alert.desc && alert.title && <span> — {alert.desc.slice(0, 120)}</span>}
                </div>
              ))}
              {weatherAlerts.length === 0 && climate === "cold" && weatherSource === "sample" && (
                <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 6, background: "rgba(245,158,11,0.04)", borderLeft: "2px solid #f59e0b", fontSize: 11, color: "rgba(245,158,11,0.6)" }}>
                  ⚠ Extreme cold warning — wind chill to -25°C tonight. Check heating fuel and insulate pipes.
                </div>
              )}
            </>
          )}
        </div>

        {/* Local News */}
        <div style={{ ...cardSt, padding: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <h3 style={{ margin: 0, fontSize: 11, color: "rgba(36,61,48,0.58)", textTransform: "uppercase", letterSpacing: 2 }}>📰 Local News</h3>
            <span style={{ fontSize: 7, padding: "2px 5px", borderRadius: 3, background: newsSource === "live" ? "rgba(34,197,94,0.1)" : newsSource === "cached" ? "rgba(14,165,233,0.1)" : "rgba(36,61,48,0.06)", color: newsSource === "live" ? "#22c55e" : newsSource === "cached" ? "#0ea5e9" : "rgba(36,61,48,0.2)", fontWeight: 700, letterSpacing: 0.5 }}>{newsSource === "live" ? "LIVE" : newsSource === "cached" ? "CACHED" : "SAMPLE"}</span>
          </div>
          {newsLoading && !news ? (
            <div style={{ textAlign: "center", padding: "20px 0", fontSize: 11, color: "rgba(36,61,48,0.58)" }}>⟳ Loading news...</div>
          ) : (
            <div style={{ display: "grid", gap: 3 }}>
              {newsItems.slice(0, 6).map((n, i) => {
                const sevColors = { critical: "#ef4444", amber: "#f59e0b", info: "#0ea5e9", green: "#22c55e" };
                const col = sevColors[n.severity] || "#6b7280";
                const isClickable = !!n.url;
                return (
                  <div key={i} onClick={() => isClickable && window.open(n.url, "_blank", "noopener,noreferrer")} style={{ display: "flex", gap: 10, padding: "5px 10px", borderRadius: 8, background: "rgba(47,76,39,0.015)", borderLeft: "2px solid " + col + "40", transition: "background 0.15s", cursor: isClickable ? "pointer" : "default" }} onMouseOver={e => e.currentTarget.style.background = "rgba(36,61,48,0.04)"} onMouseOut={e => e.currentTarget.style.background = "rgba(36,61,48,0.015)"}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: isClickable ? "rgba(36,61,48,0.75)" : "rgba(36,61,48,0.65)", lineHeight: 1.4 }}>{n.title}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                        <span style={{ fontSize: 11, color: "rgba(36,61,48,0.58)" }}>{n.source}</span>
                        <span style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", fontFamily: M }}>{n.time}</span>
                        {isClickable && <span style={{ fontSize: 11, color: "rgba(36,61,48,0.58)" }}>↗</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 7, padding: "2px 6px", borderRadius: 4, background: col + "10", color: col, fontWeight: 700, alignSelf: "flex-start", flexShrink: 0, letterSpacing: 0.5 }}>{n.tag}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Action Bar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "4px 0" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowAlerts(!showAlerts)} style={{ ...btnSt, background: (allAlerts.length > 0 && !alertsDismissed) ? "rgba(239,68,68,0.06)" : "rgba(36,61,48,0.04)", color: (allAlerts.length > 0 && !alertsDismissed) ? "#ef4444" : "rgba(36,61,48,0.4)", fontWeight: 700, fontSize: 14, padding: "8px 11px", border: (allAlerts.length > 0 && !alertsDismissed) ? "1px solid rgba(239,68,68,0.15)" : "1px solid #e0e6da", position: "relative", opacity: alertsDismissed ? 0.5 : 1 }} title={alertsDismissed ? `Alerts dismissed — returns in ${Math.ceil((alertsDismissedUntil - Date.now()) / 3600000)}h` : allAlerts.length + " alerts"}>
            🔔
            {allAlerts.length > 0 && !alertsDismissed && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, background: "#ef4444", color: "#243d30", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: M, padding: "0 3px", boxShadow: "0 2px 6px rgba(239,68,68,0.4)" }}>{allAlerts.length}</span>}
          </button>
          {showAlerts && allAlerts.length > 0 && !alertsDismissed && (
            <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 340, maxHeight: 400, overflowY: "auto", background: "#ffffff", border: "1px solid #dce3d5", borderRadius: 12, boxShadow: "0 16px 48px rgba(0,0,0,0.6)", zIndex: 999, padding: 6 }}>
              <div style={{ padding: "8px 12px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444" }}>⚠ {allAlerts.length} Alerts</span>
                <button onClick={() => setShowAlerts(false)} style={{ background: "none", border: "none", color: "rgba(36,61,48,0.58)", fontSize: 14, cursor: "pointer", padding: 0 }}>×</button>
              </div>
              {allAlerts.map((a, i) => (
                <div key={i} onClick={() => { setShowAlerts(false); if (a.category) setSelCat(a.category); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, cursor: "pointer", transition: "background 0.1s" }} onMouseOver={e => e.currentTarget.style.background = "rgba(36,61,48,0.04)"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{CATEGORIES[a.category]?.icon || "⚠"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(36,61,48,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: a.ac, fontFamily: M }}>{a.al}</div>
                  </div>
                </div>
              ))}
              <div style={{ padding: "6px 12px 8px", borderTop: "1px solid #e0e6da", marginTop: 4 }}>
                <button onClick={() => { onDismissAlerts(); setShowAlerts(false); }} style={{ ...btnSt, width: "100%", padding: "6px 0", fontSize: 11, fontWeight: 700, background: "rgba(47,76,39,0.04)", color: "rgba(36,61,48,0.58)", border: "1px solid #e0e6da", borderRadius: 6 }}>
                  Dismiss all for 24h
                </button>
              </div>
            </div>
          )}
          {showAlerts && alertsDismissed && (
            <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 240, background: "#ffffff", border: "1px solid #dce3d5", borderRadius: 12, boxShadow: "0 16px 48px rgba(0,0,0,0.6)", zIndex: 999, padding: "12px 16px" }}>
              <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", textAlign: "center" }}>🔕 Alerts dismissed · returns in {Math.ceil((alertsDismissedUntil - Date.now()) / 3600000)}h</div>
            </div>
          )}
        </div>
        <button onClick={() => setShowScanner(true)} style={{ ...btnSt, background: "rgba(47,76,39,0.04)", color: "rgba(36,61,48,0.58)", fontWeight: 700, fontSize: 15, padding: "8px 11px", border: "1px solid #e0e6da" }} title="Scan Barcode">📷</button>
        <button onClick={() => openAdd()} style={{ ...btnSt, background: "linear-gradient(135deg,#214c39,#a03e28)", color: "#243d30", fontWeight: 700, fontSize: 12, padding: "8px 16px", boxShadow: "0 2px 10px rgba(33,76,57,0.25)" }}>+ Add</button>
      </div>

      {/* ── Prep Inventory Grid ── */}
      <div>
        <h3 style={{ margin: "0 0 10px", fontSize: 11, color: "rgba(36,61,48,0.58)", textTransform: "uppercase", letterSpacing: 2 }}>📦 Prep Inventory</h3>
        <div className="pcs-cat-grid">
          {Object.entries(CATEGORIES).map(([k, cat]) => {
            const ci = items.filter((i) => i.category === k);
            const filled = new Set(ci.map((i) => i.subType)).size;
            const total = Object.keys(cat.subTypes).length;
            const p = people || 4;
            const _clim = CLIMATES[climate] || CLIMATES.temperate;
            const _waterMod = _clim.waterMod || 1;
            const _firewoodMod = _clim.firewoodMod || 1;

            /* Compute key metric per category */
            let metric = null;
            if (k === "food") {
              const totalCals = ci.reduce((s, i) => { const cal = parseFloat(i.fields?.totalCalories || i.fields?.caloriesPerServing || i.fields?.calories || 0); const serv = parseFloat(i.fields?.servings || 1); return s + (cal > 500 ? cal : cal * serv) * (i.quantity || 1); }, 0);
              const days = totalCals / Math.max(p * 2000, 1);
              metric = { val: days.toFixed(1), unit: "days", color: days >= 30 ? "#22c55e" : days >= 7 ? "#f59e0b" : "#ef4444" };
            } else if (k === "water") {
              const stored = ci.filter((i) => i.subType === "storedWater").reduce((s, i) => s + (i.quantity || 0), 0);
              const filters = ci.filter((i) => i.subType === "purificationDevice" || i.subType === "purificationTablets").reduce((s, i) => s + (i.quantity || 0), 0);
              const days = stored / Math.max(p * 1.0 * _waterMod, 0.1) + filters * 3;
              metric = { val: days.toFixed(1), unit: "days", color: days >= 14 ? "#22c55e" : days >= 3 ? "#f59e0b" : "#ef4444" };
            } else if (k === "fuel") {
              const gasGals = ci.filter((i) => i.subType === "gasoline").reduce((s, i) => s + (i.quantity || 0) * (parseFloat(i.fields?.fuelGallons || i.fields?.gallons) || 5), 0);
              const propGals = ci.filter((i) => i.subType === "propane").reduce((s, i) => s + (i.quantity || 0), 0) * 4.6;
              const totalL = (gasGals + propGals) * 3.785;
              const genHrs = gasGals * 5.5;
              metric = { val: totalL > 0 ? totalL.toFixed(0) + "L" : "0L", unit: genHrs > 0 ? genHrs.toFixed(0) + "h gen" : "", color: genHrs >= 48 ? "#22c55e" : genHrs >= 12 ? "#f59e0b" : "#ef4444" };
            } else if (k === "firewood") {
              const cords = ci.reduce((s, i) => s + (parseFloat(i.fields?.cords) || 0) * (i.quantity || 1), 0);
              const days = (cords * 30) / Math.max(_firewoodMod, 0.1);
              metric = { val: days.toFixed(0), unit: "days heat", color: days >= 60 ? "#22c55e" : days >= 14 ? "#f59e0b" : "#ef4444" };
            } else if (k === "medical") {
              const coverage = filled / Math.max(total, 1);
              metric = { val: Math.round(coverage * 100), unit: "% covered", color: coverage >= 0.6 ? "#22c55e" : coverage >= 0.3 ? "#f59e0b" : "#ef4444" };
            } else if (k === "batteries") {
              const cells = ci.reduce((s, i) => s + (i.quantity || 0), 0);
              const hrs = cells * 20;
              metric = { val: cells, unit: cells + " cells · " + hrs + "h", color: cells >= 50 ? "#22c55e" : cells >= 20 ? "#f59e0b" : "#ef4444" };
            } else if (k === "electronics" || k === "comms") {
              const ch = new Set();
              ci.forEach((i) => { if (i.subType === "satPhone") ch.add("SAT"); if (i.subType === "cellPhone") ch.add("CELL"); if (i.subType === "radio") ch.add("HAM"); if (i.subType === "weatherRadio") ch.add("WX"); });
              if (k === "comms") ch.add("HAM");
              metric = { val: ch.size, unit: ch.size === 1 ? "channel" : "channels", color: ch.size >= 3 ? "#22c55e" : ch.size >= 2 ? "#f59e0b" : "#ef4444" };
            } else if (k === "vehicles") {
              const veh = ci.reduce((s, i) => s + (i.quantity || 0), 0);
              const overdue = ci.filter((i) => i.fields?.nextService && new Date(i.fields.nextService) < new Date()).length;
              metric = { val: veh, unit: overdue > 0 ? overdue + " need svc" : "ready", color: overdue === 0 && veh > 0 ? "#22c55e" : overdue > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "kids") {
              const diapers = ci.filter((i) => i.subType === "diapers").reduce((s, i) => s + (i.quantity || 0), 0);
              const formula = ci.filter((i) => i.subType === "formula").reduce((s, i) => s + (i.quantity || 0), 0);
              const days = Math.min(diapers / 8, formula * 3);
              metric = ci.length > 0 ? { val: days.toFixed(1), unit: "days", color: days >= 14 ? "#22c55e" : days >= 3 ? "#f59e0b" : "#ef4444" } : null;
            } else if (k === "firearms" || k === "defense") {
              const qty = ci.reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: qty, unit: qty > 0 ? (qty / p).toFixed(1) + "/person" : "none", color: qty >= p ? "#22c55e" : qty > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "nbc") {
              const masks = ci.filter((i) => i.subType === "gasMask").reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: Math.round(masks / Math.max(p, 1) * 100), unit: "% covered", color: masks >= p ? "#22c55e" : masks > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "alcohol") {
              const vol = ci.reduce((s, i) => s + parseVolMl(i.fields?.volume || i.fields?.alcVolume) * (i.quantity || 1), 0);
              metric = { val: (vol / 1000).toFixed(1), unit: "liters", color: ci.length >= 5 ? "#22c55e" : ci.length >= 2 ? "#f59e0b" : "#ef4444" };
            } else if (k === "fishing") {
              const rods = ci.filter((i) => i.subType === "rodReel").reduce((s, i) => s + (i.quantity || 0), 0);
              const nets = ci.filter((i) => i.subType === "net" || i.subType === "fishTrap").reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: rods + nets, unit: "sources", color: rods > 0 ? "#22c55e" : "#ef4444" };
            } else if (k === "boat") {
              const vessels = ci.filter((i) => i.subType === "vessel").reduce((s, i) => s + (i.quantity || 0), 0);
              const pfd = ci.filter((i) => i.subType === "lifeJacket").reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: vessels, unit: pfd >= p ? "PFDs ✓" : pfd + "/" + p + " PFDs", color: vessels > 0 && pfd >= p ? "#22c55e" : vessels > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "farm") {
              const seeds = ci.filter(i => i.subType === "seedPacket").reduce((s, i) => s + (i.quantity || 0), 0);
              const varieties = new Set(ci.filter(i => i.subType === "seedPacket").map(i => i.fields?.cropName)).size;
              const beds = ci.filter(i => i.subType === "raisedBed").reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: varieties, unit: seeds + " packs · " + beds + " beds", color: varieties >= 5 ? "#22c55e" : varieties >= 2 ? "#f59e0b" : "#ef4444" };
            } else if (k === "bugout") {
              const bags = ci.reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: bags, unit: bags >= p ? "ready" : bags + "/" + p + " packed", color: bags >= p ? "#22c55e" : bags > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "recreational") {
              const lighters = ci.filter((i) => i.subType === "lighters").reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: ci.reduce((s, i) => s + (i.quantity || 0), 0), unit: lighters > 0 ? lighters + " lighters" : "items", color: lighters >= 5 ? "#22c55e" : lighters > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "books") {
              metric = { val: ci.reduce((s, i) => s + (i.quantity || 0), 0), unit: "volumes", color: ci.length >= 8 ? "#22c55e" : ci.length >= 3 ? "#f59e0b" : "#ef4444" };
            } else if (k === "power") {
              const qty = ci.reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: qty, unit: "devices", color: qty > 0 ? "#22c55e" : "#ef4444" };
            } else if (k === "hygiene") {
              const qty = ci.reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: qty, unit: "items", color: qty >= 10 ? "#22c55e" : qty > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "clothing") {
              const qty = ci.reduce((s, i) => s + (i.quantity || 0), 0);
              const coverage = filled / Math.max(total, 1);
              metric = { val: qty, unit: Math.round(coverage * 100) + "% types", color: coverage >= 0.5 ? "#22c55e" : qty > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "pets") {
              const food = ci.filter(i => i.subType === "petFood").reduce((s, i) => s + (i.quantity || 0), 0);
              const qty = ci.reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: qty, unit: food > 0 ? food + " food bags" : "items", color: food >= 2 ? "#22c55e" : qty > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "lighting") {
              const lights = ci.filter(i => ["flashlight", "headlamp", "lantern"].includes(i.subType)).reduce((s, i) => s + (i.quantity || 0), 0);
              const candles = ci.filter(i => i.subType === "candle").reduce((s, i) => s + (i.quantity || 0), 0);
              const parts = [];
              if (lights > 0) parts.push(lights + " lights");
              if (candles > 0) parts.push(candles + " candles");
              metric = { val: lights + candles, unit: parts.join(" · ") || "items", color: lights >= 3 ? "#22c55e" : lights > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "bullion") {
              let totalVal = 0;
              ci.forEach(i => { const { oz, metal } = bullionTroyOz(i); totalVal += oz * (SPOT_PRICES[metal] || 0); });
              const goldOz = ci.filter(i => bullionTroyOz(i).metal === "gold").reduce((s, i) => s + bullionTroyOz(i).oz, 0);
              const silverOz = ci.filter(i => bullionTroyOz(i).metal === "silver").reduce((s, i) => s + bullionTroyOz(i).oz, 0);
              const parts = [];
              if (goldOz > 0) parts.push(goldOz.toFixed(1) + " oz Au");
              if (silverOz > 0) parts.push(silverOz.toFixed(0) + " oz Ag");
              metric = { val: "$" + (totalVal >= 1000 ? (totalVal / 1000).toFixed(1) + "k" : totalVal.toFixed(0)), unit: parts.join(" · ") || "none", color: totalVal >= 10000 ? "#22c55e" : totalVal >= 1000 ? "#f59e0b" : "#ef4444" };
            } else if (k === "shelter" || k === "tools" || k === "equipment") {
              const qty = ci.reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: qty, unit: "items", color: qty > 0 ? "#22c55e" : "rgba(36,61,48,0.15)" };
            }

            const statusColor = metric ? metric.color : (filled / total >= 0.6 ? "#22c55e" : filled / total >= 0.3 ? "#f59e0b" : "#ef4444");
            return (
              <button key={k} onClick={() => { setActiveTab("preps"); setSelCat(k); window.scrollTo(0, 0); }} style={{ ...cardSt, padding: 14, cursor: "pointer", textAlign: "left", borderLeft: "3px solid " + statusColor, minWidth: 0, overflow: "hidden" }} onMouseOver={(e) => { e.currentTarget.style.background = "rgba(36,61,48,0.04)"; }} onMouseOut={(e) => { e.currentTarget.style.background = "rgba(36,61,48,0.02)"; }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                  <div style={{ fontSize: 22, marginBottom: 3, flexShrink: 0 }}>{cat.icon}</div>
                  {metric && (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, fontFamily: M, color: metric.color, lineHeight: 1 }}>{metric.val}</div>
                      <div style={{ fontSize: 11, color: metric.color, opacity: 0.7, whiteSpace: "nowrap" }}>{metric.unit}</div>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.label}</div>
                <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", fontFamily: M }}>{ci.length} items · {filled}/{total}</div>
                <div style={{ height: 3, background: "rgba(47,76,39,0.06)", borderRadius: 2, marginTop: 5 }}><div style={{ height: "100%", width: (filled / total) * 100 + "%", background: statusColor, borderRadius: 2, transition: "width 0.3s ease" }} /></div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Expiry Calendar Heatmap ── */}
      {(() => {
        const now = new Date();
        const months = [];
        for (let m = 0; m < 12; m++) {
          const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
          months.push({ key: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"), label: d.toLocaleDateString("en", { month: "short" }), year: d.getFullYear(), month: d.getMonth() });
        }
        const expiringItems = items.filter((i) => i.fields?.expiryDate).map((i) => {
          const exp = new Date(i.fields.expiryDate);
          const mKey = exp.getFullYear() + "-" + String(exp.getMonth() + 1).padStart(2, "0");
          return { ...i, expDate: exp, monthKey: mKey };
        }).filter((i) => {
          const diff = (i.expDate - now) / 864e5;
          return diff > -30 && diff < 400;
        });
        const byMonth = {};
        expiringItems.forEach((i) => { if (!byMonth[i.monthKey]) byMonth[i.monthKey] = []; byMonth[i.monthKey].push(i); });
        const maxCount = Math.max(1, ...months.map((m) => (byMonth[m.key] || []).length));
        if (expiringItems.length === 0) return null;
        return (
          <div style={{ marginTop: 2 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 11, color: "rgba(36,61,48,0.58)", textTransform: "uppercase", letterSpacing: 2 }}>Expiry Calendar</h3>
            <div style={{ ...cardSt, padding: 16 }}>
              <div className="pcs-expiry-grid" style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 4 }}>
                {months.map((m) => {
                  const mItems = byMonth[m.key] || [];
                  const count = mItems.length;
                  const intensity = count / maxCount;
                  const expired = mItems.filter((i) => i.expDate < now).length;
                  const bgColor = count === 0 ? "rgba(36,61,48,0.02)" : expired > 0 ? `rgba(239,68,68,${0.1 + intensity * 0.35})` : intensity > 0.6 ? `rgba(245,158,11,${0.1 + intensity * 0.3})` : `rgba(34,197,94,${0.05 + intensity * 0.15})`;
                  const borderColor = count === 0 ? "rgba(36,61,48,0.04)" : expired > 0 ? "rgba(239,68,68,0.2)" : intensity > 0.6 ? "rgba(245,158,11,0.2)" : "rgba(34,197,94,0.15)";
                  const isNow = m.month === now.getMonth() && m.year === now.getFullYear();
                  return (
                    <div key={m.key} style={{ padding: "8px 4px", borderRadius: 8, background: bgColor, border: isNow ? "2px solid rgba(33,76,57,0.4)" : "1px solid " + borderColor, textAlign: "center", minHeight: 58, display: "flex", flexDirection: "column", justifyContent: "center", position: "relative" }} title={count > 0 ? mItems.map(i => i.name + " (" + CATEGORIES[i.category]?.icon + ")").join(", ") : "Nothing expiring"}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: isNow ? "#214c39" : "rgba(36,61,48,0.3)", marginBottom: 3 }}>{m.label}</div>
                      <div style={{ fontSize: count > 0 ? 18 : 12, fontWeight: 800, fontFamily: M, color: count === 0 ? "rgba(36,61,48,0.08)" : expired > 0 ? "#ef4444" : intensity > 0.6 ? "#f59e0b" : "#22c55e", lineHeight: 1 }}>{count > 0 ? count : "—"}</div>
                      {count > 0 && <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", marginTop: 2 }}>{expired > 0 ? <span style={{ color: "#ef4444" }}>{expired} exp</span> : "items"}</div>}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 8, justifyContent: "center", fontSize: 11, color: "rgba(36,61,48,0.58)" }}>
                <span>🟢 Low</span><span>🟡 Moderate</span><span>🔴 Urgent</span><span style={{ color: "#214c39" }}>◻ Now</span>
              </div>
              {expiringItems.filter(i => { const d = (i.expDate - now) / 864e5; return d <= 90 && d >= -30; }).length > 0 && (
                <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.08)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginBottom: 4 }}>⚠ Expiring within 90 days</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {expiringItems.filter(i => { const d = (i.expDate - now) / 864e5; return d <= 90 && d >= -30; }).sort((a, b) => a.expDate - b.expDate).slice(0, 8).map((i, idx) => {
                      const d = Math.ceil((i.expDate - now) / 864e5);
                      return <span key={idx} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: d < 0 ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.08)", color: d < 0 ? "#ef4444" : "#f59e0b", fontFamily: M }}>{CATEGORIES[i.category]?.icon} {i.name} · {d < 0 ? Math.abs(d) + "d ago" : d + "d"}</span>;
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ═══════════════════════════════════════════ */
/* ═══ PREPS TAB ═══                         */
/* ═══════════════════════════════════════════ */
function PrepsTab({ items, setSelCat, openAdd, people, climate, allAlerts, showAlerts, setShowAlerts, setShowScanner, alertsDismissed, alertsDismissedUntil, onDismissAlerts, categories = CATEGORIES }) {
  const M = "'DM Sans',sans-serif";
  const cardSt = { background: "#ffffff", backdropFilter: "blur(12px)", border: "1px solid #e0e6da", borderRadius: 14, padding: 20 };

  /* ── Prep Inventory Score (items-only) ── */
  const invScore = useMemo(() => {
    const totalCats = Object.keys(categories).length;
    const catsWithItems = new Set(items.map(i => i.category)).size;
    const catCoverage = catsWithItems / totalCats;

    let subtypeCoverage = 0;
    let catCount = 0;
    Object.entries(categories).forEach(([k, cat]) => {
      const ci = items.filter(i => i.category === k);
      if (ci.length === 0) return;
      const filled = new Set(ci.map(i => i.subType)).size;
      const total = Object.keys(cat.subTypes).length;
      subtypeCoverage += filled / Math.max(total, 1);
      catCount++;
    });
    const avgSubCoverage = catCount > 0 ? subtypeCoverage / catCount : 0;

    const totalItems = items.reduce((s, i) => s + (i.quantity || 1), 0);
    const depthScore = Math.min(totalItems / 100, 1);

    const now = new Date();
    const expiringCount = items.filter(i => {
      if (!i.fields?.expiryDate) return false;
      const exp = new Date(i.fields.expiryDate);
      return exp < now;
    }).length;
    const expiryPenalty = Math.min(expiringCount * 2, 15);

    const score = Math.round(
      catCoverage * 35 +
      avgSubCoverage * 30 +
      depthScore * 20 +
      (items.length > 0 ? 15 : 0) -
      expiryPenalty
    );
    return Math.max(0, Math.min(100, score));
  }, [items, categories]);

  return (
    <div style={{ display: "grid", gap: 16 }}>

      {/* ── Inventory Score ── */}
      <div style={{ ...cardSt, padding: "20px 24px", display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(36,61,48,0.06)" strokeWidth="5" />
            <circle cx="32" cy="32" r="28" fill="none" stroke={SC(invScore)} strokeWidth="5" strokeDasharray={`${(invScore / 100) * 175.9} 175.9`} strokeLinecap="round" transform="rotate(-90 32 32)" style={{ transition: "stroke-dasharray 0.6s ease" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: M, fontSize: 18, fontWeight: 800, color: SC(invScore) }}>{invScore}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 2 }}>Prep Inventory</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: SC(invScore), fontFamily: M }}>{SL(invScore)}</div>
          <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", marginTop: 4 }}>
            {items.length} items · {new Set(items.map(i => i.category)).size}/{Object.keys(categories).length} categories covered
          </div>
        </div>
        <div style={{ display: "grid", gap: 6, textAlign: "right" }}>
          {[
            { l: "Categories", v: new Set(items.map(i => i.category)).size + "/" + Object.keys(categories).length, c: new Set(items.map(i => i.category)).size >= Object.keys(categories).length * 0.6 ? "#22c55e" : "#f59e0b" },
            { l: "Total Items", v: items.reduce((s, i) => s + (i.quantity || 1), 0), c: "#0ea5e9" },
            { l: "Expired", v: items.filter(i => i.fields?.expiryDate && new Date(i.fields.expiryDate) < new Date()).length, c: items.filter(i => i.fields?.expiryDate && new Date(i.fields.expiryDate) < new Date()).length > 0 ? "#ef4444" : "#22c55e" },
          ].map((s, i) => (
            <div key={i} style={{ fontSize: 11, color: "rgba(36,61,48,0.58)" }}>{s.l}: <span style={{ color: s.c, fontWeight: 700, fontFamily: M }}>{s.v}</span></div>
          ))}
        </div>
      </div>

      {/* ── Expiry Calendar Heatmap ── */}
      {(() => {
        const now = new Date();
        const months = [];
        for (let m = 0; m < 12; m++) {
          const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
          months.push({ key: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"), label: d.toLocaleDateString("en", { month: "short" }), year: d.getFullYear(), month: d.getMonth() });
        }
        const expiringItems = items.filter((i) => i.fields?.expiryDate).map((i) => {
          const exp = new Date(i.fields.expiryDate);
          const mKey = exp.getFullYear() + "-" + String(exp.getMonth() + 1).padStart(2, "0");
          return { ...i, expDate: exp, monthKey: mKey };
        }).filter((i) => {
          const diff = (i.expDate - now) / 864e5;
          return diff > -30 && diff < 400;
        });
        const byMonth = {};
        expiringItems.forEach((i) => { if (!byMonth[i.monthKey]) byMonth[i.monthKey] = []; byMonth[i.monthKey].push(i); });
        const maxCount = Math.max(1, ...months.map((m) => (byMonth[m.key] || []).length));
        if (expiringItems.length === 0) return null;
        return (
          <div style={{ marginTop: 2 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 11, color: "rgba(36,61,48,0.58)", textTransform: "uppercase", letterSpacing: 2 }}>Expiry Calendar</h3>
            <div style={{ ...cardSt, padding: 16 }}>
              <div className="pcs-expiry-grid" style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 4 }}>
                {months.map((m) => {
                  const mItems = byMonth[m.key] || [];
                  const count = mItems.length;
                  const intensity = count / maxCount;
                  const expired = mItems.filter((i) => i.expDate < now).length;
                  const bgColor = count === 0 ? "rgba(36,61,48,0.02)" : expired > 0 ? `rgba(239,68,68,${0.1 + intensity * 0.35})` : intensity > 0.6 ? `rgba(245,158,11,${0.1 + intensity * 0.3})` : `rgba(34,197,94,${0.05 + intensity * 0.15})`;
                  const borderColor = count === 0 ? "rgba(36,61,48,0.04)" : expired > 0 ? "rgba(239,68,68,0.2)" : intensity > 0.6 ? "rgba(245,158,11,0.2)" : "rgba(34,197,94,0.15)";
                  const isNow = m.month === now.getMonth() && m.year === now.getFullYear();
                  return (
                    <div key={m.key} style={{ padding: "8px 4px", borderRadius: 8, background: bgColor, border: isNow ? "2px solid rgba(33,76,57,0.4)" : "1px solid " + borderColor, textAlign: "center", minHeight: 58, display: "flex", flexDirection: "column", justifyContent: "center", position: "relative" }} title={count > 0 ? mItems.map(i => i.name + " (" + categories[i.category]?.icon + ")").join(", ") : "Nothing expiring"}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: isNow ? "#214c39" : "rgba(36,61,48,0.3)", marginBottom: 3 }}>{m.label}</div>
                      <div style={{ fontSize: count > 0 ? 18 : 12, fontWeight: 800, fontFamily: M, color: count === 0 ? "rgba(36,61,48,0.08)" : expired > 0 ? "#ef4444" : intensity > 0.6 ? "#f59e0b" : "#22c55e", lineHeight: 1 }}>{count > 0 ? count : "—"}</div>
                      {count > 0 && <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", marginTop: 2 }}>{expired > 0 ? <span style={{ color: "#ef4444" }}>{expired} exp</span> : "items"}</div>}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 8, justifyContent: "center", fontSize: 11, color: "rgba(36,61,48,0.58)" }}>
                <span>🟢 Low</span><span>🟡 Moderate</span><span>🔴 Urgent</span><span style={{ color: "#214c39" }}>◻ Now</span>
              </div>
              {expiringItems.filter(i => { const d = (i.expDate - now) / 864e5; return d <= 90 && d >= -30; }).length > 0 && (
                <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.08)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginBottom: 4 }}>⚠ Expiring within 90 days</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {expiringItems.filter(i => { const d = (i.expDate - now) / 864e5; return d <= 90 && d >= -30; }).sort((a, b) => a.expDate - b.expDate).slice(0, 8).map((i, idx) => {
                      const d = Math.ceil((i.expDate - now) / 864e5);
                      return <span key={idx} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: d < 0 ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.08)", color: d < 0 ? "#ef4444" : "#f59e0b", fontFamily: M }}>{categories[i.category]?.icon} {i.name} · {d < 0 ? Math.abs(d) + "d ago" : d + "d"}</span>;
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Action Bar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "4px 0" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowAlerts(!showAlerts)} style={{ ...btnSt, background: (allAlerts.length > 0 && !alertsDismissed) ? "rgba(239,68,68,0.06)" : "rgba(36,61,48,0.04)", color: (allAlerts.length > 0 && !alertsDismissed) ? "#ef4444" : "rgba(36,61,48,0.4)", fontWeight: 700, fontSize: 14, padding: "8px 11px", border: (allAlerts.length > 0 && !alertsDismissed) ? "1px solid rgba(239,68,68,0.15)" : "1px solid #e0e6da", position: "relative", opacity: alertsDismissed ? 0.5 : 1 }} title={alertsDismissed ? `Alerts dismissed — returns in ${Math.ceil((alertsDismissedUntil - Date.now()) / 3600000)}h` : allAlerts.length + " alerts"}>
            🔔
            {allAlerts.length > 0 && !alertsDismissed && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, background: "#ef4444", color: "#243d30", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: M, padding: "0 3px", boxShadow: "0 2px 6px rgba(239,68,68,0.4)" }}>{allAlerts.length}</span>}
          </button>
          {showAlerts && allAlerts.length > 0 && !alertsDismissed && (
            <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 340, maxHeight: 400, overflowY: "auto", background: "#ffffff", border: "1px solid #dce3d5", borderRadius: 12, boxShadow: "0 16px 48px rgba(0,0,0,0.6)", zIndex: 999, padding: 6 }}>
              <div style={{ padding: "8px 12px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444" }}>⚠ {allAlerts.length} Alerts</span>
                <button onClick={() => setShowAlerts(false)} style={{ background: "none", border: "none", color: "rgba(36,61,48,0.58)", fontSize: 14, cursor: "pointer", padding: 0 }}>×</button>
              </div>
              {allAlerts.map((a, i) => (
                <div key={i} onClick={() => { setShowAlerts(false); if (a.category) setSelCat(a.category); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, cursor: "pointer", transition: "background 0.1s" }} onMouseOver={e => e.currentTarget.style.background = "rgba(36,61,48,0.04)"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{categories[a.category]?.icon || "⚠"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(36,61,48,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: a.ac, fontFamily: M }}>{a.al}</div>
                  </div>
                </div>
              ))}
              <div style={{ padding: "6px 12px 8px", borderTop: "1px solid #e0e6da", marginTop: 4 }}>
                <button onClick={() => { onDismissAlerts(); setShowAlerts(false); }} style={{ ...btnSt, width: "100%", padding: "6px 0", fontSize: 11, fontWeight: 700, background: "rgba(47,76,39,0.04)", color: "rgba(36,61,48,0.58)", border: "1px solid #e0e6da", borderRadius: 6 }}>
                  Dismiss all for 24h
                </button>
              </div>
            </div>
          )}
          {showAlerts && alertsDismissed && (
            <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 240, background: "#ffffff", border: "1px solid #dce3d5", borderRadius: 12, boxShadow: "0 16px 48px rgba(0,0,0,0.6)", zIndex: 999, padding: "12px 16px" }}>
              <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", textAlign: "center" }}>🔕 Alerts dismissed · returns in {Math.ceil((alertsDismissedUntil - Date.now()) / 3600000)}h</div>
            </div>
          )}
        </div>
        <button onClick={() => setShowScanner(true)} style={{ ...btnSt, background: "rgba(47,76,39,0.04)", color: "rgba(36,61,48,0.58)", fontWeight: 700, fontSize: 15, padding: "8px 11px", border: "1px solid #e0e6da" }} title="Scan Barcode">📷</button>
        <button onClick={() => openAdd()} style={{ ...btnSt, background: "linear-gradient(135deg,#214c39,#a03e28)", color: "#243d30", fontWeight: 700, fontSize: 12, padding: "8px 16px", boxShadow: "0 2px 10px rgba(33,76,57,0.25)" }}>+ Add</button>
      </div>

      {/* ── Categories Grid ── */}
      <div>
        <h3 style={{ margin: "0 0 10px", fontSize: 11, color: "rgba(36,61,48,0.58)", textTransform: "uppercase", letterSpacing: 2 }}>Categories</h3>
        <div className="pcs-cat-grid">
          {Object.entries(categories).map(([k, cat]) => {
            const ci = items.filter((i) => i.category === k);
            const filled = new Set(ci.map((i) => i.subType)).size;
            const total = Object.keys(cat.subTypes).length;
            const p = people || 4;
            const _clim = CLIMATES[climate] || CLIMATES.temperate;
            const _waterMod = _clim.waterMod || 1;
            const _firewoodMod = _clim.firewoodMod || 1;

            let metric = null;
            if (k === "food") {
              const totalCals = ci.reduce((s, i) => { const cal = parseFloat(i.fields?.totalCalories || i.fields?.caloriesPerServing || i.fields?.calories || 0); const serv = parseFloat(i.fields?.servings || 1); return s + (cal > 500 ? cal : cal * serv) * (i.quantity || 1); }, 0);
              const days = totalCals / Math.max(p * 2000, 1);
              metric = { val: days.toFixed(1), unit: "days", color: days >= 30 ? "#22c55e" : days >= 7 ? "#f59e0b" : "#ef4444" };
            } else if (k === "water") {
              const stored = ci.filter((i) => i.subType === "storedWater").reduce((s, i) => s + (i.quantity || 0), 0);
              const filters = ci.filter((i) => i.subType === "purificationDevice" || i.subType === "purificationTablets").reduce((s, i) => s + (i.quantity || 0), 0);
              const days = stored / Math.max(p * 1.0 * _waterMod, 0.1) + filters * 3;
              metric = { val: days.toFixed(1), unit: "days", color: days >= 14 ? "#22c55e" : days >= 3 ? "#f59e0b" : "#ef4444" };
            } else if (k === "fuel") {
              const gasGals = ci.filter((i) => i.subType === "gasoline").reduce((s, i) => s + (i.quantity || 0) * (parseFloat(i.fields?.fuelGallons || i.fields?.gallons) || 5), 0);
              const propGals = ci.filter((i) => i.subType === "propane").reduce((s, i) => s + (i.quantity || 0), 0) * 4.6;
              const totalL = (gasGals + propGals) * 3.785;
              const genHrs = gasGals * 5.5;
              metric = { val: totalL > 0 ? totalL.toFixed(0) + "L" : "0L", unit: genHrs > 0 ? genHrs.toFixed(0) + "h gen" : "", color: genHrs >= 48 ? "#22c55e" : genHrs >= 12 ? "#f59e0b" : "#ef4444" };
            } else if (k === "firewood") {
              const cords = ci.reduce((s, i) => s + (parseFloat(i.fields?.cords) || 0) * (i.quantity || 1), 0);
              const days = (cords * 30) / Math.max(_firewoodMod, 0.1);
              metric = { val: days.toFixed(0), unit: "days heat", color: days >= 60 ? "#22c55e" : days >= 14 ? "#f59e0b" : "#ef4444" };
            } else if (k === "medical") {
              const coverage = filled / Math.max(total, 1);
              metric = { val: Math.round(coverage * 100), unit: "% covered", color: coverage >= 0.6 ? "#22c55e" : coverage >= 0.3 ? "#f59e0b" : "#ef4444" };
            } else if (k === "batteries") {
              const cells = ci.reduce((s, i) => s + (i.quantity || 0), 0);
              const hrs = cells * 20;
              metric = { val: cells, unit: cells + " cells · " + hrs + "h", color: cells >= 50 ? "#22c55e" : cells >= 20 ? "#f59e0b" : "#ef4444" };
            } else if (k === "electronics" || k === "comms") {
              const ch = new Set();
              ci.forEach((i) => { if (i.subType === "satPhone") ch.add("SAT"); if (i.subType === "cellPhone") ch.add("CELL"); if (i.subType === "radio") ch.add("HAM"); if (i.subType === "weatherRadio") ch.add("WX"); });
              if (k === "comms") ch.add("HAM");
              metric = { val: ch.size, unit: ch.size === 1 ? "channel" : "channels", color: ch.size >= 3 ? "#22c55e" : ch.size >= 2 ? "#f59e0b" : "#ef4444" };
            } else if (k === "vehicles") {
              const veh = ci.reduce((s, i) => s + (i.quantity || 0), 0);
              const overdue = ci.filter((i) => i.fields?.nextService && new Date(i.fields.nextService) < new Date()).length;
              metric = { val: veh, unit: overdue > 0 ? overdue + " need svc" : "ready", color: overdue === 0 && veh > 0 ? "#22c55e" : overdue > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "kids") {
              const diapers = ci.filter((i) => i.subType === "diapers").reduce((s, i) => s + (i.quantity || 0), 0);
              const formula = ci.filter((i) => i.subType === "formula").reduce((s, i) => s + (i.quantity || 0), 0);
              const days = Math.min(diapers / 8, formula * 3);
              metric = ci.length > 0 ? { val: days.toFixed(1), unit: "days", color: days >= 14 ? "#22c55e" : days >= 3 ? "#f59e0b" : "#ef4444" } : null;
            } else if (k === "firearms" || k === "defense") {
              const qty = ci.reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: qty, unit: qty > 0 ? (qty / p).toFixed(1) + "/person" : "none", color: qty >= p ? "#22c55e" : qty > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "nbc") {
              const masks = ci.filter((i) => i.subType === "gasMask").reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: Math.round(masks / Math.max(p, 1) * 100), unit: "% covered", color: masks >= p ? "#22c55e" : masks > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "alcohol") {
              const vol = ci.reduce((s, i) => s + parseVolMl(i.fields?.volume || i.fields?.alcVolume) * (i.quantity || 1), 0);
              metric = { val: (vol / 1000).toFixed(1), unit: "liters", color: ci.length >= 5 ? "#22c55e" : ci.length >= 2 ? "#f59e0b" : "#ef4444" };
            } else if (k === "fishing") {
              const rods = ci.filter((i) => i.subType === "rodReel").reduce((s, i) => s + (i.quantity || 0), 0);
              const nets = ci.filter((i) => i.subType === "net" || i.subType === "fishTrap").reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: rods + nets, unit: "sources", color: rods > 0 ? "#22c55e" : "#ef4444" };
            } else if (k === "boat") {
              const vessels = ci.filter((i) => i.subType === "vessel").reduce((s, i) => s + (i.quantity || 0), 0);
              const pfd = ci.filter((i) => i.subType === "lifeJacket").reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: vessels, unit: pfd >= p ? "PFDs ✓" : pfd + "/" + p + " PFDs", color: vessels > 0 && pfd >= p ? "#22c55e" : vessels > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "farm") {
              const seeds = ci.filter(i => i.subType === "seedPacket").reduce((s, i) => s + (i.quantity || 0), 0);
              const varieties = new Set(ci.filter(i => i.subType === "seedPacket").map(i => i.fields?.cropName)).size;
              const beds = ci.filter(i => i.subType === "raisedBed").reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: varieties, unit: seeds + " packs · " + beds + " beds", color: varieties >= 5 ? "#22c55e" : varieties >= 2 ? "#f59e0b" : "#ef4444" };
            } else if (k === "bugout") {
              const bags = ci.reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: bags, unit: bags >= p ? "ready" : bags + "/" + p + " packed", color: bags >= p ? "#22c55e" : bags > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "recreational") {
              const lighters = ci.filter((i) => i.subType === "lighters").reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: ci.reduce((s, i) => s + (i.quantity || 0), 0), unit: lighters > 0 ? lighters + " lighters" : "items", color: lighters >= 5 ? "#22c55e" : lighters > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "books") {
              metric = { val: ci.reduce((s, i) => s + (i.quantity || 0), 0), unit: "volumes", color: ci.length >= 8 ? "#22c55e" : ci.length >= 3 ? "#f59e0b" : "#ef4444" };
            } else if (k === "power") {
              const qty = ci.reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: qty, unit: "devices", color: qty > 0 ? "#22c55e" : "#ef4444" };
            } else if (k === "hygiene") {
              const qty = ci.reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: qty, unit: "items", color: qty >= 10 ? "#22c55e" : qty > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "clothing") {
              const qty = ci.reduce((s, i) => s + (i.quantity || 0), 0);
              const coverage = filled / Math.max(total, 1);
              metric = { val: qty, unit: Math.round(coverage * 100) + "% types", color: coverage >= 0.5 ? "#22c55e" : qty > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "pets") {
              const food = ci.filter(i => i.subType === "petFood").reduce((s, i) => s + (i.quantity || 0), 0);
              const qty = ci.reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: qty, unit: food > 0 ? food + " food bags" : "items", color: food >= 2 ? "#22c55e" : qty > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "lighting") {
              const lights = ci.filter(i => ["flashlight", "headlamp", "lantern"].includes(i.subType)).reduce((s, i) => s + (i.quantity || 0), 0);
              const candles = ci.filter(i => i.subType === "candle").reduce((s, i) => s + (i.quantity || 0), 0);
              const parts = [];
              if (lights > 0) parts.push(lights + " lights");
              if (candles > 0) parts.push(candles + " candles");
              metric = { val: lights + candles, unit: parts.join(" · ") || "items", color: lights >= 3 ? "#22c55e" : lights > 0 ? "#f59e0b" : "#ef4444" };
            } else if (k === "bullion") {
              let totalVal = 0;
              ci.forEach(i => { const { oz, metal } = bullionTroyOz(i); totalVal += oz * (SPOT_PRICES[metal] || 0); });
              const goldOz = ci.filter(i => bullionTroyOz(i).metal === "gold").reduce((s, i) => s + bullionTroyOz(i).oz, 0);
              const silverOz = ci.filter(i => bullionTroyOz(i).metal === "silver").reduce((s, i) => s + bullionTroyOz(i).oz, 0);
              const parts = [];
              if (goldOz > 0) parts.push(goldOz.toFixed(1) + " oz Au");
              if (silverOz > 0) parts.push(silverOz.toFixed(0) + " oz Ag");
              metric = { val: "$" + (totalVal >= 1000 ? (totalVal / 1000).toFixed(1) + "k" : totalVal.toFixed(0)), unit: parts.join(" · ") || "none", color: totalVal >= 10000 ? "#22c55e" : totalVal >= 1000 ? "#f59e0b" : "#ef4444" };
            } else if (k === "shelter" || k === "tools" || k === "equipment") {
              const qty = ci.reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: qty, unit: "items", color: qty > 0 ? "#22c55e" : "rgba(36,61,48,0.15)" };
            }

            const statusColor = metric ? metric.color : (filled / total >= 0.6 ? "#22c55e" : filled / total >= 0.3 ? "#f59e0b" : "#ef4444");
            return (
              <button key={k} onClick={() => setSelCat(k)} style={{ ...cardSt, padding: 14, cursor: "pointer", textAlign: "left", borderLeft: "3px solid " + statusColor, minWidth: 0, overflow: "hidden" }} onMouseOver={(e) => { e.currentTarget.style.background = "rgba(36,61,48,0.04)"; }} onMouseOut={(e) => { e.currentTarget.style.background = "rgba(36,61,48,0.02)"; }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                  <div style={{ fontSize: 22, marginBottom: 3, flexShrink: 0 }}>{cat.icon}</div>
                  {metric && (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, fontFamily: M, color: metric.color, lineHeight: 1 }}>{metric.val}</div>
                      <div style={{ fontSize: 11, color: metric.color, opacity: 0.7, whiteSpace: "nowrap" }}>{metric.unit}</div>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.label}</div>
                <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", fontFamily: M }}>{ci.length} items · {filled}/{total}</div>
                <div style={{ height: 3, background: "rgba(47,76,39,0.06)", borderRadius: 2, marginTop: 5 }}><div style={{ height: "100%", width: (filled / total) * 100 + "%", background: statusColor, borderRadius: 2, transition: "width 0.3s ease" }} /></div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── AuthPanel — Moved outside PropertyTab to prevent re-mount on each render ── */
function PropertyTab({ propSub, setPropSub, propAddress, setPropAddress, pins, setPins, routes, setRoutes, mapSetups, setMapSetups, properties, activePropertyId, amenities, user, items, onSetup, members, demoData, onOpenPropertyMap }) {
  const [nestAuth, setNestAuth] = useState({ email: "", password: "", connected: false, showPw: false, error: "", loading: false });
  const [liveNestDevices, setLiveNestDevices] = useState(null);
  const [trapStatus, setTrapStatus] = useState(() => { try { return JSON.parse(localStorage.getItem("prepvault-trap-status") || "{}"); } catch { return {}; } });
  useEffect(() => { try { localStorage.setItem("prepvault-trap-status", JSON.stringify(trapStatus)); } catch {} }, [trapStatus]);

  const handleAuth = async (setter, state) => {
    if (!state.email || !state.password) { setter(p => ({ ...p, error: "Enter email and password" })); return; }
    setter(p => ({ ...p, loading: true, error: "" }));
    try {
      if (user && user.authProvider !== "neon" && supabaseConfigured) {
        const session = await supabase.auth.getSession();
        const token = session?.data?.session?.access_token;
        if (token) {
          const apiBase = import.meta.env.VITE_API_URL || "";
          const res = await fetch(`${apiBase}/api/smart-home/nest/auth`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ email: state.email, password: state.password }) });
          if (res.ok) {
            setter(p => ({ ...p, password: "", loading: false, connected: true, error: "" }));
            const devices = await fetch(`${apiBase}/api/smart-home/nest/devices`, { headers: { Authorization: `Bearer ${token}` } });
            if (devices.ok) { const data = await devices.json(); setLiveNestDevices(data.devices); }
            return;
          }
          const data = await res.json().catch(() => ({}));
          setter(p => ({ ...p, password: "", loading: false, error: data.error || "Connection failed" }));
          return;
        }
      }
      setter(p => ({ ...p, password: "", loading: false, connected: false, error: "Sign in to a cloud account to connect this service." }));
    } catch {
      setter(p => ({ ...p, password: "", loading: false, connected: false, error: "Could not connect. Check your connection and try again." }));
    }
  };
  const handleDisconnect = setter => { setter({ email: "", password: "", connected: false, showPw: false, error: "", loading: false }); setLiveNestDevices(null); };
  const displayNestDevices = liveNestDevices || SMART_HOME.nest.devices;


  const primaryId = properties.some(property => property.id === "prop1") ? "prop1" : properties[0]?.id;
  const selectedPins = activePropertyId === "all" ? properties.flatMap(property => mapSetups[property.id]?.pins || (property.id === primaryId ? pins : [])) : mapSetups[activePropertyId]?.pins || (activePropertyId === primaryId ? pins : []);
  const positionRecords = getDefensePositions({ properties, mapSetups, legacyPins: pins, activePropertyId });
  const saveAssignment = (record, patch) => {
    if (Array.isArray(mapSetups[record.propertyId]?.pins)) {
      setMapSetups(previous => ({ ...previous, [record.propertyId]: { ...previous[record.propertyId], pins: patchPositionAssignment(previous[record.propertyId]?.pins || [], record.pin.id, patch) } }));
    } else if (record.propertyId === primaryId) setPins(previous => patchPositionAssignment(previous, record.pin.id, patch));
  };
  const openPropertyMap = propertyId => {
    if (propertyId) onOpenPropertyMap(propertyId);
    setPropSub("map");
  };
  return <PropertyView propSub={propSub} setPropSub={setPropSub} items={items} pins={selectedPins} defenseTypes={CATEGORIES.defense.subTypes} defensePinTypes={MAP_PIN_TYPES.defense} positionRecords={positionRecords} members={members} sampleRoles={demoData ? DEFENSE_ROLES : []} showProperties={activePropertyId === "all"} onSaveAssignment={saveAssignment} onOpenPropertyMap={openPropertyMap} trapStatus={trapStatus} setTrapStatus={setTrapStatus} onSetup={onSetup}
    map={<PropertyMapWorkspace pins={pins} propAddress={propAddress} setPropAddress={setPropAddress} mapSetups={mapSetups} setMapSetups={setMapSetups} routes={routes} setRoutes={setRoutes} properties={properties} activePropertyId={activePropertyId} layers={MAP_LAYERS} pinTypes={MAP_PIN_TYPES} defenseRoles={demoData ? DEFENSE_ROLES : []} />}
    systems={<div>
          {/* Nest / Google Home Auth */}
          <AuthPanel title="Nest / Google Home Login" icon="🏠" color="#06b6d4" auth={nestAuth} setAuth={setNestAuth} provider="Google Nest" providerId="nest" onAuth={handleAuth} onDisconnect={handleDisconnect} />
          {nestAuth.connected ? (
            <div style={{ ...cardSt, borderLeft: "3px solid #06b6d4" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 22 }}>🏠</span>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Nest Devices</div>
                <span style={{ fontSize: 11, padding: "4px 8px", borderRadius: 8, background: "rgba(6,182,212,0.1)", color: "#06b6d4", fontWeight: 700 }}>{displayNestDevices.length} devices</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                {displayNestDevices.map((d, i) => (
                  <div key={i} style={{ padding: "12px 14px", background: "rgba(47,76,39,0.02)", borderRadius: 8, borderLeft: d.type === "lock" ? (d.status === "Locked" ? "3px solid #22c55e" : "3px solid #f59e0b") : "3px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                      {d.type === "lock" ? "🔐" : d.type === "smoke" ? "🔥" : "🌡️"} {d.n}
                    </div>
                    {d.type === "lock" ? (
                      <div>
                        <div style={{ fontSize: 11, color: d.status === "Locked" ? "#22c55e" : "#f59e0b", fontWeight: 600 }}>
                          {d.status === "Locked" ? "✓ Locked" : "⚠ Unlocked"} · 🔋 {d.bat}
                        </div>
                        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                          <button style={{ ...btnSt, padding: "5px 10px", fontSize: 11, background: d.status === "Locked" ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)", color: d.status === "Locked" ? "#ef4444" : "#22c55e", border: "1px solid " + (d.status === "Locked" ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)") }}>
                            {d.status === "Locked" ? "Unlock" : "Lock"}
                          </button>
                        </div>
                      </div>
                    ) : d.type === "smoke" ? (
                      <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)" }}>✓ OK · 🔋 {d.bat} · CO: {d.co}</div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 24, fontWeight: 800, fontFamily: M }}>{d.temp}</div>
                        <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)" }}>Set: {d.set} · {d.hum} · {d.mode}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ ...cardSt, padding: "30px 20px", textAlign: "center", borderStyle: "dashed" }}>
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>🏠</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(36,61,48,0.58)" }}>Connect Google Nest to view locks, thermostats, and smoke detectors</div>
            </div>
          )}
        </div>} />;
}

function CommunityTab({ user, contacts, setContacts, onSignIn }) {
  const [comSub, setComSub] = useState("people");
  const subTabs = [{ id: "people", label: "People" }, { id: "tracker", label: "Tracker" }];
  return (
    <div>
      <nav className="pv-people-sections" aria-label="People sections">
        {subTabs.map(section => (
          <button key={section.id} className={comSub === section.id ? "is-active" : ""} aria-current={comSub === section.id ? "page" : undefined} onClick={() => setComSub(section.id)}>{section.label}</button>
        ))}
      </nav>
      {comSub === "tracker" && <LiveTracker key={user?.id || "visitor"} user={user} contacts={contacts} onSignIn={onSignIn} />}
      {comSub === "people" && <PeopleDirectory contacts={contacts} setContacts={setContacts} />}
    </div>
  );
}

/* ── Rally Point Large Map (for modal) ── */
function OpportunitiesTab({ items: allItems, people, climate, gardenBeds, dismissedOpps, setDismissedOpps, propertyProfile }) {
  // Presence and coverage describe available stock, not empty inventory rows.
  const items = useMemo(() => allItems.filter(item => Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0).map(item => ({ ...item, quantity: Number(item.quantity) })), [allItems]);
  /* ── Continuity Metrics ── */
  const cont = useMemo(() => {
    const clim = CLIMATES[climate] || CLIMATES.temperate;
    const waterMod = clim.waterMod || 1;
    const firewoodMod = clim.firewoodMod || 1;
    const p = people || 1;
    const pools = computeResourcePools(items, p, clim);
    const fuelGals = items.filter(i => i.category === "fuel" && (i.subType === "gasoline" || i.subType === "diesel")).reduce((s, i) => s + i.quantity, 0);
    const propaneTanks = items.filter(i => i.category === "fuel" && i.subType === "propane").reduce((s, i) => s + (i.quantity || 0), 0);
    const batteries = items.filter(i => i.category === "batteries").reduce((s, i) => s + (i.quantity || 0), 0);
    const solarPanels = items.filter(i => (i.category === "power" && i.subType === "solarPanel") || (i.category === "electronics" && i.subType === "solarDevice")).reduce((s, i) => s + (i.quantity || 0), 0);
    const powerHrs = fuelGals * 5.5 + batteries * 0.3 + solarPanels * 5;
    const waterStored = pools.waterGals;
    const waterFilters = items.filter(i => i.category === "water" && (i.subType === "purificationDevice" || i.subType === "purificationTablets")).reduce((s, i) => s + (i.quantity || 0), 0);
    const dailyWater = p * 1.0 * waterMod;
    const waterDays = (waterStored / Math.max(dailyWater, 0.1)) + (waterFilters * 3);
    const firewoodCords = pools.firewoodCords;
    const propaneHeatDays = (propaneTanks * 4.6 * 91452 / 18000) / 12;
    const firewoodDays = firewoodCords * 30;
    const heatDays = firewoodMod > 1 ? (firewoodDays + propaneHeatDays) / firewoodMod : firewoodDays + propaneHeatDays + 30;
    const totalCals = pools.totalCals;
    const calDays = totalCals / Math.max(p * 2000, 1);
    const commCh = new Set();
    items.filter(i => i.category === "electronics").forEach(i => {
      if (i.subType === "satPhone") commCh.add("Satellite");
      if (i.subType === "cellPhone") commCh.add("Cellular");
      if (i.subType === "radio") commCh.add("HAM/GMRS");
      if (i.subType === "weatherRadio") commCh.add("Weather Band");
    });
    items.filter(i => i.category === "comms").forEach(() => commCh.add("HAM/GMRS"));
    // Fragility analysis
    const frag = [];
    const fuelSrc = new Set();
    if (propaneTanks > 0) fuelSrc.add("propane");
    if (fuelGals > 0) fuelSrc.add("gasoline");
    if (fuelSrc.size <= 1 && climate === "cold") frag.push({ icon: "🔥", msg: "Heat continuity depends on " + (fuelSrc.size === 0 ? "no fuel source" : "one fuel source") + ".", sev: fuelSrc.size === 0 ? "critical" : "warning" });
    if (waterFilters < 2) frag.push({ icon: "💧", msg: "Water purification lacks redundancy.", sev: waterFilters === 0 ? "critical" : "warning" });
    if (solarPanels > 0 && batteries < 10) frag.push({ icon: "🔋", msg: "Battery backup is weather-dependent.", sev: "warning" });
    if (commCh.size < 2) frag.push({ icon: "📡", msg: commCh.size === 0 ? "No communication backup exists." : "Single communication channel — no redundancy.", sev: commCh.size === 0 ? "critical" : "warning" });
    if (calDays < 7) frag.push({ icon: "🍽️", msg: `Caloric reserve below 7 days (${calDays.toFixed(1)}d).`, sev: "critical" });
    if (powerHrs < 24) frag.push({ icon: "⚡", msg: "Power autonomy under 24 hours.", sev: "warning" });
    if (propertyProfile?.completedAt) {
      const toArr = v => Array.isArray(v) ? v : v ? [v] : [];
      const pWater = toArr(propertyProfile.waterSource);
      const pFresh = toArr(propertyProfile.freshwaterAccess);
      const pPower = toArr(propertyProfile.powerSource);
      if (propertyProfile.populationDensity === "urban") frag.push({ icon: "🏙️", msg: "Urban location — high population risk in prolonged scenarios.", sev: "warning" });
      if (pWater.length === 1 && pWater[0] === "municipal" && (pFresh.length === 0 || (pFresh.length === 1 && pFresh[0] === "none"))) frag.push({ icon: "🚱", msg: "Municipal water with no natural backup — vulnerable to infrastructure failure.", sev: "warning" });
      if (propertyProfile.gridStatus === "on_grid" && !propertyProfile.hasGenerator) frag.push({ icon: "🔌", msg: "Grid-dependent with no backup generator.", sev: "warning" });
      if (propertyProfile.geoRisks?.length >= 3) frag.push({ icon: "⚠️", msg: `Multiple geographic risks identified (${propertyProfile.geoRisks.length}).`, sev: "warning" });
      if (propertyProfile.specialNeeds?.length > 0) frag.push({ icon: "🩺", msg: "Household includes vulnerable members — plan for extended care needs.", sev: "info" });
    }
    return { powerHrs, waterDays, heatDays, calDays, commCount: commCh.size, commChannels: [...commCh], frag };
  }, [items, people, climate, propertyProfile]);

  /* ── Preparedness Score ── */
  const prepScore = useMemo(() => {
    let s = 0;
    s += Math.min(cont.waterDays / 14, 1) * 25;
    s += Math.min(cont.calDays / 30, 1) * 25;
    s += Math.min(cont.powerHrs / 72, 1) * 15;
    s += Math.min(cont.heatDays / 30, 1) * 15;
    s += Math.min(cont.commCount / 3, 1) * 10;
    const cats = new Set(items.map(i => i.category)).size;
    s += Math.min(cats / Object.keys(CATEGORIES).length, 1) * 10;
    return Math.round(s);
  }, [cont, items]);

  /* ── Score simulation helper — replicates prepScore formula ── */
  const computeScore = (metrics, itemList) => {
    let s = 0;
    s += Math.min(metrics.waterDays / 14, 1) * 25;
    s += Math.min(metrics.calDays / 30, 1) * 25;
    s += Math.min(metrics.powerHrs / 72, 1) * 15;
    s += Math.min(metrics.heatDays / 30, 1) * 15;
    s += Math.min(metrics.commCount / 3, 1) * 10;
    const cats = new Set(itemList.map(i => i.category)).size;
    s += Math.min(cats / Object.keys(CATEGORIES).length, 1) * 10;
    return Math.round(s);
  };

  /* ── Opportunity Engine ── */
  const opportunities = useMemo(() => {
    const opps = [];
    const scoreNow = prepScore;
    const p = people || 1;
    const catsWithItems = new Set(items.map(i => i.category));
    const climateMeta = CLIMATES[climate] || CLIMATES.temperate;

    // Helper: simulate score with modified metrics
    const simScore = (overrides, extraCats) => {
      const m = { ...cont, ...overrides };
      // For coverage simulation, create a fake item list
      let fakeItems = [...items];
      if (extraCats) extraCats.forEach(c => { if (!catsWithItems.has(c)) fakeItems.push({ category: c }); });
      return computeScore(m, fakeItems);
    };

    const priorityFor = (gain) => gain >= 5 ? "critical" : gain >= 3 ? "high" : gain >= 1 ? "medium" : "low";
    const prioColor = (pr) => pr === "critical" ? "#ef4444" : pr === "high" ? "#f97316" : pr === "medium" ? "#eab308" : "#84cc16";

    // ─── WATER OPPORTUNITIES ───
    if (cont.waterDays < 14) {
      const after = simScore({ waterDays: 14 });
      const gain = after - scoreNow;
      if (gain > 0) opps.push({ id: "water-storage", icon: "💧", title: "Increase Water Storage", desc: `You have ${cont.waterDays.toFixed(1)} days of water. Target is 14 days for ${p} ${p === 1 ? "person" : "people"} (${(p * 14).toFixed(0)} gallons).`, action: `Store ${Math.ceil((14 - cont.waterDays) * p)} more gallons of water in food-grade containers.`, category: "water", priority: priorityFor(gain), scoreNow, scoreAfter: after, pointsGain: gain, prioColor: prioColor(priorityFor(gain)) });
    }

    const purDevices = items.filter(i => i.category === "water" && (i.subType === "purificationDevice" || i.subType === "purificationTablets")).length;
    if (purDevices === 0) {
      const after = simScore({ waterDays: cont.waterDays + 6 });
      const gain = after - scoreNow;
      if (gain > 0) opps.push({ id: "water-purification", icon: "🔬", title: "Add Water Purification", desc: "No water purification capability. Stored water eventually runs out — purification extends supply indefinitely.", action: "Add a gravity-fed water filter (e.g. Berkey) and purification tablets as backup.", category: "water", priority: priorityFor(gain), scoreNow, scoreAfter: after, pointsGain: gain, prioColor: prioColor(priorityFor(gain)) });
    }

    const waterTypes = new Set();
    items.filter(i => i.category === "water").forEach(i => waterTypes.add(i.subType));
    if (waterTypes.size < 2 && cont.waterDays < 14) {
      const after = simScore({ waterDays: Math.min(cont.waterDays + 5, 14) });
      const gain = after - scoreNow;
      if (gain > 0) opps.push({ id: "water-diversity", icon: "🌧️", title: "Diversify Water Sources", desc: `Only ${waterTypes.size} water source type${waterTypes.size === 1 ? "" : "s"}. Add rainwater collection, a well, or natural spring access for redundancy.`, action: "Install a rainwater collection system or identify a nearby natural water source.", category: "water", priority: priorityFor(gain), scoreNow, scoreAfter: after, pointsGain: gain, prioColor: prioColor(priorityFor(gain)) });
    }

    // ─── FOOD OPPORTUNITIES ───
    if (cont.calDays < 30) {
      const after = simScore({ calDays: 30 });
      const gain = after - scoreNow;
      if (gain > 0) opps.push({ id: "food-storage", icon: "🥫", title: "Build Food Reserves", desc: `${cont.calDays.toFixed(1)} days of calories stored. Target is 30 days at 2,000 cal/person/day (${(p * 30 * 2000).toLocaleString()} total calories).`, action: "Stock freeze-dried meals, rice, beans, and canned goods. Focus on calorie-dense, long-shelf items.", category: "food", priority: priorityFor(gain), scoreNow, scoreAfter: after, pointsGain: gain, prioColor: prioColor(priorityFor(gain)) });
    }

    if (gardenBeds.length === 0 && !catsWithItems.has("farm")) {
      const after = simScore({ calDays: cont.calDays + 5 }, ["farm"]);
      const gain = after - scoreNow;
      if (gain > 0) opps.push({ id: "food-garden", icon: "🌱", title: "Start a Garden", desc: "No garden beds set up. Growing food provides a renewable calorie source and adds category coverage.", action: "Set up raised beds with high-yield crops: potatoes, beans, tomatoes, squash.", category: "food", priority: priorityFor(gain), scoreNow, scoreAfter: after, pointsGain: gain, prioColor: prioColor(priorityFor(gain)) });
    }

    if (gardenBeds.length > 0) {
      const cropTypes = new Set();
      gardenBeds.forEach(b => (b.plants || []).forEach(pl => cropTypes.add(pl.crop)));
      if (cropTypes.size > 0 && cropTypes.size < 5) {
        opps.push({ id: "farm-expansion", icon: "🌾", title: "Diversify Crop Types", desc: `Only ${cropTypes.size} crop type${cropTypes.size === 1 ? "" : "s"} planted. More variety improves nutritional balance and reduces crop failure risk.`, action: "Add root vegetables (potatoes, carrots), legumes (beans, peas), and greens (lettuce, kale).", category: "food", priority: "low", scoreNow, scoreAfter: scoreNow + 1, pointsGain: 1, prioColor: prioColor("low") });
      }
    }

    // ─── POWER OPPORTUNITIES ───
    if (cont.powerHrs < 72) {
      const after = simScore({ powerHrs: 72 });
      const gain = after - scoreNow;
      if (gain > 0) opps.push({ id: "power-generator", icon: "⚡", title: "Extend Power Backup", desc: `${cont.powerHrs.toFixed(1)} hours of power autonomy. Target is 72 hours to sustain critical systems.`, action: "Add a generator with stored fuel, or increase fuel reserves for existing generator.", category: "power", priority: priorityFor(gain), scoreNow, scoreAfter: after, pointsGain: gain, prioColor: prioColor(priorityFor(gain)) });
    }

    const solarPanels = items.filter(i => (i.category === "power" && i.subType === "solarPanel") || (i.category === "electronics" && i.subType === "solarDevice")).length;
    if (solarPanels === 0 && cont.powerHrs < 72) {
      const after = simScore({ powerHrs: Math.min(cont.powerHrs + 40, 72) });
      const gain = after - scoreNow;
      if (gain > 0) opps.push({ id: "power-solar", icon: "☀️", title: "Add Solar Power", desc: "No solar panels. Solar provides renewable, silent power generation that doesn't depend on fuel supply.", action: "Install a portable solar panel system (100W+) with charge controller and battery bank.", category: "power", priority: priorityFor(gain), scoreNow, scoreAfter: after, pointsGain: gain, prioColor: prioColor(priorityFor(gain)) });
    }

    const batteryCount = items.filter(i => i.category === "batteries").reduce((s, i) => s + (i.quantity || 0), 0);
    if (solarPanels > 0 && batteryCount < 10) {
      const extraHrs = (10 - batteryCount) * 0.3;
      const after = simScore({ powerHrs: Math.min(cont.powerHrs + extraHrs, 72) });
      const gain = after - scoreNow;
      if (gain > 0) opps.push({ id: "power-batteries", icon: "🔋", title: "Increase Battery Storage", desc: `Only ${batteryCount} batteries with solar panels. Batteries store solar energy for nighttime and cloudy days.`, action: "Stock rechargeable 18650 and AA batteries with a solar-compatible charger.", category: "power", priority: priorityFor(gain), scoreNow, scoreAfter: after, pointsGain: gain, prioColor: prioColor(priorityFor(gain)) });
    }

    // ─── HEAT OPPORTUNITIES ───
    const needsHeat = climateMeta.firewoodMod >= 0.5;
    if (needsHeat && cont.heatDays < 30) {
      const after = simScore({ heatDays: 30 });
      const gain = after - scoreNow;
      if (gain > 0) opps.push({ id: "heat-firewood", icon: "🪵", title: "Stock Heating Fuel", desc: `${cont.heatDays.toFixed(1)} days of heating. Target is 30 days. ${climate === "arctic" || climate === "cold" ? "Critical in your climate zone." : "Important for winter resilience."}`, action: climate === "cold" || climate === "arctic" ? "Stack 2+ cords of seasoned firewood and store propane as backup." : "Stock firewood or propane to cover 30 cold days.", category: "heat", priority: priorityFor(gain), scoreNow, scoreAfter: after, pointsGain: gain, prioColor: prioColor(priorityFor(gain)) });
    }

    const heatSources = new Set();
    const firewoodCords = items.filter(i => i.category === "firewood").reduce((s, i) => s + (parseFloat(i.fields?.cords) || 0) * (i.quantity || 1), 0);
    const propaneTanks = items.filter(i => i.category === "fuel" && i.subType === "propane").reduce((s, i) => s + (i.quantity || 0), 0);
    if (firewoodCords > 0) heatSources.add("wood");
    if (propaneTanks > 0) heatSources.add("propane");
    if (needsHeat && heatSources.size === 1) {
      const addDays = heatSources.has("wood") ? propaneTanks === 0 ? 10 : 0 : 15;
      const after = simScore({ heatDays: Math.min(cont.heatDays + addDays, 30) });
      const gain = after - scoreNow;
      if (gain > 0) opps.push({ id: "heat-diversity", icon: "🔥", title: "Diversify Heat Sources", desc: `Only ${[...heatSources][0]} for heating. A single fuel source is a critical vulnerability.`, action: heatSources.has("wood") ? "Add propane tanks and a propane heater as backup heat." : "Stock seasoned firewood and ensure you have a wood stove or fireplace.", category: "heat", priority: priorityFor(gain), scoreNow, scoreAfter: after, pointsGain: gain, prioColor: prioColor(priorityFor(gain)) });
    }

    // ─── COMMS OPPORTUNITIES ───
    if (cont.commCount < 3) {
      const after = simScore({ commCount: 3 });
      const gain = after - scoreNow;
      const missing = [];
      if (!cont.commChannels.includes("HAM/GMRS")) missing.push("HAM/GMRS radio");
      if (!cont.commChannels.includes("Satellite")) missing.push("satellite phone");
      if (!cont.commChannels.includes("Weather Band")) missing.push("NOAA weather radio");
      if (!cont.commChannels.includes("Cellular")) missing.push("cell phone");
      if (gain > 0) opps.push({ id: "comms-channels", icon: "📡", title: "Add Communication Channels", desc: `${cont.commCount} of 3 required channels. Multiple independent channels ensure contact when infrastructure fails.`, action: `Add: ${missing.slice(0, 3 - cont.commCount).join(", ")}.`, category: "comms", priority: priorityFor(gain), scoreNow, scoreAfter: after, pointsGain: gain, prioColor: prioColor(priorityFor(gain)) });
    }

    if (!cont.commChannels.includes("Weather Band")) {
      const after = simScore({ commCount: Math.min(cont.commCount + 1, 3) });
      const gain = after - scoreNow;
      if (gain > 0 && cont.commCount < 3) opps.push({ id: "comms-weather", icon: "🌤️", title: "Add Weather Radio", desc: "No NOAA weather radio. Weather alerts provide early warning for severe weather events.", action: "Get a hand-crank NOAA weather radio with battery backup.", category: "comms", priority: priorityFor(gain), scoreNow, scoreAfter: after, pointsGain: gain, prioColor: prioColor(priorityFor(gain)) });
    }

    // ─── CATEGORY COVERAGE OPPORTUNITIES ───
    const allCatKeys = Object.keys(CATEGORIES);
    const missedCats = allCatKeys.filter(c => !catsWithItems.has(c));

    if (!catsWithItems.has("medical")) {
      const after = simScore({}, ["medical"]);
      const gain = after - scoreNow;
      if (gain > 0) opps.push({ id: "medical-kit", icon: "💊", title: "Build Medical Supplies", desc: "No medical supplies inventoried. Medical emergencies are the most common crisis, regardless of scenario.", action: "Start with a comprehensive first aid kit, trauma kit (tourniquet, hemostatic gauze), and prescription reserves.", category: "medical", priority: priorityFor(gain), scoreNow, scoreAfter: after, pointsGain: gain, prioColor: prioColor(priorityFor(gain)) });
    }

    if (!catsWithItems.has("defense")) {
      const after = simScore({}, ["defense"]);
      const gain = after - scoreNow;
      if (gain > 0) opps.push({ id: "security-defense", icon: "🛡️", title: "Add Perimeter Security", desc: "No defense items inventoried. Physical security deters threats and provides early warning.", action: "Install motion-sensor lights, trail cameras, and trip-wire alarms at entry points.", category: "defense", priority: priorityFor(gain), scoreNow, scoreAfter: after, pointsGain: gain, prioColor: prioColor(priorityFor(gain)) });
    }

    if (!catsWithItems.has("bugout")) {
      const after = simScore({}, ["bugout"]);
      const gain = after - scoreNow;
      if (gain > 0) opps.push({ id: "bugout-bags", icon: "🎒", title: "Build Bug-Out Bags", desc: "No bug-out bags prepared. In evacuation scenarios, a pre-packed bag saves critical minutes.", action: `Build ${p} bag${p > 1 ? "s" : ""} with 72h of water, food, first aid, fire kit, shelter, documents, and cash.`, category: "bugout", priority: priorityFor(gain), scoreNow, scoreAfter: after, pointsGain: gain, prioColor: prioColor(priorityFor(gain)) });
    }

    // General coverage gaps (batch remaining empty categories)
    const importantGaps = missedCats.filter(c => !["medical", "defense", "bugout", "farm"].includes(c));
    if (importantGaps.length >= 3) {
      const after = simScore({}, importantGaps.slice(0, 3));
      const gain = after - scoreNow;
      if (gain > 0) opps.push({ id: "coverage-gaps", icon: "📊", title: "Fill Category Gaps", desc: `${missedCats.length} of ${allCatKeys.length} categories empty. Each new category adds ~${(10 / allCatKeys.length).toFixed(1)} points to your coverage score.`, action: `Start with: ${importantGaps.slice(0, 3).map(c => CATEGORIES[c]?.label || c).join(", ")}.`, category: "coverage", priority: priorityFor(gain), scoreNow, scoreAfter: after, pointsGain: gain, prioColor: prioColor(priorityFor(gain)) });
    }

    // Sort by pointsGain descending
    opps.sort((a, b) => b.pointsGain - a.pointsGain);
    return opps;
  }, [items, people, climate, cont, prepScore, gardenBeds]);

  return <ResourceOpportunitiesView opportunities={opportunities} dismissedOpps={dismissedOpps} setDismissedOpps={setDismissedOpps} fragility={cont.frag || []} prepScore={prepScore} />;
}

/* ═══════════════════════════════════════════ */
/* ═══ FARMING TAB ═══                       */
/* ═══════════════════════════════════════════ */
const SUPPLY_CATEGORIES = Object.fromEntries(Object.entries(CATEGORIES).filter(([key]) => !["food", "water"].includes(key)));

const PV_STORAGE_KEY = "prepvault-db";
function loadSaved() {
  try {
    const raw = localStorage.getItem(PV_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.items)) return validateSnapshot(data);
    return null;
  } catch { return null; }
}

const INVALID_WORKSPACE_OWNER = Symbol("invalid-workspace-owner");
function safeWorkspaceOwner() {
  try { return readWorkspaceOwner(localStorage); } catch { return INVALID_WORKSPACE_OWNER; }
}

function emptyPlan() {
  return { version: 4, items: [], people: 1, climate: "cold", pins: [], propAddress: "", mapSetups: {}, routes: [],
    properties: DEFAULT_PROPERTIES.slice(0, 1).map(property => ({ ...property })), activePropertyId: "prop1", members: [], contacts: [],
    callSigns: [], codeWords: [], rallyPoints: [], codes: [], gardenBeds: [], actionLog: [], soilTests: [], compostBins: [],
    livestock: [], slaughterLog: [], bugOutEntries: [], propertyProfile: { ...DEFAULT_PROPERTY_PROFILE }, demoData: false, localSettings: {} };
}

export default function PrepVault() {
  const saved = useRef(loadSaved());
  const [items, setItems] = useState(() => saved.current?.items || validateSnapshot({items: SAMPLE_ITEMS.map(i => ({ ...i, propertyId: "prop1" }))}).items);
  const [people, setPeople] = useState(() => saved.current?.people ?? 4);
  const [dailyCalTarget, setDailyCalTarget] = useState(2000);
  const [climate, setClimate] = useState(() => saved.current?.climate || "cold");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [inventorySearch, setInventorySearch] = useState({ query: "", status: "all", key: 0 });
  const [demoData, setDemoData] = useState(() => saved.current?.demoData ?? !saved.current);
  const [showDetailedDashboard, setShowDetailedDashboard] = useState(false);
  const [showDetailedInventory, setShowDetailedInventory] = useState(false);
  const navigate = (tab) => { setSelCat(null); setActiveTab(tab); if (["preps", "inventory-search"].includes(tab)) setInventorySearch(previous => ({ query: "", status: "all", key: previous.key + 1 })); };
  const openCategory = (category) => { if (category === "property" || category === "codes") navigate("codes"); else if (["food", "water"].includes(category)) navigate(category); else if (Object.hasOwn(CATEGORIES, category)) { navigate("preps"); setSelCat(category); } else navigate("preps"); };
  const openSetup = () => { setShowQuickStart(true); setQsStep(0); };
  const enterWorkspace = () => { setShowLanding(false); localStorage.setItem("prepvault-workspace-open", "1"); };
  const resetToOwnPlan = () => {
    setItems([]); setPins([]); setMapSetups({}); setRoutes([]); setMembers([]); setContacts([]);
    setCodes([]); setCallSigns([]); setCodeWords([]); setRallyPoints([]); setGardenBeds([]);
    setSoilTests([]); setCompostBins([]); setLivestock([]); setSlaughterLog([]); setActionLog([]);
    setBugOutEntries([]); setDemoData(false); setDailyCalTarget(2000);
    setPeople(1); setPropAddress(""); setPropertyProfile({ ...DEFAULT_PROPERTY_PROFILE });
    setProperties(DEFAULT_PROPERTIES.slice(0, 1)); setActivePropertyId("prop1"); navigate("dashboard");
  };
  const startPlan = () => {
    enterWorkspace();
    if (demoData) setShowStartPlan(true); else openSetup();
  };
  const [selCat, setSelCat] = useState(null);
  const [properties, setProperties] = useState(() => saved.current?.properties || DEFAULT_PROPERTIES);
  const [activePropertyId, setActivePropertyId] = useState(() => saved.current?.activePropertyId || "prop1");
  const [showAddProp, setShowAddProp] = useState(false);
  const [newPropName, setNewPropName] = useState("");
  const [newPropType, setNewPropType] = useState("cabin");
  const [showSiteMenu, setShowSiteMenu] = useState(false);
  const [crisisMode, setCrisisMode] = useState(false);
  const [crisisStart, setCrisisStart] = useState(null);
  const [crisisType, setCrisisType] = useState(null);
  const [showCrisisSelector, setShowCrisisSelector] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addCat, setAddCat] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [selScen, setSelScen] = useState("economic");
  const [simDuration, setSimDuration] = useState(180);
  const [propSub, setPropSub] = useState("map");
  const [propAddress, setPropAddress] = useState(() => saved.current?.propAddress || "");
  const [pins, setPins] = useState(() => saved.current?.pins || SAMPLE_MAP_PINS);
  const [mapSetups, setMapSetups] = useState(() => saved.current?.mapSetups || {});
  const [members, setMembers] = useState(() => saved.current?.members || SAMPLE_MEMBERS);
  const [contacts, setContacts] = useState(() => saved.current?.contacts || SAMPLE_CONTACTS);
  const rationPeople = useMemo(() => buildFoodWaterRoster(contacts), [contacts]);
  const [callSigns, setCallSigns] = useState(() => saved.current?.callSigns || COMMS_PLAN.callSigns);
  const [codeWords, setCodeWords] = useState(() => saved.current?.codeWords || COMMS_PLAN.codeWords);
  const [rallyPoints, setRallyPoints] = useState(() => saved.current?.rallyPoints || COMMS_PLAN.rallyPoints);
  const [codes, setCodes] = useState(() => saved.current?.codes || SAMPLE_CODES);
  const [gardenBeds, setGardenBeds] = useState(() => saved.current?.gardenBeds || []);
  const [soilTests, setSoilTests] = useState(() => saved.current?.soilTests || []);
  const [compostBins, setCompostBins] = useState(() => saved.current?.compostBins || []);
  const [livestock, setLivestock] = useState(() => saved.current?.livestock || []);
  const [slaughterLog, setSlaughterLog] = useState(() => saved.current?.slaughterLog || []);
  const [bugOutEntries, setBugOutEntries] = useState(() => saved.current?.bugOutEntries || []);
  const [upgradeNotices, setUpgradeNotices] = useState([]);
  const [showStartPlan, setShowStartPlan] = useState(false);
  const [actionLog, setActionLog] = useState(() => saved.current?.actionLog || []);
  const [manuals] = useState(SAMPLE_MANUALS);
  const [routes, setRoutes] = useState(() => saved.current?.routes || []);
  const [amenities] = useState(SAMPLE_AMENITIES);
  const [revealedCodes, setRevealedCodes] = useState({});
  const [showScanner, setShowScanner] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [alertsDismissedUntil, setAlertsDismissedUntil] = useState(() => {
    try { const s = localStorage.getItem("prepvault-alerts-dismissed-until"); if (s && parseInt(s, 10) > Date.now()) return parseInt(s, 10); } catch {} return null;
  });
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showLanding, setShowLanding] = useState(() => !localStorage.getItem("prepvault-active-session") && !localStorage.getItem("prepvault-workspace-open"));
  const [dbStatus, setDbStatus] = useState(() => saved.current ? "saved" : "unsaved");
  const [exportPw, setExportPw] = useState("");
  const [importPw, setImportPw] = useState("");
  const [secMsg, setSecMsg] = useState("");
  const [lastSaved, setLastSaved] = useState(() => saved.current ? new Date().toISOString() : null);
  const [encryptedDb, setEncryptedDb] = useState(false);
  const [dbPassphrase, setDbPassphrase] = useState("");
  const [showDbPw, setShowDbPw] = useState(false);
  const [toast, setToast] = useState(null);
  const importRef = useRef(null);

  /* ── Auth + Sync State ── */
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // 'login' | 'signup'
  const [authReady, setAuthReady] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const sessionHandlerRef = useRef(null);
  const sessionGeneration = useRef(0);
  const verifiedIdentityRef = useRef(undefined);
  const workspaceOwnerRef = useRef(safeWorkspaceOwner());
  const [dismissedOpps, setDismissedOpps] = useState(() => JSON.parse(localStorage.getItem("prepvault-dismissed-opps") || "[]"));
  useEffect(() => localStorage.setItem("prepvault-dismissed-opps", JSON.stringify(dismissedOpps)), [dismissedOpps]);
  const [syncStatus, setSyncStatus] = useState("local"); // 'local' | 'syncing' | 'synced' | 'error' | 'offline'
  const syncEngineRef = useRef(null);
  const currentSnapshotRef = useRef(null);
  const [restoreVersion, setRestoreVersion] = useState(0);

  /* ── Property Profile / Quick Start ── */
  const [propertyProfile, setPropertyProfile] = useState(() => {
    const p = saved.current?.propertyProfile || { ...DEFAULT_PROPERTY_PROFILE };
    const toArr = v => Array.isArray(v) ? v : v != null ? [v] : [];
    ["heatSource", "powerSource", "generatorFuel", "waterSource", "freshwaterAccess", "medicalTraining", "defensivePosture"].forEach(k => { if (p[k] != null && !Array.isArray(p[k])) p[k] = toArr(p[k]); });
    return p;
  });
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [dismissResetKey, setDismissResetKey] = useState(0);
  const [showQuickStart, setShowQuickStart] = useState(false);
  const [qsStep, setQsStep] = useState(0);

  /* ── Auto-save to localStorage (debounced) ── */
  const saveTimerRef = useRef(null);
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (!authReady) return;
    setDbStatus("unsaved");
    const persistenceOwner = workspaceOwnerRef.current;
    const persist = () => {
      if (safeWorkspaceOwner() !== persistenceOwner) return;
      try {
        localStorage.setItem(PV_STORAGE_KEY, JSON.stringify({
          items, people, climate, pins, propAddress, mapSetups, routes, properties, activePropertyId,
          members, contacts, callSigns, codeWords, rallyPoints, codes, gardenBeds, actionLog,
          soilTests, compostBins, livestock, slaughterLog, bugOutEntries,
          propertyProfile, demoData,
          savedAt: new Date().toISOString()
        }));
        setDbStatus("saved");
        setLastSaved(new Date().toISOString());
        // Queue cloud sync if authenticated
        if (syncEngineRef.current) syncEngineRef.current.queueSync();
      } catch { setDbStatus("error"); setToast({ msg: "Changes could not be saved. Export a backup before closing.", type: "error" }); }
    };
    saveTimerRef.current = setTimeout(persist, 350);
    window.addEventListener("pagehide", persist);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); window.removeEventListener("pagehide", persist); };
  }, [authReady, user?.id, items, people, climate, pins, propAddress, mapSetups, routes, properties, activePropertyId, members, contacts, callSigns, codeWords, rallyPoints, codes, gardenBeds, actionLog, soilTests, compostBins, livestock, slaughterLog, bugOutEntries, propertyProfile, demoData]);

  /* ── Toast auto-dismiss ── */
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 2500); return () => clearTimeout(t); }
  }, [toast]);

  const showToast = (msg, type = "success") => setToast({ msg, type });

  /* ── Alert Dismissal Persistence + Auto-Expire ── */
  const alertsDismissed = alertsDismissedUntil !== null && alertsDismissedUntil > Date.now();
  useEffect(() => {
    if (alertsDismissedUntil) localStorage.setItem("prepvault-alerts-dismissed-until", String(alertsDismissedUntil));
    else localStorage.removeItem("prepvault-alerts-dismissed-until");
  }, [alertsDismissedUntil]);
  useEffect(() => {
    if (!alertsDismissedUntil) return;
    const remaining = alertsDismissedUntil - Date.now();
    if (remaining <= 0) { setAlertsDismissedUntil(null); return; }
    const timer = setTimeout(() => setAlertsDismissedUntil(null), remaining);
    return () => clearTimeout(timer);
  }, [alertsDismissedUntil]);

  /* ── Offline Detection ── */
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => { window.removeEventListener("offline", goOffline); window.removeEventListener("online", goOnline); };
  }, []);

  /* ── Verified account session and separate device workspaces ── */
  useEffect(() => {
    let active = true;
    const refresh = async event => {
      const changedSession = event?.type === ACCOUNT_SESSION_EVENT;
      if (changedSession) { setAuthReady(false); setShowAuth(false); }
      const generation = ++sessionGeneration.current;
      try {
        const nextUser = await getAccountSession();
        if (active && generation === sessionGeneration.current) {
          sessionHandlerRef.current?.(nextUser);
          if (changedSession && nextUser) { setShowLanding(false); localStorage.setItem("prepvault-workspace-open", "1"); }
        }
      } catch (error) {
        if (!active || generation !== sessionGeneration.current) return;
        // Unbound, device-only plans remain usable when the network is offline.
        if (!error.code?.startsWith("WORKSPACE_") && !changedSession && (safeWorkspaceOwner() == null || (verifiedIdentityRef.current !== undefined && verifiedIdentityRef.current === safeWorkspaceOwner()))) { setAuthReady(true); setSessionError(""); }
        else { setAuthReady(false); setSessionError(error.message); }
      }
    };
    const otherWorkspace = event => {
      if (event.key === "prepvault-workspace-owner") window.location.reload();
    };
    refresh();
    window.addEventListener(ACCOUNT_SESSION_EVENT, refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", otherWorkspace);
    return () => { active = false; window.removeEventListener(ACCOUNT_SESSION_EVENT, refresh); window.removeEventListener("focus", refresh); window.removeEventListener("storage", otherWorkspace); };
  }, [sessionAttempt]);

  /* Legacy cloud identities must never receive a Neon user ID. */
  useEffect(() => {
    if (!user || user.isLocal || user.authProvider === "neon" || !supabaseConfigured) { setSyncStatus("local"); return; }
    const engine = new SyncEngine(supabase);
    syncEngineRef.current = engine;
    engine.setStatusCallback(setSyncStatus);
    engine.setSnapshotProvider(() => currentSnapshotRef.current);
    engine.setDataCallback(data => restoreSnapshot(data, false));
    engine.setUser(user.id);
    return () => { engine.destroy(); syncEngineRef.current = null; };
  }, [user]);

  const applyAccount = nextUser => {
    const nextId = nextUser?.id || null;
    const previousId = readWorkspaceOwner(localStorage);
    const result = switchAccountWorkspace(localStorage, {
      accountId: nextId, currentSnapshot: currentSnapshotRef.current || getDbSnapshot(), emptySnapshot: emptyPlan(),
    });
    workspaceOwnerRef.current = readWorkspaceOwner(localStorage);
    if (result.changed && !result.claimedUnbound) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      restoreSnapshot(result.snapshot, true, false);
      setShowQuickStart(false); setShowStartPlan(false); setUpgradeNotices([]); setShowAdd(false);
      setShowScanner(false); setShowSecurity(false); setCrisisMode(false); setCrisisType(null); setCrisisStart(null);
      setRevealedCodes({}); setDbPassphrase(""); setShowDbPw(false); setExportPw(""); setImportPw("");
      setEncryptedDb(false); setSecMsg(""); setToast(null); navigate("dashboard");
    }
    verifiedIdentityRef.current = nextId;
    setUser(nextUser); setSyncStatus("local"); setAuthReady(true); setSessionError("");
    if (previousId && nextId !== previousId) setShowLanding(true);
    localStorage.removeItem("prepvault-active-session");
  };
  useLayoutEffect(() => { sessionHandlerRef.current = applyAccount; });

  const handleSignedIn = nextUser => {
    ++sessionGeneration.current;
    applyAccount(nextUser);
    setShowAuth(false); enterWorkspace();
    showToast("Signed in securely. Your plan is saved on this device.");
  };
  const handleLogout = async () => {
    try {
      await signOutAccount();
      ++sessionGeneration.current;
      applyAccount(null); setShowLanding(true);
    } catch (error) { showToast(error.message || "Sign-out failed. Please try again.", "error"); }
  };

  /* ── Local working data and optionally encrypted backups ── */
  const getDbSnapshot = () => ({
    version: 4,
    timestamp: new Date().toISOString(),
    items, people, climate, pins, propAddress, mapSetups, routes, properties, activePropertyId,
    members, contacts, callSigns, codeWords, rallyPoints, codes, gardenBeds, actionLog,
    soilTests, compostBins, livestock, slaughterLog, bugOutEntries, propertyProfile, demoData,
    localSettings: Object.fromEntries(Object.keys(localStorage).filter(isWorkspaceSettingKey).map(k => [k, localStorage.getItem(k)])),
    meta: { categories: Object.keys(CATEGORIES).length, scenarios: Object.keys(SCENARIOS).length, properties: properties.length }
  });

  useLayoutEffect(() => { currentSnapshotRef.current = getDbSnapshot(); });

  const restoreSnapshot = (raw, includeSettings = true, notifyLimit = true) => {
    const data = validateSnapshot(raw);
    data.mapSetups ??= includeSettings ? {} : (currentSnapshotRef.current?.mapSetups || mapSetups);
    data.bugOutEntries ??= includeSettings ? [] : (currentSnapshotRef.current?.bugOutEntries || []);
    data.routes ??= includeSettings ? [] : (currentSnapshotRef.current?.routes || routes);
    if (data.items.some(i => !CATEGORIES[i.category] || !CATEGORIES[i.category].subTypes[i.subType])) throw new Error("Backup contains an unknown supply category or type.");
    const arrays = { items: setItems, pins: setPins, properties: setProperties, members: setMembers, contacts: setContacts, callSigns: setCallSigns, codeWords: setCodeWords, rallyPoints: setRallyPoints, codes: setCodes, gardenBeds: setGardenBeds, actionLog: setActionLog, soilTests: setSoilTests, compostBins: setCompostBins, livestock: setLivestock, slaughterLog: setSlaughterLog, bugOutEntries: setBugOutEntries };
    Object.entries(arrays).forEach(([key, setter]) => { if (data[key] !== undefined) setter(data[key]); });
    if (data.people !== undefined) setPeople(data.people);
    if (data.climate !== undefined && CLIMATES[data.climate]) setClimate(data.climate);
    if (data.propAddress !== undefined) setPropAddress(data.propAddress);
    // Full backup imports replace the map workspace, including older backups
    // without these fields. Core cloud refreshes preserve this device-only data.
    if (data.mapSetups !== undefined || includeSettings) setMapSetups(data.mapSetups || {});
    if (data.routes !== undefined || includeSettings) setRoutes(data.routes || []);
    if (data.activePropertyId !== undefined) setActivePropertyId(data.activePropertyId);
    if (data.propertyProfile) setPropertyProfile(data.propertyProfile);
    if (data.demoData !== undefined) setDemoData(data.demoData);
    if (includeSettings && data.localSettings && typeof data.localSettings === "object") Object.entries(data.localSettings).forEach(([key, value]) => {
      if (isWorkspaceSettingKey(key) && typeof value === "string") localStorage.setItem(key, value);
    });
    if (includeSettings && data.localSettings) {
      try { const dismissed = JSON.parse(localStorage.getItem("prepvault-dismissed-opps") || "[]"); setDismissedOpps(Array.isArray(dismissed) ? dismissed : []); } catch { setDismissedOpps([]); }
      const until = Number(localStorage.getItem("prepvault-alerts-dismissed-until"));
      setAlertsDismissedUntil(Number.isFinite(until) && until > Date.now() ? until : null);
    }
    if (includeSettings) { setRestoreVersion(version => version + 1); setDailyCalTarget(2000); }
    if (notifyLimit) { const notices = categoryUpgradeNotices(items, data.items); if (notices.length) setUpgradeNotices(notices); }
    saved.current = data;
    setSelCat(null);
    localStorage.setItem(PV_STORAGE_KEY, JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
    setLastSaved(new Date().toISOString());
    setDbStatus("saved");
  };

  const handleEncryptedExport = async () => {
    if (!exportPw || exportPw.length < 6) { setSecMsg("⚠ Password must be at least 6 characters"); return; }
    try {
      setSecMsg("🔐 Encrypting...");
      const data = getDbSnapshot();
      const encrypted = await encryptData(data, exportPw);
      const blob = new Blob([JSON.stringify({ pcs: true, enc: "AES-256-GCM", kdf: "PBKDF2-SHA256-310K", payload: encrypted })], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "pcs-backup-" + new Date().toISOString().slice(0, 10) + ".enc.json";
      a.click();
      URL.revokeObjectURL(url);
      setSecMsg("✅ Encrypted backup downloaded — AES-256-GCM");
      setExportPw("");
    } catch (e) {
      setSecMsg("❌ Export failed: " + e.message);
    }
  };

  const handleEncryptedImport = async (file) => {
    const importOwner = workspaceOwnerRef.current;
    if (!importPw) { setSecMsg("⚠ Enter decryption password"); return; }
    try {
      setSecMsg("🔓 Decrypting...");
      const text = await file.text();
      const wrapper = JSON.parse(text);
      if (!wrapper.pcs || !wrapper.payload) { setSecMsg("❌ Not a valid PrepVault backup file"); return; }
      const data = await decryptData(wrapper.payload, importPw);
      if (importOwner !== safeWorkspaceOwner()) return;
      restoreSnapshot(data);
      setSecMsg("✅ Restored " + (data.items?.length || 0) + " items from encrypted backup");
      setImportPw("");
    } catch (e) {
      setSecMsg("❌ Decryption failed — wrong password or corrupt file");
    }
  };

  const handleLocalSave = async () => {
    try {
      setDbStatus("saving");
      const data = getDbSnapshot();
      if (encryptedDb && dbPassphrase.length < 6) { setDbStatus("unsaved"); setSecMsg("Use a passphrase of at least 6 characters."); return; }
      if (encryptedDb) {
        const encrypted = await encryptData(data, dbPassphrase);
        localStorage.setItem("pcs-db", JSON.stringify({ enc: true, payload: encrypted }));
      } else {
        localStorage.setItem("pcs-db", JSON.stringify({ enc: false, payload: data }));
      }
      setDbStatus(encryptedDb ? "encrypted" : "saved");
      setLastSaved(new Date().toISOString());
      setSecMsg("✅ Saved to local database" + (encryptedDb ? " (encrypted)" : ""));
    } catch (e) {
      setDbStatus("unsaved");
      setSecMsg("⚠ Local save failed — storage may be unavailable");
    }
  };

  const handleLocalLoad = async () => {
    const importOwner = workspaceOwnerRef.current;
    try {
      const result = localStorage.getItem("pcs-db");
      if (!result) { setSecMsg("⚠ No local database found"); return; }
      const wrapper = JSON.parse(result);
      let data;
      if (wrapper.enc) {
        if (!dbPassphrase) { setSecMsg("⚠ Enter database passphrase to decrypt"); return; }
        data = await decryptData(wrapper.payload, dbPassphrase);
      } else {
        data = wrapper.payload;
      }
      if (importOwner !== safeWorkspaceOwner()) return;
      restoreSnapshot(data);
      setDbStatus(wrapper.enc ? "encrypted" : "saved");
      setSecMsg("✅ Loaded " + (data.items?.length || 0) + " items from local database");
    } catch (e) {
      setSecMsg("❌ Load failed — " + (e.message.includes("decrypt") ? "wrong passphrase" : e.message));
    }
  };

  const handleDbWipe = async () => {
    if (!window.confirm("Delete the saved local backup? Your current working plan will be kept.")) return;
    localStorage.removeItem("pcs-db");
    setSecMsg("Local backup deleted. Your current working plan is unchanged.");
  };

  /* ── Property-filtered items ── */
  const propItems = activePropertyId === "all" ? items : items.filter(i => (i.propertyId || "prop1") === activePropertyId);
  const activeProp = properties.find(p => p.id === activePropertyId) || properties[0];

  const openAdd = (c) => { setAddCat(c || null); setEditItem(null); setShowAdd(true); };
  const openEdit = (i) => { setEditItem(i); setAddCat(i.category); setShowAdd(true); };
  const showCategoryUpgradeNotice = (nextItems) => {
    const notices = categoryUpgradeNotices(items, nextItems);
    if (notices.length) setUpgradeNotices(notices);
  };
  const handleAdd = (i) => {
    showCategoryUpgradeNotice(editItem ? items.map(item => item.id === i.id ? i : item) : [...items, i]);
    if (editItem) {
      setItems((p) => p.map((x) => (x.id === i.id ? { ...x, ...i, propertyId: x.propertyId || "prop1" } : x)));
      showToast("✏️ " + i.name + " updated");
    } else {
      setItems((p) => [...p, { ...i, propertyId: activePropertyId === "all" ? "prop1" : activePropertyId }]);
      showToast("✅ " + i.name + " added to " + (CATEGORIES[i.category]?.label || "inventory"));
    }
    if (["preps", "food", "water"].includes(activeTab) && (["food", "water"].includes(i.category) || ["food", "water"].includes(activeTab))) openCategory(i.category);
  };
  const handleRemove = (id) => {
    const item = items.find(i => i.id === id);
    setItems((p) => p.filter((i) => i.id !== id));
    showToast("🗑️ " + (item?.name || "Item") + " removed");
  };
  const handleScan = (product) => {
    setShowScanner(false);
    const newItem = { id: uid(), category: product.category, subType: product.subType, name: product.name, quantity: product.qty || 1, location: "", fields: product.fields || {}, addedDate: new Date().toISOString().split("T")[0], propertyId: activePropertyId === "all" ? "prop1" : activePropertyId };
    showCategoryUpgradeNotice([...items, newItem]);
    setItems((p) => [...p, newItem]);
    showToast("📷 " + product.name + " scanned and added");
    if (["food", "water"].includes(product.category)) openCategory(product.category);
  };

  const addProperty = (name = newPropName, type = newPropType) => {
    if (!name.trim()) return;
    const icons = { cabin: "🏕️", cache: "📦", farm: "🌾", vehicle: "🚐", home: "🏠", office: "🏢" };
    const np = { id: "prop" + Date.now(), name: name.trim(), type: type, icon: icons[type] || "📍", active: false };
    setProperties(p => [...p, np]);
    setActivePropertyId(np.id);
    setNewPropName("");
    setShowAddProp(false);
  };
  const removeProperty = (id) => {
    if (id === "prop1") return;
    if (!window.confirm("Delete this property, its supplies, saved map and travel routes? This cannot be undone.")) return;
    setProperties(p => p.filter(pp => pp.id !== id));
    setItems(p => p.filter(i => i.propertyId !== id));
    setMapSetups(previous => Object.fromEntries(Object.entries(previous).filter(([propertyId]) => propertyId !== id)));
    setRoutes(previous => previous.filter(route => route.propertyId !== id));
    if (activePropertyId === id) setActivePropertyId("prop1");
  };

  const allAlerts = useMemo(() => {
    const alerts = [];
    const now = new Date();
    const month = now.getMonth(); // 0=Jan
    const coldMonths = [9, 10, 11, 0, 1, 2]; // Oct-Mar
    const isColdSeason = coldMonths.includes(month);
    const approachingCold = month >= 7 && month <= 9; // Aug-Oct = prep time

    items.forEach((i) => {
      if (i.fields?.lastRefreshed) { const s = getRefreshStatus(i.fields.lastRefreshed); if (s.u) alerts.push({ ...i, al: s.l, ac: s.c }); }
      if (i.fields?.expiryDate) { const s = getExpiryStatus(i.fields.expiryDate); if (s?.u) alerts.push({ ...i, al: s.l, ac: s.c }); }
      /* Vehicle service alerts */
      if (i.fields?.nextService) {
        const svc = new Date(i.fields.nextService);
        const daysUntil = Math.ceil((svc - now) / 864e5);
        if (daysUntil < 0) alerts.push({ ...i, al: `Service ${Math.abs(daysUntil)}d overdue`, ac: "#ef4444" });
        else if (daysUntil <= 30) alerts.push({ ...i, al: `Service in ${daysUntil}d`, ac: "#f59e0b" });
      }
      if (i.fields?.lastOilChange) {
        const oil = new Date(i.fields.lastOilChange);
        const daysSince = Math.ceil((now - oil) / 864e5);
        if (daysSince > 180) alerts.push({ ...i, al: `Oil change ${daysSince}d ago`, ac: "#f59e0b" });
      }
      /* Chainsaw service alert */
      if (i.subType === "chainsaw" && i.fields?.lastService) {
        const svc = new Date(i.fields.lastService);
        const daysSince = Math.ceil((now - svc) / 864e5);
        if (daysSince > 180) alerts.push({ ...i, al: `Saw service ${daysSince}d ago`, ac: "#f59e0b" });
      }
      /* Bug-out bag audit alert */
      if (i.subType === "bag" && i.fields?.lastAudited) {
        const aud = new Date(i.fields.lastAudited);
        const daysSince = Math.ceil((now - aud) / 864e5);
        if (daysSince > 90) alerts.push({ ...i, al: `Audit ${daysSince}d ago${i.fields?.bagOwner ? " (" + i.fields.bagOwner + ")" : ""}`, ac: daysSince > 180 ? "#ef4444" : "#f59e0b" });
      }
      /* Electronics plan expiry alert */
      if (i.fields?.planExpiry && i.fields?.hasPlan !== "No plan needed") {
        const exp = new Date(i.fields.planExpiry);
        const daysUntil = Math.ceil((exp - now) / 864e5);
        if (daysUntil < 0) alerts.push({ ...i, al: `Plan expired ${Math.abs(daysUntil)}d ago`, ac: "#ef4444" });
        else if (daysUntil <= 30) alerts.push({ ...i, al: `Plan expires in ${daysUntil}d`, ac: "#f59e0b" });
      }
      /* Fishing license expiry */
      if (i.category === "fishing" && i.subType === "fishLicense" && i.fields?.planExpiry) {
        const exp = new Date(i.fields.planExpiry);
        const daysUntil = Math.ceil((exp - now) / 864e5);
        if (daysUntil < 0) alerts.push({ ...i, al: `License expired ${Math.abs(daysUntil)}d ago`, ac: "#ef4444" });
        else if (daysUntil <= 60) alerts.push({ ...i, al: `License expires in ${daysUntil}d`, ac: "#f59e0b" });
      }
      /* Boat engine service alert */
      if (i.category === "boat" && i.subType === "outboard" && i.fields?.nextService) {
        const svc = new Date(i.fields.nextService);
        const daysUntil = Math.ceil((svc - now) / 864e5);
        if (daysUntil < 0) alerts.push({ ...i, al: `Engine service overdue ${Math.abs(daysUntil)}d`, ac: "#ef4444" });
        else if (daysUntil <= 30) alerts.push({ ...i, al: `Engine service in ${daysUntil}d`, ac: "#f59e0b" });
      }
      /* Boat safety kit expiry */
      if (i.category === "boat" && i.subType === "boatSafety" && i.fields?.expiryDate) {
        const exp = new Date(i.fields.expiryDate);
        const daysUntil = Math.ceil((exp - now) / 864e5);
        if (daysUntil < 0) alerts.push({ ...i, al: `Flares/safety kit expired`, ac: "#ef4444" });
        else if (daysUntil <= 90) alerts.push({ ...i, al: `Safety kit expires in ${daysUntil}d`, ac: "#f59e0b" });
      }
      /* Kids diaper/formula low stock warning */
      if (i.category === "kids" && (i.subType === "diapers" || i.subType === "formula" || i.subType === "wipes") && i.quantity <= 2) {
        alerts.push({ ...i, al: `Low — only ${i.quantity} left`, ac: i.quantity <= 1 ? "#ef4444" : "#f59e0b" });
      }
    });

    /* Firewood season warnings */
    const clim = CLIMATES[climate];
    if (clim && (isColdSeason || approachingCold)) {
      const fireplaces = items.filter((i) => i.category === "firewood" && i.subType === "fireplace");
      const totalCordsPerMonth = fireplaces.reduce((sum, fp) => sum + (parseFloat(fp.fields?.cordsPerMonth) || 0.5), 0) * clim.firewoodMod;
      const coldMonthsLeft = isColdSeason ? (month <= 2 ? 3 - month : 6 - (month - 9)) : 6;
      const cordsNeeded = totalCordsPerMonth * coldMonthsLeft;
      const cordsAvail = items.filter((i) => i.category === "firewood" && i.subType === "cordwood").reduce((sum, cw) => sum + (parseFloat(cw.fields?.cords) || 0) * cw.quantity, 0);
      if (cordsNeeded > 0 && cordsAvail < cordsNeeded) {
        const deficit = (cordsNeeded - cordsAvail).toFixed(1);
        alerts.push({ category: "firewood", name: "🪵 Firewood shortage", al: approachingCold && !isColdSeason ? `Need ${deficit} more cords before winter` : `Low! Need ${deficit} more cords`, ac: cordsAvail < cordsNeeded * 0.5 ? "#ef4444" : "#f59e0b" });
      }
    }

    /* Code rotation alerts */
    codes.forEach((c) => {
      if (c.lastChanged) {
        const daysSince = Math.floor((now - new Date(c.lastChanged)) / 864e5);
        if (daysSince > 30) alerts.push({ category: "property", name: `🔑 ${c.label} — code rotation overdue`, al: `${daysSince}d since last change`, ac: daysSince > 45 ? "#ef4444" : "#f59e0b" });
      }
    });

    return alerts;
  }, [items, climate, codes]);

  const visibleAlerts = allAlerts.filter(a => !a.id || propItems.some(i => i.id === a.id));
  const navigationHealth = buildNavigationHealth({
    items: propItems, supplyCategoryKeys: Object.keys(SUPPLY_CATEGORIES), alerts: visibleAlerts,
    peopleCount: rationPeople.length, dailyCalTarget, contacts, propertyProfile, activePropertyId,
    mapSetups, routes, callSigns, rallyPoints, bugOutEntries, codes, gardenBeds, soilTests, compostBins, livestock,
  });
  const tabs = [{ id: "dashboard", l: "Dashboard", i: "◈" }, { id: "property", l: "Property", i: "🏠" }, { id: "preps", l: "Preps", i: "📦" }, { id: "community", l: "Team", i: "👥" }, { id: "comms", l: "Comms", i: "📡" }, { id: "farming", l: "Farming", i: "🌱" }];

  const getPrepChatContext = () => buildAdvisorContext({
          items, categories: CATEGORIES, people, climate, climateConfig: CLIMATES[climate],
          activePropertyId, properties, propAddress, propertyProfile, mapSetups, pins, routes,
          contacts, members, dailyCalTarget, callSigns, codeWords, rallyPoints, codes,
          commsPlan: COMMS_PLAN, gardenBeds, soilTests, compostBins, livestock, slaughterLog, bugOutEntries,
          actionLog, selScen, scenario: SCENARIOS[selScen], simDuration, crisisMode, crisisType,
          crisisStart, dismissedOpps, allAlerts, manuals, handbooks: HANDBOOKS, demoData,
          device: readAdvisorDeviceContext(localStorage),
        });

  const renderContent = () => {
    if (selCat) {
      return <CategoryDetailView key={selCat} categories={CATEGORIES} climates={CLIMATES} fieldMeta={FIELD_META} refreshStatus={getRefreshStatus} expiryStatus={getExpiryStatus} parseVolMl={parseVolMl} catKey={selCat} items={propItems} people={people} climate={climate} onBack={() => setSelCat(null)} onAdd={(c) => openAdd(c)} onRemove={handleRemove} onEdit={openEdit} onQtyChange={(id, delta) => setItems(p => p.map(i => i.id === id ? { ...i, quantity: Math.max(0, (i.quantity ?? 1) + delta) } : i))} />;
    }
    switch (activeTab) {
      case "bugout":
        return <BugOutPlan entries={bugOutEntries} setEntries={setBugOutEntries} items={items} contacts={contacts} />;
      case "emergency":
        return <HandbookLibrary crisisMode={crisisMode} onCrisis={() => { if (crisisMode) { setCrisisMode(false); setCrisisStart(null); setCrisisType(null); } else setShowCrisisSelector(true); }} />;
      case "dashboard":
        return <><Overview items={propItems} categories={CATEGORIES} people={contacts.length} property={activePropertyId === "all" ? "All properties" : activeProp} alerts={visibleAlerts} onNavigate={navigate} onCategory={openCategory} onAdd={() => openAdd()} onCrisis={() => setShowCrisisSelector(true)} onScan={() => setShowScanner(true)} members={contacts} rationPeople={rationPeople} dailyCalTarget={dailyCalTarget}/><details className="pv-legacy-details" onToggle={e => setShowDetailedDashboard(e.currentTarget.open)}><summary><Icon name="compass"/> Readiness details, weather & activity</summary>{showDetailedDashboard && <div className="pv-legacy-content pv-quiet-legacy"><DashboardTab items={propItems} setSelCat={openCategory} openAdd={openAdd} people={people} climate={climate} allAlerts={allAlerts} showAlerts={showAlerts} setShowAlerts={setShowAlerts} crisisMode={crisisMode} setCrisisMode={setCrisisMode} setCrisisStart={setCrisisStart} setShowScanner={setShowScanner} propAddress={propAddress} alertsDismissed={alertsDismissed} alertsDismissedUntil={alertsDismissedUntil} onDismissAlerts={() => setAlertsDismissedUntil(Date.now() + 24 * 60 * 60 * 1000)} members={members} codes={codes} actionLog={actionLog} setActionLog={setActionLog} propertyProfile={propertyProfile} onOpenQuickStart={openSetup} setActiveTab={setActiveTab} dismissResetKey={dismissResetKey} /></div>}</details></>;
      case "codes":
        return <CodesView onSetup={openSetup} codes={codes} setCodes={setCodes} members={members} revealedCodes={revealedCodes} setRevealedCodes={setRevealedCodes} />;
      case "manuals":
        return <ManualsView manuals={manuals} onSetup={openSetup} onEmergency={() => navigate("emergency")} />;
      case "surveillance":
        return <Surveillance />;
      case "property":
        return <PropertyTab propSub={propSub} setPropSub={setPropSub} propAddress={propAddress} setPropAddress={setPropAddress} pins={pins} setPins={setPins} routes={routes} setRoutes={setRoutes} mapSetups={mapSetups} setMapSetups={setMapSetups} properties={properties} activePropertyId={activePropertyId} amenities={amenities} user={user} items={propItems} onSetup={openSetup} members={[...contacts, ...members]} demoData={demoData} onOpenPropertyMap={setActivePropertyId} />;
      case "dependencies":
        return <DependenciesView items={propItems} onSupplies={() => navigate("preps")} onSetup={openSetup} />;
      case "food":
      case "water":
        return <CategoryDetailView key={activeTab} standalone planningOverride={buildEssentialPlanning(activeTab, propItems, rationPeople.length, dailyCalTarget)} onPeople={() => navigate("community")} onRationing={() => navigate("rationing")} onScan={() => setShowScanner(true)} categories={CATEGORIES} climates={CLIMATES} fieldMeta={FIELD_META} refreshStatus={getRefreshStatus} expiryStatus={getExpiryStatus} parseVolMl={parseVolMl} catKey={activeTab} items={propItems} people={people} climate={climate} onAdd={openAdd} onRemove={handleRemove} onEdit={openEdit} onQtyChange={(id, delta) => setItems(previous => previous.map(item => item.id === id ? { ...item, quantity: Math.max(0, (item.quantity ?? 1) + delta) } : item))} />;
      case "inventory-search":
      case "preps": {
        const allInventory = activeTab === "inventory-search";
        const listedItems = allInventory ? propItems : propItems.filter(item => !["food", "water"].includes(item.category));
        const listedCategories = allInventory ? CATEGORIES : SUPPLY_CATEGORIES;
        const listedAlerts = allInventory ? visibleAlerts : visibleAlerts.filter(alert => Object.hasOwn(SUPPLY_CATEGORIES, alert.category));
        const addSupply = () => openAdd(allInventory ? undefined : "medical");
        return <><InventoryView key={`${activeTab}-${inventorySearch.key}`} initialQuery={inventorySearch.query} initialStatus={inventorySearch.status} title={allInventory ? "All inventory" : "Your supplies"} eyebrow={allInventory ? "EVERYTHING, IN ONE SEARCH" : "KNOW WHAT YOU HAVE"} intro={allInventory ? "Search Food, Water and Supplies together across your selected property." : "Equipment and everyday essentials, beyond food and water."} alerts={listedAlerts} items={listedItems} categories={listedCategories} people={people} onCategory={openCategory} onAdd={addSupply} onEdit={openEdit} onRemove={handleRemove} onQtyChange={(id, delta) => setItems(p => p.map(i => i.id === id ? { ...i, quantity: Math.max(0, (i.quantity ?? 1) + delta) } : i))} onScan={() => setShowScanner(true)}/><details className="pv-legacy-details" onToggle={e => setShowDetailedInventory(e.currentTarget.open)}><summary><Icon name="clock"/> Expiry calendar & category analysis</summary>{showDetailedInventory && <div className="pv-legacy-content pv-quiet-legacy"><PrepsTab categories={listedCategories} items={listedItems} setSelCat={openCategory} openAdd={category => openAdd(category || (allInventory ? undefined : "medical"))} people={people} climate={climate} allAlerts={listedAlerts} showAlerts={showAlerts} setShowAlerts={setShowAlerts} setShowScanner={setShowScanner} alertsDismissed={alertsDismissed} alertsDismissedUntil={alertsDismissedUntil} onDismissAlerts={() => setAlertsDismissedUntil(Date.now() + 24 * 60 * 60 * 1000)} /></div>}</details></>;
      }
      case "community":
        return <CommunityTab onSignIn={() => { setAuthMode("login"); setShowAuth(true); }} user={user} contacts={contacts} setContacts={setContacts} />;
      case "board":
        return <Suspense fallback={<p role="status">Opening the community board…</p>}><MessageBoard /></Suspense>;
      case "rationing":
        return <RationingPlanner items={propItems} rationPeople={rationPeople} dailyCalTarget={dailyCalTarget} setDailyCalTarget={setDailyCalTarget} onManagePeople={() => navigate("community")} />;
      case "comms":
        return <CommunicationsView plan={COMMS_PLAN} frequencies={EMERGENCY_FREQUENCIES} prowords={PROWORDS} phonetic={NATO_PHONETIC} equipmentTypes={CATEGORIES.comms.subTypes} sampleChat={SAMPLE_CHAT} onSupplies={() => openCategory("comms")} items={propItems} people={people} climate={climate} callSigns={callSigns} setCallSigns={setCallSigns} codeWords={codeWords} setCodeWords={setCodeWords} rallyPoints={rallyPoints} setRallyPoints={setRallyPoints} members={members} user={user} />;
      case "farming":
        return <FarmingView cropDatabase={CROP_DATABASE} growingZones={GROWING_ZONES} climates={CLIMATES} caloriesPerLb={CALORIES_PER_LB} onSupplies={() => openCategory("farm")} items={propItems} people={people} climate={climate} gardenBeds={gardenBeds} setGardenBeds={setGardenBeds} soilTests={soilTests} setSoilTests={setSoilTests} compostBins={compostBins} setCompostBins={setCompostBins} livestock={livestock} setLivestock={setLivestock} slaughterLog={slaughterLog} setSlaughterLog={setSlaughterLog} />;
      case "systems":
        return <ResourcePlanningView items={propItems} people={people} climateConfig={CLIMATES[climate] || CLIMATES.temperate} onSetup={openSetup} onSupplies={() => navigate("preps")} opportunities={<OpportunitiesTab items={propItems} people={people} climate={climate} gardenBeds={gardenBeds} dismissedOpps={dismissedOpps} setDismissedOpps={setDismissedOpps} propertyProfile={propertyProfile}/>} />;
      case "simulate":
        return <ScenarioView scenarios={SCENARIOS} climates={CLIMATES} categories={CATEGORIES} recommendations={RECS} onSetup={openSetup} items={propItems} people={people} setPeople={setPeople} climate={climate} setClimate={setClimate} selScen={selScen} setSelScen={setSelScen} simDuration={simDuration} setSimDuration={setSimDuration} />;
      default:
        return null;
    }
  };

  const renderAuthModal = () => <AccountAuth initialMode={authMode} onClose={() => setShowAuth(false)} onSignedIn={handleSignedIn} />;

  if (!authReady) return <div className="pv-account-gate"><Icon name="shield" size={30}/><h1>{sessionError ? "Reconnect to your plan" : "Opening your workspace…"}</h1><p role="status">{sessionError || "Checking your secure sign-in."}</p>{sessionError && <><button className="pv-button pv-primary" onClick={() => { setSessionError(""); setSessionAttempt(value => value + 1); }}>Try again</button><button className="pv-button pv-secondary" onClick={() => { try { ++sessionGeneration.current; applyAccount(null); } catch (error) { setSessionError(error.message); } }}>Use a separate guest plan</button></>}</div>;

  if (showLanding) return <Welcome hasPlan={!demoData} user={user} onEnter={enterWorkspace} onSetup={startPlan} onSignIn={() => { if (user) enterWorkspace(); else { setShowAuth(true); setAuthMode("login"); } }}>{showAuth && renderAuthModal()}</Welcome>;

  const pageMeta = {
    community: ["Your people", "Stay connected to the people you count on."],
    rationing: ["Rationing", "Plan your food and water around the people you’re preparing for."],
  };
  return (
    <WorkspaceShell navigationHealth={navigationHealth} onHome={() => { setShowLanding(true); window.scrollTo({ top: 0, behavior: "instant" }); }} getPrepChatContext={getPrepChatContext} prepChatResetKey={restoreVersion} activeTab={activeTab} onNavigate={navigate} properties={properties} propertyId={activePropertyId} onProperty={id => { setActivePropertyId(id); setSelCat(null); }} onAddProperty={addProperty} onRemoveProperty={removeProperty} user={user} syncStatus={syncStatus} dbStatus={dbStatus} isOffline={isOffline} onAccount={() => setShowAuth(true)} onLogout={handleLogout} onSetup={openSetup} onSecurity={() => setShowSecurity(true)} onCrisis={() => { if (crisisMode) { setCrisisMode(false); setCrisisStart(null); setCrisisType(null); } else setShowCrisisSelector(true); }} crisisMode={crisisMode} onSearch={(query, status = "all") => { navigate("inventory-search"); setInventorySearch(p => ({query, status, key: p.key + 1})); }} alertCount={visibleAlerts.length} inventoryAlertCounts={{food: visibleAlerts.filter(alert => alert.category === "food").length, water: visibleAlerts.filter(alert => alert.category === "water").length, preps: visibleAlerts.filter(alert => Object.hasOwn(SUPPLY_CATEGORIES, alert.category)).length}}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes slideUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
        * { -webkit-tap-highlight-color: transparent; }
        input:focus, textarea:focus, select:focus { border-color: rgba(33,76,57,0.5) !important; box-shadow: 0 0 0 2px rgba(33,76,57,0.15) !important; }
        .pv-legacy-content button:active { transform: scale(0.99); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        .pcs-header { padding: 12px 20px; display: flex; align-items: center; gap: 12; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.015); }
        .pcs-header-actions { display: flex; align-items: center; gap: 10; flex-shrink: 0; }
        .pcs-tabs { display: flex; gap: 0; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 0 20px; background: rgba(255,255,255,0.01); }
        .pcs-bottom-nav { display: flex; position: fixed; bottom: 0; left: 0; right: 0; z-index: 900; background: rgba(10,12,16,0.95); backdrop-filter: blur(20px); border-top: 1px solid #e0e6da; padding: 6px 0 env(safe-area-inset-bottom, 8px); justify-content: space-around; }
        .pcs-bottom-nav button { background: none; border: none; color: rgba(255,255,255,0.35); cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 9px; font-weight: 600; padding: 6px 12px; font-family: inherit; min-width: 56px; transition: color 0.15s; }
        .pcs-bottom-nav button.active { color: #214c39; }
        @media (min-width: 769px) {
          .pcs-bottom-nav { display: none; }
        }
        .pcs-crisis-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8; margin-bottom: 14; }
        .pcs-opt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 6; }
        .pcs-tracker-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; }
        .pcs-trade-grid { display: grid; grid-template-columns: 300px 1fr; gap: 16px; }
        .pcs-expiry-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 4; }
        .pcs-weather-news { display: grid; grid-template-columns: 1fr 1fr; gap: 12; }
        .pcs-comms-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 16; }
        .pcs-cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 14px; }
        .pcs-content { max-width: 1100px; margin: 0 auto; padding: 20px; }
        .pcs-sec-status-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8; margin-bottom: 18; }
        @media (max-width: 768px) {
          .pcs-header { padding: 10px 14px; gap: 8; flex-wrap: wrap; }
          .pcs-header-actions { gap: 8; }
          .pcs-tabs { display: none !important; }
          .pcs-crisis-grid { grid-template-columns: repeat(2, 1fr); }
          .pcs-opt-grid { grid-template-columns: 1fr; }
          .pcs-cat-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
          .pcs-expiry-grid { grid-template-columns: repeat(4, 1fr) !important; }
          .pcs-weather-news { grid-template-columns: 1fr !important; }
          .pcs-comms-2col { grid-template-columns: 1fr !important; }
          .pcs-tracker-grid { grid-template-columns: 1fr !important; }
          .pcs-trade-grid { grid-template-columns: 1fr !important; }
          .pcs-content { padding: 14px; }
          .pcs-sec-status-grid { grid-template-columns: repeat(3, 1fr); gap: 6; }
          .pcs-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .pcs-stats-grid > :last-child { grid-column: 1 / -1; border-right: none !important; }
          .pcs-summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .pcs-sys-grid { grid-template-columns: 1fr 1fr 1fr !important; }
        }
        @media (max-width: 400px) {
          .pcs-cat-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
          .pcs-header { padding: 8px 10px; }
          .pcs-content { padding: 10px; }
        }
      `}</style>

      {/* ═══ CRISIS ACTIVATE MODE ═══ */}
      {crisisMode && (() => {
        const _clim = CLIMATES[climate] || CLIMATES.temperate;
        const _waterMod = _clim.waterMod || 1;
        const _firewoodMod = _clim.firewoodMod || 1;
        const p = people || 4;
        const fuelGals = items.filter((i) => i.category === "fuel" && i.subType === "gasoline").reduce((s, i) => s + (i.quantity || 0) * (parseFloat(i.fields?.fuelGallons || i.fields?.gallons) || 5), 0);
        const propTanks = items.filter((i) => i.category === "fuel" && i.subType === "propane").reduce((s, i) => s + (i.quantity || 0), 0);
        const batteries = items.filter((i) => i.category === "batteries").reduce((s, i) => s + (i.quantity || 0), 0);
        const solarPanels = items.filter((i) => (i.category === "power" && i.subType === "solarPanel") || (i.category === "electronics" && i.subType === "solarDevice")).reduce((s, i) => s + (i.quantity || 0), 0);
        const waterGals = items.filter((i) => i.category === "water" && i.subType === "storedWater").reduce((s, i) => s + (i.quantity || 0), 0);
        const firewoodCords = items.filter((i) => i.category === "firewood").reduce((s, i) => s + (parseFloat(i.fields?.cords) || 0) * (i.quantity || 1), 0);
        const totalCals = items.filter((i) => i.category === "food").reduce((s, i) => {
          const cal = parseFloat(i.fields?.totalCalories || i.fields?.caloriesPerServing || i.fields?.calories || 0);
          const serv = parseFloat(i.fields?.servings || 1);
          return s + (cal > 500 ? cal : cal * serv) * (i.quantity || 1);
        }, 0);

        const powerHrs = fuelGals * 5.5 + batteries * 0.3 + solarPanels * 5;
        const waterDays = waterGals / Math.max(p * 1.0 * _waterMod, 0.1);
        const heatDays = _firewoodMod > 1 ? (firewoodCords * 30 + propTanks * 4.6 * 91452 / 18000 / 12) / _firewoodMod : 999;
        const calDays = totalCals / Math.max(p * 2000, 1);

        const elapsed = crisisStart ? Math.floor((new Date() - crisisStart) / 3600000 * 10) / 10 : 0;

        /* Optimization suggestions */
        const suggestions = [];
        if (powerHrs > 0) {
          suggestions.push({ icon: "🧊", action: "Reduce fridge to 4hr/day cycles", gain: "+" + (powerHrs * 0.15).toFixed(1) + "h", detail: "Run fridge 4hrs on, 8hrs off. Keeps food safe 48hrs+ if unopened.", impact: "power", pct: 15 });
          suggestions.push({ icon: "🔥", action: "Shift to wood/propane heat", gain: "+" + (powerHrs * 0.25).toFixed(1) + "h", detail: "Eliminate furnace blower draw (300-600W). Use wood stove instead.", impact: "power", pct: 25 });
          suggestions.push({ icon: "🔌", action: "Kill standby devices", gain: "+" + (powerHrs * 0.07).toFixed(1) + "h", detail: "Unplug all non-essential: TV, router, chargers, microwave clock. Phantom loads = ~50W.", impact: "power", pct: 7 });
          suggestions.push({ icon: "💡", action: "Switch to battery lanterns", gain: "+" + (powerHrs * 0.05).toFixed(1) + "h", detail: "LED lanterns on AA batteries instead of powered lights. Save generator fuel.", impact: "power", pct: 5 });
        }
        if (waterDays < 14) {
          suggestions.push({ icon: "🛁", action: "Fill all bathtubs and containers", gain: "+2-3 days", detail: "Standard bathtub = 40 gal. Fill NOW while pressure exists. Fill pots, buckets, coolers.", impact: "water", pct: 0 });
          suggestions.push({ icon: "🚿", action: "Eliminate bathing — sponge baths only", gain: "+30% water life", detail: "Sponge bath uses 1qt vs shower at 17gal. Prioritize drinking water.", impact: "water", pct: 30 });
        }
        if (calDays < 30) {
          suggestions.push({ icon: "🍳", action: "Ration to 1,500 cal/person/day", gain: "+" + (calDays * 0.33).toFixed(1) + " days food", detail: "Reduce from 2,000 to 1,500 cal. Sustainable for weeks. Prioritize calorie-dense foods.", impact: "food", pct: 33 });
        }
        if (heatDays < 30 && climate === "cold") {
          suggestions.push({ icon: "🏠", action: "Consolidate to one heated room", gain: "+60% heat duration", detail: "Seal off unused rooms. Hang blankets over doorways. One room = less volume to heat.", impact: "heat", pct: 60 });
        }

        return (
          <div style={{ background: "linear-gradient(180deg, rgba(239,68,68,0.06), rgba(239,68,68,0.02) 40%, transparent)", borderBottom: "1px solid rgba(239,68,68,0.1)" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 20px" }}>
              {/* Status bar */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: "#ef4444", animation: "pulse 1s infinite" }} />
                <div style={{ fontSize: 12, fontWeight: 800, color: "#ef4444", textTransform: "uppercase", letterSpacing: 2 }}>Crisis Mode Active</div>
                <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", fontFamily: M }}>Elapsed: {elapsed}h</div>
                <button onClick={() => { setCrisisMode(false); setCrisisStart(null); setCrisisType(null); }} style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 6, background: "rgba(47,76,39,0.04)", border: "1px solid #dce3d5", color: "rgba(36,61,48,0.58)", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>Deactivate</button>
              </div>

              {/* Immediate Actions for Crisis Type */}
              {crisisType && (() => {
                const ct = CRISIS_TYPES.find(c => c.id === crisisType);
                if (!ct) return null;
                return (
                  <div style={{ padding: 14, marginBottom: 12, borderRadius: 10, borderLeft: "4px solid " + ct.color, background: ct.color + "08", border: "1px solid " + ct.color + "20" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 20 }}>{ct.icon}</span>
                      <div style={{ fontSize: 14, fontWeight: 800, color: ct.color, fontFamily: M }}>{ct.name}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Immediate Actions</div>
                    {ct.actions.map((a, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "5px 0", fontSize: 11, color: "rgba(36,61,48,0.6)" }}>
                        <span style={{ color: ct.color, fontWeight: 800, fontSize: 12, flexShrink: 0, fontFamily: M }}>{i + 1}.</span>
                        <span>{a}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Resource countdown */}
              <div className="pcs-crisis-grid">
                {[
                  { icon: "🔋", label: "Power", value: Math.max(powerHrs - elapsed, 0).toFixed(1), unit: "hrs left", total: powerHrs.toFixed(1) + "h total", color: (powerHrs - elapsed) > 24 ? "#22c55e" : (powerHrs - elapsed) > 6 ? "#f59e0b" : "#ef4444", pct: Math.max((powerHrs - elapsed) / Math.max(powerHrs, 1) * 100, 0) },
                  { icon: "💧", label: "Water", value: waterDays.toFixed(1), unit: "days left", total: waterGals + " gal stored", color: waterDays > 7 ? "#22c55e" : waterDays > 2 ? "#f59e0b" : "#ef4444", pct: Math.min(waterDays / 14 * 100, 100) },
                  { icon: "🔥", label: "Heat", value: climate === "cold" ? heatDays.toFixed(1) : "N/A", unit: climate === "cold" ? "days left" : "not needed", total: firewoodCords.toFixed(1) + " cords + " + propTanks + " propane", color: heatDays > 14 ? "#22c55e" : heatDays > 3 ? "#f59e0b" : "#ef4444", pct: climate === "cold" ? Math.min(heatDays / 30 * 100, 100) : 100 },
                  { icon: "🍽️", label: "Food", value: calDays.toFixed(1), unit: "days left", total: Math.round(totalCals).toLocaleString() + " cal", color: calDays > 14 ? "#22c55e" : calDays > 3 ? "#f59e0b" : "#ef4444", pct: Math.min(calDays / 30 * 100, 100) },
                ].map((r, i) => (
                  <div key={i} style={{ background: "#f0f3ec", borderRadius: 10, padding: 12, border: "1px solid " + r.color + "20" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 14 }}>{r.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(36,61,48,0.58)", textTransform: "uppercase" }}>{r.label}</span>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, fontFamily: M, color: r.color, lineHeight: 1 }}>{r.value}</div>
                    <div style={{ fontSize: 11, color: r.color, marginTop: 2 }}>{r.unit}</div>
                    <div style={{ height: 3, background: "rgba(47,76,39,0.06)", borderRadius: 2, marginTop: 6 }}>
                      <div style={{ height: "100%", width: r.pct + "%", background: r.color, borderRadius: 2, transition: "width 1s" }} />
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", marginTop: 3 }}>{r.total}</div>
                  </div>
                ))}
              </div>

              {/* Optimization suggestions */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(36,61,48,0.58)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>⚡ Optimization Suggestions</div>
              <div className="pcs-opt-grid">
                {suggestions.slice(0, 6).map((s, i) => (
                  <div key={i} style={{ padding: "8px 12px", background: "rgba(0,0,0,0.15)", borderRadius: 8, border: "1px solid #e5eadd", display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{s.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(36,61,48,0.7)" }}>{s.action}</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#22c55e", fontFamily: M }}>{s.gain}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", lineHeight: 1.4 }}>{s.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {demoData && !["surveillance", "board"].includes(activeTab) && <div className="pv-sample-banner"><Icon name="compass" size={16}/><span>You’re exploring a sample household. Your changes are saved on this device.</span><button onClick={() => setShowStartPlan(true)}>Start my own plan →</button></div>}
      {crisisMode && <div className="pv-sample-banner"><Icon name="box" size={18}/><span>Your emergency grab list: {bugOutEntries.filter(entry => !entry.grabbed).length} items remaining.</span><button onClick={() => navigate("bugout")}>Open Bug Out →</button></div>}
      {showStartPlan && <PlanNotice title="Start your own plan" eyebrow="A FRESH START" onClose={() => setShowStartPlan(false)} actions={<><button className="pv-button pv-secondary" onClick={() => setShowStartPlan(false)}>Keep exploring</button><button className="pv-button pv-primary" onClick={() => { resetToOwnPlan(); setShowStartPlan(false); openSetup(); }}>Start my plan</button></>}><p>Replace the sample household with a blank plan, then add your home, people and supplies.</p><p>This clears the sample records and any changes you made to them. You can export a backup from Settings & backups first.</p></PlanNotice>}
      {upgradeNotices.length > 0 && <PlanNotice title="More room for your preparation" eyebrow="PLAN UPGRADE" onClose={() => setUpgradeNotices([])} actions={<button className="pv-button pv-primary" onClick={() => setUpgradeNotices([])}>Keep planning</button>}><p>The free plan includes 20 entries in each supply category. A paid plan will be needed above that limit.</p><ul>{upgradeNotices.map(notice => <li key={notice.category}><strong>{CATEGORIES[notice.category]?.label || notice.category}</strong><span>{notice.count} entries</span></li>)}</ul><p><strong>You can keep saving for now.</strong> Upgrades aren’t enforced yet, and your entries have been added. Nothing has been charged.</p></PlanNotice>}
      {pageMeta[activeTab] && !selCat && <header className="pv-page-intro"><div><span className="pv-eyebrow">PREPARED FOR REAL LIFE</span><h1>{pageMeta[activeTab][0]}</h1><p>{pageMeta[activeTab][1]}</p></div><button className="pv-button pv-secondary" onClick={openSetup}><Icon name="settings" size={16}/> Household setup</button></header>}
      <div key={restoreVersion} className={!selCat && !["dashboard", "food", "water", "inventory-search", "board", "bugout", "preps", "dependencies", "emergency", "rationing", "systems", "manuals", "surveillance", "codes", "property", "simulate", "farming", "comms"].includes(activeTab) ? "pv-legacy-content" : "pv-content"}>{renderContent()}</div>

      {/* ═══ TOAST NOTIFICATION ═══ */}
      {toast && (
        <div style={{ position: "fixed", bottom: "max(80px, calc(env(safe-area-inset-bottom, 0px) + 70px))", left: "50%", transform: "translateX(-50%)", padding: "10px 20px", borderRadius: 12, background: toast.type === "success" ? "rgba(34,197,94,0.95)" : toast.type === "error" ? "rgba(239,68,68,0.95)" : "rgba(33,76,57,0.95)", color: "#243d30", fontSize: 12, fontWeight: 700, fontFamily: "inherit", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 2000, animation: "slideUp 0.2s ease", whiteSpace: "nowrap", maxWidth: "90vw", overflow: "hidden", textOverflow: "ellipsis" }}>{toast.msg}</div>
      )}
      {showAdd && <AddItemModal onAdd={handleAdd} onClose={() => { setShowAdd(false); setEditItem(null); }} editItem={editItem} initialCategory={addCat} />}
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      {/* ═══ Auth Modal ═══ */}
      {showAuth && renderAuthModal()}

      {/* ═══ Quick Start Wizard Modal ═══ */}
      {showQuickStart && (
        <HouseholdSetup
          step={qsStep} setStep={setQsStep}
          profile={propertyProfile} setProfile={setPropertyProfile}
          people={people} setPeople={setPeople}
          climate={climate} setClimate={setClimate}
          propAddress={propAddress} setPropAddress={setPropAddress}
          onComplete={(completed) => { setPropertyProfile(completed); setShowQuickStart(false); showToast("Property profile saved"); }}
          onSkip={() => setShowQuickStart(false)}
          onPeople={() => navigate("community")}
        />
      )}

      {/* ═══ Crisis Type Selector Modal ═══ */}
      {showCrisisSelector && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowCrisisSelector(false)}>
          <div style={{ background: "#ffffff", borderRadius: 16, border: "2px solid rgba(239,68,68,0.3)", maxWidth: 480, width: "100%", padding: 24, maxHeight: "80vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: "#ef4444", fontFamily: M }}>⚡ Activate Crisis Mode</h2>
            <p style={{ margin: "0 0 16px", fontSize: 11, color: "rgba(36,61,48,0.58)" }}>Select the type of crisis to receive targeted immediate action steps.</p>
            <div style={{ display: "grid", gap: 6 }}>
              {CRISIS_TYPES.map(ct => (
                <button key={ct.id} onClick={() => { setCrisisType(ct.id); setCrisisMode(true); setCrisisStart(new Date()); setShowCrisisSelector(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, border: "1px solid " + ct.color + "30", background: ct.color + "08", cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: "#243d30" }}>
                  <span style={{ fontSize: 24 }}>{ct.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: ct.color }}>{ct.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", marginTop: 2 }}>{ct.actions[0]}</div>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => setShowCrisisSelector(false)} style={{ marginTop: 12, width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #dce3d5", background: "none", color: "rgba(36,61,48,0.58)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ═══ Security & Privacy Panel ═══ */}
      {showSecurity && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowSecurity(false)}>
          <div style={{ background: "#ffffff", borderRadius: 14, width: "92%", maxWidth: 560, maxHeight: "90vh", overflow: "auto", border: "1px solid #dce3d5", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid #e0e6da", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>🔒 Security & Privacy</h3>
                <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", marginTop: 2 }}>All encryption runs locally — nothing leaves your device</div>
              </div>
              <button onClick={() => setShowSecurity(false)} style={{ background: "none", border: "none", color: "rgba(36,61,48,0.58)", fontSize: 20, cursor: "pointer" }}>×</button>
            </div>

            <div style={{ padding: "16px 22px" }}>
              {/* Status Row */}
              <div className="pcs-sec-status-grid">
                <div style={{ padding: 12, borderRadius: 8, background: "rgba(47,76,39,0.02)", border: "1px solid #e0e6da", textAlign: "center" }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{isOffline ? "📡" : "🌐"}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isOffline ? "#f59e0b" : "#22c55e" }}>{isOffline ? "Offline" : "Online"}</div>
                  <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)" }}>{isOffline ? "No data leaves device" : "Network detected"}</div>
                </div>
                <div style={{ padding: 12, borderRadius: 8, background: "rgba(47,76,39,0.02)", border: "1px solid #e0e6da", textAlign: "center" }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{dbStatus === "encrypted" ? "🔐" : dbStatus === "saved" ? "💾" : "⚪"}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: dbStatus === "encrypted" ? "#22c55e" : dbStatus === "saved" ? "#0ea5e9" : "rgba(36,61,48,0.3)" }}>
                    {dbStatus === "encrypted" ? "Encrypted" : dbStatus === "saved" ? "Saved" : dbStatus === "saving" ? "Saving..." : "Not Saved"}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)" }}>{lastSaved ? "Last: " + new Date(lastSaved).toLocaleTimeString() : "No local backup"}</div>
                </div>
                <div style={{ padding: 12, borderRadius: 8, background: "rgba(47,76,39,0.02)", border: "1px solid #e0e6da", textAlign: "center" }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>📦</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(36,61,48,0.58)" }}>{items.length} Items</div>
                  <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)" }}>{people} people · {climate}</div>
                </div>
              </div>

              {/* Messages */}
              {secMsg && (
                <div style={{ padding: "8px 12px", marginBottom: 14, borderRadius: 6, background: secMsg.startsWith("✅") ? "rgba(34,197,94,0.06)" : secMsg.startsWith("❌") || secMsg.startsWith("⚠") ? "rgba(239,68,68,0.06)" : "rgba(36,61,48,0.02)", border: "1px solid " + (secMsg.startsWith("✅") ? "rgba(34,197,94,0.15)" : secMsg.startsWith("❌") || secMsg.startsWith("⚠") ? "rgba(239,68,68,0.15)" : "rgba(36,61,48,0.06)"), fontSize: 11, color: "rgba(36,61,48,0.6)" }}>
                  {secMsg}
                </div>
              )}

              {/* ── Local Database ── */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(36,61,48,0.58)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>💾 Local Database</div>
                <div style={{ padding: 14, background: "rgba(47,76,39,0.02)", borderRadius: 8, border: "1px solid #e0e6da" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <label style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", flex: 1 }}>
                      <input type="checkbox" checked={encryptedDb} onChange={(e) => setEncryptedDb(e.target.checked)} style={{ marginRight: 6 }} />
                      Encrypt this saved backup (AES-256-GCM)
                    </label>
                  </div>
                  {encryptedDb && (
                    <div style={{ position: "relative", marginBottom: 10 }}>
                      <input type={showDbPw ? "text" : "password"} value={dbPassphrase} onChange={(e) => setDbPassphrase(e.target.value)} placeholder="Database passphrase (min 6 chars)" style={{ width: "100%", padding: "8px 36px 8px 10px", borderRadius: 6, border: "1px solid #dce3d5", background: "#f0f3ec", color: "#243d30", fontSize: 11, fontFamily: "inherit", boxSizing: "border-box" }} />
                      <button onClick={() => setShowDbPw(!showDbPw)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "rgba(36,61,48,0.58)", padding: 0 }}>{showDbPw ? "🙈" : "👁️"}</button>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={handleLocalSave} style={{ ...btnSt, flex: 1, padding: "8px 12px", fontSize: 11, fontWeight: 700, background: "rgba(34,197,94,0.08)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>💾 Save</button>
                    <button onClick={handleLocalLoad} style={{ ...btnSt, flex: 1, padding: "8px 12px", fontSize: 11, fontWeight: 700, background: "rgba(14,165,233,0.08)", color: "#0ea5e9", border: "1px solid rgba(14,165,233,0.2)", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>📂 Load</button>
                    <button onClick={handleDbWipe} style={{ ...btnSt, padding: "8px 12px", fontSize: 11, fontWeight: 700, background: "rgba(239,68,68,0.06)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>🗑️</button>
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", marginTop: 6, lineHeight: 1.5 }}>
                    Your working plan remains in browser storage. This option protects the saved backup only. {encryptedDb ? "AES-256-GCM with PBKDF2-SHA256 (310K iterations). Without your passphrase, data is unrecoverable." : "Set a passphrase to protect this backup."}
                  </div>
                </div>
              </div>

              {/* ── Encrypted Export ── */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(36,61,48,0.58)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>📤 Encrypted Export</div>
                <div style={{ padding: 14, background: "rgba(47,76,39,0.02)", borderRadius: 8, border: "1px solid #e0e6da" }}>
                  <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", marginBottom: 8 }}>Download a password-protected backup file. AES-256-GCM encrypted — unreadable without the password.</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="password" value={exportPw} onChange={(e) => setExportPw(e.target.value)} placeholder="Encryption password (min 6 chars)" style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid #dce3d5", background: "#f0f3ec", color: "#243d30", fontSize: 11, fontFamily: "inherit" }} />
                    <button onClick={handleEncryptedExport} style={{ ...btnSt, padding: "8px 16px", fontSize: 11, fontWeight: 700, background: "rgba(168,85,247,0.08)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.2)" }}>🔐 Export</button>
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", marginTop: 6 }}>File: pcs-backup-YYYY-MM-DD.enc.json · Portable, offline, tamper-evident</div>
                </div>
              </div>

              {/* ── Encrypted Import ── */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(36,61,48,0.58)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>📥 Encrypted Import</div>
                <div style={{ padding: 14, background: "rgba(47,76,39,0.02)", borderRadius: 8, border: "1px solid #e0e6da" }}>
                  <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", marginBottom: 8 }}>Restore from an encrypted backup file. Requires the same password used during export.</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="password" value={importPw} onChange={(e) => setImportPw(e.target.value)} placeholder="Decryption password" style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid #dce3d5", background: "#f0f3ec", color: "#243d30", fontSize: 11, fontFamily: "inherit" }} />
                    <button onClick={() => importRef.current?.click()} style={{ ...btnSt, padding: "8px 16px", fontSize: 11, fontWeight: 700, background: "rgba(14,165,233,0.08)", color: "#0ea5e9", border: "1px solid rgba(14,165,233,0.2)" }}>📂 Import</button>
                    <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) handleEncryptedImport(e.target.files[0]); e.target.value = ""; }} />
                  </div>
                </div>
              </div>

              {/* ── Offline Mode Info ── */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(36,61,48,0.58)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>📡 Offline Mode</div>
                <div style={{ padding: 14, background: "rgba(47,76,39,0.02)", borderRadius: 8, border: "1px solid #e0e6da" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 5, background: isOffline ? "#f59e0b" : "#22c55e", boxShadow: "0 0 6px " + (isOffline ? "#f59e0b60" : "#22c55e60") }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: isOffline ? "#f59e0b" : "#22c55e" }}>{isOffline ? "Offline — saved on this device" : "Online — Network Detected"}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(36,61,48,0.58)", lineHeight: 1.6 }}>
                    {isOffline
                      ? "No network connection detected. Keep this tab open to work with saved supplies and plans. Connected accounts can sync core data when a connection returns."
                      : user && !user.isLocal && user.authProvider !== "neon"
                        ? "Your connected account can sync supplies, properties and household settings. Saved map images, their markers, travel routes and other planning details remain on this device; export a complete backup to keep them safe."
                        : "Your working plan is saved in this browser. Maps, weather, live feeds and connected services use the network. Export a complete backup before moving to another device."
                    }
                  </div>
                  {!isOffline && (
                    <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(245,158,11,0.04)", borderRadius: 6, borderLeft: "3px solid #f59e0b", fontSize: 11, color: "rgba(245,158,11,0.6)" }}>
                      Keep this tab open if you lose your connection. Reloading the app and using live services may require the internet.
                    </div>
                  )}
                </div>
              </div>

              {/* ── Security Specs ── */}
              <div style={{ padding: 14, background: "rgba(47,76,39,0.01)", borderRadius: 8, border: "1px solid #e5eadd" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(36,61,48,0.58)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Security Specifications</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11, color: "rgba(36,61,48,0.58)" }}>
                  {[
                    ["Cipher", "AES-256-GCM"],
                    ["Key Derivation", "PBKDF2-SHA256"],
                    ["Iterations", "310,000"],
                    ["Salt", "128-bit random"],
                    ["IV", "96-bit random"],
                    ["Storage", "Local only"],
                    ["Telemetry", "None"],
                    ["Core data sync", user && !user.isLocal && user.authProvider !== "neon" && supabaseConfigured ? "Enabled" : "Disabled"],
                  ].map(([k, v], i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                      <span>{k}</span>
                      <span style={{ fontFamily: M, color: "rgba(36,61,48,0.58)" }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
}
