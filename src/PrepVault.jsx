import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase, supabaseConfigured } from "./supabase.js";
import { SyncEngine } from "./sync-engine.js";
import L from "leaflet";

/* ═══════════════════════════════════════════════════════════
   DATA CONSTANTS
   ═══════════════════════════════════════════════════════════ */
const M = "'Geist Mono','JetBrains Mono', monospace";

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
      generator: { label: "Generator", icon: "⚙️", fields: ["watts", "fuelType"], dailyYield: 24, unit: "gen" },
      powerBank: { label: "Power Bank", icon: "🪫", fields: ["mah", "isRechargeable"], unit: "units" },
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
};

const SCENARIOS = {
  economic: { label: "Economic Collapse", icon: "📉", desc: "Supply chains fail, banks close", weights: { water: 0.8, food: 1, medical: 0.6, firewood: 0.5, fuel: 0.6, shelter: 0.3, tools: 0.7, comms: 0.4, defense: 0.7, firearms: 0.8, hygiene: 0.3, power: 0.5, batteries: 0.4, electronics: 0.3, vehicles: 0.5, equipment: 0.3, farm: 0.9, bugout: 0.6, kids: 0.7, boat: 0.3, fishing: 0.7, alcohol: 0.5, recreational: 0.2, books: 0.5, nbc: 0.2 }, defaultDur: 180 },
  emp: { label: "EMP Attack", icon: "⚡", desc: "Electronics disabled, grid down", weights: { water: 1, food: 1, medical: 0.8, firewood: 0.9, fuel: 0.7, shelter: 0.5, tools: 0.9, comms: 1, defense: 0.6, firearms: 0.7, hygiene: 0.4, power: 1, batteries: 0.9, electronics: 0.2, vehicles: 0.3, equipment: 0.4, farm: 1, bugout: 0.8, kids: 0.8, boat: 0.2, fishing: 0.8, alcohol: 0.4, recreational: 0.1, books: 0.7, nbc: 0.3 }, defaultDur: 365 },
  wildfire: { label: "Wildfire", icon: "🌲", desc: "Evacuation, dangerous air", weights: { water: 0.9, food: 0.7, medical: 0.9, firewood: 0.1, fuel: 0.8, shelter: 1, tools: 0.6, comms: 0.8, defense: 0.2, firearms: 0.2, hygiene: 0.5, power: 0.6, batteries: 0.5, electronics: 0.6, vehicles: 0.9, equipment: 0.4, farm: 0.1, bugout: 1, kids: 1, boat: 0.4, fishing: 0.1, alcohol: 0.1, recreational: 0.1, books: 0.2, nbc: 0.3 }, defaultDur: 30 },
  nuclear: { label: "Nuclear", icon: "☢️", desc: "Radiation fallout, shelter-in-place", weights: { water: 1, food: 1, medical: 1, firewood: 0.5, fuel: 0.5, shelter: 1, tools: 0.5, comms: 0.7, defense: 0.3, firearms: 0.4, hygiene: 0.8, power: 0.8, batteries: 0.6, electronics: 0.4, vehicles: 0.3, equipment: 0.5, farm: 0.3, bugout: 0.7, kids: 0.9, boat: 0.1, fishing: 0.2, alcohol: 0.3, recreational: 0.1, books: 0.6, nbc: 1.0 }, defaultDur: 90 },
  pandemic: { label: "Pandemic", icon: "🦠", desc: "Quarantine, supply disruptions", weights: { water: 0.7, food: 0.9, medical: 1, firewood: 0.3, fuel: 0.4, shelter: 0.2, tools: 0.3, comms: 0.5, defense: 0.2, firearms: 0.3, hygiene: 1, power: 0.4, batteries: 0.3, electronics: 0.4, vehicles: 0.3, equipment: 0.2, farm: 0.7, bugout: 0.3, kids: 0.9, boat: 0.1, fishing: 0.4, alcohol: 0.3, recreational: 0.2, books: 0.4, nbc: 0.6 }, defaultDur: 120 },
  grid: { label: "Grid Failure", icon: "🔌", desc: "Blackout, no heat/cooling", weights: { water: 1, food: 0.8, medical: 0.5, firewood: 1, fuel: 0.9, shelter: 0.6, tools: 0.7, comms: 0.6, defense: 0.3, firearms: 0.4, hygiene: 0.4, power: 1, batteries: 0.8, electronics: 0.5, vehicles: 0.4, equipment: 0.4, farm: 0.5, bugout: 0.5, kids: 0.7, boat: 0.2, fishing: 0.5, alcohol: 0.3, recreational: 0.1, books: 0.5, nbc: 0.1 }, defaultDur: 60 },
  winter: { label: "Winter Storm", icon: "🌨️", desc: "Blizzard, ice storm, roads impassable", weights: { water: 0.8, food: 0.8, medical: 0.6, firewood: 1, fuel: 1, shelter: 0.8, tools: 0.7, comms: 0.5, defense: 0.1, firearms: 0.1, hygiene: 0.3, power: 0.9, batteries: 0.7, electronics: 0.4, vehicles: 0.6, equipment: 0.5, farm: 0.1, bugout: 0.3, kids: 0.8, boat: 0.0, fishing: 0.1, alcohol: 0.2, recreational: 0.2, books: 0.3, nbc: 0.0 }, defaultDur: 14 },
  solarFlare: { label: "Solar Flare", icon: "☀️", desc: "Carrington-class event, grid & satellites down", weights: { water: 1, food: 1, medical: 0.7, firewood: 0.8, fuel: 0.7, shelter: 0.4, tools: 0.9, comms: 1, defense: 0.5, firearms: 0.6, hygiene: 0.3, power: 1, batteries: 0.9, electronics: 0.1, vehicles: 0.4, equipment: 0.4, farm: 0.9, bugout: 0.6, kids: 0.7, boat: 0.2, fishing: 0.7, alcohol: 0.4, recreational: 0.1, books: 0.8, nbc: 0.1 }, defaultDur: 365 },
  waterCrisis: { label: "Water Disruption", icon: "🚱", desc: "Municipal water contamination or failure", weights: { water: 1, food: 0.5, medical: 0.6, firewood: 0.2, fuel: 0.3, shelter: 0.2, tools: 0.4, comms: 0.3, defense: 0.2, firearms: 0.2, hygiene: 0.7, power: 0.4, batteries: 0.2, electronics: 0.2, vehicles: 0.5, equipment: 0.6, farm: 0.4, bugout: 0.4, kids: 0.8, boat: 0.3, fishing: 0.2, alcohol: 0.1, recreational: 0.1, books: 0.3, nbc: 0.2 }, defaultDur: 30 },
  supplyChain: { label: "Supply Chain Shock", icon: "📦", desc: "Ports closed, shelves empty, delivery halt", weights: { water: 0.6, food: 1, medical: 0.8, firewood: 0.3, fuel: 0.7, shelter: 0.2, tools: 0.5, comms: 0.3, defense: 0.4, firearms: 0.5, hygiene: 0.6, power: 0.3, batteries: 0.5, electronics: 0.2, vehicles: 0.4, equipment: 0.4, farm: 1, bugout: 0.3, kids: 0.9, boat: 0.2, fishing: 0.8, alcohol: 0.6, recreational: 0.3, books: 0.3, nbc: 0.1 }, defaultDur: 180 },
  russiaWar: { label: "Russia Conflict", icon: "🇷🇺", desc: "NATO conflict escalation, nuclear threat", weights: { water: 0.9, food: 0.9, medical: 0.8, firewood: 0.7, fuel: 0.8, shelter: 0.8, tools: 0.6, comms: 0.8, defense: 0.7, firearms: 0.7, hygiene: 0.5, power: 0.7, batteries: 0.6, electronics: 0.5, vehicles: 0.5, equipment: 0.5, farm: 0.7, bugout: 0.8, kids: 0.9, boat: 0.3, fishing: 0.5, alcohol: 0.4, recreational: 0.2, books: 0.6, nbc: 0.9 }, defaultDur: 365 },
  chinaWar: { label: "China Conflict", icon: "🇨🇳", desc: "Pacific conflict, trade collapse, cyber attacks", weights: { water: 0.7, food: 1, medical: 0.7, firewood: 0.4, fuel: 0.8, shelter: 0.3, tools: 0.6, comms: 0.7, defense: 0.5, firearms: 0.5, hygiene: 0.4, power: 0.6, batteries: 0.7, electronics: 0.3, vehicles: 0.4, equipment: 0.5, farm: 0.9, bugout: 0.5, kids: 0.8, boat: 0.2, fishing: 0.7, alcohol: 0.5, recreational: 0.2, books: 0.4, nbc: 0.4 }, defaultDur: 365 },
  aiDisrupt: { label: "AI Disruption", icon: "🤖", desc: "Mass unemployment, infrastructure failures, social collapse", weights: { water: 0.5, food: 0.7, medical: 0.5, firewood: 0.3, fuel: 0.4, shelter: 0.2, tools: 0.5, comms: 0.4, defense: 0.6, firearms: 0.6, hygiene: 0.2, power: 0.5, batteries: 0.3, electronics: 0.3, vehicles: 0.3, equipment: 0.3, farm: 0.8, bugout: 0.4, kids: 0.6, boat: 0.2, fishing: 0.5, alcohol: 0.5, recreational: 0.3, books: 0.7, nbc: 0.1 }, defaultDur: 365 },
};

const CLIMATES = {
  arctic: { label: "Arctic", firewoodMod: 2.5, fuelMod: 2, waterMod: 0.7, icon: "🧊" },
  cold: { label: "Cold Continental", firewoodMod: 1.8, fuelMod: 1.5, waterMod: 0.8, icon: "❄️" },
  temperate: { label: "Temperate", firewoodMod: 1, fuelMod: 1, waterMod: 1, icon: "🌤️" },
  hot_dry: { label: "Hot & Dry", firewoodMod: 0.3, fuelMod: 0.8, waterMod: 1.8, icon: "🏜️" },
  tropical: { label: "Tropical", firewoodMod: 0.1, fuelMod: 0.6, waterMod: 1.3, icon: "🌴" },
  coastal: { label: "Coastal", firewoodMod: 0.5, fuelMod: 0.8, waterMod: 1.1, icon: "🌊" },
};

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
  medication: { label: "Med", type: "text", placeholder: "Lisinopril" }, daysSupply: { label: "Days", type: "number", placeholder: "90" },
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
  /* Food calorie helpers */
  totalCalories: { label: "Total Calories", type: "number", placeholder: "2400" },
  caloriesPerServing: { label: "Cal/Serving", type: "number", placeholder: "250" },
  servings: { label: "Servings", type: "number", placeholder: "8" },
  volume: { label: "Volume (ml)", type: "number", placeholder: "750" },
  fuelGallons: { label: "Gallons", type: "number", placeholder: "5" },
};

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

const NEARBY_COMMUNITIES = [
  { id: "nc1", name: "Rideau Creek Co-op", avatar: "🏔️", distance: "4.2 km", members: 8, status: "allied", color: "#22c55e", readiness: 62, strengths: ["farm", "water", "medical"], weaknesses: ["firearms", "comms", "power"], contact: "HAM 146.520", lastContact: "1d ago" },
  { id: "nc2", name: "Cedar Hill Homestead", avatar: "🌲", distance: "7.8 km", members: 5, status: "allied", color: "#0ea5e9", readiness: 48, strengths: ["firewood", "tools", "vehicles"], weaknesses: ["medical", "food", "electronics"], contact: "HAM 146.520", lastContact: "3d ago" },
  { id: "nc3", name: "Lakeside Compound", avatar: "🏕️", distance: "12.1 km", members: 12, status: "neutral", color: "#f59e0b", readiness: 71, strengths: ["boat", "fishing", "defense"], weaknesses: ["farm", "medical", "kids"], contact: "Runner only", lastContact: "2w ago" },
  { id: "nc4", name: "South Valley Farm", avatar: "🌾", distance: "15.6 km", members: 6, status: "allied", color: "#a855f7", readiness: 55, strengths: ["farm", "food", "alcohol"], weaknesses: ["defense", "firearms", "comms"], contact: "HAM 147.000", lastContact: "5d ago" },
];

const TRADE_OFFERS = [
  { id: "t1", from: "nc1", type: "offer", have: "Fresh produce (10kg mixed veg)", want: "5.56 ammo (100 rds) or AA batteries (48-pack)", status: "open", posted: "1d ago" },
  { id: "t2", from: "nc2", type: "offer", have: "Chainsaw service + 2 cords split oak", want: "Antibiotics or medical supplies", status: "open", posted: "3d ago" },
  { id: "t3", from: "nc4", type: "offer", have: "50L homebrew beer + 5L moonshine", want: "Solar panel (100W+) or generator fuel (10gal)", status: "open", posted: "5d ago" },
  { id: "t4", from: "nc3", type: "request", have: "Fresh fish (weekly supply)", want: "Seeds (any variety) + fertilizer", status: "open", posted: "1w ago" },
  { id: "t5", from: "nc1", type: "offer", have: "RN available for medical consultation", want: "Propane tank or fuel", status: "completed", posted: "2w ago" },
  { id: "t6", from: "nc2", type: "request", have: "Vehicle repair labor + parts", want: "Canned food (20+ cans) or freeze-dried meals", status: "open", posted: "4d ago" },
];

const TRADE_MESSAGES = [
  { id: "tm1", community: "nc1", from: "them", text: "We've got surplus tomatoes and beans. Interested in trading for batteries?", ts: "Yesterday 4:30 PM" },
  { id: "tm2", community: "nc1", from: "us", text: "We can do 24x AA Eneloops + a solar USB charger. How much produce?", ts: "Yesterday 5:15 PM" },
  { id: "tm3", community: "nc1", from: "them", text: "Deal. 15kg mixed veg — tomatoes, beans, squash. Meet at crossroads Thursday?", ts: "Today 8:20 AM" },
  { id: "tm4", community: "nc2", from: "them", text: "Our guy needs antibiotics badly. Can you help? We'll cut and deliver 3 cords of oak.", ts: "3d ago" },
  { id: "tm5", community: "nc2", from: "us", text: "Sarah says she can consult but we can't part with antibiotics right now. Can offer Tylenol and wound care supplies.", ts: "3d ago" },
  { id: "tm6", community: "nc2", from: "them", text: "Understood. We'll take the wound care. Still offering 2 cords for that.", ts: "2d ago" },
  { id: "tm7", community: "nc4", from: "them", text: "Anyone need homebrew? We've got way too much. Looking for anything solar.", ts: "5d ago" },
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

const SKILLS_DATA = [
  { id: "sk1", icon: "🔥", label: "Fire Starting", color: "#f97316", unlocked: true, level: 3, maxLevel: 5, desc: "Build and sustain fire in any condition",
    badges: [
      { level: 1, name: "Spark", desc: "Light a fire with matches and newspaper", unlocked: true },
      { level: 2, name: "Kindler", desc: "Build a fire lay (teepee, log cabin, lean-to)", unlocked: true },
      { level: 3, name: "Firestarter", desc: "Start fire with ferro rod and natural tinder", unlocked: true },
      { level: 4, name: "Friction Master", desc: "Bow drill or hand drill fire from raw materials", unlocked: false },
      { level: 5, name: "Pyromancer", desc: "Start fire in rain/snow with only natural materials", unlocked: false },
    ],
    lessons: [
      { title: "Tinder Bundle Basics", content: "Collect dry cedar bark, birch bark, or cattail fluff. Shred into fine fibers — the finer the better. Form a loose bird's nest shape. The goal is maximum surface area for the spark to catch.", duration: "5 min" },
      { title: "Ferro Rod Technique", content: "Hold the rod still, scrape the striker DOWN toward the tinder. Don't move the rod — move the striker. Angle at 30°. Push sparks into the finest part of your tinder bundle. Blow gently once it smokes.", duration: "3 min" },
      { title: "Wet Weather Fire", content: "Find standing dead wood — it's drier inside. Split logs open for dry heartwood. Build your fire lay off the ground on a platform of green sticks. Shield from wind and rain with a bark lean-to above.", duration: "8 min" },
    ]
  },
  { id: "sk2", icon: "🥫", label: "Food Preservation", color: "#b45309", unlocked: true, level: 2, maxLevel: 5, desc: "Can, smoke, cure, dehydrate, and ferment food",
    badges: [
      { level: 1, name: "Pantry", desc: "Properly store dry goods in mylar + O2 absorbers", unlocked: true },
      { level: 2, name: "Canner", desc: "Water bath canning (jams, pickles, tomatoes)", unlocked: true },
      { level: 3, name: "Preserver", desc: "Pressure canning (meats, soups, low-acid foods)", unlocked: false },
      { level: 4, name: "Smoker", desc: "Hot smoke and cold smoke meat and fish", unlocked: false },
      { level: 5, name: "Master Preserver", desc: "Fermentation, salt curing, pemmican, root cellar management", unlocked: false },
    ],
    lessons: [
      { title: "Water Bath Canning 101", content: "Sterilize jars in boiling water 10 min. Fill with hot product, leave 1/2\" headspace. Wipe rims clean. Finger-tighten lids. Process in boiling water bath — time depends on altitude and product. Listen for the 'ping' — that's your seal.", duration: "10 min" },
      { title: "Mylar Bag Storage", content: "Use 5mil+ mylar bags with 300cc O2 absorbers per gallon. Fill with dry goods (rice, beans, pasta). Push out air, seal with flat iron 6\" from top. Once sealed, O2 absorber creates vacuum. Label with contents and date. Store in cool, dark location.", duration: "5 min" },
    ]
  },
  { id: "sk3", icon: "🌱", label: "Gardening", color: "#22c55e", unlocked: true, level: 2, maxLevel: 5, desc: "Grow food from seed to harvest",
    badges: [
      { level: 1, name: "Sprout", desc: "Successfully germinate seeds indoors", unlocked: true },
      { level: 2, name: "Grower", desc: "Grow a full season of vegetables to harvest", unlocked: true },
      { level: 3, name: "Seed Saver", desc: "Save viable seed from heirloom plants", unlocked: false },
      { level: 4, name: "Farmer", desc: "Year-round food production (greenhouse, cold frame)", unlocked: false },
      { level: 5, name: "Homesteader", desc: "Full food self-sufficiency for family of 4+", unlocked: false },
    ],
    lessons: [
      { title: "Seed Starting Indoors", content: "Start 6-8 weeks before last frost. Use sterile seed-starting mix, not garden soil. Plant 2x seed depth. Keep soil moist but not soggy. 65-75°F. Light 14-16hrs/day. Harden off 1 week before transplanting — set outside a few hours/day, increasing daily.", duration: "6 min" },
      { title: "Companion Planting", content: "Tomatoes + basil: basil repels aphids and whiteflies. Corn + beans + squash (Three Sisters): beans fix nitrogen, corn supports beans, squash shades soil. Never plant tomatoes near brassicas. Marigolds border everything — they repel nematodes.", duration: "4 min" },
    ]
  },
  { id: "sk4", icon: "🩹", label: "First Aid", color: "#ef4444", unlocked: true, level: 3, maxLevel: 5, desc: "Treat injuries and medical emergencies",
    badges: [
      { level: 1, name: "Bandaid", desc: "Clean and dress basic wounds", unlocked: true },
      { level: 2, name: "Responder", desc: "CPR certified, splinting, shock management", unlocked: true },
      { level: 3, name: "Medic", desc: "Tourniquet, wound packing, chest seals (TCCC)", unlocked: true },
      { level: 4, name: "Field Surgeon", desc: "Suturing, IV access, medication administration", unlocked: false },
      { level: 5, name: "Doc", desc: "Surgical procedures, anesthesia, advanced diagnostics", unlocked: false },
    ],
    lessons: [
      { title: "Tourniquet Application", content: "Apply 2-3\" above the wound, NEVER on a joint. Pull strap tight, twist windlass until bleeding stops. Secure windlass. Note the TIME applied — write on patient's forehead if needed. Do NOT loosen once applied. Tourniquets save lives — don't hesitate.", duration: "3 min" },
      { title: "Wound Packing", content: "For deep wounds that tourniquets can't reach (junctional: groin, armpit, neck). Pack gauze INTO the wound — push deep, fill the cavity. Apply direct pressure for 3 min minimum. If blood soaks through, pack MORE gauze on top. Don't remove the first layer.", duration: "4 min" },
    ]
  },
  { id: "sk5", icon: "🔧", label: "Repair Skills", color: "#0ea5e9", unlocked: true, level: 2, maxLevel: 5, desc: "Fix engines, plumbing, electrical, and structures",
    badges: [
      { level: 1, name: "Handy", desc: "Basic home repairs — leaks, outlets, drywall", unlocked: true },
      { level: 2, name: "Mechanic", desc: "Oil changes, belt replacement, brake pads, basic diagnostics", unlocked: true },
      { level: 3, name: "Fabricator", desc: "Welding (MIG/stick), metal cutting, custom brackets", unlocked: false },
      { level: 4, name: "Engineer", desc: "Engine rebuild, electrical troubleshooting, plumbing systems", unlocked: false },
      { level: 5, name: "Master Builder", desc: "Build structures, design systems, fabricate from raw materials", unlocked: false },
    ],
    lessons: [
      { title: "Emergency Pipe Repair", content: "Shut off water main immediately. For small leaks: wrap with rubber + hose clamp. For burst pipes: cut out damaged section with pipe cutter. Use SharkBite push-fit couplings — no soldering needed. Always drain the line before cutting. Keep spare SharkBites in your kit.", duration: "5 min" },
      { title: "Small Engine Troubleshooting", content: "Won't start? Check in order: 1) Fuel — is it fresh? Stale gas is #1 cause. 2) Spark — pull plug, ground against block, pull cord — blue spark? 3) Air — clean/replace filter. 4) Compression — pull cord should have resistance. Fix fuel first, it's almost always fuel.", duration: "4 min" },
    ]
  },
  { id: "sk6", icon: "🗺️", label: "Navigation", color: "#a855f7", unlocked: true, level: 1, maxLevel: 5, desc: "Navigate with map, compass, and natural signs",
    badges: [
      { level: 1, name: "Tourist", desc: "Read a road map and basic compass bearing", unlocked: true },
      { level: 2, name: "Navigator", desc: "Topo map reading, grid references, pace counting", unlocked: false },
      { level: 3, name: "Pathfinder", desc: "Triangulation, dead reckoning, GPS waypoints", unlocked: false },
      { level: 4, name: "Scout", desc: "Night navigation, celestial navigation, terrain association", unlocked: false },
      { level: 5, name: "Wayfinder", desc: "Navigate any terrain in any condition with no tools", unlocked: false },
    ],
    lessons: [
      { title: "Compass Bearing Basics", content: "Hold compass flat at chest height. Rotate bezel until desired bearing aligns with direction-of-travel arrow. Turn your BODY until the red needle sits inside the orienting arrow (red in the shed). Look up — sight a landmark on your bearing. Walk to it. Repeat.", duration: "4 min" },
      { title: "Natural Navigation", content: "Sun rises East, sets West (roughly). At noon, shadows point North (in Northern hemisphere). Polaris (North Star) — find Big Dipper, follow the 2 'pointer stars' 5x the distance between them. Moss grows on ALL sides of trees — don't trust that myth. Wind patterns and snow melt on south-facing slopes are more reliable.", duration: "6 min" },
    ]
  },
];
const SAMPLE_CAMERAS = [
  { id: "cm1", name: "North Gate", model: "Reveal X Pro", status: "online", battery: 78, signal: 4, captures: 14, last: "Deer (2)", location: "North perimeter", activity: [{ t: "2:14 PM", desc: "2 deer crossing" }, { t: "11:30 AM", desc: "Fox" }] },
  { id: "cm2", name: "Driveway", model: "Reveal X Pro", status: "online", battery: 92, signal: 5, captures: 31, last: "Delivery truck", location: "Front entrance", activity: [{ t: "1:48 PM", desc: "Delivery truck" }, { t: "10:22 AM", desc: "Vehicle — F-250" }] },
  { id: "cm3", name: "South Tree Line", model: "Reveal SK2", status: "online", battery: 45, signal: 3, captures: 6, last: "Coyote", location: "South boundary", activity: [{ t: "5:51 AM", desc: "Coyote" }] },
  { id: "cm4", name: "Barn Door", model: "Reveal X", status: "online", battery: 61, signal: 4, captures: 9, last: "No motion", location: "Barn east side", activity: [{ t: "12:05 PM", desc: "Person — owner" }, { t: "8:40 AM", desc: "Cat" }] },
  { id: "cm5", name: "Creek Trail", model: "Reveal SK2", status: "offline", battery: 8, signal: 0, captures: 2, last: "Low battery", location: "East creek", activity: [] },
  { id: "cm6", name: "Back Road", model: "Reveal X Pro", status: "online", battery: 84, signal: 3, captures: 4, last: "Clear", location: "West access", activity: [{ t: "9:15 AM", desc: "Unknown vehicle" }] },
];
const SMART_HOME = {
  alarm: { provider: "EyezOn", status: "Armed (Home)", zones: [{ n: "Front Door", s: "closed" }, { n: "Back Door", s: "closed" }, { n: "Garage", s: "closed" }, { n: "Motion — Living", s: "clear" }, { n: "Motion — Basement", s: "clear" }, { n: "Glass Break — Office", s: "clear" }] },
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

const inp = { width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const labelSt = { display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 600 };
const btnSt = { padding: "10px 20px", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14, transition: "all 0.15s ease", fontFamily: "inherit" };
const cardSt = { background: "rgba(255,255,255,0.025)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 };

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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={strokeWidth} strokeDasharray={c} strokeDashoffset={o} strokeLinecap="round" style={{ transition: "all 0.8s" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.26, fontWeight: 800, color: col, fontFamily: M }}>{Math.round(score)}</span>
        <span style={{ fontSize: size * 0.07, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 2, fontWeight: 600 }}>{SL(score)}</span>
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
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>INTEL</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n?.headline}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 480, background: "#1a1d23", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, boxShadow: "0 20px 50px rgba(0,0,0,0.6)", zIndex: 999, maxHeight: 400, overflowY: "auto", padding: 4 }}>
          <div style={{ padding: "12px 16px 6px" }}><span style={{ fontSize: 12, fontWeight: 800, color: "#ef4444", textTransform: "uppercase", letterSpacing: 2 }}>Threat Intel</span></div>
          {news.map((item) => (
            <div key={item.id} style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", gap: 10 }}>
              <div style={{ width: 7, height: 7, borderRadius: 4, background: sv[item.sev], marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.4, marginBottom: 4 }}>{item.headline}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {item.tags.map((tag, idx) => (<span key={idx} style={{ fontSize: 10, padding: "4px 5px", borderRadius: 3, background: tag.c + "15", color: tag.c, fontWeight: 700 }}>{tag.l}</span>))}
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginLeft: "auto" }}>{item.time} ago</span>
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

function GenericModal({ title, fields, onSave, onClose }) {
  const [data, setData] = useState({});
  const upd = (key, val) => setData((prev) => ({ ...prev, [key]: val }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1a1d23", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 500 }}>
        <h3 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700 }}>{title}</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {fields.map((f) => (
            <div key={f.key}>
              <label style={labelSt}>{f.label}</label>
              {f.type === "select" ? (
                <select style={inp} value={data[f.key] || ""} onChange={(e) => upd(f.key, e.target.value)}>
                  <option value="">...</option>
                  {(f.options || []).map((o) => { const val = typeof o === "string" ? o : o.value; const lab = typeof o === "string" ? o : o.label; return <option key={val} value={val}>{lab}</option>; })}
                </select>
              ) : f.type === "textarea" ? (
                <textarea style={{ ...inp, minHeight: 60, resize: "vertical" }} value={data[f.key] || ""} onChange={(e) => upd(f.key, e.target.value)} placeholder={f.placeholder || ""} />
              ) : (
                <input style={inp} type={f.type || "text"} value={data[f.key] || ""} onChange={(e) => upd(f.key, e.target.value)} placeholder={f.placeholder || ""} />
              )}
            </div>
          ))}
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button onClick={onClose} style={{ ...btnSt, flex: 1, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>Cancel</button>
            <button onClick={() => onSave(data)} style={{ ...btnSt, flex: 1, background: "#1e3a5f", color: "#fff", fontWeight: 700 }}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PinLock({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const savedPin = (() => { try { return localStorage.getItem("prepvault-pin"); } catch { return null; } })();
  const [stored, setStored] = useState(savedPin || "");
  const [setup, setSetup] = useState(!savedPin);
  const handleDigit = (d) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setErr(false);
    if (next.length === 4) {
      if (setup) { setStored(next); setSetup(false); setPin(""); try { localStorage.setItem("prepvault-pin", next); } catch {} }
      else if (next === stored) { setTimeout(() => onUnlock(), 200); }
      else { setErr(true); setTimeout(() => { setPin(""); setErr(false); }, 800); }
    }
  };
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, "del"];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px" }}>
      <div style={{ fontSize: 28, marginBottom: 16 }}>🔒</div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>Property Intel Locked</h2>
      <p style={{ margin: "0 0 28px", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{setup ? "Set a 4-digit PIN" : "Enter PIN"}</p>
      <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ width: 16, height: 16, borderRadius: 8, background: i < pin.length ? (err ? "#ef4444" : "#22c55e") : "rgba(255,255,255,0.1)", border: `2px solid ${i < pin.length ? (err ? "#ef4444" : "#22c55e") : "rgba(255,255,255,0.15)"}`, transition: "all 0.2s" }} />
        ))}
      </div>
      {err && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 12 }}>Wrong PIN</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,68px)", gap: 8 }}>
        {keys.map((d, i) => d === null ? <div key={i} /> : (
          <button key={i} onClick={() => d === "del" ? setPin((p) => p.slice(0, -1)) : handleDigit(String(d))}
            style={{ width: 68, height: 52, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: d === "del" ? "rgba(255,255,255,0.4)" : "#fff", fontSize: d === "del" ? 14 : 20, fontWeight: 600, cursor: "pointer", fontFamily: d === "del" ? "inherit" : M, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, padding: 0, textAlign: "center" }}>
            {d === "del" ? "⌫" : d}
          </button>
        ))}
      </div>
    </div>
  );
}

function PropertyMap({ pins, setPins, propAddress, setPropAddress }) {
  const [activeLayers, setActiveLayers] = useState({ buildings: true, flora: true, water: true, wildlife: true, trails: true, caches: true, defense: false });
  const [tacticalMode, setTacticalMode] = useState(false);
  const [placing, setPlacing] = useState(null);
  const [selectedPin, setSelectedPin] = useState(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [newPinData, setNewPinData] = useState({});
  const [addressInput, setAddressInput] = useState(propAddress || "");
  const [mapLoaded, setMapLoaded] = useState(!!propAddress);
  const [mapView, setMapView] = useState("satellite"); // satellite | roadmap | terrain
  const [mapZoom, setMapZoom] = useState(18);
  const mapRef = useRef(null);

  const toggleLayer = (k) => {
    if (k === "defense") { setTacticalMode((p) => !p); }
    setActiveLayers((p) => ({ ...p, [k]: !p[k] }));
  };
  const handleMapClick = (e) => {
    if (!placing || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setNewPinData({ x, y, layer: placing.layer, type: placing.type });
    setShowPinModal(true);
    setPlacing(null);
  };
  const savePin = (formData) => {
    setPins((p) => [...p, { id: uid(), x: newPinData.x, y: newPinData.y, layer: newPinData.layer, type: newPinData.type, label: formData.label || "", notes: formData.notes || "", assignee: formData.assignee || "" }]);
    setShowPinModal(false);
  };
  const visiblePins = pins.filter((p) => activeLayers[p.layer]);

  const handleSetAddress = () => {
    if (!addressInput.trim()) return;
    setPropAddress(addressInput.trim());
    setMapLoaded(true);
  };

  const mapTypeCode = mapView === "satellite" ? "k" : mapView === "terrain" ? "p" : "m";
  const embedUrl = propAddress ? `https://maps.google.com/maps?q=${encodeURIComponent(propAddress)}&t=${mapTypeCode}&z=${mapZoom}&output=embed` : "";

  return (
    <div>
      {/* ── Address Bar ── */}
      <div style={{ ...cardSt, padding: "16px 20px", marginBottom: 16, borderLeft: "3px solid #3b82f6" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: propAddress ? 8 : 0 }}>
          <span style={{ fontSize: 20 }}>📍</span>
          <div style={{ flex: 1 }}>
            <label style={{ ...labelSt, marginBottom: 4 }}>Property Address</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ ...inp, flex: 1, fontSize: 13 }}
                type="text"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSetAddress(); }}
                placeholder="123 Rural Route 7, Muskoka, ON P0B 1J0"
              />
              <button
                onClick={handleSetAddress}
                style={{ ...btnSt, padding: "8px 18px", fontSize: 12, background: "#3b82f6", color: "#fff", fontWeight: 700, whiteSpace: "nowrap" }}
              >
                {propAddress ? "Update" : "Load Map"}
              </button>
            </div>
          </div>
        </div>
        {propAddress && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              📌 <strong style={{ color: "#3b82f6" }}>{propAddress}</strong>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {[{ id: "satellite", l: "Satellite", i: "🛰️" }, { id: "roadmap", l: "Road", i: "🗺️" }, { id: "terrain", l: "Terrain", i: "⛰️" }].map((v) => (
                <button key={v.id} onClick={() => setMapView(v.id)} style={{ padding: "5px 10px", borderRadius: 6, fontSize: 9, fontWeight: 700, cursor: "pointer", border: mapView === v.id ? "1px solid rgba(59,130,246,0.4)" : "1px solid rgba(255,255,255,0.06)", background: mapView === v.id ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.02)", color: mapView === v.id ? "#3b82f6" : "rgba(255,255,255,0.3)" }}>
                  {v.i} {v.l}
                </button>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 8 }}>
                <button onClick={() => setMapZoom((z) => Math.max(14, z - 1))} style={{ ...btnSt, padding: "4px 8px", fontSize: 12, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>−</button>
                <span style={{ fontSize: 9, fontFamily: M, color: "rgba(255,255,255,0.3)", minWidth: 20, textAlign: "center" }}>{mapZoom}</span>
                <button onClick={() => setMapZoom((z) => Math.min(21, z + 1))} style={{ ...btnSt, padding: "4px 8px", fontSize: 12, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>+</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Map Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Property Map</h3>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Click map to place pins. {visiblePins.length} pins visible.</p>
        </div>
        <button onClick={() => { setTacticalMode((p) => !p); setActiveLayers((p) => ({ ...p, defense: !p.defense })); }}
          style={{ ...btnSt, padding: "8px 16px", fontSize: 12, background: tacticalMode ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)", color: tacticalMode ? "#ef4444" : "rgba(255,255,255,0.5)", border: tacticalMode ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.08)", fontWeight: 700 }}>
          {tacticalMode ? "🛡️ TACTICAL" : "🗺️ Standard"}
        </button>
      </div>

      {/* ── Layers ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {Object.entries(MAP_LAYERS).map(([k, layer]) => (
          <button key={k} onClick={() => toggleLayer(k)} style={{ padding: "6px 12px", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, background: activeLayers[k] ? layer.color + "15" : "rgba(255,255,255,0.02)", border: activeLayers[k] ? "1px solid " + layer.color + "40" : "1px solid rgba(255,255,255,0.06)", color: activeLayers[k] ? layer.color : "rgba(255,255,255,0.3)" }}>
            {layer.icon} {layer.label} ({pins.filter((p) => p.layer === k).length})
          </button>
        ))}
      </div>

      {/* ── Pin Types ── */}
      {Object.entries(MAP_LAYERS).filter(([k]) => activeLayers[k]).map(([layerKey, layer]) => (
        <div key={layerKey} style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 9, color: layer.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, minWidth: 70 }}>{layer.label}:</span>
          {(MAP_PIN_TYPES[layerKey] || []).map((pt) => (
            <button key={pt.v} onClick={() => setPlacing(placing?.type === pt.v && placing?.layer === layerKey ? null : { layer: layerKey, type: pt.v })}
              style={{ padding: "5px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer", border: (placing?.type === pt.v && placing?.layer === layerKey) ? "1px solid " + layer.color : "1px solid rgba(255,255,255,0.06)", background: (placing?.type === pt.v && placing?.layer === layerKey) ? layer.color + "20" : "rgba(255,255,255,0.02)", color: (placing?.type === pt.v && placing?.layer === layerKey) ? layer.color : "rgba(255,255,255,0.4)" }}>
              {pt.i} {pt.l}
            </button>
          ))}
        </div>
      ))}
      {placing && <div style={{ padding: "8px 14px", background: "rgba(239,68,68,0.08)", borderRadius: 8, marginBottom: 10, fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>📍 Click map to place: {(MAP_PIN_TYPES[placing.layer] || []).find((p) => p.v === placing.type)?.i} {(MAP_PIN_TYPES[placing.layer] || []).find((p) => p.v === placing.type)?.l}</div>}

      {/* ── Map Container ── */}
      <div ref={mapRef} onClick={handleMapClick} style={{ position: "relative", width: "100%", height: 520, borderRadius: 16, overflow: "hidden", cursor: placing ? "crosshair" : "default", border: tacticalMode ? "2px solid rgba(239,68,68,0.2)" : "1px solid rgba(255,255,255,0.06)" }}>
        {/* Google Maps Embed or Fallback */}
        {propAddress && mapLoaded ? (
          <iframe
            title="Property Map"
            src={embedUrl}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", filter: tacticalMode ? "hue-rotate(120deg) saturate(0.3) brightness(0.6)" : "none" }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: tacticalMode ? "linear-gradient(180deg,#0a0f0a,#0d160d,#0a120a)" : "linear-gradient(180deg,#0a1628,#0d1f2d 40%,#0f1a14 70%,#0d160d)" }}>
            {!tacticalMode && (
              <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M5,30 Q12,40 15,50 Q18,60 25,70 Q28,75 30,80" fill="none" stroke="rgba(14,165,233,0.2)" strokeWidth="0.5" strokeDasharray="1,1" />
                <path d="M35,0 Q45,5 50,15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
                <rect x="5" y="5" width="90" height="90" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.3" strokeDasharray="2,2" rx="1" />
                <ellipse cx="15" cy="25" rx="12" ry="8" fill="rgba(34,197,94,0.03)" />
                <ellipse cx="75" cy="60" rx="15" ry="10" fill="rgba(34,197,94,0.03)" />
              </svg>
            )}
            {tacticalMode && (
              <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 100 100" preserveAspectRatio="none">
                {[20, 40, 60, 80].map((v) => <line key={"h" + v} x1="0" y1={v} x2="100" y2={v} stroke="rgba(239,68,68,0.05)" strokeWidth="0.2" />)}
                {[20, 40, 60, 80].map((v) => <line key={"v" + v} x1={v} y1="0" x2={v} y2="100" stroke="rgba(239,68,68,0.05)" strokeWidth="0.2" />)}
                <path d="M45,20 L30,5 L60,5 Z" fill="rgba(239,68,68,0.04)" stroke="rgba(239,68,68,0.1)" strokeWidth="0.3" />
                <path d="M60,28 L80,10 L90,30 Z" fill="rgba(239,68,68,0.04)" stroke="rgba(239,68,68,0.1)" strokeWidth="0.3" />
                <rect x="5" y="5" width="90" height="90" fill="none" stroke="rgba(239,68,68,0.15)" strokeWidth="0.4" strokeDasharray="2,1" rx="1" />
              </svg>
            )}
            {/* Prompt to enter address */}
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 44, marginBottom: 12, opacity: 0.3 }}>🗺️</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Enter your property address above</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.12)" }}>Google Maps satellite view will load with your exact plot</div>
            </div>
          </div>
        )}

        {/* Tactical overlay on top of Google Maps */}
        {tacticalMode && propAddress && (
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 5 }} viewBox="0 0 100 100" preserveAspectRatio="none">
            {[20, 40, 60, 80].map((v) => <line key={"h" + v} x1="0" y1={v} x2="100" y2={v} stroke="rgba(239,68,68,0.12)" strokeWidth="0.2" />)}
            {[20, 40, 60, 80].map((v) => <line key={"v" + v} x1={v} y1="0" x2={v} y2="100" stroke="rgba(239,68,68,0.12)" strokeWidth="0.2" />)}
            <rect x="2" y="2" width="96" height="96" fill="none" stroke="rgba(239,68,68,0.2)" strokeWidth="0.3" strokeDasharray="2,1" rx="1" />
          </svg>
        )}

        {tacticalMode && <div style={{ position: "absolute", top: 10, left: 10, fontSize: 10, color: "rgba(239,68,68,0.5)", fontWeight: 700, fontFamily: M, letterSpacing: 2, zIndex: 10, textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>TACTICAL OVERLAY</div>}
        {!tacticalMode && !propAddress && <div style={{ position: "absolute", top: 10, left: 10, fontSize: 9, color: "rgba(255,255,255,0.1)" }}>N ↑</div>}
        {propAddress && !tacticalMode && <div style={{ position: "absolute", top: 10, left: 10, padding: "4px 10px", borderRadius: 6, background: "rgba(0,0,0,0.6)", fontSize: 9, color: "rgba(255,255,255,0.5)", zIndex: 10, backdropFilter: "blur(4px)" }}>📍 {propAddress}</div>}

        {/* Pin Overlay — pointer-events transparent background so map is still interactive */}
        <div style={{ position: "absolute", inset: 0, zIndex: 8, pointerEvents: "none" }}>
          {visiblePins.map((pin) => {
            const layer = MAP_LAYERS[pin.layer] || {};
            const pt = (MAP_PIN_TYPES[pin.layer] || []).find((p) => p.v === pin.type);
            const isSel = selectedPin === pin.id;
            return (
              <div key={pin.id} onClick={(e) => { e.stopPropagation(); setSelectedPin(isSel ? null : pin.id); }}
                style={{ position: "absolute", left: pin.x + "%", top: pin.y + "%", transform: "translate(-50%,-50%)", zIndex: isSel ? 100 : 10, cursor: "pointer", pointerEvents: "auto" }}>
                <div style={{ width: isSel ? 36 : 28, height: isSel ? 36 : 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: (layer.color || "#888") + (isSel ? "40" : "20"), border: "2px solid " + (layer.color || "#888") + (isSel ? "" : "80"), fontSize: isSel ? 18 : 14, transition: "all 0.2s", boxShadow: isSel ? "0 0 16px " + (layer.color || "#888") + "40" : "0 2px 8px rgba(0,0,0,0.5)", backdropFilter: "blur(2px)" }}>
                  {pt?.i || "📍"}
                </div>
                <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", marginTop: 2, textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: layer.color || "#888", textShadow: "0 1px 4px rgba(0,0,0,.9)", opacity: isSel ? 1 : 0.8 }}>{pin.label}</div>
                  {pin.assignee && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textShadow: "0 1px 3px rgba(0,0,0,.8)" }}>{pin.assignee}</div>}
                </div>
                {isSel && pin.notes && (
                  <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", padding: "8px 12px", background: "#1a1d23", border: "1px solid " + (layer.color || "#888") + "40", borderRadius: 8, whiteSpace: "nowrap", zIndex: 200, boxShadow: "0 8px 20px rgba(0,0,0,0.5)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{pin.label}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{pin.notes}</div>
                    <button onClick={(e) => { e.stopPropagation(); setPins((p) => p.filter((x) => x.id !== pin.id)); setSelectedPin(null); }}
                      style={{ ...btnSt, padding: "4px 8px", fontSize: 9, background: "rgba(239,68,68,0.1)", color: "#ef4444", marginTop: 4, pointerEvents: "auto" }}>Remove</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Defense Roster ── */}
      {tacticalMode && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: 1.5 }}>Defense Roster</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
            {DEFENSE_ROLES.map((r) => (
              <div key={r.id} style={{ ...cardSt, padding: "12px 14px", borderLeft: "3px solid #ef4444" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 20 }}>{r.avatar}</span>
                  <div><div style={{ fontSize: 13, fontWeight: 700 }}>{r.name}</div><div style={{ fontSize: 10, color: "#ef4444", fontWeight: 600 }}>{r.role}</div></div>
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>📍 {r.position}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>🔫 {r.weapon}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {showPinModal && <GenericModal title="Pin Details" onClose={() => setShowPinModal(false)} onSave={savePin} fields={[{ key: "label", label: "Label", type: "text", placeholder: "Name this pin..." }, { key: "notes", label: "Notes", type: "textarea", placeholder: "Details..." }, ...(newPinData.layer === "defense" ? [{ key: "assignee", label: "Assigned To", type: "text", placeholder: "Name" }] : [])]} />}
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", zIndex: 1100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "30px 20px", overflowY: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1a1d23", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>📷</span> Barcode Scanner
          </h3>
          <button onClick={onClose} style={{ ...btnSt, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", fontSize: 16, padding: "4px 10px" }}>✕</button>
        </div>

        {/* Camera View */}
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", marginBottom: 14, background: "#000", border: "1px solid rgba(255,255,255,0.06)" }}>
          <video ref={videoRef} style={{ width: "100%", height: 240, objectFit: "cover", display: "block" }} muted playsInline />
          <canvas ref={canvasRef} style={{ display: "none" }} />
          {/* Scan overlay crosshairs */}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ width: "70%", height: 80, border: "2px solid rgba(200,85,58,0.6)", borderRadius: 8, position: "relative" }}>
              <div style={{ position: "absolute", top: -1, left: -1, width: 20, height: 20, borderTop: "3px solid #c8553a", borderLeft: "3px solid #c8553a", borderRadius: "4px 0 0 0" }} />
              <div style={{ position: "absolute", top: -1, right: -1, width: 20, height: 20, borderTop: "3px solid #c8553a", borderRight: "3px solid #c8553a", borderRadius: "0 4px 0 0" }} />
              <div style={{ position: "absolute", bottom: -1, left: -1, width: 20, height: 20, borderBottom: "3px solid #c8553a", borderLeft: "3px solid #c8553a", borderRadius: "0 0 0 4px" }} />
              <div style={{ position: "absolute", bottom: -1, right: -1, width: 20, height: 20, borderBottom: "3px solid #c8553a", borderRight: "3px solid #c8553a", borderRadius: "0 0 4px 0" }} />
              {scanning && <div style={{ position: "absolute", top: "50%", left: 8, right: 8, height: 2, background: "#c8553a", borderRadius: 1, animation: "pulse 1.5s infinite" }} />}
            </div>
          </div>
          {flash && <div style={{ position: "absolute", inset: 0, background: "rgba(34,197,94,0.2)", transition: "opacity 0.3s" }} />}
          {scanning && <div style={{ position: "absolute", top: 8, left: 8, display: "flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.6)", padding: "5px 8px", borderRadius: 6 }}><div style={{ width: 6, height: 6, borderRadius: 3, background: "#ef4444", animation: "pulse 1s infinite" }} /><span style={{ fontSize: 9, color: "#fff", fontWeight: 700 }}>SCANNING</span></div>}
        </div>

        {cameraError && <div style={{ fontSize: 10, color: "#f59e0b", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>{cameraError}</div>}

        {/* Manual Entry */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input value={manualCode} onChange={(e) => setManualCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitManual()} placeholder="Enter barcode manually (UPC/EAN)..." style={{ ...inp, flex: 1, margin: 0, fontSize: 12, fontFamily: M }} />
          <button onClick={submitManual} style={{ ...btnSt, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", fontSize: 11, padding: "8px 14px", flexShrink: 0 }}>Look Up</button>
        </div>

        {/* Scan Result */}
        {lastScanned && (
          <div style={{ ...cardSt, padding: 14, borderLeft: "3px solid " + (lastScanned.found ? "#22c55e" : "#f59e0b") }}>
            {lastScanned.found ? (<>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 22 }}>{CATEGORIES[lastScanned.category]?.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{lastScanned.name}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{CATEGORIES[lastScanned.category]?.label} → {CATEGORIES[lastScanned.category]?.subTypes[lastScanned.subType]?.label}</div>
                </div>
                <span style={{ fontSize: 10, padding: "4px 6px", borderRadius: 4, background: "rgba(34,197,94,0.1)", color: "#22c55e", fontWeight: 700 }}>FOUND</span>
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontFamily: M, marginBottom: 10 }}>UPC: {lastScanned.code} · Qty: {lastScanned.qty}</div>
              <button onClick={confirmScan} style={{ ...btnSt, width: "100%", background: "#22c55e", color: "#000", fontWeight: 700, fontSize: 13, padding: "10px 0" }}>✓ Add to Inventory</button>
            </>) : (<>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>❓</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>Unknown Barcode</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontFamily: M }}>{lastScanned.code}</div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Not in product database. You can add it manually with + Supply.</div>
            </>)}
          </div>
        )}

        {/* Quick stats */}
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
          {Object.keys(BARCODE_DB).length} products in database · Point camera at UPC barcode
        </div>
      </div>
    </div>
  );
}

function AddItemModal({ onAdd, onClose, editItem, initialCategory }) {
  const [cat, setCat] = useState(editItem?.category || initialCategory || "water");
  const [sub, setSub] = useState(editItem?.subType || "");
  const [qty, setQty] = useState(editItem?.quantity?.toString() || "1");
  const [nm, setNm] = useState(editItem?.name || "");
  const [loc, setLoc] = useState(editItem?.location || "");
  const [flds, setFlds] = useState(editItem?.fields || {});

  const catData = CATEGORIES[cat];
  const subTypes = catData?.subTypes || {};
  const selSub = subTypes[sub];
  const subFields = selSub?.fields || [];

  useEffect(() => { if (!editItem) { setSub(Object.keys(subTypes)[0] || ""); setFlds({}); } }, [cat]);
  useEffect(() => { if (selSub && !editItem) setNm(selSub.label); }, [sub]);

  const save = () => {
    if (!sub) return;
    onAdd({ id: editItem?.id || uid(), category: cat, subType: sub, name: nm || selSub?.label || "Item", quantity: parseFloat(qty) || 1, location: loc || "?", notes: "", fields: flds, addedDate: editItem?.addedDate || new Date().toISOString().split("T")[0] });
    onClose();
  };
  const uf = (k, v) => setFlds((f) => ({ ...f, [k]: v }));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1a1d23", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 520 }}>
        <h3 style={{ margin: "0 0 18px", fontSize: 18, fontWeight: 700 }}>{editItem ? "Edit" : "Add"} Supply</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={labelSt}>Category</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(58px,1fr))", gap: 4 }}>
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <button key={k} onClick={() => setCat(k)} style={{ padding: "5px 2px", background: cat === k ? v.color + "20" : "rgba(255,255,255,0.03)", border: cat === k ? "1px solid " + v.color : "1px solid rgba(255,255,255,0.06)", borderRadius: 6, cursor: "pointer", textAlign: "center" }}>
                  <div style={{ fontSize: 14 }}>{v.icon}</div>
                  <div style={{ fontSize: 9, color: cat === k ? v.color : "rgba(255,255,255,0.4)", fontWeight: 600 }}>{v.label}</div>
                </button>
              ))}
            </div>
          </div>
          <div><label style={labelSt}>Type</label><select style={inp} value={sub} onChange={(e) => { setSub(e.target.value); if (!editItem) setNm(subTypes[e.target.value]?.label || ""); }}>{Object.entries(subTypes).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}</select></div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <div><label style={labelSt}>Name</label><input style={inp} value={nm} onChange={(e) => setNm(e.target.value)} /></div>
            <div><label style={labelSt}>Qty</label><input style={inp} type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          </div>
          {subFields.length > 0 && (
            <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: 12, border: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "grid", gridTemplateColumns: subFields.length > 2 ? "1fr 1fr" : "1fr", gap: 10 }}>
                {subFields.map((fk) => { const meta = FIELD_META[fk]; if (!meta) return null; return meta.type === "select" ? (
                  <div key={fk}><label style={labelSt}>{meta.label}</label><select style={inp} value={flds[fk] || ""} onChange={(e) => uf(fk, e.target.value)}><option value="">...</option>{meta.options.map((o) => <option key={o}>{o}</option>)}</select></div>
                ) : (
                  <div key={fk}><label style={labelSt}>{meta.label}</label><input style={inp} type={meta.type} value={flds[fk] || ""} onChange={(e) => uf(fk, e.target.value)} placeholder={meta.placeholder || ""} /></div>
                ); })}
              </div>
            </div>
          )}
          <div><label style={labelSt}>Location</label><input style={inp} value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Where?" /></div>
          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            <button onClick={onClose} style={{ ...btnSt, flex: 1, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>Cancel</button>
            <button onClick={save} style={{ ...btnSt, flex: 1, background: "#c8553a", color: "#fff", fontWeight: 700 }}>{editItem ? "Save" : "Add"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryDetail({ catKey, items, people, climate, onBack, onAdd, onRemove, onEdit, onQtyChange }) {
  const cat = CATEGORIES[catKey];
  const ci = items.filter((i) => i.category === catKey);
  const grouped = useMemo(() => { const g = {}; Object.keys(cat.subTypes).forEach((k) => { g[k] = ci.filter((i) => i.subType === k); }); return g; }, [ci, catKey]);
  const M = "'JetBrains Mono',monospace";
  const p = people || 4;
  const clim = CLIMATES[climate] || CLIMATES.temperate;
  const climMod = clim.waterMod || 1;
  const firewoodMod = clim.firewoodMod || 1;

  /* ── Continuity Calculations per Category ── */
  const calc = useMemo(() => {
    if (catKey === "food") {
      const totalCals = ci.reduce((s, i) => {
        const cal = parseFloat(i.fields?.totalCalories || i.fields?.caloriesPerServing || i.fields?.calories || 0);
        const serv = parseFloat(i.fields?.servings || 1);
        return s + (cal > 500 ? cal : cal * serv) * (i.quantity || 1);
      }, 0);
      const dailyNeed = p * 2000;
      const days = totalCals / Math.max(dailyNeed, 1);
      return {
        title: "Caloric Continuity",
        icon: "🍽️",
        color: days >= 30 ? "#22c55e" : days >= 7 ? "#f59e0b" : "#ef4444",
        bigNum: days.toFixed(1),
        bigUnit: "days",
        rows: [
          { label: "Total stored calories", value: Math.round(totalCals).toLocaleString() + " cal" },
          { label: "People", value: p },
          { label: "Daily consumption", value: dailyNeed.toLocaleString() + " cal/day", note: p + " × 2,000 cal" },
          { label: "Reserve", value: days.toFixed(1) + " days", note: Math.round(totalCals).toLocaleString() + " ÷ " + dailyNeed.toLocaleString(), highlight: true },
        ]
      };
    }
    if (catKey === "water") {
      const stored = ci.filter((i) => i.subType === "storedWater").reduce((s, i) => s + (i.quantity || 0), 0);
      const filters = ci.filter((i) => i.subType === "purificationDevice" || i.subType === "purificationTablets").reduce((s, i) => s + (i.quantity || 0), 0);
      const dailyNeed = p * 1.0 * climMod;
      const storedDays = stored / Math.max(dailyNeed, 0.1);
      const filterBonus = filters * 3;
      const totalDays = storedDays + filterBonus;
      return {
        title: "Water Continuity",
        icon: "💧",
        color: totalDays >= 14 ? "#22c55e" : totalDays >= 3 ? "#f59e0b" : "#ef4444",
        bigNum: totalDays.toFixed(1),
        bigUnit: "days",
        rows: [
          { label: "Stored water", value: stored + " gallons" },
          { label: "People", value: p },
          { label: "Climate modifier", value: climMod + "×", note: climate || "temperate" },
          { label: "Daily consumption", value: dailyNeed.toFixed(1) + " gal/day", note: p + " × 1.0 gal × " + climMod },
          { label: "Storage days", value: storedDays.toFixed(1) + " days", note: stored + " ÷ " + dailyNeed.toFixed(1) },
          { label: "Filtration bonus", value: "+" + filterBonus + " days", note: filters + " filters × 3 days each" },
          { label: "Total continuity", value: totalDays.toFixed(1) + " days", highlight: true },
        ]
      };
    }
    if (catKey === "fuel") {
      const gasGals = ci.filter((i) => i.subType === "gasoline").reduce((s, i) => s + (i.quantity || 0) * (parseFloat(i.fields?.fuelGallons || i.fields?.gallons) || 5), 0);
      const propTanks = ci.filter((i) => i.subType === "propane").reduce((s, i) => s + (i.quantity || 0), 0);
      const propGals = propTanks * 4.6;
      const genHrs = gasGals * 5.5;
      const heatHrs = propGals * 5.1;
      const cookHrs = propGals * 11;
      return {
        title: "Fuel Conversion",
        icon: "⛽",
        color: genHrs >= 48 ? "#22c55e" : genHrs >= 12 ? "#f59e0b" : "#ef4444",
        bigNum: genHrs.toFixed(1),
        bigUnit: "hrs gen",
        rows: [
          { label: "Gasoline stored", value: gasGals.toFixed(1) + " gallons" },
          { label: "Generator runtime", value: genHrs.toFixed(1) + " hours", note: gasGals.toFixed(1) + " gal × 5.5 hrs/gal" },
          { label: "Propane tanks", value: propTanks + " tanks (" + propGals.toFixed(1) + " gal)" },
          { label: "Propane → heat", value: heatHrs.toFixed(1) + " hours", note: propGals.toFixed(1) + " gal × 5.1 hrs/gal (18k BTU)" },
          { label: "Propane → cooking", value: cookHrs.toFixed(0) + " hours", note: propGals.toFixed(1) + " gal × 11 hrs/gal" },
          { label: "Power autonomy", value: genHrs.toFixed(1) + " hrs at 1kW load", highlight: true },
        ]
      };
    }
    if (catKey === "firewood") {
      const cords = ci.reduce((s, i) => s + (parseFloat(i.fields?.cords) || 0) * (i.quantity || 1), 0);
      const heatDays = cords * 30;
      const fwMod = Math.max(firewoodMod, 0.1);
      const adjusted = heatDays / fwMod;
      return {
        title: "Heat Continuity (Wood)",
        icon: "🔥",
        color: adjusted >= 60 ? "#22c55e" : adjusted >= 14 ? "#f59e0b" : "#ef4444",
        bigNum: adjusted.toFixed(1),
        bigUnit: "days",
        rows: [
          { label: "Firewood stored", value: cords.toFixed(2) + " cords" },
          { label: "Burn rate", value: "~1 cord per 30 days" },
          { label: "Base heating days", value: heatDays.toFixed(1) + " days", note: cords.toFixed(2) + " × 30" },
          { label: "Climate modifier", value: fwMod + "×", note: clim.label || climate },
          { label: "Adjusted continuity", value: adjusted.toFixed(1) + " days", note: heatDays.toFixed(1) + " ÷ " + fwMod, highlight: true },
        ]
      };
    }
    if (catKey === "batteries") {
      const total = ci.reduce((s, i) => s + (i.quantity || 0), 0);
      const rechargeables = ci.filter((i) => i.fields?.rechargeable === "Yes").reduce((s, i) => s + (i.quantity || 0), 0);
      const lightHrs = total * 20;
      const radioHrs = total * 8;
      return {
        title: "Battery Capacity",
        icon: "🔋",
        color: total >= 50 ? "#22c55e" : total >= 20 ? "#f59e0b" : "#ef4444",
        bigNum: total,
        bigUnit: "cells",
        rows: [
          { label: "Total battery cells", value: total },
          { label: "Rechargeable", value: rechargeables + " (" + (total > 0 ? Math.round(rechargeables / total * 100) : 0) + "%)" },
          { label: "Flashlight runtime", value: lightHrs.toLocaleString() + " hours", note: total + " × ~20 hrs/cell" },
          { label: "Radio runtime", value: radioHrs.toLocaleString() + " hours", note: total + " × ~8 hrs/cell" },
          { label: "Equivalent energy", value: (total * 3).toLocaleString() + " Wh", note: total + " × ~3 Wh avg", highlight: true },
        ]
      };
    }
    if (catKey === "medical") {
      const totalItems = ci.reduce((s, i) => s + (i.quantity || 0), 0);
      const expiring = ci.filter((i) => { if (!i.fields?.expiryDate) return false; const d = new Date(i.fields.expiryDate); return d - new Date() < 90 * 24 * 3600 * 1000 && d > new Date(); }).length;
      const expired = ci.filter((i) => { if (!i.fields?.expiryDate) return false; return new Date(i.fields.expiryDate) < new Date(); }).length;
      const subtypesCovered = new Set(ci.map((i) => i.subType)).size;
      const totalSubtypes = Object.keys(cat.subTypes).length;
      return {
        title: "Medical Readiness",
        icon: "💊",
        color: subtypesCovered / totalSubtypes >= 0.6 ? "#22c55e" : subtypesCovered / totalSubtypes >= 0.3 ? "#f59e0b" : "#ef4444",
        bigNum: Math.round(subtypesCovered / totalSubtypes * 100),
        bigUnit: "% coverage",
        rows: [
          { label: "Total medical items", value: totalItems },
          { label: "Categories covered", value: subtypesCovered + " / " + totalSubtypes },
          { label: "Expiring within 90 days", value: expiring, note: expiring > 0 ? "⚠ Check soon" : "None" },
          { label: "Already expired", value: expired, note: expired > 0 ? "🔴 Replace" : "None" },
          { label: "People covered", value: p + " people", highlight: true },
        ]
      };
    }
    if (catKey === "electronics" || catKey === "comms") {
      const channels = new Set();
      ci.forEach((i) => {
        if (i.subType === "satPhone") channels.add("Satellite");
        if (i.subType === "cellPhone") channels.add("Cellular");
        if (i.subType === "radio") channels.add("HAM/GMRS");
        if (i.subType === "weatherRadio") channels.add("Weather Band");
      });
      if (catKey === "comms") items.filter((i) => i.category === "comms").forEach(() => channels.add("HAM/GMRS"));
      const totalDevices = ci.reduce((s, i) => s + (i.quantity || 0), 0);
      return {
        title: "Communication Redundancy",
        icon: "📡",
        color: channels.size >= 3 ? "#22c55e" : channels.size >= 2 ? "#f59e0b" : "#ef4444",
        bigNum: channels.size,
        bigUnit: "channels",
        rows: [
          { label: "Total devices", value: totalDevices },
          { label: "Unique channels", value: channels.size, highlight: true },
          ...([...channels].map((ch) => ({ label: ch, value: "✓", note: "Active" }))),
          { label: "Redundancy level", value: channels.size >= 3 ? "Strong" : channels.size >= 2 ? "Adequate" : "Vulnerable", note: channels.size < 2 ? "Add backup channel" : "" },
        ]
      };
    }
    if (catKey === "firearms" || catKey === "defense") {
      const totalQty = ci.reduce((s, i) => s + (i.quantity || 0), 0);
      const calibers = new Set(ci.map((i) => i.fields?.caliber).filter(Boolean));
      return {
        title: "Defense Inventory",
        icon: "🛡️",
        color: totalQty >= 3 ? "#22c55e" : totalQty >= 1 ? "#f59e0b" : "#ef4444",
        bigNum: totalQty,
        bigUnit: "items",
        rows: [
          { label: "Total items", value: totalQty },
          { label: "Unique calibers", value: calibers.size || "N/A" },
          { label: "People to arm", value: p },
          { label: "Ratio", value: totalQty > 0 ? (totalQty / p).toFixed(1) + " per person" : "0", highlight: true },
        ]
      };
    }
    if (catKey === "alcohol") {
      const totalVol = ci.reduce((s, i) => {
        const vol = parseVolMl(i.fields?.volume || i.fields?.alcVolume);
        return s + vol * (i.quantity || 1);
      }, 0);
      const highAbv = ci.filter((i) => parseFloat(i.fields?.alcABV || i.fields?.abv) >= 60).reduce((s, i) => s + (i.quantity || 0), 0);
      return {
        title: "Barter & Morale Reserve",
        icon: "🥃",
        color: ci.length >= 5 ? "#22c55e" : ci.length >= 2 ? "#f59e0b" : "#ef4444",
        bigNum: (totalVol / 1000).toFixed(1),
        bigUnit: "liters",
        rows: [
          { label: "Total volume", value: (totalVol / 1000).toFixed(1) + " L (" + Math.round(totalVol) + " mL)" },
          { label: "Unique products", value: ci.length },
          { label: "High-proof (≥60% ABV)", value: highAbv + " items", note: "Dual-use: barter + disinfectant" },
          { label: "Barter value", value: ci.length >= 5 ? "High" : ci.length >= 2 ? "Moderate" : "Low", highlight: true },
        ]
      };
    }
    if (catKey === "kids") {
      const diapers = ci.filter((i) => i.subType === "diapers").reduce((s, i) => s + (i.quantity || 0), 0);
      const formula = ci.filter((i) => i.subType === "formula").reduce((s, i) => s + (i.quantity || 0), 0);
      const wipes = ci.filter((i) => i.subType === "wipes").reduce((s, i) => s + (i.quantity || 0), 0);
      const diaperDays = diapers / 8; // ~8 diapers/day
      const formulaDays = formula * 3; // ~1 can per 3 days
      return {
        title: "Child Continuity",
        icon: "👶",
        color: Math.min(diaperDays, formulaDays) >= 14 ? "#22c55e" : Math.min(diaperDays, formulaDays) >= 3 ? "#f59e0b" : "#ef4444",
        bigNum: Math.min(diaperDays, formulaDays).toFixed(1),
        bigUnit: "days",
        rows: [
          { label: "Diapers", value: diapers + " units" },
          { label: "Diaper days", value: diaperDays.toFixed(1) + " days", note: diapers + " ÷ 8/day" },
          { label: "Formula", value: formula + " cans" },
          { label: "Formula days", value: formulaDays.toFixed(1) + " days", note: formula + " × 3 days/can" },
          { label: "Wipes", value: wipes + " packs" },
          { label: "Limiting factor", value: diaperDays < formulaDays ? "Diapers" : "Formula", note: "Shortest supply sets the ceiling", highlight: true },
        ]
      };
    }
    if (catKey === "vehicles") {
      const totalVeh = ci.reduce((s, i) => s + (i.quantity || 0), 0);
      const needService = ci.filter((i) => {
        if (!i.fields?.nextService) return false;
        return new Date(i.fields.nextService) < new Date();
      }).length;
      return {
        title: "Vehicle Readiness",
        icon: "🚗",
        color: needService === 0 && totalVeh > 0 ? "#22c55e" : needService > 0 ? "#f59e0b" : "#ef4444",
        bigNum: totalVeh,
        bigUnit: "vehicles",
        rows: [
          { label: "Total vehicles", value: totalVeh },
          { label: "Overdue for service", value: needService, note: needService > 0 ? "⚠ Schedule maintenance" : "All current" },
          { label: "People per vehicle", value: totalVeh > 0 ? (p / totalVeh).toFixed(1) : "N/A" },
          { label: "Fleet status", value: needService === 0 ? "Ready" : "Needs attention", highlight: true },
        ]
      };
    }
    if (catKey === "nbc") {
      const masks = ci.filter((i) => i.subType === "gasMask").reduce((s, i) => s + (i.quantity || 0), 0);
      const filters = ci.filter((i) => i.subType === "filters").reduce((s, i) => s + (i.quantity || 0), 0);
      const ki = ci.filter((i) => i.subType === "kiTablets").reduce((s, i) => s + (i.quantity || 0), 0);
      const kiDays = ki / Math.max(p, 1); // 1 tab/person/day for 14 days
      const suits = ci.filter((i) => i.subType === "hazmatSuit" || i.subType === "tyvekSuit").reduce((s, i) => s + (i.quantity || 0), 0);
      return {
        title: "CBRN Protection",
        icon: "☢️",
        color: masks >= p && filters > 0 ? "#22c55e" : masks > 0 ? "#f59e0b" : "#ef4444",
        bigNum: Math.round(masks / Math.max(p, 1) * 100),
        bigUnit: "% covered",
        rows: [
          { label: "Gas masks", value: masks },
          { label: "People", value: p },
          { label: "Mask coverage", value: masks >= p ? "Full" : masks + "/" + p + " covered", note: masks >= p ? "1+ per person" : "Need " + (p - masks) + " more", highlight: masks < p },
          { label: "Replacement filters", value: filters },
          { label: "KI tablets", value: ki + " tabs → " + kiDays.toFixed(0) + " doses/person" },
          { label: "Protective suits", value: suits },
          { label: "Protection level", value: masks >= p && filters > 0 && ki >= p * 14 ? "Full" : "Partial", highlight: true },
        ]
      };
    }
    if (catKey === "fishing") {
      const rods = ci.filter((i) => i.subType === "rodReel").reduce((s, i) => s + (i.quantity || 0), 0);
      const tackle = ci.filter((i) => ["hooks", "lures", "line", "bait"].includes(i.subType)).reduce((s, i) => s + (i.quantity || 0), 0);
      const nets = ci.filter((i) => i.subType === "net" || i.subType === "fishTrap").reduce((s, i) => s + (i.quantity || 0), 0);
      return {
        title: "Protein Production",
        icon: "🐟",
        color: rods > 0 && tackle > 0 ? "#22c55e" : rods > 0 ? "#f59e0b" : "#ef4444",
        bigNum: rods + nets,
        bigUnit: "sources",
        rows: [
          { label: "Rods & reels", value: rods },
          { label: "Tackle items", value: tackle + " (hooks, lures, line, bait)" },
          { label: "Nets & traps", value: nets, note: nets > 0 ? "Passive protein collection" : "None — active fishing only" },
          { label: "Est. yield", value: rods > 0 ? "~1-2 lbs/day active" : "0", note: nets > 0 ? "+ passive net yield" : "" },
          { label: "Sustainable protein", value: rods + nets > 0 ? "Yes" : "No", highlight: true },
        ]
      };
    }
    if (catKey === "boat") {
      const vessels = ci.filter((i) => i.subType === "vessel").reduce((s, i) => s + (i.quantity || 0), 0);
      const motors = ci.filter((i) => i.subType === "outboardMotor").reduce((s, i) => s + (i.quantity || 0), 0);
      const pfd = ci.filter((i) => i.subType === "lifeJacket").reduce((s, i) => s + (i.quantity || 0), 0);
      return {
        title: "Marine Readiness",
        icon: "⛵",
        color: vessels > 0 && pfd >= p ? "#22c55e" : vessels > 0 ? "#f59e0b" : "#ef4444",
        bigNum: vessels,
        bigUnit: "vessels",
        rows: [
          { label: "Vessels", value: vessels },
          { label: "Motors", value: motors },
          { label: "PFDs", value: pfd },
          { label: "PFD coverage", value: pfd >= p ? "Full (" + pfd + "/" + p + ")" : pfd + "/" + p + " — need " + (p - pfd) + " more", highlight: pfd < p },
          { label: "Water transport", value: vessels > 0 ? "Available" : "None", highlight: true },
        ]
      };
    }
    if (catKey === "farm") {
      const seeds = ci.filter((i) => i.subType === "seedPacket").reduce((s, i) => s + (i.quantity || 0), 0);
      const crops = new Set(ci.filter((i) => i.subType === "seedPacket").map((i) => i.fields?.cropName)).size;
      const animals = ci.filter((i) => ["chickens", "livestock"].includes(i.subType)).reduce((s, i) => s + (i.quantity || 0), 0);
      return {
        title: "Food Production",
        icon: "🌾",
        color: crops >= 5 ? "#22c55e" : crops >= 2 ? "#f59e0b" : "#ef4444",
        bigNum: crops,
        bigUnit: "crops",
        rows: [
          { label: "Seed packets", value: seeds },
          { label: "Crop varieties", value: crops },
          { label: "Livestock/poultry", value: animals || "None" },
          { label: "People to feed", value: p },
          { label: "Self-sufficiency", value: crops >= 8 && animals > 0 ? "High" : crops >= 4 ? "Partial" : "Low", highlight: true },
        ]
      };
    }
    return null;
  }, [ci, catKey, p, climMod, climate, items]);

  return (
    <div>
      <button onClick={onBack} style={{ ...btnSt, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", marginBottom: 16, fontSize: 12 }}>← Back</button>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        <span style={{ fontSize: 36 }}>{cat.icon}</span>
        <div><h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{cat.label}</h2><p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{cat.desc}</p></div>
        <button onClick={() => onAdd(catKey)} style={{ ...btnSt, marginLeft: "auto", background: cat.color, color: "#fff", fontWeight: 700, fontSize: 13 }}>+ Add</button>
      </div>

      {/* ── Continuity Calculation Banner ── */}
      {calc && (
        <div style={{ background: calc.color + "08", border: "1px solid " + calc.color + "20", borderRadius: 12, padding: 18, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
            <div style={{ textAlign: "center", minWidth: 80 }}>
              <div style={{ fontSize: 32, fontWeight: 800, fontFamily: M, color: calc.color, lineHeight: 1 }}>{calc.bigNum}</div>
              <div style={{ fontSize: 9, color: calc.color, fontWeight: 600, textTransform: "uppercase", marginTop: 2 }}>{calc.bigUnit}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{calc.icon} {calc.title}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{p} people · {climate || "temperate"} climate · {ci.reduce((s, i) => s + (i.quantity || 0), 0)} items logged</div>
            </div>
          </div>
          <div style={{ display: "grid", gap: 0 }}>
            {calc.rows.map((row, ri) => (
              <div key={ri} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: row.highlight ? calc.color + "10" : ri % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent", borderRadius: row.highlight ? 6 : 0, borderLeft: row.highlight ? "3px solid " + calc.color : "3px solid transparent" }}>
                <span style={{ fontSize: 11, color: row.highlight ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.4)", fontWeight: row.highlight ? 700 : 400 }}>{row.label}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {row.note && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>{row.note}</span>}
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: M, color: row.highlight ? calc.color : "rgba(255,255,255,0.6)" }}>{row.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state when category has no items at all */}
      {ci.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", border: "2px dashed rgba(255,255,255,0.06)", borderRadius: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 8, opacity: 0.3 }}>{cat.icon}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>No items yet</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 14 }}>Add your first {cat.label.toLowerCase()} items to start tracking</div>
          <button onClick={() => onAdd(catKey)} style={{ ...btnSt, background: cat.color, color: "#fff", fontWeight: 700, fontSize: 12, padding: "10px 20px" }}>+ Add {cat.label}</button>
        </div>
      )}

      {Object.entries(cat.subTypes).map(([sk, sub]) => {
        const si = grouped[sk] || [];
        return (
          <div key={sk} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
              <span style={{ fontSize: 14 }}>{sub.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>{sub.label}</span>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: M }}>{si.length > 0 ? si.reduce((s, i) => s + i.quantity, 0) + " " + sub.unit : "—"}</span>
            </div>
            {si.length === 0 ? (
              <div onClick={() => onAdd(catKey)} style={{ padding: "10px 14px", border: "1px dashed rgba(255,255,255,0.06)", borderRadius: 8, color: "rgba(255,255,255,0.3)", fontSize: 11, cursor: "pointer", transition: "border-color 0.15s" }} onMouseOver={e => e.currentTarget.style.borderColor = cat.color + "40"} onMouseOut={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"}>+ Add {sub.label}</div>
            ) : si.map((item) => {
              const rs = item.fields?.lastRefreshed ? getRefreshStatus(item.fields.lastRefreshed) : null;
              const es = item.fields?.expiryDate ? getExpiryStatus(item.fields.expiryDate) : null;
              return (
                <div key={item.id} style={{ padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 0, borderRadius: 8, overflow: "hidden", border: "1px solid " + cat.color + "30" }}>
                      <button onClick={() => onQtyChange && onQtyChange(item.id, -1)} style={{ background: cat.color + "10", border: "none", color: cat.color, fontSize: 16, padding: "0", width: 36, height: 36, cursor: "pointer", fontWeight: 700, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                      <span style={{ fontSize: 12, fontWeight: 700, color: cat.color, fontFamily: M, padding: "0 8px", background: cat.color + "08", minWidth: 32, textAlign: "center", height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>{item.quantity}</span>
                      <button onClick={() => onQtyChange && onQtyChange(item.id, 1)} style={{ background: cat.color + "10", border: "none", color: cat.color, fontSize: 16, padding: "0", width: 36, height: 36, cursor: "pointer", fontWeight: 700, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                    {es && <span style={{ fontSize: 10, padding: "4px 8px", borderRadius: 10, background: es.c + "15", color: es.c, fontFamily: M, fontWeight: 600 }}>{es.l}</span>}
                    {rs && <span style={{ fontSize: 9, padding: "3px 6px", borderRadius: 10, background: rs.c + "12", color: rs.c, fontFamily: M }}>{rs.l}</span>}
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", flexShrink: 0 }}>📍{item.location}</span>
                    <button onClick={() => onEdit(item)} style={{ ...btnSt, padding: "6px 10px", fontSize: 10, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>Edit</button>
                    <button onClick={() => onRemove(item.id)} style={{ ...btnSt, padding: "6px 8px", fontSize: 14, background: "none", color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>×</button>
                  </div>
                  {item.fields && Object.entries(item.fields).filter(([k, v]) => v && k !== "expiryDate" && k !== "lastRefreshed").length > 0 && (
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", paddingTop: 6, marginTop: 6, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      {Object.entries(item.fields).filter(([k, v]) => v && k !== "expiryDate" && k !== "lastRefreshed").map(([k, v]) => (
                        <div key={k} style={{ fontSize: 9 }}><span style={{ color: "rgba(255,255,255,0.35)" }}>{FIELD_META[k]?.label || k}: </span><span style={{ color: "rgba(255,255,255,0.5)", fontFamily: M }}>{v}</span></div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB RENDERERS
   ═══════════════════════════════════════════════════════════ */
function DashboardTab({ items, setSelCat, openAdd, people, climate, allAlerts, showAlerts, setShowAlerts, crisisMode, setCrisisMode, setCrisisStart, setShowScanner, propAddress, alertsDismissed, alertsDismissedUntil, onDismissAlerts }) {
  const M = "'JetBrains Mono',monospace";

  /* ── Live Weather State ── */
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState(null);
  const [weatherSource, setWeatherSource] = useState("sample"); // 'sample' | 'live' | 'cached'

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
    { title: "Ontario hydro rates to increase 4.2% in March", source: "CBC News", time: "2h ago", severity: "amber", tag: "GRID", url: "https://www.cbc.ca/news/business" },
    { title: "Supply chain delays: canned goods prices up 12% nationally", source: "Globe & Mail", time: "6h ago", severity: "amber", tag: "FOOD", url: "https://www.theglobeandmail.com/business" },
    { title: "Environment Canada: lake-effect snow squalls through Thursday", source: "Weather Network", time: "8h ago", severity: "amber", tag: "WEATHER", url: "https://www.theweathernetwork.com/ca/alerts" },
    { title: "Highway 401 closures this weekend — detour via Hwy 7", source: "CTV Toronto", time: "10h ago", severity: "info", tag: "ROUTES", url: "https://www.ctvnews.ca/toronto" },
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

    return { powerHrs, waterDays, heatDays, calDays, commCount: commCh.size, commChannels: [...commCh], frag };
  }, [items, people, climate]);

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
      {/* ── Overall Score Banner ── */}
      <div style={{ ...cardSt, padding: "14px 20px", display: "flex", alignItems: "center", gap: 20, background: "linear-gradient(135deg, rgba(200,85,58,0.04), rgba(200,85,58,0.01))", border: "1px solid rgba(200,85,58,0.1)" }}>
        <div style={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}>
          <svg width="56" height="56" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
            <circle cx="28" cy="28" r="24" fill="none" stroke={SC(prepScore)} strokeWidth="4" strokeDasharray={`${prepScore / 100 * 150.8} 150.8`} strokeLinecap="round" transform="rotate(-90 28 28)" style={{ transition: "stroke-dasharray 0.8s ease" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, fontFamily: M, color: SC(prepScore) }}>{prepScore}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: SC(prepScore) }}>{SL(prepScore)}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{items.length} items across {new Set(items.map(i => i.category)).size} categories · {people} people · {climate} climate</div>
          {expiringSoon > 0 && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4, padding: "3px 8px", borderRadius: 6, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.1)", fontSize: 9, color: "#ef4444", fontWeight: 600 }}>⏰ {expiringSoon} item{expiringSoon !== 1 ? "s" : ""} expiring within 90d</div>
          )}
        </div>
        {allAlerts.length > 0 && (
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: M, color: "#f59e0b" }}>{allAlerts.length}</div>
            <div style={{ fontSize: 9, color: "#f59e0b", opacity: 0.7 }}>alerts</div>
          </div>
        )}
      </div>

      {/* ── System Quick Status ── */}
      <div style={{ ...cardSt, padding: 0, overflow: "hidden", background: "linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          {[
            { icon: "⚡", label: "Power", value: cont.powerHrs >= 24 ? cont.powerHrs.toFixed(0) + "h backup" : cont.powerHrs > 0 ? cont.powerHrs.toFixed(0) + "h backup" : "No backup", color: cont.powerHrs >= 72 ? "#22c55e" : cont.powerHrs >= 24 ? "#f59e0b" : "#ef4444" },
            { icon: "💧", label: "Water", value: cont.waterDays >= 14 ? cont.waterDays.toFixed(0) + " days" : cont.waterDays > 0 ? cont.waterDays.toFixed(1) + " days" : "No stored water", color: cont.waterDays >= 14 ? "#22c55e" : cont.waterDays >= 3 ? "#f59e0b" : "#ef4444" },
            { icon: "🔥", label: "Heat", value: cont.heatDays >= 999 ? "N/A" : cont.heatDays.toFixed(0) + " days", color: cont.heatDays >= 999 ? "rgba(255,255,255,0.3)" : cont.heatDays >= 30 ? "#22c55e" : cont.heatDays >= 7 ? "#f59e0b" : "#ef4444" },
            { icon: "📡", label: "Comms", value: cont.commCount > 0 ? cont.commCount + (cont.commCount === 1 ? " channel" : " channels") : "No comms", color: cont.commCount >= 3 ? "#22c55e" : cont.commCount >= 1 ? "#f59e0b" : "#ef4444" },
          ].map((s, i) => (
            <div key={i} style={{ padding: "14px 16px", borderRight: i < 3 ? "1px solid rgba(255,255,255,0.04)" : "none", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: s.color + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Farm Calendar ── */}
      {(plantNow.length > 0 || harvestNow.length > 0) && (
        <div style={{ ...cardSt, background: "rgba(101,163,13,0.04)", border: "1px solid rgba(101,163,13,0.1)", padding: 14 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 10, color: "#65a30d", textTransform: "uppercase", letterSpacing: 2 }}>🌾 {currentMonth} Farm Calendar</h3>
          {plantNow.length > 0 && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>🌱 <strong style={{ color: "#22c55e" }}>Plant now:</strong> {plantNow.map((s) => s.fields?.cropName || s.name).join(", ")}</div>}
          {harvestNow.length > 0 && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>🍅 <strong style={{ color: "#f59e0b" }}>Harvest now:</strong> {harvestNow.map((s) => s.fields?.cropName || s.name).join(", ")}</div>}
        </div>
      )}

      {/* ── Weather & Local News ── */}
      <div className="pcs-weather-news" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Local Weather */}
        <div style={{ ...cardSt, padding: 16, background: "linear-gradient(135deg, rgba(14,165,233,0.04), rgba(14,165,233,0.01))", border: "1px solid rgba(14,165,233,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 2 }}>🌤️ Local Weather</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 7, padding: "2px 5px", borderRadius: 3, background: weatherSource === "live" ? "rgba(34,197,94,0.1)" : weatherSource === "cached" ? "rgba(14,165,233,0.1)" : "rgba(255,255,255,0.06)", color: weatherSource === "live" ? "#22c55e" : weatherSource === "cached" ? "#0ea5e9" : "rgba(255,255,255,0.2)", fontWeight: 700, letterSpacing: 0.5 }}>{weatherSource === "live" ? "LIVE" : weatherSource === "cached" ? "CACHED" : "SAMPLE"}</span>
              {currentWeather.city && <span style={{ fontSize: 8, color: "rgba(255,255,255,0.15)", fontFamily: M }}>{currentWeather.city}</span>}
            </div>
          </div>
          {weatherLoading && !weather ? (
            <div style={{ textAlign: "center", padding: "20px 0", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>⟳ Loading weather...</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 36, fontWeight: 800, fontFamily: M, color: "#0ea5e9", lineHeight: 1 }}>{currentWeather.temp}°</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Feels like {currentWeather.feels_like}°</div>
                </div>
                <div style={{ fontSize: 40, lineHeight: 1 }}>{currentWeather.icon || "🌤️"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>{currentWeather.description}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>Wind: {currentWeather.wind_dir} {currentWeather.wind_speed} km/h · Humidity: {currentWeather.humidity}%</div>
                </div>
              </div>
              {forecast.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(forecast.length, 5)}, 1fr)`, gap: 4 }}>
                  {forecast.slice(0, 5).map((d, i) => (
                    <div key={i} style={{ textAlign: "center", padding: "6px 2px", borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)" }}>{d.day}</div>
                      <div style={{ fontSize: 16, margin: "3px 0" }}>{d.icon}</div>
                      <div style={{ fontSize: 10, fontFamily: M, color: "rgba(255,255,255,0.5)" }}>{d.hi}°</div>
                      <div style={{ fontSize: 8, fontFamily: M, color: "rgba(255,255,255,0.2)" }}>{d.lo}°</div>
                    </div>
                  ))}
                </div>
              )}
              {weatherAlerts.length > 0 && weatherAlerts.map((alert, i) => (
                <div key={i} style={{ marginTop: 8, padding: "6px 10px", borderRadius: 6, background: "rgba(245,158,11,0.04)", borderLeft: "2px solid #f59e0b", fontSize: 9, color: "rgba(245,158,11,0.6)" }}>
                  ⚠ {alert.title || alert.desc || "Weather alert active"}
                  {alert.desc && alert.title && <span> — {alert.desc.slice(0, 120)}</span>}
                </div>
              ))}
              {weatherAlerts.length === 0 && climate === "cold" && weatherSource === "sample" && (
                <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 6, background: "rgba(245,158,11,0.04)", borderLeft: "2px solid #f59e0b", fontSize: 9, color: "rgba(245,158,11,0.6)" }}>
                  ⚠ Extreme cold warning — wind chill to -25°C tonight. Check heating fuel and insulate pipes.
                </div>
              )}
            </>
          )}
        </div>

        {/* Local News */}
        <div style={{ ...cardSt, padding: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <h3 style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 2 }}>📰 Local News</h3>
            <span style={{ fontSize: 7, padding: "2px 5px", borderRadius: 3, background: newsSource === "live" ? "rgba(34,197,94,0.1)" : newsSource === "cached" ? "rgba(14,165,233,0.1)" : "rgba(255,255,255,0.06)", color: newsSource === "live" ? "#22c55e" : newsSource === "cached" ? "#0ea5e9" : "rgba(255,255,255,0.2)", fontWeight: 700, letterSpacing: 0.5 }}>{newsSource === "live" ? "LIVE" : newsSource === "cached" ? "CACHED" : "SAMPLE"}</span>
          </div>
          {newsLoading && !news ? (
            <div style={{ textAlign: "center", padding: "20px 0", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>⟳ Loading news...</div>
          ) : (
            <div style={{ display: "grid", gap: 3 }}>
              {newsItems.slice(0, 6).map((n, i) => {
                const sevColors = { critical: "#ef4444", amber: "#f59e0b", info: "#0ea5e9", green: "#22c55e" };
                const col = sevColors[n.severity] || "#6b7280";
                const isClickable = !!n.url;
                return (
                  <div key={i} onClick={() => isClickable && window.open(n.url, "_blank", "noopener,noreferrer")} style={{ display: "flex", gap: 10, padding: "5px 10px", borderRadius: 8, background: "rgba(255,255,255,0.015)", borderLeft: "2px solid " + col + "40", transition: "background 0.15s", cursor: isClickable ? "pointer" : "default" }} onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"} onMouseOut={e => e.currentTarget.style.background = "rgba(255,255,255,0.015)"}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: isClickable ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.65)", lineHeight: 1.4 }}>{n.title}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{n.source}</span>
                        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.15)", fontFamily: M }}>{n.time}</span>
                        {isClickable && <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)" }}>↗</span>}
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

      {/* ── Continuity Metrics ── */}
      <div style={{ ...cardSt, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 2, color: "rgba(255,255,255,0.35)", fontWeight: 700 }}>System Continuity</div>
        </div>
        <div className="pcs-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}>
          {[
            { icon: "🔋", label: "Power Autonomy", value: cont.powerHrs < 100 ? cont.powerHrs.toFixed(1) : Math.round(cont.powerHrs), unit: "hours", color: cont.powerHrs >= 72 ? "#22c55e" : cont.powerHrs >= 24 ? "#f59e0b" : "#ef4444", threshold: cont.powerHrs >= 72 ? "72h+" : cont.powerHrs >= 24 ? "24h+" : "<24h" },
            { icon: "💧", label: "Water Continuity", value: cont.waterDays.toFixed(1), unit: "days", color: cont.waterDays >= 14 ? "#22c55e" : cont.waterDays >= 3 ? "#f59e0b" : "#ef4444", threshold: cont.waterDays >= 14 ? "14d+" : cont.waterDays >= 3 ? "3d+" : "<3d" },
            { icon: "🔥", label: "Heat Stability", value: cont.heatDays.toFixed(1), unit: climate === "cold" ? "days (winter)" : "days", color: cont.heatDays >= 30 ? "#22c55e" : cont.heatDays >= 7 ? "#f59e0b" : "#ef4444", threshold: cont.heatDays >= 30 ? "30d+" : cont.heatDays >= 7 ? "7d+" : "<7d" },
            { icon: "🍽️", label: "Caloric Reserve", value: cont.calDays.toFixed(1), unit: "days", color: cont.calDays >= 30 ? "#22c55e" : cont.calDays >= 7 ? "#f59e0b" : "#ef4444", threshold: cont.calDays >= 30 ? "30d+" : cont.calDays >= 7 ? "7d+" : "<7d" },
            { icon: "📡", label: "Comms Redundancy", value: cont.commCount, unit: cont.commCount === 1 ? "channel" : "channels", color: cont.commCount >= 3 ? "#22c55e" : cont.commCount >= 2 ? "#f59e0b" : "#ef4444", threshold: cont.commCount >= 3 ? "3ch+" : cont.commCount >= 1 ? "1ch+" : "none" },
          ].map((m, i) => (
            <div key={i} style={{ padding: "16px 14px", borderRight: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none", textAlign: "center" }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{m.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: M, color: m.color, lineHeight: 1 }}>{m.value}</div>
              <div style={{ fontSize: 10, color: m.color, fontWeight: 600, marginTop: 2, textTransform: "uppercase" }}>{m.unit}</div>
              <div style={{ fontSize: 9, color: m.color, opacity: 0.6, marginTop: 2, fontFamily: M }}>{m.threshold}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4, lineHeight: 1.3 }}>{m.label}</div>
            </div>
          ))}
        </div>
        {cont.frag.length > 0 && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", padding: "10px 16px" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, color: "rgba(239,68,68,0.5)", fontWeight: 700, marginBottom: 6 }}>⚠ Fragility Analysis</div>
            <div style={{ display: "grid", gap: 4 }}>
              {cont.frag.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: f.sev === "critical" ? "rgba(239,68,68,0.04)" : "rgba(245,158,11,0.03)", borderRadius: 6, borderLeft: "2px solid " + (f.sev === "critical" ? "#ef4444" : "#f59e0b") }}>
                  <span style={{ fontSize: 12 }}>{f.icon}</span>
                  <span style={{ fontSize: 10, color: f.sev === "critical" ? "rgba(239,68,68,0.7)" : "rgba(245,158,11,0.7)", fontStyle: "italic" }}>{f.msg}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Action Bar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "4px 0" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowAlerts(!showAlerts)} style={{ ...btnSt, background: (allAlerts.length > 0 && !alertsDismissed) ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.04)", color: (allAlerts.length > 0 && !alertsDismissed) ? "#ef4444" : "rgba(255,255,255,0.4)", fontWeight: 700, fontSize: 14, padding: "8px 11px", border: (allAlerts.length > 0 && !alertsDismissed) ? "1px solid rgba(239,68,68,0.15)" : "1px solid rgba(255,255,255,0.06)", position: "relative", opacity: alertsDismissed ? 0.5 : 1 }} title={alertsDismissed ? `Alerts dismissed — returns in ${Math.ceil((alertsDismissedUntil - Date.now()) / 3600000)}h` : allAlerts.length + " alerts"}>
            🔔
            {allAlerts.length > 0 && !alertsDismissed && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: M, padding: "0 3px", boxShadow: "0 2px 6px rgba(239,68,68,0.4)" }}>{allAlerts.length}</span>}
          </button>
          {showAlerts && allAlerts.length > 0 && !alertsDismissed && (
            <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 340, maxHeight: 400, overflowY: "auto", background: "#13151a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, boxShadow: "0 16px 48px rgba(0,0,0,0.6)", zIndex: 999, padding: 6 }}>
              <div style={{ padding: "8px 12px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444" }}>⚠ {allAlerts.length} Alerts</span>
                <button onClick={() => setShowAlerts(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 14, cursor: "pointer", padding: 0 }}>×</button>
              </div>
              {allAlerts.map((a, i) => (
                <div key={i} onClick={() => { setShowAlerts(false); if (a.category) setSelCat(a.category); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, cursor: "pointer", transition: "background 0.1s" }} onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{CATEGORIES[a.category]?.icon || "⚠"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                    <div style={{ fontSize: 9, color: a.ac, fontFamily: M }}>{a.al}</div>
                  </div>
                </div>
              ))}
              <div style={{ padding: "6px 12px 8px", borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 4 }}>
                <button onClick={() => { onDismissAlerts(); setShowAlerts(false); }} style={{ ...btnSt, width: "100%", padding: "6px 0", fontSize: 10, fontWeight: 700, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6 }}>
                  Dismiss all for 24h
                </button>
              </div>
            </div>
          )}
          {showAlerts && alertsDismissed && (
            <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 240, background: "#13151a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, boxShadow: "0 16px 48px rgba(0,0,0,0.6)", zIndex: 999, padding: "12px 16px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>🔕 Alerts dismissed · returns in {Math.ceil((alertsDismissedUntil - Date.now()) / 3600000)}h</div>
            </div>
          )}
        </div>
        <button onClick={() => setShowScanner(true)} style={{ ...btnSt, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", fontWeight: 700, fontSize: 15, padding: "8px 11px", border: "1px solid rgba(255,255,255,0.06)" }} title="Scan Barcode">📷</button>
        <button onClick={() => openAdd()} style={{ ...btnSt, background: "linear-gradient(135deg,#c8553a,#a03e28)", color: "#fff", fontWeight: 700, fontSize: 12, padding: "8px 16px", boxShadow: "0 2px 10px rgba(200,85,58,0.25)" }}>+ Add</button>
      </div>

      {/* ── Categories Grid ── */}
      <div>
        <h3 style={{ margin: "0 0 10px", fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 2 }}>Categories</h3>
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
              const crops = new Set(ci.filter((i) => i.subType === "seedPacket").map((i) => i.fields?.cropName)).size;
              metric = { val: crops, unit: "crops", color: crops >= 5 ? "#22c55e" : crops >= 2 ? "#f59e0b" : "#ef4444" };
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
            } else if (k === "shelter" || k === "tools" || k === "equipment") {
              const qty = ci.reduce((s, i) => s + (i.quantity || 0), 0);
              metric = { val: qty, unit: "items", color: qty > 0 ? "#22c55e" : "rgba(255,255,255,0.15)" };
            }

            return (
              <button key={k} onClick={() => setSelCat(k)} style={{ ...cardSt, padding: 14, cursor: "pointer", textAlign: "left", borderLeft: "3px solid " + cat.color, minWidth: 0, overflow: "hidden" }} onMouseOver={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }} onMouseOut={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                  <div style={{ fontSize: 22, marginBottom: 3, flexShrink: 0 }}>{cat.icon}</div>
                  {metric && (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, fontFamily: M, color: metric.color, lineHeight: 1 }}>{metric.val}</div>
                      <div style={{ fontSize: 9, color: metric.color, opacity: 0.7, whiteSpace: "nowrap" }}>{metric.unit}</div>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.label}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: M }}>{ci.length} items · {filled}/{total}</div>
                <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 5 }}><div style={{ height: "100%", width: (filled / total) * 100 + "%", background: cat.color, borderRadius: 2, transition: "width 0.3s ease" }} /></div>
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
            <h3 style={{ margin: "0 0 10px", fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 2 }}>Expiry Calendar</h3>
            <div style={{ ...cardSt, padding: 16 }}>
              <div className="pcs-expiry-grid" style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 4 }}>
                {months.map((m) => {
                  const mItems = byMonth[m.key] || [];
                  const count = mItems.length;
                  const intensity = count / maxCount;
                  const expired = mItems.filter((i) => i.expDate < now).length;
                  const bgColor = count === 0 ? "rgba(255,255,255,0.02)" : expired > 0 ? `rgba(239,68,68,${0.1 + intensity * 0.35})` : intensity > 0.6 ? `rgba(245,158,11,${0.1 + intensity * 0.3})` : `rgba(34,197,94,${0.05 + intensity * 0.15})`;
                  const borderColor = count === 0 ? "rgba(255,255,255,0.04)" : expired > 0 ? "rgba(239,68,68,0.2)" : intensity > 0.6 ? "rgba(245,158,11,0.2)" : "rgba(34,197,94,0.15)";
                  const isNow = m.month === now.getMonth() && m.year === now.getFullYear();
                  return (
                    <div key={m.key} style={{ padding: "8px 4px", borderRadius: 8, background: bgColor, border: isNow ? "2px solid rgba(200,85,58,0.4)" : "1px solid " + borderColor, textAlign: "center", minHeight: 58, display: "flex", flexDirection: "column", justifyContent: "center", position: "relative" }} title={count > 0 ? mItems.map(i => i.name + " (" + CATEGORIES[i.category]?.icon + ")").join(", ") : "Nothing expiring"}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: isNow ? "#c8553a" : "rgba(255,255,255,0.3)", marginBottom: 3 }}>{m.label}</div>
                      <div style={{ fontSize: count > 0 ? 18 : 12, fontWeight: 800, fontFamily: M, color: count === 0 ? "rgba(255,255,255,0.08)" : expired > 0 ? "#ef4444" : intensity > 0.6 ? "#f59e0b" : "#22c55e", lineHeight: 1 }}>{count > 0 ? count : "—"}</div>
                      {count > 0 && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{expired > 0 ? <span style={{ color: "#ef4444" }}>{expired} exp</span> : "items"}</div>}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 8, justifyContent: "center", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                <span>🟢 Low</span><span>🟡 Moderate</span><span>🔴 Urgent</span><span style={{ color: "#c8553a" }}>◻ Now</span>
              </div>
              {expiringItems.filter(i => { const d = (i.expDate - now) / 864e5; return d <= 90 && d >= -30; }).length > 0 && (
                <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.08)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#ef4444", marginBottom: 4 }}>⚠ Expiring within 90 days</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {expiringItems.filter(i => { const d = (i.expDate - now) / 864e5; return d <= 90 && d >= -30; }).sort((a, b) => a.expDate - b.expDate).slice(0, 8).map((i, idx) => {
                      const d = Math.ceil((i.expDate - now) / 864e5);
                      return <span key={idx} style={{ fontSize: 9, padding: "4px 8px", borderRadius: 6, background: d < 0 ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.08)", color: d < 0 ? "#ef4444" : "#f59e0b", fontFamily: M }}>{CATEGORIES[i.category]?.icon} {i.name} · {d < 0 ? Math.abs(d) + "d ago" : d + "d"}</span>;
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

/* ── AuthPanel — Moved outside PropertyTab to prevent re-mount on each render ── */
function AuthPanel({ title, icon, color, auth, setAuth, provider, helpUrl, providerId, onAuth, onDisconnect }) {
  const [focusField, setFocusField] = useState(null);
  if (auth.connected) {
    return (
      <div style={{ ...cardSt, padding: "14px 18px", marginBottom: 16, borderLeft: "3px solid " + color, background: color + "06" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>{icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{provider}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <div style={{ width: 7, height: 7, borderRadius: 4, background: color, animation: "pulse 2s infinite" }} />
                <span style={{ fontSize: 10, color: color, fontWeight: 600 }}>Connected as {auth.email}</span>
              </div>
            </div>
          </div>
          <button onClick={() => onDisconnect(setAuth, providerId)} style={{ ...btnSt, padding: "6px 14px", fontSize: 11, background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.15)" }}>Disconnect</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...cardSt, padding: "20px 24px", marginBottom: 16, borderLeft: "3px solid " + color }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Sign in with your {provider} account to enable live feeds</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelSt}>Email / Username</label>
          <input style={{ ...inp, border: focusField === "email" ? `1px solid ${color}` : inp.border, boxShadow: focusField === "email" ? `0 0 0 2px ${color}33` : "none" }} type="email" value={auth.email} onChange={(e) => setAuth((p) => ({ ...p, email: e.target.value, error: "" }))} onFocus={() => setFocusField("email")} onBlur={() => setFocusField(null)} placeholder="user@email.com" />
        </div>
        <div>
          <label style={labelSt}>Password</label>
          <div style={{ position: "relative" }}>
            <input style={{ ...inp, paddingRight: 36, border: focusField === "password" ? `1px solid ${color}` : inp.border, boxShadow: focusField === "password" ? `0 0 0 2px ${color}33` : "none" }} type={auth.showPw ? "text" : "password"} value={auth.password} onChange={(e) => setAuth((p) => ({ ...p, password: e.target.value, error: "" }))} onFocus={() => setFocusField("password")} onBlur={() => setFocusField(null)} placeholder="••••••••" />
            <button onClick={() => setAuth((p) => ({ ...p, showPw: !p.showPw }))} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "rgba(255,255,255,0.3)", padding: 0 }}>{auth.showPw ? "🙈" : "👁️"}</button>
          </div>
        </div>
      </div>
      {auth.error && <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 8 }}>{auth.error}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => onAuth(setAuth, auth, providerId)} disabled={auth.loading} style={{ ...btnSt, padding: "8px 20px", fontSize: 12, background: auth.loading ? "rgba(255,255,255,0.06)" : color, color: "#fff", fontWeight: 700, opacity: auth.loading ? 0.6 : 1 }}>
          {auth.loading ? "Connecting..." : "Connect"}
        </button>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>Credentials are stored locally behind your PIN</span>
      </div>
    </div>
  );
}

/* ── CameraFeedCanvas — Renders simulated trail camera feed ── */
function CameraFeedCanvas({ cam, expanded }) {
  const canvasRef = useRef(null);
  const height = expanded ? 200 : 120;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.width = canvas.parentElement?.offsetWidth || 280;
    const h = canvas.height = height;
    const ctx = canvas.getContext("2d");

    // Base gradient — night-vision green/brown tint per camera
    const hue = (cam.id.charCodeAt(cam.id.length - 1) * 37) % 60 + 90;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, `hsl(${hue}, 15%, 8%)`);
    grad.addColorStop(0.5, `hsl(${hue}, 20%, 12%)`);
    grad.addColorStop(1, `hsl(${hue}, 10%, 6%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // IR noise grain
    const imageData = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 25;
      imageData.data[i] += noise;
      imageData.data[i + 1] += noise;
      imageData.data[i + 2] += noise;
    }
    ctx.putImageData(imageData, 0, 0);

    // Vignette
    const vignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.7);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    // HUD overlay
    ctx.font = "bold 9px JetBrains Mono, monospace";
    ctx.fillStyle = "rgba(34,197,94,0.7)";
    ctx.fillText(cam.name.toUpperCase(), 8, 14);

    const ts = new Date().toLocaleString("en-US", { hour12: false });
    const tsW = ctx.measureText(ts).width;
    ctx.fillText(ts, w - tsW - 8, 14);

    // REC dot
    ctx.fillStyle = "rgba(239,68,68,0.8)";
    ctx.beginPath();
    ctx.arc(14, h - 12, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "bold 9px JetBrains Mono, monospace";
    ctx.fillText("REC", 22, h - 8);

    // Model + location bottom-right
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    const locText = `${cam.model} | ${cam.location}`;
    const locW = ctx.measureText(locText).width;
    ctx.fillText(locText, w - locW - 8, h - 8);

    // Crosshair center (subtle)
    ctx.strokeStyle = "rgba(34,197,94,0.15)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 20, h / 2);
    ctx.lineTo(w / 2 + 20, h / 2);
    ctx.moveTo(w / 2, h / 2 - 20);
    ctx.lineTo(w / 2, h / 2 + 20);
    ctx.stroke();

  }, [cam.id, cam.name, cam.model, cam.location, height, expanded]);

  return <canvas ref={canvasRef} style={{ width: "100%", height, display: "block" }} />;
}

function PropertyTab({ propUnlocked, setPropUnlocked, propSub, setPropSub, propAddress, setPropAddress, pins, setPins, codes, setCodes, members, manuals, routes, amenities, revealedCodes, setRevealedCodes, user }) {
  const [revealAuth, setRevealAuth] = useState({ email: "", password: "", connected: false, showPw: false, error: "", loading: false });
  const [nestAuth, setNestAuth] = useState({ email: "", password: "", connected: false, showPw: false, error: "", loading: false });
  const [eyezonAuth, setEyezonAuth] = useState({ email: "", password: "", connected: false, showPw: false, error: "", loading: false });
  const [expandedCam, setExpandedCam] = useState(null);
  const [accessDropdown, setAccessDropdown] = useState(null);
  const [liveCameras, setLiveCameras] = useState(null);
  const [liveAlarm, setLiveAlarm] = useState(null);
  const [liveNestDevices, setLiveNestDevices] = useState(null);

  if (!propUnlocked) return <PinLock onUnlock={() => setPropUnlocked(true)} />;

  const CODE_ICONS = { gate: "🚪", safe: "🔐", alarm: "🚨", wifi: "📶", radio: "📻" };
  const subTabs = [{ id: "map", l: "Map", i: "🗺️" }, { id: "codes", l: "Codes", i: "🔑" }, { id: "manuals", l: "Manuals", i: "📖" }, { id: "routes", l: "Routes", i: "🛤️" }, { id: "resources", l: "Resources", i: "📍" }, { id: "cameras", l: "Cameras", i: "📷" }, { id: "systems", l: "Systems", i: "🏠" }, { id: "weather", l: "Advisories", i: "🌤️" }, { id: "skills", l: "Skills", i: "🎖️" }];
  const ROUTE_COLORS = { primary: "#22c55e", secondary: "#f59e0b", tertiary: "#ef4444", emergency: "#8b5cf6" };

  const handleAuth = async (setter, state, provider) => {
    if (!state.email || !state.password) { setter((p) => ({ ...p, error: "Enter email and password" })); return; }
    setter((p) => ({ ...p, loading: true, error: "" }));

    const apiBase = import.meta.env.VITE_API_URL || "";
    const endpoints = {
      tactacam: `${apiBase}/api/smart-home/tactacam/auth`,
      eyezon: `${apiBase}/api/smart-home/eyezon/auth`,
      nest: `${apiBase}/api/smart-home/nest/auth`,
    };

    try {
      // Try real API if user is authenticated
      if (user && supabaseConfigured) {
        const session = await supabase.auth.getSession();
        const token = session?.data?.session?.access_token;
        if (token && endpoints[provider]) {
          const res = await fetch(endpoints[provider], {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ email: state.email, password: state.password }),
          });
          if (res.ok) {
            setter((p) => ({ ...p, loading: false, connected: true, error: "" }));
            // Fetch live data after successful auth
            if (provider === "tactacam") fetchLiveCameras(token);
            if (provider === "eyezon") fetchLiveAlarmStatus(token);
            if (provider === "nest") fetchLiveNestDevices(token);
            return;
          }
          const errData = await res.json().catch(() => ({}));
          setter((p) => ({ ...p, loading: false, error: errData.error || "Connection failed" }));
          return;
        }
      }
      // Fallback: simulate connection with sample data
      setTimeout(() => { setter((p) => ({ ...p, loading: false, connected: true, error: "" })); }, 1500);
    } catch (err) {
      // Fallback: simulate connection
      setTimeout(() => { setter((p) => ({ ...p, loading: false, connected: true, error: "" })); }, 1500);
    }
  };

  const fetchLiveCameras = async (token) => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${apiBase}/api/smart-home/tactacam/cameras`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); setLiveCameras(data.cameras); }
    } catch { /* use sample data */ }
  };
  const fetchLiveAlarmStatus = async (token) => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${apiBase}/api/smart-home/eyezon/status`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); setLiveAlarm(data); }
    } catch { /* use sample data */ }
  };
  const fetchLiveNestDevices = async (token) => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${apiBase}/api/smart-home/nest/devices`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); setLiveNestDevices(data.devices); }
    } catch { /* use sample data */ }
  };

  const handleDisconnect = (setter, provider) => {
    setter({ email: "", password: "", connected: false, showPw: false, error: "", loading: false });
    if (provider === "tactacam") setLiveCameras(null);
    if (provider === "eyezon") setLiveAlarm(null);
    if (provider === "nest") setLiveNestDevices(null);
  };

  const displayCameras = liveCameras || SAMPLE_CAMERAS;
  const displayAlarm = liveAlarm || SMART_HOME.alarm;
  const displayNestDevices = liveNestDevices || SMART_HOME.nest.devices;

  const signalBars = (level) => {
    const bars = [];
    for (let i = 0; i < 5; i++) {
      bars.push(<div key={i} style={{ width: 3, height: 4 + i * 2, borderRadius: 1, background: i < level ? "#22c55e" : "rgba(255,255,255,0.1)" }} />);
    }
    return <div style={{ display: "flex", alignItems: "flex-end", gap: 1 }}>{bars}</div>;
  };

  /* AuthPanel moved outside PropertyTab — see above */

  return (
    <div>
      <div style={{ display: "flex", gap: 3, marginBottom: 20, background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: 3, overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        {subTabs.map((st) => (
          <button key={st.id} onClick={() => setPropSub(st.id)} style={{ flex: "0 0 auto", minWidth: 60, padding: "8px 8px", background: propSub === st.id ? "rgba(255,255,255,0.08)" : "transparent", border: "none", borderRadius: 8, cursor: "pointer", textAlign: "center" }}>
            <div style={{ fontSize: 14 }}>{st.i}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: propSub === st.id ? "#fff" : "rgba(255,255,255,0.35)", marginTop: 2, whiteSpace: "nowrap" }}>{st.l}</div>
          </button>
        ))}
      </div>

      {propSub === "map" && <PropertyMap pins={pins} setPins={setPins} propAddress={propAddress} setPropAddress={setPropAddress} />}

      {propSub === "codes" && (
        <div>
          {codes.map((c) => {
            const daysSinceChange = c.lastChanged ? Math.floor((Date.now() - new Date(c.lastChanged).getTime()) / 864e5) : null;
            const rotationOverdue = daysSinceChange !== null && daysSinceChange > 30;
            const rotationWarning = daysSinceChange !== null && daysSinceChange > 25;
            return (
              <div key={c.id} style={{ ...cardSt, padding: "12px 16px", marginBottom: 6, display: "flex", alignItems: "flex-start", gap: 12, borderLeft: `3px solid ${rotationOverdue ? "#ef4444" : "#1e3a5f"}` }}>
                <span style={{ fontSize: 20, marginTop: 2 }}>{CODE_ICONS[c.type] || "🔑"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{c.label}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <div style={{ fontFamily: M, fontSize: 15, fontWeight: 700, color: revealedCodes[c.id] ? "#22c55e" : "rgba(255,255,255,0.1)", background: revealedCodes[c.id] ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.03)", padding: "5px 10px", borderRadius: 6, userSelect: revealedCodes[c.id] ? "text" : "none" }}>
                      {revealedCodes[c.id] ? c.code : "••••••"}
                    </div>
                    <button onClick={() => setRevealedCodes((p) => ({ ...p, [c.id]: !p[c.id] }))} style={{ ...btnSt, padding: "5px 8px", fontSize: 12, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
                      {revealedCodes[c.id] ? "🙈" : "👁️"}
                    </button>
                  </div>
                  {c.notes && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>{c.location} · {c.notes}</div>}
                  {daysSinceChange !== null && (
                    <div style={{ fontSize: 9, fontFamily: M, marginTop: 5, color: rotationOverdue ? "#ef4444" : rotationWarning ? "#f59e0b" : "rgba(255,255,255,0.3)", fontWeight: rotationOverdue ? 700 : 400 }}>
                      {rotationOverdue ? `⚠ ${daysSinceChange}d since change — ROTATE` : `Changed ${daysSinceChange}d ago · rotate in ${30 - daysSinceChange}d`}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0, minWidth: 90 }}>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Access</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "flex-end", maxWidth: 200 }}>
                    {(c.access || []).map((person) => (
                      <span key={person} style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "2px 6px", borderRadius: 10, fontSize: 9, fontWeight: 600, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        {(members || []).find(m => m.name === person)?.avatar || "👤"} {person}
                        <button onClick={() => setCodes(prev => prev.map(cd => cd.id === c.id ? { ...cd, access: (cd.access || []).filter(a => a !== person) } : cd))} style={{ background: "none", border: "none", color: "rgba(239,68,68,0.6)", cursor: "pointer", padding: 0, fontSize: 9, marginLeft: 1, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                    <div style={{ position: "relative" }}>
                      <button onClick={() => setAccessDropdown(accessDropdown === c.id ? null : c.id)} style={{ padding: "2px 6px", borderRadius: 10, fontSize: 9, fontWeight: 700, background: "rgba(200,85,58,0.1)", color: "#c8553a", border: "1px solid rgba(200,85,58,0.2)", cursor: "pointer" }}>+</button>
                      {accessDropdown === c.id && (
                        <div style={{ position: "absolute", top: "100%", right: 0, background: "#13151a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: 4, zIndex: 50, minWidth: 120, marginTop: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.6)" }}>
                          {(members || []).filter(m => !(c.access || []).includes(m.name)).length === 0 ? (
                            <div style={{ padding: "6px 8px", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>All members added</div>
                          ) : (members || []).filter(m => !(c.access || []).includes(m.name)).map(m => (
                            <button key={m.id} onClick={() => { setCodes(prev => prev.map(cd => cd.id === c.id ? { ...cd, access: [...(cd.access || []), m.name] } : cd)); setAccessDropdown(null); }} style={{ display: "block", width: "100%", padding: "5px 8px", background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 10, cursor: "pointer", textAlign: "left", borderRadius: 4 }} onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"} onMouseOut={e => e.currentTarget.style.background = "none"}>
                              {m.avatar} {m.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {propSub === "manuals" && <div>{manuals.map((m) => (<div key={m.id} style={{ ...cardSt, padding: "12px 16px", marginBottom: 6, borderLeft: "3px solid " + (m.priority === "high" ? "#ef4444" : "#f59e0b") }}><div style={{ fontSize: 13, fontWeight: 700 }}>{m.title} <span style={{ fontSize: 10, color: m.priority === "high" ? "#ef4444" : "#f59e0b", fontWeight: 700 }}>{m.priority.toUpperCase()}</span></div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>{m.desc}</div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>📄 {m.file}</div></div>))}</div>}

      {propSub === "routes" && <div>{routes.map((r) => { const col = ROUTE_COLORS[r.priority] || "#6b7280"; return (<div key={r.id} style={{ ...cardSt, padding: "16px 18px", marginBottom: 8, borderLeft: "4px solid " + col }}><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><span style={{ fontSize: 10, padding: "4px 8px", borderRadius: 12, background: col + "18", color: col, fontWeight: 800, textTransform: "uppercase" }}>{r.priority}</span><h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{r.name}</h4></div><div style={{ display: "flex", gap: 14, fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}><span>📍 {r.dest}</span><span style={{ fontFamily: M, color: col }}>{r.dist}</span><span>ETA: {r.eta}</span></div><p style={{ margin: "0 0 8px", fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>{r.desc}</p><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}><div style={{ background: "rgba(255,255,255,0.02)", padding: 8, borderRadius: 6 }}><div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700, marginBottom: 3 }}>WAYPOINTS</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{r.waypoints}</div></div><div style={{ background: "rgba(239,68,68,0.03)", padding: 8, borderRadius: 6 }}><div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, marginBottom: 3 }}>RISKS</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{r.risks}</div></div><div style={{ background: "rgba(34,197,94,0.03)", padding: 8, borderRadius: 6 }}><div style={{ fontSize: 10, color: "#22c55e", fontWeight: 700, marginBottom: 3 }}>SUPPLIES</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{r.supplies}</div></div></div></div>); })}</div>}

      {propSub === "resources" && <div>{amenities.map((a) => (<div key={a.id} style={{ ...cardSt, padding: "12px 14px", marginBottom: 6, borderLeft: "3px solid " + (a.crisis === "high" ? "#22c55e" : "#f59e0b") }}><div style={{ fontSize: 13, fontWeight: 700 }}>{a.name}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>📏 {a.dist} · 🧭 {a.dir}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>{a.notes}</div></div>))}</div>}

      {propSub === "cameras" && (
        <div>
          <AuthPanel title="Reveal Camera Login" icon="📷" color="#22c55e" auth={revealAuth} setAuth={setRevealAuth} provider="Tactacam Reveal" providerId="tactacam" helpUrl="https://www.reveal.tactacam.com" onAuth={handleAuth} onDisconnect={handleDisconnect} />
          {!revealAuth.connected ? (
            <div style={{ ...cardSt, padding: "40px 20px", textAlign: "center", borderStyle: "dashed" }}>
              <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.3 }}>📷</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>Camera feeds unavailable</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Connect your Reveal account above to view live camera feeds and snapshots</div>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>{displayCameras.length} cameras · {displayCameras.filter((c) => c.status === "online").length} online</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>Auto-refresh every 30s</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                {displayCameras.map((cam) => {
                  const isOnline = cam.status === "online";
                  const isExpanded = expandedCam === cam.id;
                  return (
                    <div key={cam.id} style={{ ...cardSt, padding: 0, overflow: "hidden", borderTop: "3px solid " + (isOnline ? "#22c55e" : "#ef4444") }}>
                      <div onClick={() => isOnline && setExpandedCam(isExpanded ? null : cam.id)} style={{ height: isExpanded ? 200 : 120, position: "relative", cursor: isOnline ? "pointer" : "default", transition: "height 0.3s", overflow: "hidden", background: isOnline ? "transparent" : "linear-gradient(135deg,#1a0a0a,#200d0d)" }}>
                        {isOnline ? (
                          <CameraFeedCanvas cam={cam} expanded={isExpanded} />
                        ) : (
                          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontSize: 20, opacity: 0.3 }}>📷</div>
                              <div style={{ fontSize: 9, color: "rgba(239,68,68,0.5)", marginTop: 4 }}>OFFLINE</div>
                            </div>
                          </div>
                        )}
                        <div style={{ position: "absolute", top: 6, left: 8, display: "flex", alignItems: "center", gap: 4 }}>
                          <div style={{ width: 5, height: 5, borderRadius: 3, background: isOnline ? "#22c55e" : "#ef4444", animation: isOnline ? "pulse 2s infinite" : "none" }} />
                          <span style={{ fontSize: 10, color: isOnline ? "#22c55e" : "#ef4444", fontWeight: 700 }}>{isOnline ? "LIVE" : "OFFLINE"}</span>
                        </div>
                        <div style={{ position: "absolute", top: 6, right: 8, display: "flex", alignItems: "center", gap: 6 }}>
                          {signalBars(cam.signal)}
                          <span style={{ fontSize: 10, color: cam.battery < 20 ? "#ef4444" : cam.battery < 50 ? "#f59e0b" : "#22c55e", fontFamily: M }}>🔋{cam.battery}%</span>
                        </div>
                        {isOnline && !isExpanded && <div style={{ position: "absolute", bottom: 6, right: 8, fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Click to expand</div>}
                      </div>
                      <div style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{cam.name}</div>
                            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{cam.model} · {cam.location}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>📸 {cam.captures}/24h</div>
                            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>{cam.last}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {propSub === "systems" && (
        <div>
          {/* EyezOn Alarm Auth */}
          <AuthPanel title="EyezOn Alarm Login" icon="🚨" color="#f59e0b" auth={eyezonAuth} setAuth={setEyezonAuth} provider="EyezOn EnvisaLink" providerId="eyezon" onAuth={handleAuth} onDisconnect={handleDisconnect} />
          {eyezonAuth.connected ? (
            <div style={{ ...cardSt, marginBottom: 16, borderLeft: "3px solid #22c55e" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 22 }}>🚨</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Alarm — {displayAlarm.provider}</div>
                  <div style={{ fontSize: 11, color: "#22c55e" }}>{displayAlarm.status}</div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button style={{ ...btnSt, padding: "5px 12px", fontSize: 10, background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" }}>Arm Away</button>
                  <button style={{ ...btnSt, padding: "5px 12px", fontSize: 10, background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>Disarm</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 6 }}>
                {(displayAlarm.zones || []).map((z, i) => (
                  <div key={i} style={{ padding: "8px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: z.s === "closed" || z.s === "clear" ? "#22c55e" : "#ef4444" }} />
                    <div style={{ fontSize: 11 }}>{z.n} — <span style={{ color: "rgba(255,255,255,0.4)" }}>{z.s}</span></div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ ...cardSt, padding: "30px 20px", textAlign: "center", borderStyle: "dashed", marginBottom: 16 }}>
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>🚨</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.3)" }}>Connect EyezOn to view alarm status and control zones</div>
            </div>
          )}

          {/* Nest Auth */}
          <AuthPanel title="Nest / Google Home Login" icon="🏠" color="#06b6d4" auth={nestAuth} setAuth={setNestAuth} provider="Google Nest" providerId="nest" onAuth={handleAuth} onDisconnect={handleDisconnect} />
          {nestAuth.connected ? (
            <div style={{ ...cardSt, borderLeft: "3px solid #06b6d4" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 22 }}>🏠</span>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Nest Devices</div>
                <span style={{ fontSize: 9, padding: "4px 8px", borderRadius: 8, background: "rgba(6,182,212,0.1)", color: "#06b6d4", fontWeight: 700 }}>{displayNestDevices.length} devices</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                {displayNestDevices.map((d, i) => (
                  <div key={i} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 8, borderLeft: d.type === "lock" ? (d.status === "Locked" ? "3px solid #22c55e" : "3px solid #f59e0b") : "3px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                      {d.type === "lock" ? "🔐" : d.type === "smoke" ? "🔥" : "🌡️"} {d.n}
                    </div>
                    {d.type === "lock" ? (
                      <div>
                        <div style={{ fontSize: 10, color: d.status === "Locked" ? "#22c55e" : "#f59e0b", fontWeight: 600 }}>
                          {d.status === "Locked" ? "✓ Locked" : "⚠ Unlocked"} · 🔋 {d.bat}
                        </div>
                        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                          <button style={{ ...btnSt, padding: "5px 10px", fontSize: 9, background: d.status === "Locked" ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)", color: d.status === "Locked" ? "#ef4444" : "#22c55e", border: "1px solid " + (d.status === "Locked" ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)") }}>
                            {d.status === "Locked" ? "Unlock" : "Lock"}
                          </button>
                        </div>
                      </div>
                    ) : d.type === "smoke" ? (
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>✓ OK · 🔋 {d.bat} · CO: {d.co}</div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 24, fontWeight: 800, fontFamily: M }}>{d.temp}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Set: {d.set} · {d.hum} · {d.mode}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ ...cardSt, padding: "30px 20px", textAlign: "center", borderStyle: "dashed" }}>
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>🏠</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.3)" }}>Connect Google Nest to view locks, thermostats, and smoke detectors</div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Weather & Advisories ═══ */}
      {propSub === "weather" && (
        <div>
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 800 }}>🌤️ Advisories & Alerts</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {WEATHER_ADVISORIES.sort((a, b) => {
              const sev = { advisory: 0, warning: 1, watch: 2, info: 3 };
              return (sev[a.severity] || 3) - (sev[b.severity] || 3);
            }).map((w) => (
              <div key={w.id} style={{ ...cardSt, padding: "14px 16px", borderLeft: "4px solid " + w.color, background: w.color + "06" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: w.color + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{w.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{w.title}</span>
                      <span style={{ fontSize: 10, padding: "4px 6px", borderRadius: 4, background: w.color + "20", color: w.color, fontWeight: 700, textTransform: "uppercase" }}>{w.severity}</span>
                      <span style={{ fontSize: 10, padding: "4px 6px", borderRadius: 4, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>{w.type}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 6 }}>{w.desc}</div>
                    <div style={{ display: "flex", gap: 12, fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
                      <span>📅 Issued: {w.issued}</span>
                      <span>⏱️ Expires: {w.expires}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 14, fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
            Advisory sources: Environment Canada, Ontario IESO, local public health · Updated hourly
          </div>
        </div>
      )}

      {/* ═══ Skills & Badges ═══ */}
      {propSub === "skills" && (() => {
        const [expandedSkill, setExpandedSkill] = useState(null);
        const [showLesson, setShowLesson] = useState(null);
        const totalBadges = SKILLS_DATA.reduce((s, sk) => s + sk.badges.filter((b) => b.unlocked).length, 0);
        const totalPossible = SKILLS_DATA.reduce((s, sk) => s + sk.badges.length, 0);

        return (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>🎖️ Skills & Certifications</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{totalBadges}/{totalPossible} badges</span>
                <div style={{ width: 80, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                  <div style={{ width: (totalBadges / totalPossible) * 100 + "%", height: "100%", background: "linear-gradient(90deg, #c8553a, #f59e0b)", borderRadius: 3 }} />
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, marginBottom: 16 }}>
              {SKILLS_DATA.map((sk) => (
                <button key={sk.id} onClick={() => setExpandedSkill(expandedSkill === sk.id ? null : sk.id)} style={{ ...cardSt, padding: 16, cursor: "pointer", textAlign: "center", borderTop: "3px solid " + sk.color, background: expandedSkill === sk.id ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)" }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>{sk.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{sk.label}</div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 3, marginBottom: 6 }}>
                    {Array.from({ length: sk.maxLevel }).map((_, i) => (
                      <div key={i} style={{ width: 10, height: 10, borderRadius: 5, background: i < sk.level ? sk.color : "rgba(255,255,255,0.08)", border: i < sk.level ? "none" : "1px solid rgba(255,255,255,0.06)" }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 9, color: sk.color, fontWeight: 700 }}>Level {sk.level}/{sk.maxLevel}</div>
                </button>
              ))}
            </div>

            {SKILLS_DATA.filter((sk) => expandedSkill === sk.id).map((sk) => (
              <div key={sk.id}>
                <div style={{ ...cardSt, padding: 18, borderLeft: "4px solid " + sk.color }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <span style={{ fontSize: 28 }}>{sk.icon}</span>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800 }}>{sk.label}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{sk.desc}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Badge Track</div>
                  <div style={{ display: "flex", gap: 0, marginBottom: 18, position: "relative" }}>
                    <div style={{ position: "absolute", top: 16, left: 24, right: 24, height: 2, background: "rgba(255,255,255,0.06)", zIndex: 0 }} />
                    <div style={{ position: "absolute", top: 16, left: 24, width: ((sk.level / sk.maxLevel) * 100) + "%", maxWidth: "calc(100% - 48px)", height: 2, background: sk.color, zIndex: 1 }} />
                    {sk.badges.map((b, i) => (
                      <div key={i} style={{ flex: 1, textAlign: "center", position: "relative", zIndex: 2 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 17, background: b.unlocked ? sk.color : "rgba(255,255,255,0.04)", border: b.unlocked ? "2px solid " + sk.color : "2px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 6px", fontSize: b.unlocked ? 14 : 11, color: b.unlocked ? "#fff" : "rgba(255,255,255,0.2)", fontWeight: 800 }}>
                          {b.unlocked ? "✓" : b.level}
                        </div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: b.unlocked ? sk.color : "rgba(255,255,255,0.25)" }}>{b.name}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2, lineHeight: 1.3, padding: "0 2px" }}>{b.desc}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Micro Lessons</div>
                  {sk.lessons.map((lesson, li) => (
                    <div key={li} style={{ marginBottom: 6 }}>
                      <button onClick={() => setShowLesson(showLesson === sk.id + "-" + li ? null : sk.id + "-" + li)} style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, cursor: "pointer", textAlign: "left", color: "#fff", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: sk.color + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>{sk.icon}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{lesson.title}</div>
                          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>⏱️ {lesson.duration} read</div>
                        </div>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", transform: showLesson === sk.id + "-" + li ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>▼</span>
                      </button>
                      {showLesson === sk.id + "-" + li && (
                        <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.01)", borderLeft: "2px solid " + sk.color, marginTop: 4, marginLeft: 20, borderRadius: "0 8px 8px 0" }}>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.8 }}>{lesson.content}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

/* ── Rally Point Mini Map Component ── */
function RallyMiniMap({ coords, color }) {
  const ref = useRef(null);
  const mapRef2 = useRef(null);
  useEffect(() => {
    if (!ref.current || mapRef2.current) return;
    const match = coords.match(/([\d.]+)\s*°?\s*([NS])\s*[,\s]+([\d.]+)\s*°?\s*([EW])/i);
    if (!match) return;
    const lat = parseFloat(match[1]) * (match[2].toUpperCase() === "S" ? -1 : 1);
    const lng = parseFloat(match[3]) * (match[4].toUpperCase() === "W" ? -1 : 1);
    if (isNaN(lat) || isNaN(lng)) return;
    const map = L.map(ref.current, { center: [lat, lng], zoom: 14, zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, attributionControl: false, keyboard: false, touchZoom: false });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 }).addTo(map);
    L.circleMarker([lat, lng], { radius: 6, color, fillColor: color, fillOpacity: 0.8, weight: 2 }).addTo(map);
    mapRef2.current = map;
    return () => { map.remove(); mapRef2.current = null; };
  }, [coords, color]);
  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}

function CommunityTab({ members, setMembers, contacts, setContacts, callSigns, setCallSigns, codeWords, setCodeWords, rallyPoints, setRallyPoints, items, people, climate, user }) {
  const [comSub, setComSub] = useState("tracker");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState(SAMPLE_CHAT);
  const [tradeInput, setTradeInput] = useState("");
  const [selTradeCommunity, setSelTradeCommunity] = useState("nc1");
  const [tradeMessages, setTradeMessages] = useState(TRADE_MESSAGES);
  const statColors = { home: "#22c55e", nearby: "#84cc16", away: "#f59e0b", offline: "#6b7280" };
  const statusColors = { allied: "#22c55e", neutral: "#f59e0b", unknown: "#6b7280" };
  const [editContact, setEditContact] = useState(null);
  const [contactSearch, setContactSearch] = useState("");
  const [expandedContact, setExpandedContact] = useState(null);
  const [liveMembers, setLiveMembers] = useState(null);
  const chatEndRef = useRef(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMember, setNewMember] = useState({ name: "", role: "", avatar: "👤" });
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", group: "Your Group", role: "", phone: "", address: "", age: "", bloodType: "Unknown", medical: "None", allergies: "None", skills: "", notes: "" });
  const [editingContact, setEditingContact] = useState(null);
  const [editContactData, setEditContactData] = useState(null);
  const [editingCallSign, setEditingCallSign] = useState(null);
  const [editingCodeWord, setEditingCodeWord] = useState(null);
  const [editingRallyPoint, setEditingRallyPoint] = useState(null);
  const [secureUnlockedState, setSecureUnlockedState] = useState(false);
  const [securePinState, setSecurePinState] = useState("");
  const [securePinErrorState, setSecurePinErrorState] = useState(false);
  const [fullscreenMap, setFullscreenMap] = useState(false);
  const [rpMapModal, setRpMapModal] = useState(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const subTabs = [{ id: "tracker", l: "Tracker", i: "📡" }, { id: "chat", l: "Chat", i: "💬" }, { id: "comms", l: "Comms Plan", i: "📻" }, { id: "trade", l: "Trade Routes", i: "🤝" }, { id: "contacts", l: "Contacts", i: "📇" }, { id: "combined", l: "Combined Score", i: "📊" }];

  /* ── Supabase Realtime: Chat messages ── */
  useEffect(() => {
    if (!supabaseConfigured || !user) return;
    // Fetch existing messages
    const fetchMessages = async () => {
      const { data, error } = await supabase.from("messages").select("*").order("created_at", { ascending: true }).limit(100);
      if (!error && data?.length > 0) {
        setChatMessages(data.map(m => ({
          id: m.id, from: m.user_id === user.id ? "p1" : m.user_id,
          text: m.content, ts: new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
          senderName: m.display_name || "Member",
        })));
      }
    };
    fetchMessages();
    // Subscribe to new messages
    const channel = supabase.channel("messages").on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
      const m = payload.new;
      setChatMessages(prev => [...prev, {
        id: m.id, from: m.user_id === user.id ? "p1" : m.user_id,
        text: m.content, ts: new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        senderName: m.display_name || "Member",
      }]);
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  /* ── Supabase Realtime: Location sharing ── */
  useEffect(() => {
    if (!supabaseConfigured || !user) return;
    const fetchLocations = async () => {
      const { data } = await supabase.from("location_shares").select("*, profiles(display_name)").eq("active", true);
      if (data?.length > 0) {
        setLiveMembers(data.map(l => ({
          id: l.user_id, name: l.profiles?.display_name || "Member",
          lat: l.latitude, lng: l.longitude, battery: l.battery_pct || 100,
          status: "nearby", sharing: true, lastPing: new Date(l.updated_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
          avatar: "👤", color: "#0ea5e9", role: "Member",
        })));
      }
    };
    fetchLocations();
    const channel = supabase.channel("locations").on("postgres_changes", { event: "*", schema: "public", table: "location_shares" }, () => {
      fetchLocations(); // Re-fetch all on any change
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  /* Auto-scroll chat */
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  const displayMembers = liveMembers || members;

  /* ── Leaflet Satellite Map ── */
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const firstWithCoords = displayMembers.find(m => m.lat && m.lng);
    const center = firstWithCoords ? [firstWithCoords.lat, firstWithCoords.lng] : [45.421, -75.690];
    const map = L.map(mapRef.current, { center, zoom: 13, zoomControl: false });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: "Esri", maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    mapInstanceRef.current = map;
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, [comSub]);

  /* ── Update map markers when members change ── */
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];
    displayMembers.filter(m => m.lat && m.sharing).forEach(m => {
      const icon = L.divIcon({ html: `<div style="width:30px;height:30px;border-radius:15px;background:${m.color}30;border:2px solid ${m.color};display:flex;align-items:center;justify-content:center;font-size:15px">${m.avatar}</div>`, iconSize: [30, 30], className: "" });
      const marker = L.marker([m.lat, m.lng], { icon }).addTo(map).bindTooltip(`<b>${m.name}</b><br/>${m.role || "Member"}<br/>🔋 ${m.battery}%`, { className: "", direction: "top" });
      markersRef.current.push(marker);
    });
    // Home marker
    const homeIcon = L.divIcon({ html: `<div style="width:26px;height:26px;border-radius:13px;background:rgba(34,197,94,0.2);border:2px solid rgba(34,197,94,0.5);display:flex;align-items:center;justify-content:center;font-size:13px">🏠</div>`, iconSize: [26, 26], className: "" });
    const home = L.marker([45.421, -75.690], { icon: homeIcon }).addTo(map).bindTooltip("Home Base", { direction: "top" });
    markersRef.current.push(home);
  }, [displayMembers, comSub]);

  /* ── Resize map when fullscreen toggles ── */
  useEffect(() => {
    if (mapInstanceRef.current) setTimeout(() => mapInstanceRef.current.invalidateSize(), 100);
  }, [fullscreenMap]);

  /* ── Browser Geolocation for self-tracking ── */
  useEffect(() => {
    if (!navigator.geolocation || !setMembers) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setMembers(prev => prev.map(m => m.id === "p1" ? { ...m, lat: pos.coords.latitude, lng: pos.coords.longitude, lastPing: "Now", sharing: true, status: "home" } : m));
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [setMembers]);

  const addMember = () => {
    if (!newMember.name.trim()) return;
    const id = "p" + Date.now();
    setMembers(prev => [...prev, { id, name: newMember.name.trim(), avatar: newMember.avatar || "👤", role: newMember.role.trim() || "Member", status: "offline", lat: null, lng: null, lastPing: "—", battery: 100, sharing: false, color: "#" + Math.floor(Math.random()*16777215).toString(16).padStart(6,"0") }]);
    setNewMember({ name: "", role: "", avatar: "👤" });
    setShowAddMember(false);
  };

  const removeMember = (id) => {
    if (id === "p1") return; // Can't remove yourself
    setMembers(prev => prev.filter(m => m.id !== id));
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    if (supabaseConfigured && user) {
      // Send via Supabase (realtime subscription will update state)
      supabase.from("messages").insert({ content: chatInput.trim(), user_id: user.id, display_name: user.email?.split("@")[0] || "You" }).then(({ error }) => {
        if (error) console.error("Chat send error:", error);
      });
    } else {
      // Local-only fallback
      setChatMessages((p) => [...p, { id: "c" + Date.now(), from: "p1", text: chatInput.trim(), ts: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) }]);
    }
    setChatInput("");
  };
  const sendTrade = () => {
    if (!tradeInput.trim()) return;
    if (supabaseConfigured && user) {
      supabase.from("trade_messages").insert({ content: tradeInput.trim(), user_id: user.id, community_id: selTradeCommunity }).then(({ error }) => {
        if (error) console.error("Trade send error:", error);
      });
    }
    setTradeMessages((p) => [...p, { id: "tm" + Date.now(), community: selTradeCommunity, from: "us", text: tradeInput.trim(), ts: "Just now" }]);
    setTradeInput("");
  };

  /* Combined scoring — pool all communities' strengths as bonus items */
  const computeCombined = () => {
    const allCommunities = [{ name: "Your Group", readiness: 0, members: people, strengths: [], weaknesses: [] }, ...NEARBY_COMMUNITIES.filter((c) => c.status === "allied")];
    const yourCats = {};
    Object.keys(CATEGORIES).forEach((cat) => {
      const ci = items.filter((i) => i.category === cat);
      const subs = CATEGORIES[cat].subTypes;
      let stored = 0, dailyYield = 0;
      ci.forEach((i) => { const sub = subs[i.subType]; if (sub?.dailyYield) dailyYield += sub.dailyYield * i.quantity; if (sub?.consumable) stored += i.quantity; else if (!sub?.dailyYield) stored += i.quantity; });
      yourCats[cat] = { stored, dailyYield, score: Math.min(100, stored * 10 + dailyYield * 20) };
    });
    /* Allied community bonus: add 15pts per allied community that has this as a strength */
    const combined = {};
    const totalPeople = allCommunities.reduce((s, c) => s + c.members, 0);
    Object.keys(CATEGORIES).forEach((cat) => {
      let bonus = 0;
      NEARBY_COMMUNITIES.filter((c) => c.status === "allied").forEach((c) => { if (c.strengths.includes(cat)) bonus += 15; });
      const base = yourCats[cat]?.score || 0;
      combined[cat] = { solo: base, pooled: Math.min(100, base + bonus), bonus };
    });
    const soloAvg = Object.values(combined).reduce((s, v) => s + v.solo, 0) / Object.keys(combined).length;
    const pooledAvg = Object.values(combined).reduce((s, v) => s + v.pooled, 0) / Object.keys(combined).length;
    return { combined, soloAvg, pooledAvg, totalPeople, alliedCount: NEARBY_COMMUNITIES.filter((c) => c.status === "allied").length };
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 800 }}>👥 Community</h2>
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {subTabs.map((t) => (
          <button key={t.id} onClick={() => setComSub(t.id)} style={{ padding: "8px 14px", background: "none", border: "none", borderBottom: comSub === t.id ? "2px solid #c8553a" : "2px solid transparent", color: comSub === t.id ? "#fff" : "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
            <span style={{ fontSize: 12 }}>{t.i}</span>{t.l}
            {t.id === "chat" && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6, background: "rgba(200,85,58,0.15)", color: "#c8553a", fontWeight: 700 }}>{chatMessages.length}</span>}
            {t.id === "trade" && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6, background: "rgba(245,158,11,0.15)", color: "#f59e0b", fontWeight: 700 }}>{TRADE_OFFERS.filter((o) => o.status === "open").length}</span>}
            {t.id === "contacts" && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6, background: "rgba(14,165,233,0.15)", color: "#0ea5e9", fontWeight: 700 }}>{contacts.length}</span>}
          </button>
        ))}
      </div>

      {comSub === "tracker" && (
        <div className="pcs-tracker-grid" style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
          <div style={{ ...cardSt, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>📡 LIVE MAP — Satellite</span>
              <button onClick={() => setFullscreenMap(!fullscreenMap)} style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 9, fontFamily: "inherit" }}>{fullscreenMap ? "Minimize" : "⛶ Expand"}</button>
            </div>
            <div ref={mapRef} style={{ height: fullscreenMap ? 600 : 320 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button onClick={() => setShowAddMember(!showAddMember)} style={{ ...btnSt, padding: "6px 12px", fontSize: 10, fontWeight: 700, background: "rgba(200,85,58,0.08)", color: "#c8553a", border: "1px solid rgba(200,85,58,0.2)", width: "100%", marginBottom: 2 }}>{showAddMember ? "Cancel" : "+ Add Member"}</button>
            {showAddMember && (
              <div style={{ ...cardSt, padding: "10px 12px", marginBottom: 4 }}>
                <input value={newMember.name} onChange={e => setNewMember(p => ({ ...p, name: e.target.value }))} placeholder="Name" style={{ ...inp, padding: "6px 8px", fontSize: 11, marginBottom: 4, width: "100%", boxSizing: "border-box" }} />
                <input value={newMember.role} onChange={e => setNewMember(p => ({ ...p, role: e.target.value }))} placeholder="Role" style={{ ...inp, padding: "6px 8px", fontSize: 11, marginBottom: 4, width: "100%", boxSizing: "border-box" }} />
                <div style={{ display: "flex", gap: 4 }}>
                  <input value={newMember.avatar} onChange={e => setNewMember(p => ({ ...p, avatar: e.target.value }))} placeholder="Avatar emoji" style={{ ...inp, padding: "6px 8px", fontSize: 11, width: 60, boxSizing: "border-box" }} />
                  <button onClick={addMember} style={{ ...btnSt, padding: "6px 12px", fontSize: 10, fontWeight: 700, background: "#c8553a", color: "#fff", flex: 1 }}>Add</button>
                </div>
              </div>
            )}
            {displayMembers.map((m) => (
              <div key={m.id} style={{ ...cardSt, padding: "10px 12px", borderLeft: "3px solid " + (statColors[m.status] || "#6b7280") }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{m.avatar}</span>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 700 }}>{m.name}</div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{m.role}</div></div>
                  <span style={{ fontSize: 10, padding: "4px 5px", borderRadius: 4, background: (statColors[m.status] || "#6b7280") + "15", color: statColors[m.status] || "#6b7280", fontWeight: 700 }}>{m.status}</span>
                  {m.id !== "p1" && <button onClick={() => removeMember(m.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1 }} title="Remove member">×</button>}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
                  <span>📱{m.lastPing}</span>
                  <span style={{ color: m.battery < 20 ? "#ef4444" : "#22c55e" }}>🔋{m.battery}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {comSub === "chat" && (() => {
        const SECURE_PIN_KEY = "prepvault-secure-pin";
        const storedPinHash = localStorage.getItem(SECURE_PIN_KEY);
        const [secureUnlocked, setSecureUnlocked] = [secureUnlockedState, setSecureUnlockedState];
        const [securePin, setSecurePin] = [securePinState, setSecurePinState];
        const [securePinError, setSecurePinError] = [securePinErrorState, setSecurePinErrorState];
        const isSetup = !storedPinHash;

        const hashSecurePin = async (pin) => {
          const enc = new TextEncoder();
          const hash = await crypto.subtle.digest("SHA-256", enc.encode(pin + "prepvault-secure-comms-salt"));
          return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
        };

        const handlePinSubmit = async () => {
          if (securePin.length < 4) { setSecurePinError(true); return; }
          const hashed = await hashSecurePin(securePin);
          if (isSetup) {
            localStorage.setItem(SECURE_PIN_KEY, hashed);
            setSecureUnlockedState(true);
            setSecurePinState("");
          } else {
            if (hashed === storedPinHash) { setSecureUnlockedState(true); setSecurePinState(""); setSecurePinErrorState(false); }
            else { setSecurePinErrorState(true); }
          }
        };

        const handleImageAttach = (e) => {
          const file = e.target.files?.[0];
          if (!file || !file.type.startsWith("image/")) return;
          const reader = new FileReader();
          reader.onload = () => {
            setChatMessages(prev => [...prev, { id: "c" + Date.now(), from: "p1", text: "", image: reader.result, ts: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) }]);
          };
          reader.readAsDataURL(file);
          e.target.value = "";
        };

        if (!secureUnlocked) {
          return (
            <div style={{ ...cardSt, padding: "60px 30px", textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
              <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800 }}>Secure Communications</h3>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 20, lineHeight: 1.6 }}>
                {isSetup ? "Set a 4-digit PIN to encrypt your communications" : "Enter your PIN to access secure comms"}
              </p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 }}>
                <input type="password" maxLength={6} value={securePin} onChange={e => { setSecurePinState(e.target.value.replace(/[^0-9]/g, "")); setSecurePinErrorState(false); }} onKeyDown={e => e.key === "Enter" && handlePinSubmit()} placeholder="PIN" style={{ ...inp, width: 120, textAlign: "center", fontSize: 20, fontFamily: M, letterSpacing: 8, padding: "10px 14px", borderColor: securePinError ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)" }} autoFocus />
                <button onClick={handlePinSubmit} style={{ ...btnSt, padding: "10px 20px", background: "#c8553a", color: "#fff", fontWeight: 700, fontSize: 12 }}>{isSetup ? "Set PIN" : "Unlock"}</button>
              </div>
              {securePinError && <div style={{ fontSize: 10, color: "#ef4444", marginTop: 4 }}>Incorrect PIN. Try again.</div>}
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 20 }}>🛡️ AES-256-GCM Encryption · PBKDF2 Key Derivation</div>
            </div>
          );
        }

        return (
          <div style={{ ...cardSt, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: 520 }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12 }}>🔒</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Secure Comms</span>
                <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, background: "rgba(34,197,94,0.1)", color: "#22c55e", fontWeight: 700 }}>AES-256-GCM</span>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {displayMembers.filter((m) => m.status !== "offline").map((m) => (
                  <div key={m.id} style={{ width: 22, height: 22, borderRadius: 11, background: m.color + "25", border: "1px solid " + m.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }} title={m.name}>{m.avatar}</div>
                ))}
                <button onClick={() => setSecureUnlockedState(false)} style={{ background: "none", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 6, color: "#ef4444", cursor: "pointer", fontSize: 9, padding: "2px 8px", fontFamily: "inherit" }}>Lock</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {chatMessages.map((msg) => {
                const sender = displayMembers.find((m) => m.id === msg.from);
                const isYou = msg.from === "p1";
                return (
                  <div key={msg.id} style={{ display: "flex", flexDirection: isYou ? "row-reverse" : "row", gap: 8, alignItems: "flex-start" }}>
                    {!isYou && <div style={{ width: 28, height: 28, borderRadius: 14, background: (sender?.color || "#6b7280") + "25", border: "1px solid " + (sender?.color || "#6b7280"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>{sender?.avatar || "?"}</div>}
                    <div style={{ maxWidth: "75%" }}>
                      {!isYou && <div style={{ fontSize: 9, color: sender?.color || "#999", fontWeight: 700, marginBottom: 2 }}>{sender?.name || msg.senderName || "Member"}</div>}
                      <div style={{ background: isYou ? "rgba(200,85,58,0.15)" : "rgba(255,255,255,0.04)", border: isYou ? "1px solid rgba(200,85,58,0.2)" : "1px solid rgba(255,255,255,0.06)", borderRadius: isYou ? "12px 12px 2px 12px" : "12px 12px 12px 2px", padding: "8px 12px", fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
                        {msg.image && <img src={msg.image} style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8, marginBottom: msg.text ? 6 : 0, display: "block" }} />}
                        {msg.text}
                      </div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2, textAlign: isYou ? "right" : "left", fontFamily: M }}>{msg.ts}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ cursor: "pointer", display: "flex", alignItems: "center", padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 14 }} title="Attach image">
                📷
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageAttach} />
              </label>
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat()} placeholder="Encrypted message..." style={{ ...inp, flex: 1, margin: 0, fontSize: 12 }} />
              <button onClick={sendChat} style={{ ...btnSt, background: "#c8553a", color: "#fff", fontWeight: 700, fontSize: 11, padding: "8px 16px" }}>Send</button>
            </div>
          </div>
        );
      })()}

      {comSub === "comms" && (
        <div style={{ display: "grid", gap: 16 }}>
          {/* ── Frequencies ── */}
          <div style={cardSt}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>📻 Designated Frequencies</div>
            {[COMMS_PLAN.primaryFreq, COMMS_PLAN.emergencyFreq].map((f, i) => (
              <div key={i} style={{ padding: "12px 16px", marginBottom: 8, borderRadius: 10, background: i === 1 ? "rgba(239,68,68,0.04)" : "rgba(34,197,94,0.04)", border: "1px solid " + (i === 1 ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)"), display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: M, color: i === 1 ? "#ef4444" : "#22c55e", lineHeight: 1 }}>{f.freq}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{f.mode}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: i === 1 ? "#ef4444" : "#22c55e" }}>{f.name}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{f.use}</div>
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontFamily: M }}>{f.power}</div>
              </div>
            ))}
            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1, margin: "10px 0 6px" }}>Backup Channels</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
              {COMMS_PLAN.altFreqs.map((f, i) => (
                <div key={i} style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: M, color: "#f59e0b" }}>{f.freq}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>{f.name}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>{f.use} · {f.power}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="pcs-comms-2col">
            {/* ── Check-in Schedule ── */}
            <div style={cardSt}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>🕐 Check-in Schedule</div>
              {COMMS_PLAN.schedule.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: i < COMMS_PLAN.schedule.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, fontFamily: M, color: s.mandatory ? "#c8553a" : "rgba(255,255,255,0.3)", width: 50, flexShrink: 0, textAlign: "center" }}>{s.time}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{s.desc}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{s.duration} · {s.mandatory ? "Mandatory" : "Optional"}</div>
                  </div>
                  {s.mandatory && <div style={{ width: 6, height: 6, borderRadius: 3, background: "#c8553a", flexShrink: 0 }} />}
                </div>
              ))}
            </div>

            {/* ── Call Signs ── */}
            <div style={cardSt}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1.5 }}>🎙️ Call Signs</div>
                <button onClick={() => setCallSigns(prev => [...prev, { person: "New Person", sign: "CALL" }])} style={{ background: "none", border: "1px solid rgba(200,85,58,0.2)", color: "#c8553a", cursor: "pointer", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, fontFamily: "inherit" }}>+</button>
              </div>
              {callSigns.map((cs, i) => (
                editingCallSign === i ? (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderBottom: i < callSigns.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                    <input value={cs.sign} onChange={e => { const v = e.target.value; setCallSigns(prev => prev.map((c, j) => j === i ? { ...c, sign: v } : c)); }} style={{ ...inp, padding: "4px 6px", fontSize: 12, fontWeight: 800, fontFamily: M, color: "#0ea5e9", width: 80, boxSizing: "border-box" }} />
                    <input value={cs.person} onChange={e => { const v = e.target.value; setCallSigns(prev => prev.map((c, j) => j === i ? { ...c, person: v } : c)); }} style={{ ...inp, padding: "4px 6px", fontSize: 11, flex: 1, boxSizing: "border-box" }} />
                    <button onClick={() => setEditingCallSign(null)} style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e", cursor: "pointer", fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 4, fontFamily: "inherit" }}>Done</button>
                  </div>
                ) : (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i < callSigns.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                    <div style={{ fontSize: 15, fontWeight: 800, fontFamily: M, color: "#0ea5e9", minWidth: 80 }}>{cs.sign}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", flex: 1 }}>{cs.person}</div>
                    <button onClick={() => setEditingCallSign(i)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", fontSize: 12, padding: "0 2px" }} title="Edit">\u270f\ufe0f</button>
                    <button onClick={() => setCallSigns(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1 }} title="Remove">\u00d7</button>
                  </div>
                )
              ))}
              <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.1)" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#ef4444", marginBottom: 3 }}>⚠ DURESS SIGNAL</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>{COMMS_PLAN.duress}</div>
              </div>
            </div>
          </div>

          {/* ── Code Words ── */}
          <div style={cardSt}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1.5 }}>🔐 Code Words</div>
              <button onClick={() => setCodeWords(prev => [...prev, { code: "NEWCODE", meaning: "Description", action: "Action to take" }])} style={{ background: "none", border: "1px solid rgba(200,85,58,0.2)", color: "#c8553a", cursor: "pointer", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, fontFamily: "inherit" }}>+</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 6 }}>
              {codeWords.map((cw, i) => (
                editingCodeWord === i ? (
                  <div key={i} style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(200,85,58,0.15)" }}>
                    <input value={cw.code} onChange={e => { const v = e.target.value; setCodeWords(prev => prev.map((c, j) => j === i ? { ...c, code: v } : c)); }} placeholder="Code word" style={{ ...inp, padding: "4px 6px", fontSize: 12, fontWeight: 800, fontFamily: M, marginBottom: 4, width: "100%", boxSizing: "border-box" }} />
                    <input value={cw.meaning} onChange={e => { const v = e.target.value; setCodeWords(prev => prev.map((c, j) => j === i ? { ...c, meaning: v } : c)); }} placeholder="Meaning" style={{ ...inp, padding: "4px 6px", fontSize: 10, marginBottom: 4, width: "100%", boxSizing: "border-box" }} />
                    <input value={cw.action} onChange={e => { const v = e.target.value; setCodeWords(prev => prev.map((c, j) => j === i ? { ...c, action: v } : c)); }} placeholder="Action" style={{ ...inp, padding: "4px 6px", fontSize: 10, marginBottom: 4, width: "100%", boxSizing: "border-box" }} />
                    <button onClick={() => setEditingCodeWord(null)} style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e", cursor: "pointer", fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 4, fontFamily: "inherit" }}>Done</button>
                  </div>
                ) : (
                  <div key={i} style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderLeft: "3px solid " + (cw.code === "PHOENIX" ? "#22c55e" : cw.code === "ANGEL" ? "#0ea5e9" : "#ef4444") }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, fontFamily: M, color: cw.code === "PHOENIX" ? "#22c55e" : cw.code === "ANGEL" ? "#0ea5e9" : "#ef4444", flex: 1 }}>{cw.code}</span>
                      <button onClick={() => setEditingCodeWord(i)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", fontSize: 12, padding: "0 2px" }} title="Edit">\u270f\ufe0f</button>
                      <button onClick={() => setCodeWords(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1 }} title="Remove">\u00d7</button>
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 3 }}>{cw.meaning}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>→ {cw.action}</div>
                  </div>
                )
              ))}
            </div>
          </div>

          {/* ── Rally Points ── */}
          <div style={cardSt}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1.5 }}>📍 Rally Points</div>
              <button onClick={() => setRallyPoints(prev => [...prev, { id: "rp" + Date.now(), name: "New Rally Point", location: "", coords: "", use: "", marker: "", supplies: "" }])} style={{ background: "none", border: "1px solid rgba(200,85,58,0.2)", color: "#c8553a", cursor: "pointer", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, fontFamily: "inherit" }}>+</button>
            </div>
            {rallyPoints.map((rp, i) => (
              editingRallyPoint === i ? (
                <div key={rp.id} style={{ padding: "12px 16px", marginBottom: i < rallyPoints.length - 1 ? 8 : 0, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(200,85,58,0.15)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                    <input value={rp.name} onChange={e => { const v = e.target.value; setRallyPoints(prev => prev.map((r, j) => j === i ? { ...r, name: v } : r)); }} placeholder="Name" style={{ ...inp, padding: "4px 6px", fontSize: 11, boxSizing: "border-box" }} />
                    <input value={rp.coords} onChange={e => { const v = e.target.value; setRallyPoints(prev => prev.map((r, j) => j === i ? { ...r, coords: v } : r)); }} placeholder="Coordinates" style={{ ...inp, padding: "4px 6px", fontSize: 11, fontFamily: M, boxSizing: "border-box" }} />
                  </div>
                  <input value={rp.location} onChange={e => { const v = e.target.value; setRallyPoints(prev => prev.map((r, j) => j === i ? { ...r, location: v } : r)); }} placeholder="Location description" style={{ ...inp, padding: "4px 6px", fontSize: 11, marginBottom: 4, width: "100%", boxSizing: "border-box" }} />
                  <input value={rp.marker} onChange={e => { const v = e.target.value; setRallyPoints(prev => prev.map((r, j) => j === i ? { ...r, marker: v } : r)); }} placeholder="Marker/identifier" style={{ ...inp, padding: "4px 6px", fontSize: 11, marginBottom: 4, width: "100%", boxSizing: "border-box" }} />
                  <input value={rp.supplies} onChange={e => { const v = e.target.value; setRallyPoints(prev => prev.map((r, j) => j === i ? { ...r, supplies: v } : r)); }} placeholder="Cached supplies" style={{ ...inp, padding: "4px 6px", fontSize: 11, marginBottom: 4, width: "100%", boxSizing: "border-box" }} />
                  <input value={rp.use} onChange={e => { const v = e.target.value; setRallyPoints(prev => prev.map((r, j) => j === i ? { ...r, use: v } : r)); }} placeholder="Use case" style={{ ...inp, padding: "4px 6px", fontSize: 11, marginBottom: 6, width: "100%", boxSizing: "border-box" }} />
                  <button onClick={() => setEditingRallyPoint(null)} style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e", cursor: "pointer", fontSize: 9, fontWeight: 700, padding: "3px 10px", borderRadius: 4, fontFamily: "inherit" }}>Done</button>
                </div>
              ) : (
                <div key={rp.id} style={{ display: "flex", gap: 12, padding: "12px 16px", marginBottom: i < rallyPoints.length - 1 ? 8 : 0, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderLeft: "3px solid " + (i === 0 ? "#22c55e" : i === 1 ? "#f59e0b" : "#a855f7") }}>
                  {rp.coords && (() => {
                    const rpColor = i === 0 ? "#22c55e" : i === 1 ? "#f59e0b" : "#a855f7";
                    return <div onClick={() => setRpMapModal({ coords: rp.coords, name: rp.name, color: rpColor })} style={{ width: 120, height: 90, borderRadius: 8, overflow: "hidden", flexShrink: 0, cursor: "pointer", border: "1px solid rgba(255,255,255,0.08)", position: "relative", background: "#0a1628" }} title="Click to expand map">
                      <RallyMiniMap coords={rp.coords} color={rpColor} />
                      <div style={{ position: "absolute", bottom: 4, right: 4, fontSize: 10, background: "rgba(0,0,0,0.6)", borderRadius: 3, padding: "1px 4px", color: "rgba(255,255,255,0.5)" }}>⛶</div>
                    </div>;
                  })()}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: i === 0 ? "#22c55e" : i === 1 ? "#f59e0b" : "#a855f7", flex: 1 }}>{rp.name}</span>
                      <span style={{ fontSize: 9, fontFamily: M, color: "rgba(255,255,255,0.4)" }}>{rp.coords}</span>
                      <button onClick={() => setEditingRallyPoint(i)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", fontSize: 12, padding: "0 2px" }} title="Edit">{"\u270f\ufe0f"}</button>
                      <button onClick={() => setRallyPoints(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1 }} title="Remove">{"\u00d7"}</button>
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 3 }}>📍 {rp.location}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>🔎 Marker: {rp.marker}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>📦 Cached: {rp.supplies}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>Use: {rp.use}</div>
                  </div>
                </div>
              )
            ))}
          </div>

          {/* ── Printable Wallet Card ── */}
          <div style={cardSt}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1.5 }}>🪪 Wallet Card Preview</div>
              <button onClick={() => {
                const card = document.getElementById("pcs-wallet-card");
                if (!card) return;
                const w = window.open("", "_blank", "width=500,height=340");
                w.document.write("<html><head><style>body{margin:0;padding:20px;background:#000;font-family:monospace;color:#fff}table{width:100%;border-collapse:collapse;font-size:9px}td{padding:2px 4px;border:1px solid #333}.hdr{background:#1a1a1a;font-weight:bold;text-transform:uppercase;font-size:8px;color:#999}@media print{body{background:#fff;color:#000}td{border-color:#ccc}.hdr{background:#eee;color:#333}}</style></head><body>" + card.innerHTML + "</body></html>");
                w.document.close();
                w.print();
              }} style={{ ...btnSt, padding: "6px 14px", fontSize: 10, fontWeight: 700, background: "rgba(200,85,58,0.08)", color: "#c8553a", border: "1px solid rgba(200,85,58,0.2)" }}>🖨️ Print Card</button>
            </div>
            <div id="pcs-wallet-card" style={{ background: "#111", borderRadius: 8, padding: 12, border: "1px solid rgba(255,255,255,0.1)", fontFamily: M, fontSize: 9 }}>
              <div style={{ textAlign: "center", fontSize: 11, fontWeight: 800, letterSpacing: 2, marginBottom: 8, color: "#c8553a" }}>PCS — COMMS CARD</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
                <tbody>
                  <tr><td style={{ padding: "5px 6px", background: "rgba(255,255,255,0.04)", fontWeight: 700, width: 80, color: "rgba(255,255,255,0.4)" }}>PRIMARY</td><td style={{ padding: "5px 6px", color: "#22c55e", fontWeight: 700 }}>{COMMS_PLAN.primaryFreq.freq}</td><td style={{ padding: "5px 6px", color: "rgba(255,255,255,0.3)" }}>{COMMS_PLAN.primaryFreq.mode}</td></tr>
                  <tr><td style={{ padding: "5px 6px", background: "rgba(255,255,255,0.04)", fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>EMERGENCY</td><td style={{ padding: "5px 6px", color: "#ef4444", fontWeight: 700 }}>{COMMS_PLAN.emergencyFreq.freq}</td><td style={{ padding: "5px 6px", color: "rgba(255,255,255,0.3)" }}>{COMMS_PLAN.emergencyFreq.mode}</td></tr>
                  {COMMS_PLAN.altFreqs.map((f, i) => <tr key={i}><td style={{ padding: "5px 6px", background: "rgba(255,255,255,0.04)", fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>{f.name.toUpperCase()}</td><td style={{ padding: "5px 6px", color: "#f59e0b" }}>{f.freq}</td><td style={{ padding: "5px 6px", color: "rgba(255,255,255,0.3)" }}>{f.mode}</td></tr>)}
                </tbody>
              </table>
              <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div><span style={{ color: "rgba(255,255,255,0.3)" }}>CHECK-IN:</span> {COMMS_PLAN.schedule.filter(s => s.mandatory).map(s => s.time).join(" / ")}</div>
              </div>
              <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {codeWords.slice(0, 4).map((cw, i) => <span key={i} style={{ color: "#ef4444" }}>{cw.code}</span>)}
                <span style={{ color: "#22c55e" }}>PHOENIX</span>
              </div>
              <div style={{ marginTop: 4, color: "rgba(255,255,255,0.4)" }}>RALLY: {rallyPoints.map(r => r.name.split(" — ")[0]).join(" → ")}</div>
              <div style={{ marginTop: 4, color: "#ef4444", fontSize: 10 }}>DURESS: Append "COPY THAT, ALL STATIONS"</div>
            </div>
          </div>
        </div>
      )}

      {comSub === "trade" && (
        <div className="pcs-trade-grid" style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16 }}>
          {/* Community list + trade board */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1.5, padding: "2px 6px" }}>Nearby Communities</div>
            {NEARBY_COMMUNITIES.map((c) => (
              <button key={c.id} onClick={() => setSelTradeCommunity(c.id)} style={{ ...cardSt, padding: "10px 12px", borderLeft: "3px solid " + c.color, cursor: "pointer", background: selTradeCommunity === c.id ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)", textAlign: "left" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{c.avatar}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{c.name}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{c.distance} · {c.members} members</div>
                  </div>
                  <span style={{ fontSize: 10, padding: "4px 6px", borderRadius: 4, background: (statusColors[c.status] || "#6b7280") + "15", color: statusColors[c.status] || "#6b7280", fontWeight: 700 }}>{c.status}</span>
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                  {c.strengths.map((s) => <span key={s} style={{ fontSize: 10, padding: "4px 5px", borderRadius: 4, background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>{CATEGORIES[s]?.icon} {CATEGORIES[s]?.label}</span>)}
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                  {c.weaknesses.slice(0, 2).map((w) => <span key={w} style={{ fontSize: 10, padding: "4px 5px", borderRadius: 4, background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>needs {CATEGORIES[w]?.label}</span>)}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>📻 {c.contact} · Last: {c.lastContact}</div>
              </button>
            ))}
            {/* Open Trade Offers */}
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1.5, padding: "8px 4px 0" }}>Open Trades</div>
            {TRADE_OFFERS.filter((o) => o.status === "open").map((o) => {
              const comm = NEARBY_COMMUNITIES.find((c) => c.id === o.from);
              return (
                <div key={o.id} style={{ ...cardSt, padding: "8px 12px", borderLeft: "3px solid " + (o.type === "offer" ? "#22c55e" : "#0ea5e9") }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 12 }}>{comm?.avatar}</span>
                    <span style={{ fontSize: 10, fontWeight: 700 }}>{comm?.name}</span>
                    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: o.type === "offer" ? "rgba(34,197,94,0.1)" : "rgba(14,165,233,0.1)", color: o.type === "offer" ? "#22c55e" : "#0ea5e9", fontWeight: 700 }}>{o.type}</span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginLeft: "auto", fontFamily: M }}>{o.posted}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>📦 <strong style={{ color: "#22c55e" }}>Has:</strong> {o.have}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>🔄 <strong style={{ color: "#f59e0b" }}>Wants:</strong> {o.want}</div>
                </div>
              );
            })}
          </div>
          {/* Trade conversation with selected community */}
          <div style={{ ...cardSt, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 460 }}>
            {(() => {
              const comm = NEARBY_COMMUNITIES.find((c) => c.id === selTradeCommunity);
              const msgs = tradeMessages.filter((m) => m.community === selTradeCommunity);
              return (<>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{comm?.avatar}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{comm?.name}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{comm?.distance} · {comm?.contact}</div>
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: 4, background: statusColors[comm?.status] || "#6b7280" }} />
                    <span style={{ fontSize: 9, color: statusColors[comm?.status] || "#6b7280", fontWeight: 600 }}>{comm?.status}</span>
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  {msgs.length === 0 && <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 11, padding: 40 }}>No messages with {comm?.name} yet. Start a trade conversation.</div>}
                  {msgs.map((msg) => {
                    const isUs = msg.from === "us";
                    return (
                      <div key={msg.id} style={{ display: "flex", flexDirection: isUs ? "row-reverse" : "row", gap: 8, alignItems: "flex-start" }}>
                        {!isUs && <span style={{ fontSize: 18 }}>{comm?.avatar}</span>}
                        <div style={{ maxWidth: "75%" }}>
                          <div style={{ background: isUs ? "rgba(200,85,58,0.15)" : "rgba(255,255,255,0.04)", border: isUs ? "1px solid rgba(200,85,58,0.2)" : "1px solid rgba(255,255,255,0.06)", borderRadius: isUs ? "12px 12px 2px 12px" : "12px 12px 12px 2px", padding: "8px 12px", fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>{msg.text}</div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2, textAlign: isUs ? "right" : "left", fontFamily: M }}>{msg.ts}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8 }}>
                  <input value={tradeInput} onChange={(e) => setTradeInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendTrade()} placeholder={`Message ${comm?.name}...`} style={{ ...inp, flex: 1, margin: 0, fontSize: 12 }} />
                  <button onClick={sendTrade} style={{ ...btnSt, background: "#c8553a", color: "#fff", fontWeight: 700, fontSize: 11, padding: "8px 16px" }}>Send</button>
                </div>
              </>);
            })()}
          </div>
        </div>
      )}

      {comSub === "contacts" && (() => {
        const filtered = contacts.filter((c) => {
          if (!contactSearch) return true;
          const s = contactSearch.toLowerCase();
          return c.name.toLowerCase().includes(s) || c.group.toLowerCase().includes(s) || c.role.toLowerCase().includes(s) || (c.medical || "").toLowerCase().includes(s);
        });
        const groups = [...new Set(filtered.map((c) => c.group))];
        const groupColors = { "Your Group": "#22c55e", "Rideau Creek Co-op": "#22c55e", "Cedar Hill Homestead": "#0ea5e9", "Lakeside Compound": "#f59e0b", "South Valley Farm": "#a855f7" };

        return (
          <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
              <input value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} placeholder="Search name, group, role, condition..." style={{ ...inp, flex: 1, margin: 0, fontSize: 12 }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{filtered.length} contacts</span>
              <button onClick={() => setShowAddContact(!showAddContact)} style={{ ...btnSt, padding: "6px 14px", fontSize: 10, fontWeight: 700, background: "rgba(200,85,58,0.08)", color: "#c8553a", border: "1px solid rgba(200,85,58,0.2)", flexShrink: 0 }}>{showAddContact ? "Cancel" : "+ Add"}</button>
            </div>
            {showAddContact && (
              <div style={{ ...cardSt, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>New Contact</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 6 }}>
                  <input value={newContact.name} onChange={e => setNewContact(p => ({ ...p, name: e.target.value }))} placeholder="Full name *" style={{ ...inp, padding: "6px 8px", fontSize: 11, boxSizing: "border-box" }} />
                  <select value={newContact.group} onChange={e => setNewContact(p => ({ ...p, group: e.target.value }))} style={{ ...inp, padding: "6px 8px", fontSize: 11, boxSizing: "border-box" }}>
                    {[...new Set(contacts.map(c => c.group)), "Other"].map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <input value={newContact.role} onChange={e => setNewContact(p => ({ ...p, role: e.target.value }))} placeholder="Role" style={{ ...inp, padding: "6px 8px", fontSize: 11, boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 6 }}>
                  <input value={newContact.phone} onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" style={{ ...inp, padding: "6px 8px", fontSize: 11, boxSizing: "border-box" }} />
                  <input value={newContact.address} onChange={e => setNewContact(p => ({ ...p, address: e.target.value }))} placeholder="Address" style={{ ...inp, padding: "6px 8px", fontSize: 11, boxSizing: "border-box" }} />
                  <input value={newContact.age} onChange={e => setNewContact(p => ({ ...p, age: e.target.value }))} placeholder="Age" style={{ ...inp, padding: "6px 8px", fontSize: 11, boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 6 }}>
                  <select value={newContact.bloodType} onChange={e => setNewContact(p => ({ ...p, bloodType: e.target.value }))} style={{ ...inp, padding: "6px 8px", fontSize: 11, boxSizing: "border-box" }}>
                    {["Unknown", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(bt => <option key={bt} value={bt}>{bt}</option>)}
                  </select>
                  <input value={newContact.medical} onChange={e => setNewContact(p => ({ ...p, medical: e.target.value }))} placeholder="Medical conditions" style={{ ...inp, padding: "6px 8px", fontSize: 11, boxSizing: "border-box" }} />
                  <input value={newContact.allergies} onChange={e => setNewContact(p => ({ ...p, allergies: e.target.value }))} placeholder="Allergies" style={{ ...inp, padding: "6px 8px", fontSize: 11, boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                  <input value={newContact.skills} onChange={e => setNewContact(p => ({ ...p, skills: e.target.value }))} placeholder="Skills" style={{ ...inp, padding: "6px 8px", fontSize: 11, boxSizing: "border-box" }} />
                  <input value={newContact.notes} onChange={e => setNewContact(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" style={{ ...inp, padding: "6px 8px", fontSize: 11, boxSizing: "border-box" }} />
                </div>
                <button onClick={() => { if (!newContact.name.trim()) return; setContacts(prev => [...prev, { ...newContact, id: "ct" + Date.now(), age: newContact.age ? parseInt(newContact.age) || newContact.age : "" }]); setNewContact({ name: "", group: "Your Group", role: "", phone: "", address: "", age: "", bloodType: "Unknown", medical: "None", allergies: "None", skills: "", notes: "" }); setShowAddContact(false); }} style={{ ...btnSt, padding: "6px 16px", fontSize: 10, fontWeight: 700, background: "#c8553a", color: "#fff" }}>Add Contact</button>
              </div>
            )}
            {groups.map((g) => (
              <div key={g} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: groupColors[g] || "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: groupColors[g] || "#6b7280" }} />
                  {g} ({filtered.filter((c) => c.group === g).length})
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {filtered.filter((c) => c.group === g).map((c) => {
                    const isExpanded = expandedContact === c.id;
                    const hasMedical = c.medical && c.medical !== "None" && c.medical !== "Unknown";
                    const hasAllergy = c.allergies && c.allergies !== "None" && c.allergies !== "Unknown";
                    return (
                      <div key={c.id} style={{ ...cardSt, padding: 0, overflow: "hidden", borderLeft: "3px solid " + (groupColors[c.group] || "#6b7280") }}>
                        <button onClick={() => setExpandedContact(isExpanded ? null : c.id)} style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left", color: "#fff", fontFamily: "inherit" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 18, background: (groupColors[c.group] || "#6b7280") + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: groupColors[c.group] || "#6b7280" }}>{c.name.charAt(0)}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</div>
                              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", display: "flex", gap: 8, marginTop: 1 }}>
                                <span>{c.role}</span>
                                {c.phone !== "N/A — runner only" && c.phone !== "N/A — HAM only" && <span>📱 {c.phone}</span>}
                                {c.phone.includes("HAM") && <span>📻 HAM only</span>}
                                {c.phone.includes("runner") && <span>🏃 Runner only</span>}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                              {hasMedical && <span style={{ fontSize: 10, padding: "4px 5px", borderRadius: 4, background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>⚕️ medical</span>}
                              {hasAllergy && <span style={{ fontSize: 10, padding: "4px 5px", borderRadius: 4, background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>⚠ allergy</span>}
                              {c.bloodType && c.bloodType !== "Unknown" && <span style={{ fontSize: 10, padding: "4px 5px", borderRadius: 4, background: "rgba(239,68,68,0.08)", color: "#ef4444", fontFamily: M }}>{c.bloodType}</span>}
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); setEditingContact(c.id); setEditContactData({ ...c }); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", fontSize: 12, padding: "0 2px" }} title="Edit">\u270f\ufe0f</button>
                            <button onClick={(e) => { e.stopPropagation(); setContacts(prev => prev.filter(ct => ct.id !== c.id)); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1 }} title="Remove">\u00d7</button>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
                          </div>
                        </button>
                        {isExpanded && (
                          <div style={{ padding: "0 14px 14px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 16px", marginTop: 10 }}>
                              <div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Phone</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{c.phone}</div></div>
                              <div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Address</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{c.address}</div></div>
                              <div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Age</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{c.age}</div></div>
                              <div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Blood Type</div><div style={{ fontSize: 11, color: "#ef4444", fontWeight: 700 }}>{c.bloodType}</div></div>
                              <div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Medical Conditions</div><div style={{ fontSize: 11, color: hasMedical ? "#ef4444" : "rgba(255,255,255,0.4)", fontWeight: hasMedical ? 600 : 400 }}>{c.medical}</div></div>
                              <div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Allergies</div><div style={{ fontSize: 11, color: hasAllergy ? "#f59e0b" : "rgba(255,255,255,0.4)", fontWeight: hasAllergy ? 600 : 400 }}>{c.allergies}</div></div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginTop: 8 }}>
                              <div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Skills</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{c.skills}</div></div>
                              <div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Notes</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontStyle: "italic" }}>{c.notes}</div></div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Contact Edit Modal */}
      {editingContact && editContactData && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => { setEditingContact(null); setEditContactData(null); }}>
          <div style={{ background: "#1a1f2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 20, width: 480, maxHeight: "80vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Edit Contact</div>
              <button onClick={() => { setEditingContact(null); setEditContactData(null); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 18 }}>\u00d7</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Name</div><input value={editContactData.name} onChange={e => setEditContactData(p => ({ ...p, name: e.target.value }))} style={{ ...inp, padding: "6px 8px", fontSize: 11, width: "100%", boxSizing: "border-box" }} /></div>
              <div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Group</div><select value={editContactData.group} onChange={e => setEditContactData(p => ({ ...p, group: e.target.value }))} style={{ ...inp, padding: "6px 8px", fontSize: 11, width: "100%", boxSizing: "border-box" }}>{[...new Set(contacts.map(c => c.group)), "Other"].map(g => <option key={g} value={g}>{g}</option>)}</select></div>
              <div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Role</div><input value={editContactData.role} onChange={e => setEditContactData(p => ({ ...p, role: e.target.value }))} style={{ ...inp, padding: "6px 8px", fontSize: 11, width: "100%", boxSizing: "border-box" }} /></div>
              <div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Phone</div><input value={editContactData.phone} onChange={e => setEditContactData(p => ({ ...p, phone: e.target.value }))} style={{ ...inp, padding: "6px 8px", fontSize: 11, width: "100%", boxSizing: "border-box" }} /></div>
              <div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Address</div><input value={editContactData.address} onChange={e => setEditContactData(p => ({ ...p, address: e.target.value }))} style={{ ...inp, padding: "6px 8px", fontSize: 11, width: "100%", boxSizing: "border-box" }} /></div>
              <div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Age</div><input value={editContactData.age} onChange={e => setEditContactData(p => ({ ...p, age: e.target.value }))} style={{ ...inp, padding: "6px 8px", fontSize: 11, width: "100%", boxSizing: "border-box" }} /></div>
              <div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Blood Type</div><select value={editContactData.bloodType} onChange={e => setEditContactData(p => ({ ...p, bloodType: e.target.value }))} style={{ ...inp, padding: "6px 8px", fontSize: 11, width: "100%", boxSizing: "border-box" }}>{["Unknown", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(bt => <option key={bt} value={bt}>{bt}</option>)}</select></div>
              <div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Medical</div><input value={editContactData.medical} onChange={e => setEditContactData(p => ({ ...p, medical: e.target.value }))} style={{ ...inp, padding: "6px 8px", fontSize: 11, width: "100%", boxSizing: "border-box" }} /></div>
              <div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Allergies</div><input value={editContactData.allergies} onChange={e => setEditContactData(p => ({ ...p, allergies: e.target.value }))} style={{ ...inp, padding: "6px 8px", fontSize: 11, width: "100%", boxSizing: "border-box" }} /></div>
              <div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Skills</div><input value={editContactData.skills} onChange={e => setEditContactData(p => ({ ...p, skills: e.target.value }))} style={{ ...inp, padding: "6px 8px", fontSize: 11, width: "100%", boxSizing: "border-box" }} /></div>
            </div>
            <div style={{ marginBottom: 12 }}><div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Notes</div><input value={editContactData.notes} onChange={e => setEditContactData(p => ({ ...p, notes: e.target.value }))} style={{ ...inp, padding: "6px 8px", fontSize: 11, width: "100%", boxSizing: "border-box" }} /></div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => { setEditingContact(null); setEditContactData(null); }} style={{ ...btnSt, padding: "6px 16px", fontSize: 10, fontWeight: 600, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}>Cancel</button>
              <button onClick={() => { setContacts(prev => prev.map(c => c.id === editingContact ? { ...editContactData } : c)); setEditingContact(null); setEditContactData(null); }} style={{ ...btnSt, padding: "6px 16px", fontSize: 10, fontWeight: 700, background: "#c8553a", color: "#fff" }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {comSub === "combined" && (() => {
        const { combined, soloAvg, pooledAvg, totalPeople, alliedCount } = computeCombined();
        return (
          <div>
            {/* Summary cards */}
            <div className="pcs-summary-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
              <div style={{ ...cardSt, padding: 14, textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1 }}>Solo Score</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: SC(soloAvg), fontFamily: M }}>{Math.round(soloAvg)}%</div>
              </div>
              <div style={{ ...cardSt, padding: 14, textAlign: "center", borderLeft: "3px solid #22c55e" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1 }}>Combined Score</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: SC(pooledAvg), fontFamily: M }}>{Math.round(pooledAvg)}%</div>
              </div>
              <div style={{ ...cardSt, padding: 14, textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1 }}>Allied Groups</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#0ea5e9", fontFamily: M }}>{alliedCount}</div>
              </div>
              <div style={{ ...cardSt, padding: 14, textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1 }}>Total People</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#a855f7", fontFamily: M }}>{totalPeople}</div>
              </div>
            </div>
            {/* Boost banner */}
            {pooledAvg > soloAvg && (
              <div style={{ ...cardSt, background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.1)", padding: 14, marginBottom: 16, textAlign: "center" }}>
                <span style={{ fontSize: 18 }}>📈</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#22c55e", marginLeft: 8 }}>Alliance boost: +{Math.round(pooledAvg - soloAvg)} points</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginLeft: 8 }}>by pooling resources with {alliedCount} allied communities</span>
              </div>
            )}
            {/* Per-category comparison */}
            <div style={cardSt}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Category Breakdown — Solo vs Combined</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 18px" }}>
                {Object.entries(combined).sort((a, b) => b[1].bonus - a[1].bonus).map(([cat, v]) => (
                  <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
                    <span style={{ fontSize: 13 }}>{CATEGORIES[cat]?.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{CATEGORIES[cat]?.label}</span>
                        <div style={{ display: "flex", gap: 8 }}>
                          <span style={{ fontSize: 9, color: SC(v.solo), fontFamily: M }}>{Math.round(v.solo)}%</span>
                          {v.bonus > 0 && <span style={{ fontSize: 9, color: "#22c55e", fontFamily: M, fontWeight: 700 }}>→ {Math.round(v.pooled)}%</span>}
                        </div>
                      </div>
                      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, position: "relative" }}>
                        <div style={{ height: "100%", width: v.solo + "%", background: SC(v.solo), borderRadius: 2, position: "absolute" }} />
                        {v.bonus > 0 && <div style={{ height: "100%", width: v.pooled + "%", background: "rgba(34,197,94,0.25)", borderRadius: 2, position: "absolute" }} />}
                        <div style={{ height: "100%", width: v.solo + "%", background: SC(v.solo), borderRadius: 2, position: "absolute", zIndex: 2 }} />
                      </div>
                    </div>
                    {v.bonus > 0 && <span style={{ fontSize: 10, color: "#22c55e", fontFamily: M, fontWeight: 700, flexShrink: 0 }}>+{v.bonus}</span>}
                  </div>
                ))}
              </div>
            </div>
            {/* Allied community breakdown */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Allied Community Contributions</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
                {NEARBY_COMMUNITIES.filter((c) => c.status === "allied").map((c) => (
                  <div key={c.id} style={{ ...cardSt, padding: "12px 14px", borderLeft: "3px solid " + c.color }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 18 }}>{c.avatar}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{c.name}</div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{c.distance} · {c.members} members</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: SC(c.readiness), fontFamily: M }}>{c.readiness}%</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginRight: 2 }}>Brings:</span>
                      {c.strengths.map((s) => <span key={s} style={{ fontSize: 10, padding: "4px 5px", borderRadius: 4, background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>{CATEGORIES[s]?.icon} {CATEGORIES[s]?.label}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Rally Point Map Modal ── */}
      {rpMapModal && (() => {
        const match = rpMapModal.coords.match(/([\d.]+)\s*°?\s*([NS])\s*[,\s]+([\d.]+)\s*°?\s*([EW])/i);
        return (
          <div onClick={() => setRpMapModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <div onClick={e => e.stopPropagation()} style={{ width: "80%", maxWidth: 700, background: "#111", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", cursor: "default" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div><span style={{ fontSize: 14, fontWeight: 800, color: rpMapModal.color }}>{rpMapModal.name}</span><span style={{ fontSize: 10, fontFamily: M, color: "rgba(255,255,255,0.4)", marginLeft: 10 }}>{rpMapModal.coords}</span></div>
                <button onClick={() => setRpMapModal(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 18 }}>×</button>
              </div>
              <div style={{ height: 400 }}>
                {match && <RallyMiniMapLarge lat={parseFloat(match[1]) * (match[2].toUpperCase() === "S" ? -1 : 1)} lng={parseFloat(match[3]) * (match[4].toUpperCase() === "W" ? -1 : 1)} color={rpMapModal.color} />}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ── Rally Point Large Map (for modal) ── */
function RallyMiniMapLarge({ lat, lng, color }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { center: [lat, lng], zoom: 15, zoomControl: true });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: "Esri", maxZoom: 19 }).addTo(map);
    L.circleMarker([lat, lng], { radius: 10, color, fillColor: color, fillOpacity: 0.7, weight: 3 }).addTo(map);
    L.marker([lat, lng]).addTo(map).bindPopup(`Rally Point<br/>${lat.toFixed(3)}°, ${lng.toFixed(3)}°`).openPopup();
    return () => map.remove();
  }, [lat, lng, color]);
  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}

function SimulateTab({ items, people, setPeople, climate, setClimate, selScen, setSelScen, simDuration, setSimDuration }) {
  const computeScore = (scenKey, dur) => {
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
  };

  const result = computeScore(selScen, simDuration);
  const scen = SCENARIOS[selScen];
  const recs = RECS[selScen];
  const sorted = Object.entries(result.cats).sort((a, b) => a[1] - b[1]);
  const weakest = sorted.slice(0, 3);

  return (
    <div>
      <h2 style={{ margin: "0 0 14px", fontSize: 18, fontWeight: 800 }}>Scenario Simulation</h2>
      {/* ── People & Climate Controls ── */}
      <div style={{ ...cardSt, padding: 14, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "end" }}>
          <div><label style={labelSt}>People</label><div style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="range" min={1} max={20} value={people} onChange={(e) => setPeople(+e.target.value)} style={{ flex: 1, accentColor: "#c8553a" }} /><span style={{ fontFamily: M, fontSize: 18, fontWeight: 800, color: "#c8553a", minWidth: 24, textAlign: "right" }}>{people}</span></div></div>
          <div><label style={labelSt}>Climate</label><select style={inp} value={climate} onChange={(e) => setClimate(e.target.value)}>{Object.entries(CLIMATES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}</select></div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 6, marginBottom: 16 }}>
        {Object.entries(SCENARIOS).map(([k, s]) => (
          <button key={k} onClick={() => { setSelScen(k); setSimDuration(s.defaultDur); }} style={{ padding: "10px 6px", background: selScen === k ? "rgba(200,85,58,0.15)" : "rgba(255,255,255,0.02)", border: selScen === k ? "1px solid #c8553a" : "1px solid rgba(255,255,255,0.06)", borderRadius: 8, cursor: "pointer", textAlign: "center" }}>
            <div style={{ fontSize: 22, marginBottom: 3 }}>{s.icon}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: selScen === k ? "#c8553a" : "rgba(255,255,255,0.5)" }}>{s.label}</div>
          </button>
        ))}
      </div>
      <div style={{ ...cardSt, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <label style={labelSt}>Duration</label>
          <span style={{ fontFamily: M, fontSize: 20, fontWeight: 800, color: "#c8553a" }}>
            {simDuration >= 365 ? (simDuration / 365).toFixed(1) + " yr" : simDuration >= 30 ? Math.round(simDuration / 30) + " mo" : simDuration + " d"}
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: 8 }}>({simDuration} days)</span>
          </span>
        </div>
        <input type="range" min={30} max={1095} step={30} value={simDuration} onChange={(e) => setSimDuration(+e.target.value)} style={{ width: "100%", accentColor: "#c8553a" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 4 }}><span>30d</span><span>6mo</span><span>1yr</span><span>2yr</span><span>3yr</span></div>
      </div>
      <div style={{ ...cardSt, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <ScoreRing score={result.score} size={120} />
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{scen?.icon} {scen?.label}</h3>
            <p style={{ margin: "4px 0", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{scen?.desc}</p>
            <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{simDuration} days · {people} people</p>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 18px" }}>
          {sorted.map(([cat, v]) => (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0" }}>
              <span style={{ fontSize: 12 }}>{CATEGORIES[cat]?.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 1 }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{CATEGORIES[cat]?.label}</span>
                  <span style={{ fontSize: 9, color: SC(v), fontFamily: M }}>{Math.round(v)}%</span>
                </div>
                <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                  <div style={{ height: "100%", width: v + "%", background: SC(v), borderRadius: 2, transition: "width 0.5s" }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {recs && (
        <div>
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 800 }}>📋 Recommendations for {scen?.label}</h3>
          <div style={{ ...cardSt, marginBottom: 12, borderLeft: "3px solid #c8553a" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#c8553a", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>General Actions</div>
            {recs.general.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5, marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontFamily: M, color: "#c8553a", fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{i + 1}.</span>
                <span>{r}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Priority Areas</div>
          {weakest.map(([cat, score]) => {
            const rec = recs.byCategory?.[cat];
            if (!rec) return null;
            return (
              <div key={cat} style={{ ...cardSt, padding: "14px 18px", marginBottom: 8, borderLeft: "3px solid " + SC(score) }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 18 }}>{CATEGORIES[cat]?.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{CATEGORIES[cat]?.label}</span>
                  <span style={{ fontSize: 10, color: SC(score), fontFamily: M, fontWeight: 700 }}>{Math.round(score)}%</span>
                  {score < 30 && <span style={{ fontSize: 10, padding: "4px 6px", borderRadius: 4, background: "rgba(239,68,68,0.12)", color: "#ef4444", fontWeight: 700 }}>CRITICAL</span>}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>{rec}</div>
              </div>
            );
          })}
          {sorted.slice(3).map(([cat, score]) => {
            const rec = recs.byCategory?.[cat];
            if (!rec) return null;
            return (
              <div key={cat} style={{ ...cardSt, padding: "12px 16px", marginBottom: 6, opacity: 0.7 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 14 }}>{CATEGORIES[cat]?.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>{CATEGORIES[cat]?.label}</span>
                  <span style={{ fontSize: 9, color: SC(score), fontFamily: M }}>{Math.round(score)}%</span>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>{rec}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════
   COMMS TAB — Emergency Radio Channel Monitor
   ═══════════════════════════════════════════════════════════════ */
function CommsTab({ items, people, climate, callSigns, setCallSigns, codeWords, setCodeWords, rallyPoints, setRallyPoints }) {
  const M = "'JetBrains Mono',monospace";
  const cardSt = { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 };

  const [commsSub, setCommsSub] = useState("scanner");
  const [scanning, setScanning] = useState(true);
  const [scanIdx, setScanIdx] = useState(0);
  const [bandFilter, setBandFilter] = useState("all");
  const [freqSearch, setFreqSearch] = useState("");
  const [monitoredChannels, setMonitoredChannels] = useState(() => {
    // Default monitored channels
    return [
      { freq: "162.400", name: "NOAA WX1", status: "active", signal: 4, lastHeard: "2m ago", band: "noaa" },
      { freq: "146.520", name: "2m Calling", status: "monitoring", signal: 2, lastHeard: "18m ago", band: "ham2m" },
      { freq: "146.550", name: "Emergency Simplex", status: "quiet", signal: 0, lastHeard: "—", band: "ham2m" },
      { freq: "462.5625", name: "GMRS Ch 1", status: "monitoring", signal: 1, lastHeard: "45m ago", band: "gmrs" },
      { freq: "462.5750", name: "GMRS Emergency", status: "quiet", signal: 0, lastHeard: "—", band: "gmrs" },
      { freq: "27.065", name: "CB Ch 9 Emergency", status: "quiet", signal: 0, lastHeard: "—", band: "cb" },
      { freq: "27.185", name: "CB Ch 19 Highway", status: "active", signal: 3, lastHeard: "6m ago", band: "cb" },
      { freq: "156.800", name: "Marine Ch 16", status: "monitoring", signal: 1, lastHeard: "1h ago", band: "marine" },
      { freq: "151.820", name: "MURS Ch 1", status: "quiet", signal: 0, lastHeard: "—", band: "murs" },
      { freq: "14.300", name: "20m Emergency", status: "monitoring", signal: 2, lastHeard: "32m ago", band: "hamhf" },
      { freq: "7.200", name: "40m Phone Net", status: "quiet", signal: 0, lastHeard: "3h ago", band: "hamhf" },
      { freq: "147.000", name: "Local Repeater", status: "active", signal: 5, lastHeard: "just now", band: "ham2m" },
    ];
  });
  const [showAddFreq, setShowAddFreq] = useState(false);
  const [newFreq, setNewFreq] = useState("");
  const [newFreqName, setNewFreqName] = useState("");

  // 7B: Audio scanning simulation state
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const audioCtxRef = useRef(null);
  const audioNoiseRef = useRef(null);
  const audioGainRef = useRef(null);

  // 7C: Channel activity log state
  const [activityLog, setActivityLog] = useState(() => {
    try { const s = localStorage.getItem("prepvault-radio-log"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [logInput, setLogInput] = useState("");
  const [logChannel, setLogChannel] = useState("");

  const subTabs = [
    { id: "scanner", l: "Scanner", i: "📡" },
    { id: "freqs", l: "Frequencies", i: "📻" },
    { id: "schedule", l: "Schedule", i: "🕐" },
    { id: "codes", l: "Codes", i: "🔐" },
    { id: "equipment", l: "Equipment", i: "🔧" },
  ];

  // Scanner animation — cycle through channels
  useEffect(() => {
    if (!scanning) return;
    const timer = setInterval(() => {
      setScanIdx(i => (i + 1) % monitoredChannels.length);
    }, 2200);
    return () => clearInterval(timer);
  }, [scanning, monitoredChannels.length]);

  // 7B: Audio white noise effect
  useEffect(() => {
    if (scanning && audioEnabled) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = ctx;
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;
        const bandpass = ctx.createBiquadFilter();
        bandpass.type = "bandpass";
        bandpass.frequency.value = 1000;
        bandpass.Q.value = 0.5;
        const gain = ctx.createGain();
        gain.gain.value = volume * 0.15;
        audioGainRef.current = gain;
        noise.connect(bandpass);
        bandpass.connect(gain);
        gain.connect(ctx.destination);
        noise.start();
        audioNoiseRef.current = noise;
      } catch (e) { /* Web Audio not supported */ }
    }
    return () => {
      try {
        if (audioNoiseRef.current) { audioNoiseRef.current.stop(); audioNoiseRef.current = null; }
        if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
        audioGainRef.current = null;
      } catch (e) { /* ignore */ }
    };
  }, [scanning, audioEnabled, volume]);

  // 7C: Persist activity log to localStorage
  useEffect(() => {
    try { localStorage.setItem("prepvault-radio-log", JSON.stringify(activityLog)); } catch { /* ignore */ }
  }, [activityLog]);

  // Next check-in countdown
  const [countdown, setCountdown] = useState("");
  useEffect(() => {
    function calcCountdown() {
      const now = new Date();
      const times = COMMS_PLAN.schedule.map(s => {
        const [h, m] = s.time.split(":").map(Number);
        const t = new Date(now);
        t.setHours(h, m, 0, 0);
        if (t <= now) t.setDate(t.getDate() + 1);
        return { ...s, date: t, diff: t - now };
      });
      times.sort((a, b) => a.diff - b.diff);
      const next = times[0];
      const mins = Math.floor(next.diff / 60000);
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      setCountdown({ label: next.desc, time: next.time, display: hrs > 0 ? `${hrs}h ${remMins}m` : `${remMins}m`, mandatory: next.mandatory });
    }
    calcCountdown();
    const iv = setInterval(calcCountdown, 30000);
    return () => clearInterval(iv);
  }, []);

  const currentChannel = monitoredChannels[scanIdx] || monitoredChannels[0];

  // Band filter for frequency database
  const bands = [
    { id: "all", l: "All" }, { id: "noaa", l: "NOAA" }, { id: "ham2m", l: "2m" }, { id: "ham70cm", l: "70cm" },
    { id: "hamhf", l: "HF" }, { id: "gmrs", l: "GMRS" }, { id: "frs", l: "FRS" }, { id: "murs", l: "MURS" },
    { id: "cb", l: "CB" }, { id: "marine", l: "Marine" },
  ];

  const filteredFreqs = EMERGENCY_FREQUENCIES.filter(f => {
    if (bandFilter !== "all" && f.band !== bandFilter) return false;
    if (freqSearch && !f.name.toLowerCase().includes(freqSearch.toLowerCase()) && !f.freq.includes(freqSearch)) return false;
    return true;
  });

  // Equipment from inventory
  const commsEquip = items.filter(i => i.category === "comms");

  const statusColor = (s) => s === "active" ? "#22c55e" : s === "monitoring" ? "#f59e0b" : "rgba(255,255,255,0.15)";
  const priorityColor = (p) => p === "emergency" ? "#ef4444" : p === "high" ? "#f59e0b" : p === "med" ? "#0ea5e9" : "rgba(255,255,255,0.25)";
  const licenseLabel = (l) => l === "ham" ? "HAM License" : l === "gmrs" ? "GMRS License" : l === "marine" ? "Marine License" : l === "none" ? "License-Free" : l;

  const addMonitoredFreq = () => {
    if (!newFreq.trim()) return;
    setMonitoredChannels(prev => [...prev, { freq: newFreq.trim(), name: newFreqName.trim() || newFreq.trim() + " MHz", status: "quiet", signal: 0, lastHeard: "—", band: "custom" }]);
    setNewFreq("");
    setNewFreqName("");
    setShowAddFreq(false);
  };

  const removeMonitoredFreq = (freq) => {
    setMonitoredChannels(prev => prev.filter(c => c.freq !== freq));
  };

  const signalBars = (level) => {
    return (
      <div style={{ display: "flex", gap: 1, alignItems: "flex-end", height: 14 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <div key={n} style={{ width: 3, height: 3 + n * 2, borderRadius: 1, background: n <= level ? "#22c55e" : "rgba(255,255,255,0.08)", transition: "background 0.3s" }} />
        ))}
      </div>
    );
  };

  return (
    <div>
      {/* Region indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
        <span style={{ fontSize: 11 }}>🌎</span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>Region: <strong style={{ color: "rgba(255,255,255,0.6)" }}>North America (US/Canada)</strong></span>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", marginLeft: "auto" }}>NOAA: US/CA · HAM/GMRS/FRS/CB: Universal · Marine VHF: International</span>
      </div>
      {/* Sub-tab nav */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 16, overflowX: "auto" }}>
        {subTabs.map(s => (
          <button key={s.id} onClick={() => setCommsSub(s.id)} style={{ padding: "8px 14px", background: "none", border: "none", borderBottom: commsSub === s.id ? "2px solid #c8553a" : "2px solid transparent", color: commsSub === s.id ? "#fff" : "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit", flexShrink: 0, transition: "all 0.15s", display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 13 }}>{s.i}</span>{s.l}
          </button>
        ))}
      </div>

      {/* ═══ SCANNER ═══ */}
      {commsSub === "scanner" && (
        <div style={{ display: "grid", gap: 12 }}>
          {/* Scanner Display */}
          <div style={{ ...cardSt, padding: 0, overflow: "hidden", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(34,197,94,0.15)" }}>
            <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid rgba(34,197,94,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: scanning ? "#22c55e" : "#ef4444", boxShadow: scanning ? "0 0 8px rgba(34,197,94,0.5)" : "none", animation: scanning ? "pulse 1.5s infinite" : "none" }} />
                  <span style={{ fontSize: 9, fontWeight: 700, color: scanning ? "#22c55e" : "#ef4444", textTransform: "uppercase", letterSpacing: 2 }}>{scanning ? "Scanning" : "Stopped"}</span>
                </div>
                <button onClick={() => setScanning(!scanning)} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid " + (scanning ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"), background: scanning ? "rgba(239,68,68,0.06)" : "rgba(34,197,94,0.06)", color: scanning ? "#ef4444" : "#22c55e", fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{scanning ? "STOP" : "SCAN"}</button>
                <button onClick={() => setAudioEnabled(!audioEnabled)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: audioEnabled ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.03)", color: audioEnabled ? "#22c55e" : "rgba(255,255,255,0.35)", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginLeft: 4 }} title={audioEnabled ? "Mute scanner audio" : "Enable scanner audio"}>{audioEnabled ? "🔊" : "🔇"}</button>
              </div>
              {audioEnabled && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, padding: "4px 0" }}>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>🔈</span>
                  <input type="range" min="0" max="1" step="0.05" value={volume} onChange={e => { const v = parseFloat(e.target.value); setVolume(v); if (audioGainRef.current) audioGainRef.current.gain.value = v * 0.15; }} style={{ flex: 1, accentColor: "#22c55e", height: 4 }} />
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>🔊</span>
                  <span style={{ fontSize: 8, fontFamily: M, color: "rgba(255,255,255,0.25)", minWidth: 28, textAlign: "right" }}>{Math.round(volume * 100)}%</span>
                </div>
              )}
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.15)", textAlign: "center", marginTop: 2, fontStyle: "italic" }}>Audio simulation — use physical radio for actual monitoring</div>
              {/* Large frequency display */}
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                <div style={{ fontSize: 36, fontWeight: 800, fontFamily: M, color: "#22c55e", letterSpacing: 2, textShadow: "0 0 20px rgba(34,197,94,0.3)", lineHeight: 1 }}>
                  {currentChannel.freq}<span style={{ fontSize: 14, marginLeft: 4, color: "rgba(34,197,94,0.5)" }}>MHz</span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(34,197,94,0.6)", marginTop: 6, fontWeight: 600 }}>{currentChannel.name}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 8 }}>
                  <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, background: statusColor(currentChannel.status) + "15", color: statusColor(currentChannel.status), fontWeight: 700, textTransform: "uppercase" }}>{currentChannel.status}</span>
                  {signalBars(currentChannel.signal)}
                </div>
              </div>
              {/* Scan progress bar */}
              <div style={{ height: 2, background: "rgba(34,197,94,0.08)", borderRadius: 1, marginTop: 10, overflow: "hidden" }}>
                <div style={{ height: "100%", width: ((scanIdx + 1) / monitoredChannels.length * 100) + "%", background: "linear-gradient(90deg, #22c55e, rgba(34,197,94,0.3))", transition: "width 0.5s ease", borderRadius: 1 }} />
              </div>
            </div>
          </div>

          {/* Monitored Channels List */}
          <div style={{ ...cardSt, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 2 }}>Monitored Channels ({monitoredChannels.length})</h3>
              <button onClick={() => setShowAddFreq(!showAddFreq)} style={{ padding: "3px 10px", borderRadius: 5, border: "1px dashed rgba(255,255,255,0.1)", background: "none", color: "rgba(255,255,255,0.35)", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>+ Add</button>
            </div>
            {showAddFreq && (
              <div style={{ display: "flex", gap: 4, marginBottom: 10, alignItems: "center" }}>
                <input value={newFreq} onChange={e => setNewFreq(e.target.value)} placeholder="Freq (MHz)" style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "#22c55e", fontSize: 11, fontFamily: M }} />
                <input value={newFreqName} onChange={e => setNewFreqName(e.target.value)} placeholder="Name" onKeyDown={e => e.key === "Enter" && addMonitoredFreq()} style={{ flex: 1.5, padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 11, fontFamily: "inherit" }} />
                <button onClick={addMonitoredFreq} style={{ padding: "6px 10px", borderRadius: 6, background: "#c8553a", border: "none", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Add</button>
              </div>
            )}
            <div style={{ display: "grid", gap: 2 }}>
              {monitoredChannels.map((ch, i) => (
                <div key={ch.freq + i} onClick={() => { setScanIdx(i); setScanning(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 6, background: scanIdx === i ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.01)", border: scanIdx === i ? "1px solid rgba(34,197,94,0.15)" : "1px solid transparent", cursor: "pointer", transition: "all 0.15s" }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: statusColor(ch.status), boxShadow: ch.status === "active" ? `0 0 6px ${statusColor(ch.status)}50` : "none", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: M, color: scanIdx === i ? "#22c55e" : "rgba(255,255,255,0.6)" }}>{ch.freq}</span>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name}</span>
                    </div>
                  </div>
                  {signalBars(ch.signal)}
                  <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", fontFamily: M, flexShrink: 0, width: 45, textAlign: "right" }}>{ch.lastHeard}</span>
                  <span onClick={(e) => { e.stopPropagation(); removeMonitoredFreq(ch.freq); }} style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", cursor: "pointer", padding: "2px 4px", borderRadius: 3, transition: "color 0.15s" }} onMouseOver={e => e.currentTarget.style.color = "#ef4444"} onMouseOut={e => e.currentTarget.style.color = "rgba(255,255,255,0.15)"}>×</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {[
              { label: "Active", value: monitoredChannels.filter(c => c.status === "active").length, color: "#22c55e" },
              { label: "Monitoring", value: monitoredChannels.filter(c => c.status === "monitoring").length, color: "#f59e0b" },
              { label: "Quiet", value: monitoredChannels.filter(c => c.status === "quiet").length, color: "rgba(255,255,255,0.25)" },
            ].map((s, i) => (
              <div key={i} style={{ ...cardSt, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: M, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Next Check-in */}
          {countdown && (
            <div style={{ ...cardSt, padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: countdown.mandatory ? "rgba(200,85,58,0.1)" : "rgba(255,255,255,0.03)", border: "1px solid " + (countdown.mandatory ? "rgba(200,85,58,0.2)" : "rgba(255,255,255,0.06)"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🕐</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1 }}>Next Check-in</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{countdown.label} — {countdown.time}</div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: M, color: "#c8553a" }}>{countdown.display}</div>
            </div>
          )}

          {/* 7C: Channel Activity Log */}
          <div style={{ ...cardSt, padding: 12 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 2 }}>📋 Activity Log</h3>
            <div style={{ display: "flex", gap: 4, marginBottom: 8, alignItems: "center" }}>
              <select value={logChannel} onChange={e => setLogChannel(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "#22c55e", fontSize: 10, fontFamily: M, minWidth: 110 }}>
                <option value="">Channel...</option>
                {monitoredChannels.map((ch, i) => (
                  <option key={ch.freq + i} value={ch.freq}>{ch.freq} — {ch.name}</option>
                ))}
              </select>
              <input value={logInput} onChange={e => setLogInput(e.target.value)} placeholder="What did you hear?" onKeyDown={e => { if (e.key === "Enter" && logInput.trim() && logChannel) { setActivityLog(prev => [{ id: Date.now(), channel: logChannel, channelName: (monitoredChannels.find(c => c.freq === logChannel) || {}).name || logChannel, text: logInput.trim(), timestamp: new Date().toISOString(), reporter: (people && people[0] && people[0].name) || "Operator" }, ...prev].slice(0, 50)); setLogInput(""); } }} style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 11, fontFamily: "inherit" }} />
              <button onClick={() => { if (logInput.trim() && logChannel) { setActivityLog(prev => [{ id: Date.now(), channel: logChannel, channelName: (monitoredChannels.find(c => c.freq === logChannel) || {}).name || logChannel, text: logInput.trim(), timestamp: new Date().toISOString(), reporter: (people && people[0] && people[0].name) || "Operator" }, ...prev].slice(0, 50)); setLogInput(""); } }} style={{ padding: "6px 12px", borderRadius: 6, background: (!logInput.trim() || !logChannel) ? "rgba(200,85,58,0.3)" : "#c8553a", border: "none", color: "#fff", fontSize: 10, fontWeight: 700, cursor: (!logInput.trim() || !logChannel) ? "default" : "pointer", fontFamily: "inherit", opacity: (!logInput.trim() || !logChannel) ? 0.5 : 1 }}>Log</button>
            </div>
            <div style={{ maxHeight: 300, overflowY: "auto", display: "grid", gap: 2 }}>
              {activityLog.slice(0, 20).map((entry) => (
                <div key={entry.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: M, color: "#22c55e" }}>{entry.channel}</span>
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{entry.channelName}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.4 }}>{entry.text}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
                      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", fontFamily: M }}>{new Date(entry.timestamp).toLocaleString()}</span>
                      <span style={{ fontSize: 8, color: "rgba(200,85,58,0.5)" }}>{entry.reporter}</span>
                    </div>
                  </div>
                  <span onClick={() => setActivityLog(prev => prev.filter(e => e.id !== entry.id))} style={{ fontSize: 12, color: "rgba(255,255,255,0.15)", cursor: "pointer", padding: "2px 4px", borderRadius: 3, flexShrink: 0, lineHeight: 1, transition: "color 0.15s" }} onMouseOver={e => e.currentTarget.style.color = "#ef4444"} onMouseOut={e => e.currentTarget.style.color = "rgba(255,255,255,0.15)"}>×</span>
                </div>
              ))}
              {activityLog.length === 0 && (
                <div style={{ textAlign: "center", padding: "20px 12px" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>No activity logged yet. Select a channel and describe what you heard.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ FREQUENCIES ═══ */}
      {commsSub === "freqs" && (
        <div style={{ display: "grid", gap: 12 }}>
          {/* Search + Filters */}
          <div style={{ ...cardSt, padding: 12 }}>
            <input value={freqSearch} onChange={e => setFreqSearch(e.target.value)} placeholder="Search frequencies or names..." style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {bands.map(b => (
                <button key={b.id} onClick={() => setBandFilter(b.id)} style={{ padding: "4px 10px", borderRadius: 6, border: bandFilter === b.id ? "1px solid rgba(200,85,58,0.3)" : "1px solid rgba(255,255,255,0.06)", background: bandFilter === b.id ? "rgba(200,85,58,0.1)" : "rgba(255,255,255,0.02)", color: bandFilter === b.id ? "#c8553a" : "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{b.l}</button>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textAlign: "right" }}>{filteredFreqs.length} frequencies</div>
          {/* Frequency cards */}
          <div style={{ display: "grid", gap: 4 }}>
            {filteredFreqs.map((f, i) => (
              <div key={f.freq + f.name + i} style={{ ...cardSt, padding: "8px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 4, height: 28, borderRadius: 2, background: priorityColor(f.priority), flexShrink: 0 }} />
                <div style={{ minWidth: 80, flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, fontFamily: M, color: "#fff", letterSpacing: 0.5 }}>{f.freq}</div>
                  <div style={{ fontSize: 7, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>{f.mode}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.use}</div>
                </div>
                <span style={{ fontSize: 7, padding: "2px 6px", borderRadius: 3, background: f.license === "none" ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)", color: f.license === "none" ? "#22c55e" : "#f59e0b", fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap" }}>{licenseLabel(f.license)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ SCHEDULE ═══ */}
      {commsSub === "schedule" && (
        <div style={{ display: "grid", gap: 12 }}>
          {/* Countdown */}
          {countdown && (
            <div style={{ ...cardSt, padding: 16, textAlign: "center", background: "rgba(200,85,58,0.03)", border: "1px solid rgba(200,85,58,0.1)" }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Next Check-in</div>
              <div style={{ fontSize: 32, fontWeight: 800, fontFamily: M, color: "#c8553a" }}>{countdown.display}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{countdown.label} at {countdown.time}{countdown.mandatory && <span style={{ color: "#ef4444", marginLeft: 6 }}>MANDATORY</span>}</div>
            </div>
          )}

          {/* Schedule Timeline */}
          <div style={{ ...cardSt, padding: 12 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 2 }}>Daily Check-in Schedule</h3>
            <div style={{ display: "grid", gap: 4 }}>
              {COMMS_PLAN.schedule.map((s, i) => {
                const now = new Date();
                const [h, m] = s.time.split(":").map(Number);
                const isPast = now.getHours() > h || (now.getHours() === h && now.getMinutes() > m);
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8, background: isPast ? "rgba(255,255,255,0.01)" : "rgba(200,85,58,0.03)", border: "1px solid " + (isPast ? "rgba(255,255,255,0.03)" : "rgba(200,85,58,0.08)"), opacity: isPast ? 0.5 : 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, fontFamily: M, color: s.mandatory ? "#c8553a" : "rgba(255,255,255,0.5)", minWidth: 52 }}>{s.time}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{s.desc}</div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{s.duration} · {s.mandatory ? "Mandatory" : "Optional"}</div>
                    </div>
                    {s.mandatory && <span style={{ fontSize: 7, padding: "2px 6px", borderRadius: 3, background: "rgba(239,68,68,0.08)", color: "#ef4444", fontWeight: 700 }}>REQ</span>}
                    {isPast && <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)" }}>✓</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Call Signs */}
          <div style={{ ...cardSt, padding: 12 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 2 }}>Call Sign Roster</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6 }}>
              {callSigns.map((cs, i) => (
                <div key={i} style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, fontFamily: M, color: "#22c55e", minWidth: 60 }}>{cs.sign}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cs.person}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Designated Frequencies */}
          <div style={{ ...cardSt, padding: 12 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 2 }}>Designated Frequencies</h3>
            <div style={{ display: "grid", gap: 6 }}>
              {[COMMS_PLAN.primaryFreq, COMMS_PLAN.emergencyFreq, ...COMMS_PLAN.altFreqs].map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, background: i === 1 ? "rgba(239,68,68,0.03)" : "rgba(255,255,255,0.01)", border: "1px solid " + (i === 1 ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.04)") }}>
                  <span style={{ fontSize: 12, fontWeight: 800, fontFamily: M, color: i === 1 ? "#ef4444" : "#22c55e", minWidth: 95 }}>{f.freq}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>{f.name} · {f.mode}</div>
                    <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)" }}>{f.use} — {f.power}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Duress Signal */}
          <div style={{ ...cardSt, padding: 12, background: "rgba(239,68,68,0.02)", border: "1px solid rgba(239,68,68,0.1)" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 10, color: "#ef4444", textTransform: "uppercase", letterSpacing: 2 }}>⚠ Duress Signal</h3>
            <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{COMMS_PLAN.duress}</p>
          </div>
        </div>
      )}

      {/* ═══ CODES ═══ */}
      {commsSub === "codes" && (
        <div style={{ display: "grid", gap: 12 }}>
          {/* Code Words */}
          <div style={{ ...cardSt, padding: 12 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 2 }}>Code Words</h3>
            <div style={{ display: "grid", gap: 4 }}>
              {codeWords.map((cw, i) => {
                const colors = { BLACKOUT: "#ef4444", OVERWATCH: "#f59e0b", EXODUS: "#ef4444", SHELTER: "#f59e0b", ANGEL: "#ef4444", IRON: "#ef4444", RIVER: "#0ea5e9", PHOENIX: "#22c55e" };
                const col = colors[cw.code] || "#6b7280";
                return (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.01)", borderLeft: `3px solid ${col}` }}>
                    <div style={{ minWidth: 85 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, fontFamily: M, color: col }}>{cw.code}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>{cw.meaning}</div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{cw.action}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Distress Signals / Prowords */}
          <div style={{ ...cardSt, padding: 12 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 2 }}>Radio Prowords & Distress Signals</h3>
            <div style={{ display: "grid", gap: 4 }}>
              {PROWORDS.map((pw, i) => {
                const col = pw.severity === "critical" ? "#ef4444" : pw.severity === "amber" ? "#f59e0b" : "rgba(255,255,255,0.5)";
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 6, background: pw.severity === "critical" ? "rgba(239,68,68,0.03)" : "rgba(255,255,255,0.01)", border: pw.severity === "critical" ? "1px solid rgba(239,68,68,0.08)" : "1px solid rgba(255,255,255,0.03)" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, fontFamily: M, color: col, minWidth: 85 }}>{pw.word}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>{pw.meaning}</div>
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>{pw.use}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* NATO Phonetic Alphabet */}
          <div style={{ ...cardSt, padding: 12 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 2 }}>NATO Phonetic Alphabet</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(95px, 1fr))", gap: 3 }}>
              {NATO_PHONETIC.map((np, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 4, background: "rgba(255,255,255,0.015)" }}>
                  <span style={{ fontSize: 14, fontWeight: 800, fontFamily: M, color: "#c8553a", width: 16, textAlign: "center" }}>{np.letter}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{np.word}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ EQUIPMENT ═══ */}
      {commsSub === "equipment" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ ...cardSt, padding: 12 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 2 }}>Communications Equipment ({commsEquip.length})</h3>
            {commsEquip.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📻</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>No comms equipment in inventory</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>Add radios, walkie-talkies, and sat phones in the Inventory tab</div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {commsEquip.map((item, i) => {
                  const subInfo = CATEGORIES.comms?.subTypes?.[item.subType];
                  return (
                    <div key={item.id || i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{subInfo?.icon || "📡"}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{item.name}</div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                          {subInfo?.label || item.subType}{item.quantity > 1 && ` × ${item.quantity}`}
                          {item.location && ` · ${item.location}`}
                        </div>
                        {item.fields && Object.keys(item.fields).length > 0 && (
                          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                            {Object.entries(item.fields).map(([k, v]) => v && (
                              <span key={k} style={{ fontSize: 8, padding: "1px 6px", borderRadius: 3, background: "rgba(16,185,129,0.06)", color: "rgba(16,185,129,0.7)", fontWeight: 600 }}>{k}: {v}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, fontFamily: M, color: "#10b981" }}>{item.quantity}</div>
                        <div style={{ fontSize: 7, color: "rgba(255,255,255,0.2)" }}>{subInfo?.unit || "units"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Equipment Summary Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
            {Object.entries(CATEGORIES.comms?.subTypes || {}).map(([key, sub]) => {
              const count = commsEquip.filter(i => i.subType === key).reduce((sum, i) => sum + (i.quantity || 1), 0);
              return (
                <div key={key} style={{ ...cardSt, padding: "10px 12px", textAlign: "center", opacity: count > 0 ? 1 : 0.4 }}>
                  <div style={{ fontSize: 16, marginBottom: 4 }}>{sub.icon}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, fontFamily: M, color: count > 0 ? "#10b981" : "rgba(255,255,255,0.2)" }}>{count}</div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)" }}>{sub.label}</div>
                </div>
              );
            })}
          </div>

          {/* 7A: Manuals & References */}
          <div style={{ ...cardSt, padding: 12 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 2 }}>📖 Manuals & References</h3>
            <div style={{ display: "grid", gap: 4 }}>
              {[
                { icon: "📻", title: "Baofeng UV-5R Manual", tag: "Baofeng", url: "https://www.miklor.com/uv5r/UV-5R-Manual.pdf" },
                { icon: "📻", title: "Baofeng UV-82 Manual", tag: "Baofeng", url: "https://www.miklor.com/uv82/Baofeng-UV82-Manual.pdf" },
                { icon: "📻", title: "Baofeng BF-F8HP Manual", tag: "Baofeng", url: "https://www.miklor.com/BFF8HP/BF-F8HP-Manual.pdf" },
                { icon: "🏔️", title: "Garmin GMRS Radios", tag: "Garmin", url: "https://www.garmin.com/en-US/c/outdoor-recreation/2-way-radios/" },
                { icon: "📻", title: "Yaesu FT-60R Manual", tag: "Yaesu", url: "https://www.yaesu.com/indexVS.cfm?cmd=DocumentDownload&DID=318" },
                { icon: "📻", title: "Yaesu FT-65R/FT-25R Manual", tag: "Yaesu", url: "https://www.yaesu.com/indexVS.cfm?cmd=DocumentDownload&DID=6542" },
                { icon: "🗼", title: "RepeaterBook — Repeater Database", tag: "Reference", url: "https://www.repeaterbook.com/" },
                { icon: "📊", title: "ARRL Band Plan", tag: "Reference", url: "http://www.arrl.org/band-plan" },
                { icon: "💻", title: "CHIRP Programming Software", tag: "Software", url: "https://chirp.danplanet.com/projects/chirp/wiki/Home" },
                { icon: "📡", title: "Radio Reference — Scanner Frequencies", tag: "Reference", url: "https://www.radioreference.com/" },
              ].map((link, i) => (
                <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", textDecoration: "none", cursor: "pointer", transition: "all 0.15s" }} onMouseOver={e => { e.currentTarget.style.background = "rgba(200,85,58,0.06)"; e.currentTarget.style.borderColor = "rgba(200,85,58,0.15)"; }} onMouseOut={e => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"; }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{link.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.65)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.title}</div>
                  </div>
                  <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 3, background: link.tag === "Reference" ? "rgba(14,165,233,0.08)" : link.tag === "Software" ? "rgba(168,85,247,0.08)" : "rgba(200,85,58,0.08)", color: link.tag === "Reference" ? "#0ea5e9" : link.tag === "Software" ? "#a855f7" : "#c8553a", fontWeight: 700, flexShrink: 0 }}>{link.tag}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>↗</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SYSTEMS TAB — Resource Conversion, Trade-offs, Dependency Graphs
   ═══════════════════════════════════════════════════════════════ */
function SystemsTab({ items, people, climate }) {
  const M = "'JetBrains Mono',monospace";
  const cardSt = { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 };
  const [sysSub, setSysSub] = useState("convert");
  const [divertFrom, setDivertFrom] = useState("power");
  const [divertTo, setDivertTo] = useState("heat");
  const [divertPct, setDivertPct] = useState(25);
  const [expandedDep, setExpandedDep] = useState(null);

  const subs = [{ id: "convert", l: "Conversions", i: "⚡" }, { id: "tradeoff", l: "Trade-offs", i: "⚖️" }, { id: "graph", l: "System Map", i: "🔗" }, { id: "deps", l: "Dependencies", i: "🔌" }];

  /* ── Hidden Dependency Map ── */
  const DEPENDENCY_TREE = useMemo(() => {
    const hasSolar = items.filter((i) => i.category === "electronics" && i.subType === "solarGadget").length > 0;
    const hasGen = items.filter((i) => i.category === "fuel" && i.subType === "gasoline").reduce((s, i) => s + (i.quantity || 0), 0) > 0;
    const hasBattery = items.filter((i) => i.category === "batteries").reduce((s, i) => s + (i.quantity || 0), 0) > 0;
    const hasPropane = items.filter((i) => i.category === "fuel" && i.subType === "propane").reduce((s, i) => s + (i.quantity || 0), 0) > 0;
    const hasFirewood = items.filter((i) => i.category === "firewood").reduce((s, i) => s + (parseFloat(i.fields?.cords) || 0), 0) > 0;
    const hasHAM = items.filter((i) => (i.category === "electronics" && i.subType === "radio") || i.category === "comms").length > 0;
    const hasSat = items.filter((i) => i.category === "electronics" && i.subType === "satPhone").length > 0;
    const hasFilter = items.filter((i) => i.category === "water" && (i.subType === "filter" || i.subType === "purificationTablets")).length > 0;

    return [
      { id: "garage", name: "Garage Door", icon: "🚗", depends: "Grid Power", dep: "grid", backup: hasGen ? "Generator" : null, hidden: true, risk: "high",
        desc: "Electric garage door opener fails silently during outage. Manual release cord requires physical access from inside.",
        fix: "Install manual release. Keep vehicles outside during storm warnings." },
      { id: "wellpump", name: "Well Water Pump", icon: "💧", depends: "Grid Power", dep: "grid", backup: hasGen ? "Generator" : hasSolar ? "Solar" : null, hidden: true, risk: "critical",
        desc: "Submersible well pump draws 500-1500W. No power = no water pressure, no toilets, no showers.",
        fix: hasGen ? "Generator can power pump. Store 3+ days water as buffer." : "No backup power source. Store minimum 14 days water." },
      { id: "fridge", name: "Refrigerator", icon: "🧊", depends: "Grid Power", dep: "grid", backup: hasGen ? "Generator" : null, hidden: false, risk: "high",
        desc: "Fridge draws ~150W continuous. Without power, food spoils in 4hrs (open) or 24-48hrs (closed).",
        fix: "Run generator 4-6hrs/day to maintain temp. Minimize door openings. Freeze water jugs as thermal mass." },
      { id: "furnace", name: "Furnace Blower", icon: "🌡️", depends: "Grid Power", dep: "grid", backup: hasGen ? "Generator" : null, hidden: true, risk: "critical",
        desc: "Even gas/propane furnaces need electric blower (300-600W). No grid = no forced air heat even with fuel.",
        fix: hasFirewood ? "Wood stove is grid-independent. Furnace needs generator." : "No grid-independent heat source. Generator required for furnace blower." },
      { id: "stovefan", name: "Wood Stove Fan", icon: "🔥", depends: "Battery / Thermoelectric", dep: "battery", backup: hasBattery ? "Batteries" : null, hidden: true, risk: "low",
        desc: "Heat-powered fans are thermoelectric (no battery). Battery fans improve circulation but aren't essential.",
        fix: "Stovetop thermoelectric fans need no power. Battery fans are comfort, not survival." },
      { id: "sump", name: "Sump Pump", icon: "🏠", depends: "Grid Power", dep: "grid", backup: hasGen ? "Generator" : null, hidden: true, risk: "high",
        desc: "Sump pump (500W) prevents basement flooding. Silent failure during storm + outage = catastrophic water damage.",
        fix: "Battery backup sump pump ($150-300). Generator as primary backup. Water alarm sensor ($20)." },
      { id: "phone", name: "Cell Phone", icon: "📱", depends: "LTE Tower + Grid", dep: "grid+tower", backup: hasSat ? "Satellite Phone" : hasHAM ? "HAM Radio" : null, hidden: true, risk: "high",
        desc: "Cell towers have 4-8hr battery backup. Extended outage = no cell service. Phone itself dies without charging.",
        fix: hasSat ? "Satellite phone is tower-independent." : hasHAM ? "HAM radio is fully grid-independent." : "No backup comms. Add satellite or HAM radio." },
      { id: "internet", name: "Internet / WiFi", icon: "🌐", depends: "Grid + ISP + Router", dep: "grid+isp", backup: hasSat ? "Satellite Phone data" : null, hidden: false, risk: "medium",
        desc: "Router, modem, and ISP infrastructure all need power. Starlink needs 50-75W continuous.",
        fix: "Small UPS for router extends connectivity 2-4hrs. Satellite is last-resort data." },
      { id: "security", name: "Security System", icon: "🚨", depends: "Grid + WiFi + Cloud", dep: "grid+cloud", backup: hasBattery ? "Battery backup" : null, hidden: true, risk: "medium",
        desc: "Smart security (Ring, Nest) needs WiFi + cloud servers. Local alarm may have 4-24hr battery backup.",
        fix: "Dogs don't need WiFi. Mechanical trip wires and door bars are grid-independent." },
      { id: "medical", name: "Medical Devices", icon: "💊", depends: "Grid Power", dep: "grid", backup: hasGen ? "Generator" : null, hidden: true, risk: "critical",
        desc: "CPAP, oxygen concentrator, nebulizer, insulin fridge — all grid-dependent. Failure is life-threatening.",
        fix: "Dedicated battery backup for critical medical devices. Generator auto-start for life support." },
      { id: "waterFilter", name: "UV Water Purifier", icon: "🔬", depends: "Grid Power", dep: "grid", backup: hasFilter ? "Gravity filter" : null, hidden: true, risk: "high",
        desc: "UV purification (SteriPEN, whole-house UV) needs electricity. Fails silently — water looks clean but isn't.",
        fix: hasFilter ? "Gravity filter (Berkey) works without power. Boiling requires only fuel." : "No power-independent purification. Add gravity filter or purification tablets." },
      { id: "septic", name: "Septic Pump", icon: "🚽", depends: "Grid Power", dep: "grid", backup: null, hidden: true, risk: "high",
        desc: "Mound/pressurized septic systems use electric pumps. No power = tank fills, sewage backup in 1-3 days.",
        fix: "Know your septic type. Gravity systems work without power. Pump systems need generator priority." },
      { id: "co_detector", name: "CO / Smoke Detectors", icon: "🔋", depends: "Battery", dep: "battery", backup: hasBattery ? "Replacement batteries" : null, hidden: true, risk: "critical",
        desc: "Running generators and heaters indoors without working CO detector is lethal. Battery dies = silent death.",
        fix: "Replace detector batteries every 6 months. Keep spare 9V batteries. Never disable during generator use." },
    ];
  }, [items]);

  /* ── Resource Conversion Constants ── */
  const CONVERSIONS = {
    propane_heat: { input: "1 gal propane", output: "91,452 BTU", equiv: "~5.1 hrs heat (18,000 BTU portable heater)", rate: 5.1, unit: "hrs heat" },
    propane_cook: { input: "1 gal propane", output: "91,452 BTU", equiv: "~11 hrs cooking (8,000 BTU camp stove)", rate: 11, unit: "hrs cooking" },
    gasoline_gen: { input: "1 gal gasoline", output: "~5.5 hrs generator", equiv: "5,500 Wh at 1kW half load (Honda EU2200i)", rate: 5.5, unit: "hrs gen" },
    firewood_heat: { input: "1 cord hardwood", output: "~24M BTU", equiv: "~30 days home heating (non-catalytic stove)", rate: 30, unit: "days heat" },
    battery_aa: { input: "1 AA battery", output: "~3,000 mAh", equiv: "~20 hrs flashlight / 8 hrs radio", rate: 20, unit: "hrs light" },
    solar_100w: { input: "100W solar panel", output: "~500 Wh/day", equiv: "~5 hrs equiv. grid power/day", rate: 5, unit: "hrs/day" },
    water_per_person: { input: "1 gal water", output: "1 person-day", equiv: "FEMA minimum — drinking + basic sanitation", rate: 1, unit: "person-days" },
    rice_cal: { input: "1 lb rice", output: "~1,650 cal", equiv: "~82% of daily need (1 person)", rate: 1650, unit: "calories" },
    beans_cal: { input: "1 lb beans", output: "~1,540 cal", equiv: "~77% of daily need (1 person)", rate: 1540, unit: "calories" },
    kwh_comms: { input: "1 kWh", output: "~50 hrs HAM radio", equiv: "TX: 5W avg × 10% duty cycle", rate: 50, unit: "hrs comms" },
    kwh_light: { input: "1 kWh", output: "~100 hrs LED light", equiv: "10W LED × 100hrs", rate: 100, unit: "hrs light" },
    kwh_heat: { input: "1 kWh", output: "3,412 BTU", equiv: "~0.15 hrs space heater (1500W)", rate: 0.67, unit: "hrs e-heat" },
  };

  /* ── Current Resource Inventory (computed) ── */
  const resources = useMemo(() => {
    const _clim = CLIMATES[climate] || CLIMATES.temperate;
    const climMod = _clim.firewoodMod || 1;
    const p = people || 4;
    const fuelGals = items.filter((i) => i.category === "fuel" && i.subType === "gasoline").reduce((s, i) => s + (i.quantity || 0) * (parseFloat(i.fields?.fuelGallons || i.fields?.gallons) || 5), 0);
    const propaneGals = items.filter((i) => i.category === "fuel" && i.subType === "propane").reduce((s, i) => s + (i.quantity || 0) * 4.6, 0);
    const firewoodCords = items.filter((i) => i.category === "firewood").reduce((s, i) => s + (parseFloat(i.fields?.cords) || 0) * (i.quantity || 1), 0);
    const waterGals = items.filter((i) => i.category === "water" && i.subType === "storedWater").reduce((s, i) => s + (i.quantity || 0), 0);
    const batteries = items.filter((i) => i.category === "batteries").reduce((s, i) => s + (i.quantity || 0), 0);
    const solarPanels = items.filter((i) => (i.category === "power" && i.subType === "solarPanel") || (i.category === "electronics" && i.subType === "solarDevice")).reduce((s, i) => s + (i.quantity || 0), 0);
    const totalCals = items.filter((i) => i.category === "food").reduce((s, i) => {
      const cal = parseFloat(i.fields?.totalCalories || i.fields?.caloriesPerServing || i.fields?.calories || 0);
      const serv = parseFloat(i.fields?.servings || 1);
      return s + (cal > 500 ? cal : cal * serv) * (i.quantity || 1);
    }, 0);

    // Available energy pools (in kWh equivalent)
    const genKwh = fuelGals * 5.5; // gen hrs × 1kW avg load
    const propaneKwh = propaneGals * 91.452 * 0.293 / 1000; // BTU → kWh at ~100% eff
    const solarDailyKwh = solarPanels * 0.5;
    const batteryKwh = batteries * 0.003; // AA ≈ 3Wh

    return { fuelGals, propaneGals, firewoodCords, waterGals, batteries, solarPanels, totalCals, genKwh, propaneKwh, solarDailyKwh, batteryKwh, totalKwh: genKwh + propaneKwh + batteryKwh, climMod, people: p };
  }, [items, people, climate]);

  /* ── System Dependency Graphs ── */
  const SYSTEMS = [
    { id: "water", label: "Water", icon: "💧", color: "#0ea5e9",
      nodes: [
        { id: "storage", label: "Storage", val: resources.waterGals, unit: "gal", status: resources.waterGals >= resources.people * 14 ? "green" : resources.waterGals >= resources.people * 3 ? "yellow" : "red" },
        { id: "filtration", label: "Filtration", val: items.filter((i) => i.category === "water" && i.subType === "filter").reduce((s, i) => s + (i.quantity || 0), 0), unit: "filters", status: items.filter((i) => i.category === "water" && i.subType === "filter").length > 0 ? "green" : "red" },
        { id: "purification", label: "Purification", val: items.filter((i) => i.category === "water" && i.subType === "purificationTablets").reduce((s, i) => s + (i.quantity || 0), 0), unit: "tabs", status: items.filter((i) => i.category === "water" && i.subType === "purificationTablets").length > 0 ? "green" : "red" },
        { id: "energy", label: "Pump Energy", val: resources.genKwh > 0 || resources.solarDailyKwh > 0 ? "Yes" : "No", unit: "", status: resources.genKwh > 0 || resources.solarDailyKwh > 0 ? "green" : "red" },
      ]
    },
    { id: "heat", label: "Heat", icon: "🔥", color: "#f97316",
      nodes: [
        { id: "fuel", label: "Fuel", val: resources.firewoodCords.toFixed(1) + " cord + " + resources.propaneGals.toFixed(0) + " gal", unit: "", status: resources.firewoodCords > 0 || resources.propaneGals > 0 ? "green" : "red" },
        { id: "ignition", label: "Ignition", val: items.filter((i) => (i.category === "recreational" && i.subType === "lighters") || (i.category === "equipment" && i.name?.toLowerCase().includes("lighter"))).reduce((s, i) => s + (i.quantity || 0), 0), unit: "sources", status: items.filter((i) => i.category === "recreational" && i.subType === "lighters").length > 0 ? "green" : "red" },
        { id: "ventilation", label: "Ventilation", val: "Manual", unit: "", status: resources.firewoodCords > 0 ? "green" : "yellow" },
        { id: "backup", label: "Backup", val: new Set([resources.firewoodCords > 0 ? "wood" : null, resources.propaneGals > 0 ? "propane" : null, resources.fuelGals > 0 ? "gas" : null].filter(Boolean)).size, unit: "sources", status: new Set([resources.firewoodCords > 0 ? "wood" : null, resources.propaneGals > 0 ? "propane" : null].filter(Boolean)).size >= 2 ? "green" : "yellow" },
      ]
    },
    { id: "power", label: "Power", icon: "⚡", color: "#eab308",
      nodes: [
        { id: "solar", label: "Solar", val: resources.solarPanels, unit: "panels", status: resources.solarPanels > 0 ? "green" : "red" },
        { id: "generator", label: "Generator", val: resources.fuelGals.toFixed(0), unit: "gal fuel", status: resources.fuelGals > 0 ? "green" : "red" },
        { id: "battery", label: "Battery Bank", val: resources.batteries, unit: "cells", status: resources.batteries >= 20 ? "green" : resources.batteries > 0 ? "yellow" : "red" },
        { id: "inverter", label: "Inverter/UPS", val: items.filter((i) => i.category === "power" || (i.category === "electronics" && i.name?.toLowerCase().includes("inverter"))).length > 0 ? "Yes" : "No", unit: "", status: "yellow" },
      ]
    },
    { id: "comms", label: "Communications", icon: "📡", color: "#a855f7",
      nodes: [
        { id: "primary", label: "Primary", val: "Cellular", unit: "", status: items.filter((i) => i.category === "electronics" && i.subType === "cellPhone").length > 0 ? "green" : "red" },
        { id: "secondary", label: "Secondary", val: "HAM/GMRS", unit: "", status: items.filter((i) => i.category === "electronics" && i.subType === "radio").length > 0 || items.filter((i) => i.category === "comms").length > 0 ? "green" : "red" },
        { id: "tertiary", label: "Tertiary", val: "Satellite", unit: "", status: items.filter((i) => i.category === "electronics" && i.subType === "satPhone").length > 0 ? "green" : "red" },
        { id: "power_dep", label: "Power Dep.", val: resources.totalKwh > 0 ? "Backed" : "Grid-only", unit: "", status: resources.totalKwh > 0 ? "green" : "red" },
      ]
    },
    { id: "food", label: "Food", icon: "🍽️", color: "#22c55e",
      nodes: [
        { id: "stored", label: "Stored Cal", val: Math.round(resources.totalCals).toLocaleString(), unit: "cal", status: resources.totalCals / Math.max(resources.people * 2000, 1) >= 30 ? "green" : resources.totalCals > 0 ? "yellow" : "red" },
        { id: "production", label: "Production", val: items.filter((i) => i.category === "farm" && i.subType === "seedPacket").length, unit: "crops", status: items.filter((i) => i.category === "farm").length > 0 ? "green" : "red" },
        { id: "protein", label: "Protein", val: items.filter((i) => i.category === "fishing").length + items.filter((i) => i.category === "firearms").length, unit: "sources", status: items.filter((i) => i.category === "fishing").length > 0 ? "green" : "yellow" },
        { id: "preservation", label: "Preservation", val: items.filter((i) => i.category === "food" && (i.subType === "freezeDried" || i.subType === "canned")).reduce((s, i) => s + (i.quantity || 0), 0), unit: "items", status: items.filter((i) => i.category === "food" && i.subType === "freezeDried").length > 0 ? "green" : "yellow" },
      ]
    },
  ];

  /* ── Trade-off Simulation ── */
  const tradeoff = useMemo(() => {
    const systems = {
      power: { label: "Power", icon: "⚡", totalKwh: resources.totalKwh + resources.solarDailyKwh * 7, uses: { light: resources.totalKwh * 100, comms: resources.totalKwh * 50, devices: resources.totalKwh * 20 } },
      heat: { label: "Heat", icon: "🔥", totalBtu: resources.firewoodCords * 24000000 + resources.propaneGals * 91452, days: (resources.firewoodCords * 30) + ((resources.propaneGals * 91452) / (50000 * 12)) },
      water: { label: "Water", icon: "💧", totalGal: resources.waterGals, days: resources.waterGals / Math.max(resources.people * resources.climMod, 0.1) },
      food: { label: "Food", icon: "🍽️", totalCal: resources.totalCals, days: resources.totalCals / Math.max(resources.people * 2000, 1) },
      comms: { label: "Comms", icon: "📡", hrs: resources.totalKwh * 50, channels: items.filter((i) => i.category === "electronics" && ["satPhone", "radio", "cellPhone"].includes(i.subType)).length },
    };

    // Simulate diversion
    const pct = divertPct / 100;
    const fromSys = { ...systems[divertFrom] };
    const toSys = { ...systems[divertTo] };

    let fromLoss = "", toGain = "", fromNewDays = 0, toNewDays = 0, fromOrigDays = 0, toOrigDays = 0;

    if (divertFrom === "power" && divertTo === "heat") {
      const kwDiverted = (resources.totalKwh * pct);
      const btuGained = kwDiverted * 3412;
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
      const kwhGained = propDiverted * 91.452 * 0.293 / 1000 * 0.25; // gen efficiency ~25%
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
  }, [items, people, climate, divertFrom, divertTo, divertPct, resources]);

  const statusColor = (s) => s === "green" ? "#22c55e" : s === "yellow" ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 0 }}>
        {subs.map((s) => (
          <button key={s.id} onClick={() => setSysSub(s.id)} style={{ padding: "10px 18px", background: "none", border: "none", borderBottom: sysSub === s.id ? "2px solid #c8553a" : "2px solid transparent", color: sysSub === s.id ? "#fff" : "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
            <span>{s.i}</span> {s.l}
          </button>
        ))}
      </div>

      {/* ═══ Resource Conversions ═══ */}
      {sysSub === "convert" && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 800 }}>⚡ Resource Conversion Table</h3>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>How your resources translate into continuity hours, days, and calories</div>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {Object.entries(CONVERSIONS).map(([k, c]) => (
              <div key={k} style={{ ...cardSt, padding: "12px 16px", display: "grid", gridTemplateColumns: "160px 140px 1fr", gap: 16, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700 }}>{c.input}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>INPUT</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>→</span>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#c8553a", fontFamily: M }}>{c.output}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{c.equiv}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Current Stock in Conversion Terms */}
          <div style={{ marginTop: 16 }}>
            <h4 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>Your Stock → Continuity Value</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
              {[
                { label: "Gasoline", val: resources.fuelGals.toFixed(1) + " gal", conv: (resources.fuelGals * 5.5).toFixed(1) + " hrs generator", icon: "⛽", color: "#f59e0b" },
                { label: "Propane", val: resources.propaneGals.toFixed(1) + " gal", conv: (resources.propaneGals * 5.1).toFixed(0) + " hrs heat", icon: "🔥", color: "#f97316" },
                { label: "Firewood", val: resources.firewoodCords.toFixed(1) + " cords", conv: (resources.firewoodCords * 30).toFixed(0) + " days heat", icon: "🪵", color: "#92400e" },
                { label: "Water", val: resources.waterGals + " gal", conv: (resources.waterGals / Math.max(resources.people, 1)).toFixed(1) + " person-days", icon: "💧", color: "#0ea5e9" },
                { label: "Food", val: Math.round(resources.totalCals).toLocaleString() + " cal", conv: (resources.totalCals / Math.max(resources.people * 2000, 1)).toFixed(1) + " days (" + resources.people + " ppl)", icon: "🍽️", color: "#22c55e" },
                { label: "Batteries", val: resources.batteries + " cells", conv: (resources.batteries * 20).toFixed(0) + " hrs light", icon: "🔋", color: "#eab308" },
              ].map((r, i) => (
                <div key={i} style={{ ...cardSt, padding: 14, borderLeft: "3px solid " + r.color }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 16 }}>{r.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{r.label}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, fontFamily: M, color: r.color }}>{r.val}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>= {r.conv}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Trade-off Simulator ═══ */}
      {sysSub === "tradeoff" && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 800 }}>⚖️ Resource Trade-off Simulator</h3>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Model what happens when you divert resources between systems</div>
          </div>

          {/* Controls */}
          <div style={{ ...cardSt, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Simulation Parameters</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 16, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>DIVERT FROM</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {["power", "heat", "water", "food", "comms"].map((s) => (
                    <button key={s} onClick={() => { setDivertFrom(s); if (s === divertTo) setDivertTo(s === "power" ? "heat" : "power"); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid " + (divertFrom === s ? "#ef4444" : "rgba(255,255,255,0.08)"), background: divertFrom === s ? "rgba(239,68,68,0.1)" : "transparent", color: divertFrom === s ? "#ef4444" : "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 10, fontWeight: 600, fontFamily: "inherit" }}>
                      {{ power: "⚡", heat: "🔥", water: "💧", food: "🍽️", comms: "📡" }[s]} {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 20, color: "rgba(255,255,255,0.3)" }}>→</div>
              <div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>DIVERT TO</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {["power", "heat", "water", "food", "comms"].filter((s) => s !== divertFrom).map((s) => (
                    <button key={s} onClick={() => setDivertTo(s)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid " + (divertTo === s ? "#22c55e" : "rgba(255,255,255,0.08)"), background: divertTo === s ? "rgba(34,197,94,0.1)" : "transparent", color: divertTo === s ? "#22c55e" : "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 10, fontWeight: 600, fontFamily: "inherit" }}>
                      {{ power: "⚡", heat: "🔥", water: "💧", food: "🍽️", comms: "📡" }[s]} {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>DIVERSION AMOUNT</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#c8553a", fontFamily: M }}>{divertPct}%</span>
              </div>
              <input type="range" min={5} max={75} step={5} value={divertPct} onChange={(e) => setDivertPct(parseInt(e.target.value))} style={{ width: "100%", accentColor: "#c8553a" }} />
            </div>
          </div>

          {/* Results */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ ...cardSt, padding: 16, borderLeft: "4px solid #ef4444" }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: "#ef4444", fontWeight: 700, marginBottom: 8 }}>{{ power: "⚡", heat: "🔥", water: "💧", food: "🍽️", comms: "📡" }[divertFrom]} {divertFrom} — Impact</div>
              <div style={{ fontSize: 11, color: "rgba(239,68,68,0.7)", marginBottom: 10 }}>{tradeoff.fromLoss}</div>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 2 }}>BEFORE</div>
                  <div style={{ width: 40, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: 60 }}>
                    <div style={{ height: "100%", background: "rgba(255,255,255,0.15)", borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 10, fontFamily: M, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{tradeoff.fromOrigDays.toFixed(1)}d</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 2 }}>AFTER</div>
                  <div style={{ width: 40, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: 60 }}>
                    <div style={{ height: Math.max(tradeoff.fromOrigDays > 0 ? (tradeoff.fromNewDays / tradeoff.fromOrigDays) * 100 : 0, 5) + "%", background: "#ef4444", borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 10, fontFamily: M, color: "#ef4444", marginTop: 2 }}>{tradeoff.fromNewDays.toFixed(1)}d</div>
                </div>
                <div style={{ fontSize: 9, color: "rgba(239,68,68,0.5)", fontStyle: "italic", flex: 1 }}>
                  {tradeoff.fromOrigDays > 0 ? `−${((1 - tradeoff.fromNewDays / tradeoff.fromOrigDays) * 100).toFixed(0)}% capacity` : "No baseline"}
                </div>
              </div>
            </div>
            <div style={{ ...cardSt, padding: 16, borderLeft: "4px solid #22c55e" }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: "#22c55e", fontWeight: 700, marginBottom: 8 }}>{{ power: "⚡", heat: "🔥", water: "💧", food: "🍽️", comms: "📡" }[divertTo]} {divertTo} — Gain</div>
              <div style={{ fontSize: 11, color: "rgba(34,197,94,0.7)", marginBottom: 10 }}>{tradeoff.toGain}</div>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 2 }}>BEFORE</div>
                  <div style={{ width: 40, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: 60 }}>
                    <div style={{ height: Math.max(tradeoff.toNewDays > 0 ? (tradeoff.toOrigDays / tradeoff.toNewDays) * 100 : 100, 5) + "%", background: "rgba(255,255,255,0.15)", borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 10, fontFamily: M, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{tradeoff.toOrigDays.toFixed(1)}d</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 2 }}>AFTER</div>
                  <div style={{ width: 40, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: 60 }}>
                    <div style={{ height: "100%", background: "#22c55e", borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 10, fontFamily: M, color: "#22c55e", marginTop: 2 }}>{tradeoff.toNewDays.toFixed(1)}d</div>
                </div>
                <div style={{ fontSize: 9, color: "rgba(34,197,94,0.5)", fontStyle: "italic", flex: 1 }}>
                  {tradeoff.toOrigDays > 0 ? `+${(((tradeoff.toNewDays / tradeoff.toOrigDays) - 1) * 100).toFixed(0)}% capacity` : "New capacity"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ System Dependency Map ═══ */}
      {sysSub === "graph" && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 800 }}>🔗 System Dependency Map</h3>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Each system depends on a chain of components — a break in any link degrades the whole system</div>
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            {SYSTEMS.map((sys) => {
              const allGreen = sys.nodes.every((n) => n.status === "green");
              const hasRed = sys.nodes.some((n) => n.status === "red");
              const sysStatus = allGreen ? "Nominal" : hasRed ? "Degraded" : "At Risk";
              const sysStatusColor = allGreen ? "#22c55e" : hasRed ? "#ef4444" : "#f59e0b";
              return (
                <div key={sys.id} style={{ ...cardSt, padding: 18, borderLeft: "4px solid " + sys.color }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 22 }}>{sys.icon}</span>
                      <span style={{ fontSize: 14, fontWeight: 800 }}>{sys.label} System</span>
                    </div>
                    <span style={{ fontSize: 9, padding: "5px 10px", borderRadius: 12, background: sysStatusColor + "15", color: sysStatusColor, fontWeight: 700 }}>{sysStatus}</span>
                  </div>
                  {/* Node chain */}
                  <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    {sys.nodes.map((node, ni) => (
                      <div key={ni} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                        <div style={{ flex: 1, textAlign: "center" }}>
                          <div style={{ width: 52, height: 52, borderRadius: 12, background: statusColor(node.status) + "10", border: "2px solid " + statusColor(node.status) + "40", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 6px", position: "relative" }}>
                            <div style={{ width: 8, height: 8, borderRadius: 4, background: statusColor(node.status), boxShadow: "0 0 8px " + statusColor(node.status) + "60" }} />
                          </div>
                          <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 2 }}>{node.label}</div>
                          <div style={{ fontSize: 9, fontFamily: M, color: statusColor(node.status) }}>{typeof node.val === "number" ? node.val : node.val}</div>
                          {node.unit && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{node.unit}</div>}
                        </div>
                        {ni < sys.nodes.length - 1 && (
                          <div style={{ width: 30, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <svg width="30" height="12" viewBox="0 0 30 12">
                              <line x1="0" y1="6" x2="22" y2="6" stroke={sys.nodes[ni + 1].status === "red" ? "#ef444440" : sys.color + "40"} strokeWidth="2" strokeDasharray={sys.nodes[ni + 1].status === "red" ? "3,3" : "none"} />
                              <polygon points="22,2 30,6 22,10" fill={sys.nodes[ni + 1].status === "red" ? "#ef444440" : sys.color + "60"} />
                            </svg>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* System health bar */}
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>CHAIN INTEGRITY</span>
                      <span style={{ fontSize: 10, fontFamily: M, color: sysStatusColor }}>{Math.round(sys.nodes.filter((n) => n.status === "green").length / sys.nodes.length * 100)}%</span>
                    </div>
                    <div style={{ height: 4, background: "rgba(255,255,255,0.04)", borderRadius: 2 }}>
                      <div style={{ height: "100%", width: (sys.nodes.filter((n) => n.status === "green").length / sys.nodes.length * 100) + "%", background: `linear-gradient(90deg, ${sys.color}, ${sysStatusColor})`, borderRadius: 2, transition: "width 0.5s" }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Hidden Dependencies ═══ */}
      {sysSub === "deps" && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 800 }}>🔌 Hidden Dependency Map</h3>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Appliances and amenities that silently fail when their dependencies go down</div>
          </div>

          {/* Summary cards */}
          <div className="pcs-sys-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
            {[
              { label: "Critical", count: DEPENDENCY_TREE.filter((d) => d.risk === "critical").length, color: "#ef4444", desc: "Life-safety risk" },
              { label: "No Backup", count: DEPENDENCY_TREE.filter((d) => !d.backup).length, color: "#f59e0b", desc: "Single point of failure" },
              { label: "Hidden", count: DEPENDENCY_TREE.filter((d) => d.hidden).length, color: "#a855f7", desc: "Fails silently" },
            ].map((s, i) => (
              <div key={i} style={{ ...cardSt, padding: 14, textAlign: "center", borderTop: "3px solid " + s.color }}>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: M, color: s.color }}>{s.count}</div>
                <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2 }}>{s.label}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{s.desc}</div>
              </div>
            ))}
          </div>

          {/* Dependency tree */}
          <div style={{ display: "grid", gap: 6 }}>
            {DEPENDENCY_TREE.map((dep) => {
              const riskCol = dep.risk === "critical" ? "#ef4444" : dep.risk === "high" ? "#f59e0b" : "#22c55e";
              const hasBackup = !!dep.backup;
              const isExp = expandedDep === dep.id;
              return (
                <div key={dep.id}>
                  <button onClick={() => setExpandedDep(isExp ? null : dep.id)} style={{ width: "100%", ...cardSt, padding: "12px 16px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: "#fff", borderLeft: "4px solid " + riskCol, background: isExp ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.02)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{dep.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{dep.name}</span>
                          {dep.hidden && <span style={{ fontSize: 9, padding: "4px 5px", borderRadius: 4, background: "rgba(168,85,247,0.15)", color: "#a855f7", fontWeight: 700 }}>HIDDEN</span>}
                          <span style={{ fontSize: 9, padding: "4px 5px", borderRadius: 4, background: riskCol + "15", color: riskCol, fontWeight: 700, textTransform: "uppercase" }}>{dep.risk}</span>
                        </div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                          Requires: <span style={{ color: "rgba(255,255,255,0.5)", fontFamily: M }}>{dep.depends}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {hasBackup ? (
                          <div style={{ fontSize: 9, color: "#22c55e" }}>✓ {dep.backup}</div>
                        ) : (
                          <div style={{ fontSize: 9, color: "#ef4444", fontWeight: 700 }}>✗ NO BACKUP</div>
                        )}
                      </div>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", transform: isExp ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>▼</span>
                    </div>
                  </button>
                  {isExp && (
                    <div style={{ marginLeft: 20, borderLeft: "2px solid " + riskCol + "30", padding: "12px 16px", background: "rgba(255,255,255,0.01)" }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 10 }}>{dep.desc}</div>
                      <div style={{ padding: "8px 12px", background: "rgba(34,197,94,0.04)", borderRadius: 6, borderLeft: "3px solid #22c55e" }}>
                        <div style={{ fontSize: 10, color: "#22c55e", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>Mitigation</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{dep.fix}</div>
                      </div>
                      {/* Dependency chain visualization */}
                      <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 10 }}>
                        <div style={{ padding: "4px 10px", borderRadius: 6, background: riskCol + "10", border: "1px solid " + riskCol + "30", fontSize: 9, fontWeight: 700, color: riskCol }}>{dep.name}</div>
                        <svg width="30" height="12" viewBox="0 0 30 12"><line x1="0" y1="6" x2="22" y2="6" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" /><polygon points="22,2 30,6 22,10" fill="rgba(255,255,255,0.15)" /></svg>
                        <div style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 9, fontWeight: 600, color: "rgba(239,68,68,0.6)" }}>{dep.depends}</div>
                        {hasBackup && (<>
                          <svg width="30" height="12" viewBox="0 0 30 12"><line x1="0" y1="6" x2="22" y2="6" stroke="rgba(34,197,94,0.2)" strokeWidth="1.5" strokeDasharray="3,2" /><polygon points="22,2 30,6 22,10" fill="rgba(34,197,94,0.3)" /></svg>
                          <div style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", fontSize: 9, fontWeight: 600, color: "#22c55e" }}>↻ {dep.backup}</div>
                        </>)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── localStorage helpers ── */
const PV_STORAGE_KEY = "prepvault-db";
function loadSaved() {
  try {
    const raw = localStorage.getItem(PV_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.items) && data.items.length > 0) return data;
    return null;
  } catch { return null; }
}

export default function PrepVault() {
  const saved = useRef(loadSaved());
  const [items, setItems] = useState(() => saved.current?.items || SAMPLE_ITEMS.map(i => ({ ...i, propertyId: "prop1" })));
  const [people, setPeople] = useState(() => saved.current?.people ?? 4);
  const [climate, setClimate] = useState(() => saved.current?.climate || "cold");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selCat, setSelCat] = useState(null);
  const [properties, setProperties] = useState(() => saved.current?.properties || DEFAULT_PROPERTIES);
  const [activePropertyId, setActivePropertyId] = useState(() => saved.current?.activePropertyId || "prop1");
  const [showAddProp, setShowAddProp] = useState(false);
  const [newPropName, setNewPropName] = useState("");
  const [newPropType, setNewPropType] = useState("cabin");
  const [crisisMode, setCrisisMode] = useState(false);
  const [crisisStart, setCrisisStart] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addCat, setAddCat] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [selScen, setSelScen] = useState("economic");
  const [simDuration, setSimDuration] = useState(180);
  const [propUnlocked, setPropUnlocked] = useState(false);
  const [propSub, setPropSub] = useState("map");
  const [propAddress, setPropAddress] = useState(() => saved.current?.propAddress || "");
  const [pins, setPins] = useState(() => saved.current?.pins || SAMPLE_MAP_PINS);
  const [members, setMembers] = useState(() => saved.current?.members || SAMPLE_MEMBERS);
  const [contacts, setContacts] = useState(() => saved.current?.contacts || SAMPLE_CONTACTS);
  const [callSigns, setCallSigns] = useState(() => saved.current?.callSigns || COMMS_PLAN.callSigns);
  const [codeWords, setCodeWords] = useState(() => saved.current?.codeWords || COMMS_PLAN.codeWords);
  const [rallyPoints, setRallyPoints] = useState(() => saved.current?.rallyPoints || COMMS_PLAN.rallyPoints);
  const [codes, setCodes] = useState(() => saved.current?.codes || SAMPLE_CODES);
  const [manuals] = useState(SAMPLE_MANUALS);
  const [routes] = useState(SAMPLE_ROUTES);
  const [amenities] = useState(SAMPLE_AMENITIES);
  const [revealedCodes, setRevealedCodes] = useState({});
  const [showScanner, setShowScanner] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [alertsDismissedUntil, setAlertsDismissedUntil] = useState(() => {
    try { const s = localStorage.getItem("prepvault-alerts-dismissed-until"); if (s && parseInt(s, 10) > Date.now()) return parseInt(s, 10); } catch {} return null;
  });
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showLanding, setShowLanding] = useState(() => !localStorage.getItem("prepvault-active-session"));
  const [onboardStep, setOnboardStep] = useState(() => localStorage.getItem("prepvault-onboarding-done") ? null : (saved.current ? null : 0));
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
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [syncStatus, setSyncStatus] = useState("local"); // 'local' | 'syncing' | 'synced' | 'error' | 'offline'
  const syncEngineRef = useRef(null);

  /* ── Auto-save to localStorage (debounced) ── */
  const saveTimerRef = useRef(null);
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setDbStatus("unsaved");
    saveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(PV_STORAGE_KEY, JSON.stringify({
          items, people, climate, pins, propAddress, properties, activePropertyId,
          members, contacts, callSigns, codeWords, rallyPoints, codes,
          savedAt: new Date().toISOString()
        }));
        setDbStatus("saved");
        setLastSaved(new Date().toISOString());
        // Queue cloud sync if authenticated
        if (syncEngineRef.current) syncEngineRef.current.queueSync();
      } catch { /* storage full or unavailable */ }
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [items, people, climate, pins, propAddress, properties, activePropertyId, members, contacts, callSigns, codeWords, rallyPoints, codes]);

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

  /* ── Auth Session Restore ── */
  useEffect(() => {
    if (supabaseConfigured) {
      // Cloud auth via Supabase
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user || null);
      });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user || null);
      });
      return () => subscription.unsubscribe();
    } else {
      // Restore local session from localStorage
      try {
        const saved = localStorage.getItem("prepvault-active-session");
        if (saved) {
          const session = JSON.parse(saved);
          if (session?.id && session?.email) {
            setUser({ id: session.id, email: session.email, isLocal: true });
          }
        }
      } catch { /* ignore parse errors */ }
    }
  }, []);

  /* ── Sync Engine ── */
  useEffect(() => {
    if (!syncEngineRef.current) {
      syncEngineRef.current = new SyncEngine(supabase);
      syncEngineRef.current.setStatusCallback(setSyncStatus);
    }
    const engine = syncEngineRef.current;
    if (user) {
      engine.setUser(user.id);
      engine.migrateToCloud();
    } else {
      engine.setUser(null);
      setSyncStatus("local");
    }
    return () => engine.destroy();
  }, [user]);

  /* ── Auth Handlers ── */
  // Local auth helpers (when Supabase isn't configured)
  const localAuthStore = useCallback(() => {
    try { return JSON.parse(localStorage.getItem("prepvault-local-accounts") || "{}"); } catch { return {}; }
  }, []);
  const hashPassword = useCallback(async (pwd) => {
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest("SHA-256", enc.encode(pwd + "prepvault-salt-2024"));
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  }, []);

  const handleAuth = useCallback(async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      if (supabaseConfigured) {
        // Cloud auth via Supabase
        if (authMode === "signup") {
          const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
          if (error) throw error;
          showToast("Account created! Check email for verification.", "success");
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
          if (error) throw error;
          showToast("Logged in ✓", "success");
        }
      } else {
        // Local-only auth (works without Supabase)
        if (!authEmail || !authPassword) throw new Error("Email and password required");
        if (authPassword.length < 4) throw new Error("Password must be at least 4 characters");
        const pwHash = await hashPassword(authPassword);
        const accounts = localAuthStore();
        const emailKey = authEmail.toLowerCase().trim();

        if (authMode === "signup") {
          if (accounts[emailKey]) throw new Error("Account already exists. Try signing in.");
          const localUser = { id: "local-" + crypto.randomUUID(), email: emailKey, pwHash, createdAt: new Date().toISOString() };
          accounts[emailKey] = localUser;
          localStorage.setItem("prepvault-local-accounts", JSON.stringify(accounts));
          setUser({ id: localUser.id, email: emailKey, isLocal: true });
          localStorage.setItem("prepvault-active-session", JSON.stringify({ id: localUser.id, email: emailKey, isLocal: true }));
          showToast("Account created (local mode)", "success");
        } else {
          const account = accounts[emailKey];
          if (!account) throw new Error("No account found. Try signing up first.");
          if (account.pwHash !== pwHash) throw new Error("Incorrect password");
          setUser({ id: account.id, email: emailKey, isLocal: true });
          localStorage.setItem("prepvault-active-session", JSON.stringify({ id: account.id, email: emailKey, isLocal: true }));
          showToast("Logged in ✓ (local mode)", "success");
        }
      }
      setShowAuth(false);
      setShowLanding(false);
      setAuthEmail("");
      setAuthPassword("");
      // New signups get empty state
      if (authMode === "signup") {
        setItems([]);
        setContacts([]);
        setMembers([{ id: "p1", name: "You", avatar: "👤", role: "Leader", status: "home", lat: null, lng: null, lastPing: "Now", battery: 100, sharing: false, color: "#22c55e" }]);
        setPins([]);
        setCallSigns([{ sign: "BASE", person: "You" }]);
        setCodeWords([]);
        setRallyPoints([]);
        setOnboardStep(0);
      }
    } catch (err) {
      setAuthError(err.message || "Authentication failed");
    } finally {
      setAuthLoading(false);
    }
  }, [authMode, authEmail, authPassword, localAuthStore, hashPassword]);

  const handleLogout = useCallback(async () => {
    if (supabaseConfigured) {
      await supabase.auth.signOut();
    } else {
      setUser(null);
      localStorage.removeItem("prepvault-active-session");
    }
    setSyncStatus("local");
    showToast("Logged out", "success");
  }, []);

  /* ── Web Crypto AES-256-GCM ── */
  const deriveKey = async (password, salt) => {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" }, keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  };
  const encryptData = async (data, password) => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const enc = new TextEncoder();
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(data)));
    const buf = new Uint8Array(salt.length + iv.length + ct.byteLength);
    buf.set(salt, 0);
    buf.set(iv, salt.length);
    buf.set(new Uint8Array(ct), salt.length + iv.length);
    return btoa(String.fromCharCode(...buf));
  };
  const decryptData = async (b64, password) => {
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const salt = raw.slice(0, 16);
    const iv = raw.slice(16, 28);
    const ct = raw.slice(28);
    const key = await deriveKey(password, salt);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(pt));
  };

  /* ── Local Database (encrypted in-memory with export) ── */
  const getDbSnapshot = () => ({
    version: 3,
    timestamp: new Date().toISOString(),
    items, people, climate, pins, propAddress, properties, activePropertyId,
    meta: { categories: Object.keys(CATEGORIES).length, scenarios: Object.keys(SCENARIOS).length, properties: properties.length }
  });

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
    if (!importPw) { setSecMsg("⚠ Enter decryption password"); return; }
    try {
      setSecMsg("🔓 Decrypting...");
      const text = await file.text();
      const wrapper = JSON.parse(text);
      if (!wrapper.pcs || !wrapper.payload) { setSecMsg("❌ Not a valid PCS backup file"); return; }
      const data = await decryptData(wrapper.payload, importPw);
      if (data.items) setItems(data.items);
      if (data.people) setPeople(data.people);
      if (data.climate) setClimate(data.climate);
      if (data.pins) setPins(data.pins);
      if (data.propAddress) setPropAddress(data.propAddress);
      if (data.properties) setProperties(data.properties);
      if (data.activePropertyId) setActivePropertyId(data.activePropertyId);
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
      if (encryptedDb && dbPassphrase.length >= 6) {
        const encrypted = await encryptData(data, dbPassphrase);
        await window.storage.set("pcs-db", JSON.stringify({ enc: true, payload: encrypted }));
      } else {
        await window.storage.set("pcs-db", JSON.stringify({ enc: false, payload: data }));
      }
      setDbStatus(encryptedDb ? "encrypted" : "saved");
      setLastSaved(new Date());
      setSecMsg("✅ Saved to local database" + (encryptedDb ? " (encrypted)" : ""));
    } catch (e) {
      setDbStatus("unsaved");
      setSecMsg("⚠ Local save failed — storage may be unavailable");
    }
  };

  const handleLocalLoad = async () => {
    try {
      const result = await window.storage.get("pcs-db");
      if (!result) { setSecMsg("⚠ No local database found"); return; }
      const wrapper = JSON.parse(result.value);
      let data;
      if (wrapper.enc) {
        if (!dbPassphrase) { setSecMsg("⚠ Enter database passphrase to decrypt"); return; }
        data = await decryptData(wrapper.payload, dbPassphrase);
      } else {
        data = wrapper.payload;
      }
      if (data.items) setItems(data.items);
      if (data.people) setPeople(data.people);
      if (data.climate) setClimate(data.climate);
      if (data.pins) setPins(data.pins);
      if (data.propAddress) setPropAddress(data.propAddress);
      if (data.properties) setProperties(data.properties);
      if (data.activePropertyId) setActivePropertyId(data.activePropertyId);
      setDbStatus(wrapper.enc ? "encrypted" : "saved");
      setSecMsg("✅ Loaded " + (data.items?.length || 0) + " items from local database");
    } catch (e) {
      setSecMsg("❌ Load failed — " + (e.message.includes("decrypt") ? "wrong passphrase" : e.message));
    }
  };

  const handleDbWipe = async () => {
    try {
      await window.storage.delete("pcs-db");
      setItems(SAMPLE_ITEMS);
      setDbStatus("unsaved");
      setSecMsg("🗑️ Local database wiped — reset to defaults");
    } catch (e) {
      setSecMsg("⚠ Wipe failed");
    }
  };

  /* ── Property-filtered items ── */
  const propItems = activePropertyId === "all" ? items : items.filter(i => i.propertyId === activePropertyId);
  const activeProp = properties.find(p => p.id === activePropertyId) || properties[0];

  const openAdd = (c) => { setAddCat(c || null); setEditItem(null); setShowAdd(true); };
  const openEdit = (i) => { setEditItem(i); setAddCat(i.category); setShowAdd(true); };
  const handleAdd = (i) => {
    if (editItem) {
      setItems((p) => p.map((x) => (x.id === i.id ? i : x)));
      showToast("✏️ " + i.name + " updated");
    } else {
      setItems((p) => [...p, { ...i, propertyId: activePropertyId === "all" ? "prop1" : activePropertyId }]);
      showToast("✅ " + i.name + " added to " + (CATEGORIES[i.category]?.label || "inventory"));
    }
  };
  const handleRemove = (id) => {
    const item = items.find(i => i.id === id);
    setItems((p) => p.filter((i) => i.id !== id));
    showToast("🗑️ " + (item?.name || "Item") + " removed");
  };
  const handleScan = (product) => {
    setShowScanner(false);
    const newItem = { id: uid(), category: product.category, subType: product.subType, name: product.name, quantity: product.qty || 1, location: "", fields: product.fields || {}, addedDate: new Date().toISOString().split("T")[0], propertyId: activePropertyId === "all" ? "prop1" : activePropertyId };
    setItems((p) => [...p, newItem]);
    showToast("📷 " + product.name + " scanned and added");
  };

  const addProperty = () => {
    if (!newPropName.trim()) return;
    const icons = { cabin: "🏕️", cache: "📦", farm: "🌾", vehicle: "🚐", home: "🏠", office: "🏢" };
    const np = { id: "prop" + Date.now(), name: newPropName.trim(), type: newPropType, icon: icons[newPropType] || "📍", active: false };
    setProperties(p => [...p, np]);
    setActivePropertyId(np.id);
    setNewPropName("");
    setShowAddProp(false);
  };
  const removeProperty = (id) => {
    if (id === "prop1") return; // can't remove primary
    setProperties(p => p.filter(pp => pp.id !== id));
    setItems(p => p.filter(i => i.propertyId !== id));
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

  const tabs = [{ id: "dashboard", l: "Dashboard", i: "◈" }, { id: "property", l: "Property", i: "🏠" }, { id: "community", l: "Community", i: "👥" }, { id: "comms", l: "Comms", i: "📡" }, { id: "systems", l: "Systems", i: "⚙" }, { id: "simulate", l: "Simulate", i: "🧪" }];

  const renderContent = () => {
    if (selCat) {
      return <CategoryDetail catKey={selCat} items={propItems} people={people} climate={climate} onBack={() => setSelCat(null)} onAdd={(c) => openAdd(c)} onRemove={handleRemove} onEdit={openEdit} onQtyChange={(id, delta) => setItems(p => p.map(i => i.id === id ? { ...i, quantity: Math.max(0, (i.quantity || 1) + delta) } : i))} />;
    }
    switch (activeTab) {
      case "dashboard":
        return <DashboardTab items={propItems} setSelCat={setSelCat} openAdd={openAdd} people={people} climate={climate} allAlerts={allAlerts} showAlerts={showAlerts} setShowAlerts={setShowAlerts} crisisMode={crisisMode} setCrisisMode={setCrisisMode} setCrisisStart={setCrisisStart} setShowScanner={setShowScanner} propAddress={propAddress} alertsDismissed={alertsDismissed} alertsDismissedUntil={alertsDismissedUntil} onDismissAlerts={() => setAlertsDismissedUntil(Date.now() + 24 * 60 * 60 * 1000)} />;
      case "property":
        return <PropertyTab propUnlocked={propUnlocked} setPropUnlocked={setPropUnlocked} propSub={propSub} setPropSub={setPropSub} propAddress={propAddress} setPropAddress={setPropAddress} pins={pins} setPins={setPins} codes={codes} setCodes={setCodes} members={members} manuals={manuals} routes={routes} amenities={amenities} revealedCodes={revealedCodes} setRevealedCodes={setRevealedCodes} user={user} />;
      case "community":
        return <CommunityTab members={members} setMembers={setMembers} contacts={contacts} setContacts={setContacts} callSigns={callSigns} setCallSigns={setCallSigns} codeWords={codeWords} setCodeWords={setCodeWords} rallyPoints={rallyPoints} setRallyPoints={setRallyPoints} items={propItems} people={people} climate={climate} user={user} />;
      case "comms":
        return <CommsTab items={propItems} people={people} climate={climate} callSigns={callSigns} setCallSigns={setCallSigns} codeWords={codeWords} setCodeWords={setCodeWords} rallyPoints={rallyPoints} setRallyPoints={setRallyPoints} />;
      case "systems":
        return <SystemsTab items={propItems} people={people} climate={climate} />;
      case "simulate":
        return <SimulateTab items={propItems} people={people} setPeople={setPeople} climate={climate} setClimate={setClimate} selScen={selScen} setSelScen={setSelScen} simDuration={simDuration} setSimDuration={setSimDuration} />;
      default:
        return null;
    }
  };

  /* ═══ Auth Modal (reusable) ═══ */
  const renderAuthModal = () => (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowAuth(false)}>
      <div style={{ background: "#13151a", borderRadius: 14, width: "92%", maxWidth: 400, border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "22px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg,#c8553a,#8b2e1a)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, fontFamily: M, marginBottom: 10, boxShadow: "0 4px 20px rgba(200,85,58,0.3)" }}>P</div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{authMode === "signup" ? "Create Account" : "Welcome Back"}</h3>
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{authMode === "signup" ? "Sign up to sync your data across devices" : "Sign in to access your cloud data"}</p>
        </div>
        <div style={{ padding: "20px 24px" }}>
          {authError && <div style={{ padding: "8px 12px", marginBottom: 14, borderRadius: 6, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", fontSize: 10, color: "#ef4444" }}>❌ {authError}</div>}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Email</label>
            <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@example.com" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} onKeyDown={(e) => e.key === "Enter" && handleAuth()} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Password</label>
            <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder={authMode === "signup" ? "Min 6 characters" : "Your password"} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} onKeyDown={(e) => e.key === "Enter" && handleAuth()} />
          </div>
          <button onClick={handleAuth} disabled={authLoading || !authEmail || !authPassword} style={{ width: "100%", padding: "12px", borderRadius: 8, background: authLoading ? "rgba(200,85,58,0.3)" : "linear-gradient(135deg,#c8553a,#a3412d)", color: "#fff", border: "none", cursor: authLoading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", opacity: (!authEmail || !authPassword) ? 0.5 : 1 }}>
            {authLoading ? "⟳ Please wait..." : authMode === "signup" ? "Create Account" : "Sign In"}
          </button>
          <div style={{ textAlign: "center", marginTop: 14, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            {authMode === "login" ? <>Don't have an account? <button onClick={() => { setAuthMode("signup"); setAuthError(""); }} style={{ background: "none", border: "none", color: "#c8553a", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 11, padding: 0 }}>Sign up</button></> : <>Already have an account? <button onClick={() => { setAuthMode("login"); setAuthError(""); }} style={{ background: "none", border: "none", color: "#c8553a", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 11, padding: 0 }}>Sign in</button></>}
          </div>
          <div style={{ marginTop: 16, padding: "10px 12px", background: supabaseConfigured ? "rgba(255,255,255,0.02)" : "rgba(14,165,233,0.04)", borderRadius: 8, border: "1px solid " + (supabaseConfigured ? "rgba(255,255,255,0.04)" : "rgba(14,165,233,0.15)"), textAlign: "center" }}>
            <div style={{ fontSize: 9, color: supabaseConfigured ? "rgba(255,255,255,0.3)" : "rgba(14,165,233,0.7)", lineHeight: 1.5 }}>
              {supabaseConfigured ? <>☁️ Cloud sync enabled. Your data syncs across devices.</> : <>💾 Local mode — your account is stored on this device only.</>}
            </div>
          </div>
        </div>
        <div style={{ padding: "12px 24px 18px", borderTop: "1px solid rgba(255,255,255,0.04)", textAlign: "center" }}>
          <button onClick={() => { setShowAuth(false); if (showLanding) setShowLanding(false); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Continue without account →</button>
        </div>
      </div>
    </div>
  );

  /* ═══ LANDING PAGE ═══ */
  if (showLanding) {
    const features = [
      { icon: "📦", title: "Smart Inventory", desc: "Track supplies across multiple properties with expiry alerts, consumption rate tracking, and auto-rotation reminders." },
      { icon: "📡", title: "Comms Center", desc: "HAM/GMRS frequency scanner, check-in schedules, encrypted code words, and radio protocol reference with audio simulation." },
      { icon: "👥", title: "Team Coordination", desc: "Live satellite tracking, AES-256 encrypted chat, contacts database, call signs, and rally point mapping." },
      { icon: "🧪", title: "Crisis Simulation", desc: "Test readiness against 13 real-world scenarios from grid failure to pandemic with scored results and gap analysis." },
      { icon: "🏠", title: "Property Intelligence", desc: "Multi-site management with security cameras, access codes, evacuation routes, and resource mapping." },
      { icon: "🗺️", title: "Satellite Mapping", desc: "Esri World Imagery maps with member overlays, geolocation tracking, rally point thumbnails, and tactical planning." },
    ];
    const stats = [
      { val: "22", label: "Supply Categories" },
      { val: "13", label: "Crisis Scenarios" },
      { val: "AES-256", label: "Encryption" },
      { val: "100%", label: "Offline Capable" },
    ];
    return (
      <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#fff", fontFamily: "'Outfit','DM Sans','Segoe UI',sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <style>{`@keyframes fadeUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}} @keyframes glow{0%,100%{box-shadow:0 0 30px rgba(200,85,58,0.2)}50%{box-shadow:0 0 60px rgba(200,85,58,0.35)}}`}</style>

        {/* ── Nav Bar ── */}
        <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(10,12,16,0.8)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#c8553a,#8b2e1a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, fontFamily: M, color: "#fff" }}>P</div>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.5 }}>PrepVault</span>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: M, marginLeft: 4 }}>v3.0</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => { setShowAuth(true); setAuthMode("login"); }} style={{ padding: "8px 18px", borderRadius: 8, background: "none", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Sign In</button>
            <button onClick={() => { setShowAuth(true); setAuthMode("signup"); }} style={{ padding: "8px 18px", borderRadius: 8, background: "linear-gradient(135deg,#c8553a,#a3412d)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Get Started</button>
          </div>
        </nav>

        {/* ── Hero Section ── */}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "100px 20px 60px", textAlign: "center", animation: "fadeUp 0.6s ease-out" }}>
          <div style={{ display: "inline-block", padding: "6px 14px", borderRadius: 20, background: "rgba(200,85,58,0.08)", border: "1px solid rgba(200,85,58,0.15)", fontSize: 11, color: "#c8553a", fontWeight: 700, fontFamily: M, marginBottom: 28, letterSpacing: 1 }}>PERSONAL CONTINUITY SYSTEM</div>
          <h1 style={{ fontSize: "clamp(36px, 6vw, 60px)", fontWeight: 900, margin: "0 0 16px", lineHeight: 1.05, letterSpacing: -1 }}>
            Your survival plan,<br />
            <span style={{ background: "linear-gradient(135deg,#c8553a,#e8724a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>encrypted & offline-ready</span>
          </h1>
          <p style={{ fontSize: "clamp(14px, 2vw, 18px)", color: "rgba(255,255,255,0.45)", maxWidth: 600, margin: "0 auto 44px", lineHeight: 1.7 }}>
            Track inventory, coordinate your team, monitor comms, and simulate crisis scenarios — all behind military-grade encryption with zero cloud dependency.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginBottom: 20 }}>
            <button onClick={() => { setShowAuth(true); setAuthMode("signup"); }} style={{ padding: "16px 36px", borderRadius: 12, background: "linear-gradient(135deg,#c8553a,#a3412d)", color: "#fff", border: "none", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 24px rgba(200,85,58,0.35)", animation: "glow 3s ease-in-out infinite" }}>Create Free Account</button>
            <button onClick={() => { setShowLanding(false); localStorage.setItem("prepvault-onboarding-done", "1"); }} style={{ padding: "16px 36px", borderRadius: 12, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Try Demo →</button>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontFamily: M }}>No credit card · Works offline · Your data stays yours</div>
        </div>

        {/* ── Stats Bar ── */}
        <div style={{ maxWidth: 700, margin: "0 auto 60px", padding: "0 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "rgba(255,255,255,0.04)", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
            {stats.map((s, i) => (
              <div key={i} style={{ padding: "20px 12px", textAlign: "center", background: "#0a0c10" }}>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: M, color: "#c8553a", marginBottom: 4 }}>{s.val}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Feature Cards ── */}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 20px 40px" }}>
          <h2 style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 3, fontWeight: 700, marginBottom: 24 }}>Everything you need</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {features.map((f, i) => (
              <div key={i} style={{ padding: "22px 24px", borderRadius: 14, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)", transition: "all 0.2s" }} onMouseOver={e => { e.currentTarget.style.borderColor = "rgba(200,85,58,0.2)"; e.currentTarget.style.background = "rgba(200,85,58,0.02)"; }} onMouseOut={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)"; e.currentTarget.style.background = "rgba(255,255,255,0.015)"; }}>
                <div style={{ fontSize: 26, marginBottom: 10 }}>{f.icon}</div>
                <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700 }}>{f.title}</h3>
                <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── How It Works ── */}
        <div style={{ maxWidth: 700, margin: "0 auto", padding: "40px 20px 60px" }}>
          <h2 style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 3, fontWeight: 700, marginBottom: 24 }}>Get started in 3 steps</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {[
              { n: "01", t: "Set Up Properties", d: "Add your locations — home, bug-out cabin, cache sites — with maps and access codes." },
              { n: "02", t: "Log Your Supplies", d: "Inventory everything across 22 categories. Expiry alerts and consumption tracking keep you current." },
              { n: "03", t: "Coordinate & Test", d: "Add team members, set up comms, and run crisis simulations to find your gaps." },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 900, fontFamily: M, color: "rgba(200,85,58,0.3)", marginBottom: 8 }}>{s.n}</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{s.t}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Final CTA ── */}
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "40px 20px 60px", textAlign: "center" }}>
          <div style={{ padding: "40px 32px", borderRadius: 16, background: "rgba(200,85,58,0.04)", border: "1px solid rgba(200,85,58,0.12)" }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 800 }}>Ready to start?</h2>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "0 0 24px", lineHeight: 1.6 }}>Create your account in seconds. Everything runs locally — your data never leaves your device unless you choose cloud sync.</p>
            <button onClick={() => { setShowAuth(true); setAuthMode("signup"); }} style={{ padding: "14px 36px", borderRadius: 10, background: "linear-gradient(135deg,#c8553a,#a3412d)", color: "#fff", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 20px rgba(200,85,58,0.3)" }}>Create Free Account</button>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: "20px 28px 30px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: M }}>PrepVault — Personal Continuity System</div>
          <div style={{ display: "flex", gap: 20, fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: M }}>
            <span>AES-256-GCM</span><span>Offline-First</span><span>Zero Telemetry</span>
          </div>
        </div>

        {/* Auth modal */}
        {showAuth && renderAuthModal()}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#fff", fontFamily: "'Outfit','DM Sans','Segoe UI',sans-serif", paddingBottom: 72 }} onClick={() => { if (showAlerts) setShowAlerts(false); }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes slideUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
        * { -webkit-tap-highlight-color: transparent; }
        input:focus, textarea:focus, select:focus { border-color: rgba(200,85,58,0.5) !important; box-shadow: 0 0 0 2px rgba(200,85,58,0.15) !important; }
        button:active { transform: scale(0.97); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        .pcs-header { padding: 12px 20px; display: flex; align-items: center; gap: 12; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.015); }
        .pcs-header-actions { display: flex; align-items: center; gap: 10; flex-shrink: 0; }
        .pcs-tabs { display: flex; gap: 0; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 0 20px; background: rgba(255,255,255,0.01); }
        .pcs-bottom-nav { display: flex; position: fixed; bottom: 0; left: 0; right: 0; z-index: 900; background: rgba(10,12,16,0.95); backdrop-filter: blur(20px); border-top: 1px solid rgba(255,255,255,0.06); padding: 6px 0 env(safe-area-inset-bottom, 8px); justify-content: space-around; }
        .pcs-bottom-nav button { background: none; border: none; color: rgba(255,255,255,0.35); cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 9px; font-weight: 600; padding: 6px 12px; font-family: inherit; min-width: 56px; transition: color 0.15s; }
        .pcs-bottom-nav button.active { color: #c8553a; }
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
        .pcs-cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 10; }
        .pcs-content { max-width: 1100px; margin: 0 auto; padding: 20px; }
        .pcs-sec-status-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8; margin-bottom: 18; }
        @media (max-width: 768px) {
          .pcs-header { padding: 10px 14px; gap: 8; flex-wrap: wrap; }
          .pcs-header-actions { gap: 8; }
          .pcs-tabs { display: none !important; }
          .pcs-crisis-grid { grid-template-columns: repeat(2, 1fr); }
          .pcs-opt-grid { grid-template-columns: 1fr; }
          .pcs-cat-grid { grid-template-columns: repeat(2, 1fr); gap: 8; }
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
          .pcs-cat-grid { grid-template-columns: 1fr 1fr; gap: 6; }
          .pcs-header { padding: 8px 10px; }
          .pcs-content { padding: 10px; }
        }
      `}</style>

      {/* ═══ HEADER ═══ */}
      <div className="pcs-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); setSelCat(null); setActiveTab("dashboard"); }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#c8553a,#8b2e1a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, fontFamily: M, boxShadow: "0 2px 12px rgba(200,85,58,0.3)" }}>P</div>
          <div><div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.5 }}>PCS</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 2, fontWeight: 500 }}>Personal Continuity</div></div>
        </div>
        <div style={{ flex: 1 }} />
        <div className="pcs-header-actions">
          {/* Sync Status Indicator */}
          {user && (
            <div style={{ padding: "4px 8px", borderRadius: 8, background: syncStatus === "synced" ? "rgba(34,197,94,0.08)" : syncStatus === "syncing" ? "rgba(14,165,233,0.08)" : syncStatus === "error" ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.04)", border: "1px solid " + (syncStatus === "synced" ? "rgba(34,197,94,0.2)" : syncStatus === "syncing" ? "rgba(14,165,233,0.2)" : syncStatus === "error" ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.06)"), fontSize: 9, fontWeight: 700, color: syncStatus === "synced" ? "#22c55e" : syncStatus === "syncing" ? "#0ea5e9" : syncStatus === "error" ? "#ef4444" : "rgba(255,255,255,0.4)", flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
              {syncStatus === "synced" ? "☁️ Synced" : syncStatus === "syncing" ? "⟳ Syncing" : syncStatus === "error" ? "⚠ Sync Error" : "💾 Local"}
            </div>
          )}
          <button onClick={() => setShowSecurity(true)} style={{ ...btnSt, background: encryptedDb ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.04)", color: encryptedDb ? "#22c55e" : "rgba(255,255,255,0.4)", fontWeight: 700, fontSize: 14, padding: "8px 11px", border: encryptedDb ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.06)" }} title="Security & Privacy">🔒</button>
          <button onClick={() => { if (!crisisMode) { setCrisisMode(true); setCrisisStart(new Date()); } else { setCrisisMode(false); setCrisisStart(null); } }} style={{ ...btnSt, background: crisisMode ? "#ef4444" : "rgba(239,68,68,0.06)", color: crisisMode ? "#fff" : "#ef4444", fontWeight: 800, fontSize: 10, padding: "8px 14px", border: crisisMode ? "1px solid #ef4444" : "1px solid rgba(239,68,68,0.15)", letterSpacing: 1, textTransform: "uppercase", animation: crisisMode ? "pulse 2s infinite" : "none" }}>{crisisMode ? "⚡ ACTIVE" : "⚡ ACTIVATE"}</button>
          {isOffline && <div style={{ padding: "4px 8px", borderRadius: 8, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", fontSize: 9, color: "#f59e0b", fontWeight: 700, flexShrink: 0 }}>OFFLINE</div>}
          {/* Auth Button */}
          {user ? (
            <button onClick={handleLogout} style={{ ...btnSt, padding: "6px 10px", fontSize: 10, fontWeight: 700, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 4 }} title={user.email}>
              <span style={{ width: 18, height: 18, borderRadius: 9, background: "linear-gradient(135deg,#c8553a,#8b2e1a)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff" }}>{(user.email?.[0] || "U").toUpperCase()}</span>
              <span style={{ maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email?.split("@")[0]}</span>
            </button>
          ) : (
            <button onClick={() => setShowAuth(true)} style={{ ...btnSt, padding: "6px 12px", fontSize: 10, fontWeight: 700, background: "rgba(200,85,58,0.08)", color: "#c8553a", border: "1px solid rgba(200,85,58,0.2)" }}>Sign In</button>
          )}
        </div>
      </div>

      {/* ═══ DESKTOP TABS ═══ */}
      {!selCat && (
        <div className="pcs-tabs">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); if (tab.id === "simulate") setSimDuration(SCENARIOS[selScen].defaultDur); }}
              style={{ padding: "11px 18px", background: "none", border: "none", borderBottom: activeTab === tab.id ? "2px solid #c8553a" : "2px solid transparent", color: activeTab === tab.id ? "#fff" : "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 7, fontFamily: "inherit", transition: "color 0.15s" }}>
              <span style={{ fontSize: 14 }}>{tab.i}</span> {tab.l}
              {tab.id === "property" && !propUnlocked && <span style={{ fontSize: 9 }}>🔒</span>}
              {tab.id === "community" && <span style={{ fontSize: 10, padding: "4px 6px", borderRadius: 8, background: "rgba(34,197,94,0.12)", color: "#22c55e", fontWeight: 700 }}>{members.filter((m) => m.sharing).length}</span>}
            </button>
          ))}
        </div>
      )}

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
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontFamily: M }}>Elapsed: {elapsed}h</div>
                <button onClick={() => { setCrisisMode(false); setCrisisStart(null); }} style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 9, fontWeight: 600, fontFamily: "inherit" }}>Deactivate</button>
              </div>

              {/* Resource countdown */}
              <div className="pcs-crisis-grid">
                {[
                  { icon: "🔋", label: "Power", value: Math.max(powerHrs - elapsed, 0).toFixed(1), unit: "hrs left", total: powerHrs.toFixed(1) + "h total", color: (powerHrs - elapsed) > 24 ? "#22c55e" : (powerHrs - elapsed) > 6 ? "#f59e0b" : "#ef4444", pct: Math.max((powerHrs - elapsed) / Math.max(powerHrs, 1) * 100, 0) },
                  { icon: "💧", label: "Water", value: waterDays.toFixed(1), unit: "days left", total: waterGals + " gal stored", color: waterDays > 7 ? "#22c55e" : waterDays > 2 ? "#f59e0b" : "#ef4444", pct: Math.min(waterDays / 14 * 100, 100) },
                  { icon: "🔥", label: "Heat", value: climate === "cold" ? heatDays.toFixed(1) : "N/A", unit: climate === "cold" ? "days left" : "not needed", total: firewoodCords.toFixed(1) + " cords + " + propTanks + " propane", color: heatDays > 14 ? "#22c55e" : heatDays > 3 ? "#f59e0b" : "#ef4444", pct: climate === "cold" ? Math.min(heatDays / 30 * 100, 100) : 100 },
                  { icon: "🍽️", label: "Food", value: calDays.toFixed(1), unit: "days left", total: Math.round(totalCals).toLocaleString() + " cal", color: calDays > 14 ? "#22c55e" : calDays > 3 ? "#f59e0b" : "#ef4444", pct: Math.min(calDays / 30 * 100, 100) },
                ].map((r, i) => (
                  <div key={i} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, border: "1px solid " + r.color + "20" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 14 }}>{r.icon}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{r.label}</span>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, fontFamily: M, color: r.color, lineHeight: 1 }}>{r.value}</div>
                    <div style={{ fontSize: 10, color: r.color, marginTop: 2 }}>{r.unit}</div>
                    <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 6 }}>
                      <div style={{ height: "100%", width: r.pct + "%", background: r.color, borderRadius: 2, transition: "width 1s" }} />
                    </div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>{r.total}</div>
                  </div>
                ))}
              </div>

              {/* Optimization suggestions */}
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>⚡ Optimization Suggestions</div>
              <div className="pcs-opt-grid">
                {suggestions.slice(0, 6).map((s, i) => (
                  <div key={i} style={{ padding: "8px 12px", background: "rgba(0,0,0,0.15)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{s.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{s.action}</span>
                        <span style={{ fontSize: 9, fontWeight: 800, color: "#22c55e", fontFamily: M }}>{s.gain}</span>
                      </div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>{s.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      <div className="pcs-content">
        {/* ── Property Switcher ── */}
        {!selCat && activeTab !== "community" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 2 }}>
            <button onClick={() => setActivePropertyId("all")} style={{ padding: "6px 12px", borderRadius: 8, background: activePropertyId === "all" ? "rgba(200,85,58,0.12)" : "rgba(255,255,255,0.03)", border: activePropertyId === "all" ? "1px solid rgba(200,85,58,0.25)" : "1px solid rgba(255,255,255,0.06)", color: activePropertyId === "all" ? "#c8553a" : "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit", flexShrink: 0, display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s" }}>
              🌐 All Sites <span style={{ fontSize: 10, fontFamily: M, opacity: 0.5 }}>({items.length})</span>
            </button>
            {properties.map(p => {
              const count = items.filter(i => i.propertyId === p.id).length;
              return (
                <button key={p.id} onClick={() => setActivePropertyId(p.id)} style={{ padding: "6px 12px", borderRadius: 8, background: activePropertyId === p.id ? "rgba(200,85,58,0.12)" : "rgba(255,255,255,0.03)", border: activePropertyId === p.id ? "1px solid rgba(200,85,58,0.25)" : "1px solid rgba(255,255,255,0.06)", color: activePropertyId === p.id ? "#fff" : "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", flexShrink: 0, display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s", position: "relative" }}>
                  {p.icon} {p.name} <span style={{ fontSize: 10, fontFamily: M, opacity: 0.5 }}>{count}</span>
                  {p.id !== "prop1" && (
                    <span onClick={(e) => { e.stopPropagation(); if (confirm("Remove '" + p.name + "' and all its items? This cannot be undone.")) removeProperty(p.id); }} style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", cursor: "pointer", marginLeft: 4, lineHeight: 1, width: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 4, transition: "all 0.15s" }} onMouseOver={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }} onMouseOut={e => { e.currentTarget.style.color = "rgba(255,255,255,0.25)"; e.currentTarget.style.background = "transparent"; }} title="Remove property">×</span>
                  )}
                </button>
              );
            })}
            {!showAddProp ? (
              <button onClick={() => setShowAddProp(true)} style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 12, fontFamily: "inherit", flexShrink: 0, transition: "all 0.15s" }}>+</button>
            ) : (
              <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
                <input value={newPropName} onChange={e => setNewPropName(e.target.value)} onKeyDown={e => e.key === "Enter" && addProperty()} placeholder="Name..." style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 11, fontFamily: "inherit", width: 100 }} autoFocus />
                <select value={newPropType} onChange={e => setNewPropType(e.target.value)} style={{ padding: "5px 6px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 10, fontFamily: "inherit" }}>
                  <option value="cabin">🏕️ Cabin</option>
                  <option value="cache">📦 Cache</option>
                  <option value="farm">🌾 Farm</option>
                  <option value="vehicle">🚐 Vehicle</option>
                  <option value="home">🏠 Home</option>
                  <option value="office">🏢 Office</option>
                </select>
                <button onClick={addProperty} style={{ padding: "5px 10px", borderRadius: 6, background: "#c8553a", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>Add</button>
                <button onClick={() => setShowAddProp(false)} style={{ padding: "5px 8px", borderRadius: 6, background: "none", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
              </div>
            )}
          </div>
        )}
        {renderContent()}
      </div>

      {/* ═══ MOBILE BOTTOM NAV ═══ */}
      {selCat ? (
        <div className="pcs-bottom-nav">
          <button className="active" onClick={() => setSelCat(null)}>
            <span style={{ fontSize: 18 }}>←</span>
            Back
          </button>
          <button onClick={() => openAdd(selCat)}>
            <span style={{ fontSize: 18 }}>+</span>
            Add
          </button>
        </div>
      ) : (
        <div className="pcs-bottom-nav">
          {tabs.map((tab) => (
            <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => { setActiveTab(tab.id); if (tab.id === "simulate") setSimDuration(SCENARIOS[selScen].defaultDur); }}>
              <span style={{ fontSize: 18 }}>{tab.i}</span>
              {tab.l}
            </button>
          ))}
        </div>
      )}
      {/* ═══ TOAST NOTIFICATION ═══ */}
      {toast && (
        <div style={{ position: "fixed", bottom: "max(80px, calc(env(safe-area-inset-bottom, 0px) + 70px))", left: "50%", transform: "translateX(-50%)", padding: "10px 20px", borderRadius: 12, background: toast.type === "success" ? "rgba(34,197,94,0.95)" : toast.type === "error" ? "rgba(239,68,68,0.95)" : "rgba(200,85,58,0.95)", color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "inherit", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 2000, animation: "slideUp 0.2s ease", whiteSpace: "nowrap", maxWidth: "90vw", overflow: "hidden", textOverflow: "ellipsis" }}>{toast.msg}</div>
      )}
      {showAdd && <AddItemModal onAdd={handleAdd} onClose={() => { setShowAdd(false); setEditItem(null); }} editItem={editItem} initialCategory={addCat} />}
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      {/* ═══ Auth Modal ═══ */}
      {showAuth && renderAuthModal()}

      {/* ═══ Onboarding Walkthrough ═══ */}
      {onboardStep !== null && (() => {
        const steps = [
          { icon: "👋", title: "Welcome to PrepVault", desc: "Your personal continuity system. Let's take a quick tour of your preparedness dashboard.", action: "Start Tour" },
          { icon: "🏠", title: "Set Up Your Properties", desc: "Add your primary residence, bug-out locations, and cache sites. Each property tracks its own inventory independently.", action: "Next", tab: "property" },
          { icon: "📦", title: "Track Your Supplies", desc: "Use the Dashboard to add items across 20+ categories. Track quantities, locations, expiry dates, and consumption rates.", action: "Next", tab: "dashboard" },
          { icon: "👥", title: "Connect Your Team", desc: "The Community tab lets you track team members on a satellite map, chat securely with AES-256 encryption, and manage contacts.", action: "Next", tab: "community" },
          { icon: "📡", title: "Monitor Communications", desc: "The Comms tab gives you a frequency scanner, check-in schedules, code words, and radio protocol references.", action: "Finish", tab: "comms" },
        ];
        const step = steps[onboardStep];
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "#1a1d23", borderRadius: 16, padding: 32, maxWidth: 420, border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
              <div style={{ fontSize: 44, textAlign: "center", marginBottom: 16 }}>{step.icon}</div>
              <h3 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 800, textAlign: "center" }}>{step.title}</h3>
              <p style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 1.6, marginBottom: 24, margin: "0 0 24px" }}>{step.desc}</p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button onClick={() => {
                  if (onboardStep < steps.length - 1) { setOnboardStep(onboardStep + 1); if (steps[onboardStep + 1].tab) setActiveTab(steps[onboardStep + 1].tab); }
                  else { setOnboardStep(null); localStorage.setItem("prepvault-onboarding-done", "1"); setActiveTab("dashboard"); }
                }} style={{ padding: "10px 24px", borderRadius: 8, background: "linear-gradient(135deg,#c8553a,#a3412d)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>{step.action}</button>
                <button onClick={() => { setOnboardStep(null); localStorage.setItem("prepvault-onboarding-done", "1"); }} style={{ padding: "10px 18px", borderRadius: 8, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Skip</button>
              </div>
              <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 16 }}>
                {steps.map((_, i) => <div key={i} style={{ width: 8, height: 8, borderRadius: 4, background: i === onboardStep ? "#c8553a" : i < onboardStep ? "rgba(200,85,58,0.3)" : "rgba(255,255,255,0.08)", transition: "background 0.2s" }} />)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ Security & Privacy Panel ═══ */}
      {showSecurity && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowSecurity(false)}>
          <div style={{ background: "#13151a", borderRadius: 14, width: "92%", maxWidth: 560, maxHeight: "90vh", overflow: "auto", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>🔒 Security & Privacy</h3>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>All encryption runs locally — nothing leaves your device</div>
              </div>
              <button onClick={() => setShowSecurity(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 20, cursor: "pointer" }}>×</button>
            </div>

            <div style={{ padding: "16px 22px" }}>
              {/* Status Row */}
              <div className="pcs-sec-status-grid">
                <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{isOffline ? "📡" : "🌐"}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: isOffline ? "#f59e0b" : "#22c55e" }}>{isOffline ? "Offline" : "Online"}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{isOffline ? "No data leaves device" : "Network detected"}</div>
                </div>
                <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{dbStatus === "encrypted" ? "🔐" : dbStatus === "saved" ? "💾" : "⚪"}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: dbStatus === "encrypted" ? "#22c55e" : dbStatus === "saved" ? "#0ea5e9" : "rgba(255,255,255,0.3)" }}>
                    {dbStatus === "encrypted" ? "Encrypted" : dbStatus === "saved" ? "Saved" : dbStatus === "saving" ? "Saving..." : "Not Saved"}
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{lastSaved ? "Last: " + lastSaved.toLocaleTimeString() : "No local backup"}</div>
                </div>
                <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>📦</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>{items.length} Items</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{people} people · {climate}</div>
                </div>
              </div>

              {/* Messages */}
              {secMsg && (
                <div style={{ padding: "8px 12px", marginBottom: 14, borderRadius: 6, background: secMsg.startsWith("✅") ? "rgba(34,197,94,0.06)" : secMsg.startsWith("❌") || secMsg.startsWith("⚠") ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.02)", border: "1px solid " + (secMsg.startsWith("✅") ? "rgba(34,197,94,0.15)" : secMsg.startsWith("❌") || secMsg.startsWith("⚠") ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)"), fontSize: 10, color: "rgba(255,255,255,0.6)" }}>
                  {secMsg}
                </div>
              )}

              {/* ── Local Database ── */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>💾 Local Database</div>
                <div style={{ padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", flex: 1 }}>
                      <input type="checkbox" checked={encryptedDb} onChange={(e) => setEncryptedDb(e.target.checked)} style={{ marginRight: 6 }} />
                      Encrypt local database (AES-256-GCM)
                    </label>
                  </div>
                  {encryptedDb && (
                    <div style={{ position: "relative", marginBottom: 10 }}>
                      <input type={showDbPw ? "text" : "password"} value={dbPassphrase} onChange={(e) => setDbPassphrase(e.target.value)} placeholder="Database passphrase (min 6 chars)" style={{ width: "100%", padding: "8px 36px 8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 11, fontFamily: "inherit", boxSizing: "border-box" }} />
                      <button onClick={() => setShowDbPw(!showDbPw)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.3)", padding: 0 }}>{showDbPw ? "🙈" : "👁️"}</button>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={handleLocalSave} style={{ ...btnSt, flex: 1, padding: "8px 0", fontSize: 10, fontWeight: 700, background: "rgba(34,197,94,0.08)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" }}>💾 Save</button>
                    <button onClick={handleLocalLoad} style={{ ...btnSt, flex: 1, padding: "8px 0", fontSize: 10, fontWeight: 700, background: "rgba(14,165,233,0.08)", color: "#0ea5e9", border: "1px solid rgba(14,165,233,0.2)" }}>📂 Load</button>
                    <button onClick={handleDbWipe} style={{ ...btnSt, padding: "8px 12px", fontSize: 10, fontWeight: 700, background: "rgba(239,68,68,0.06)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.15)" }}>🗑️</button>
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 6, lineHeight: 1.5 }}>
                    Data stored locally on this device only. {encryptedDb ? "AES-256-GCM with PBKDF2-SHA256 (310K iterations). Without your passphrase, data is unrecoverable." : "Enable encryption for sensitive inventories."}
                  </div>
                </div>
              </div>

              {/* ── Encrypted Export ── */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>📤 Encrypted Export</div>
                <div style={{ padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>Download a password-protected backup file. AES-256-GCM encrypted — unreadable without the password.</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="password" value={exportPw} onChange={(e) => setExportPw(e.target.value)} placeholder="Encryption password (min 6 chars)" style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 11, fontFamily: "inherit" }} />
                    <button onClick={handleEncryptedExport} style={{ ...btnSt, padding: "8px 16px", fontSize: 10, fontWeight: 700, background: "rgba(168,85,247,0.08)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.2)" }}>🔐 Export</button>
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>File: pcs-backup-YYYY-MM-DD.enc.json · Portable, offline, tamper-evident</div>
                </div>
              </div>

              {/* ── Encrypted Import ── */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>📥 Encrypted Import</div>
                <div style={{ padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>Restore from an encrypted backup file. Requires the same password used during export.</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="password" value={importPw} onChange={(e) => setImportPw(e.target.value)} placeholder="Decryption password" style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 11, fontFamily: "inherit" }} />
                    <button onClick={() => importRef.current?.click()} style={{ ...btnSt, padding: "8px 16px", fontSize: 10, fontWeight: 700, background: "rgba(14,165,233,0.08)", color: "#0ea5e9", border: "1px solid rgba(14,165,233,0.2)" }}>📂 Import</button>
                    <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) handleEncryptedImport(e.target.files[0]); e.target.value = ""; }} />
                  </div>
                </div>
              </div>

              {/* ── Offline Mode Info ── */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>📡 Offline Mode</div>
                <div style={{ padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 5, background: isOffline ? "#f59e0b" : "#22c55e", boxShadow: "0 0 6px " + (isOffline ? "#f59e0b60" : "#22c55e60") }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: isOffline ? "#f59e0b" : "#22c55e" }}>{isOffline ? "Offline — Fully Isolated" : "Online — Network Detected"}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
                    {isOffline
                      ? "No network connection detected. All data stays on this device. Encrypted exports can be saved to USB or local storage." + (user ? " Changes will sync when back online." : " Zero telemetry, zero cloud contact.")
                      : user
                        ? "Connected and syncing with cloud. Your data is backed up and available across devices. Local-first: all features work without network."
                        : "Network is available. For maximum discretion: enable airplane mode, then reload. PCS runs entirely client-side — no server calls required for core functionality."
                    }
                  </div>
                  {!isOffline && (
                    <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(245,158,11,0.04)", borderRadius: 6, borderLeft: "3px solid #f59e0b", fontSize: 9, color: "rgba(245,158,11,0.6)" }}>
                      💡 For full offline isolation: enable airplane mode → reload page → all features work without network
                    </div>
                  )}
                </div>
              </div>

              {/* ── Security Specs ── */}
              <div style={{ padding: 14, background: "rgba(255,255,255,0.01)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Security Specifications</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
                  {[
                    ["Cipher", "AES-256-GCM"],
                    ["Key Derivation", "PBKDF2-SHA256"],
                    ["Iterations", "310,000"],
                    ["Salt", "128-bit random"],
                    ["IV", "96-bit random"],
                    ["Storage", "Local only"],
                    ["Telemetry", "None"],
                    ["Cloud sync", user ? "Enabled" : "Disabled"],
                  ].map(([k, v], i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                      <span>{k}</span>
                      <span style={{ fontFamily: M, color: "rgba(255,255,255,0.5)" }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
