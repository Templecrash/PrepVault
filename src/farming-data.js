const CROP_FAMILIES = {
    nightshade: { crops: ["tomato","pepper","eggplant","potato"], icon: "🍅", label: "Nightshade", color: "#ef4444" },
    legume: { crops: ["beans","peas"], icon: "🫘", label: "Legume", color: "#22c55e" },
    brassica: { crops: ["broccoli","cabbage","cauliflower","kale"], icon: "🥦", label: "Brassica", color: "#3b82f6" },
    allium: { crops: ["onion","garlic"], icon: "🧅", label: "Allium", color: "#f59e0b" },
    cucurbit: { crops: ["cucumber","zucchini","winter_squash","watermelon"], icon: "🥒", label: "Cucurbit", color: "#8b5cf6" },
    root: { crops: ["carrot","beet","radish","potato"], icon: "🥕", label: "Root", color: "#f97316" },
    leafy: { crops: ["lettuce","spinach","celery"], icon: "🥬", label: "Leafy", color: "#10b981" },
    herb: { crops: ["basil","cilantro","parsley","dill","mint","rosemary"], icon: "🌿", label: "Herb", color: "#84cc16" },
  };
const ROTATION_RECS = {
    nightshade: { next: "legume", reason: "Legumes fix nitrogen depleted by heavy-feeding nightshades" },
    legume: { next: "brassica", reason: "Brassicas benefit from nitrogen fixed by legumes" },
    brassica: { next: "root", reason: "Deep roots break up soil compacted by brassicas" },
    root: { next: "cucurbit", reason: "Cucurbits thrive in loosened soil from root crops" },
    cucurbit: { next: "allium", reason: "Alliums repel pests that build up under cucurbits" },
    allium: { next: "leafy", reason: "Light feeders follow moderate feeders" },
    leafy: { next: "nightshade", reason: "Restarts cycle \u2014 heavy feeders in refreshed soil" },
    herb: { next: "nightshade", reason: "Herbs are flexible; heavy feeders can follow" },
  };
const getCropFamily = cropId => Object.keys(CROP_FAMILIES).find(family => CROP_FAMILIES[family].crops.includes(cropId)) || null;
const ANIMAL_TYPES = {
    chicken: { icon: "🐔", gestation: 21, feedLbs: 0.25, label: "Chickens" },
    goat: { icon: "🐐", gestation: 150, feedLbs: 4, label: "Goats" },
    cow: { icon: "🐄", gestation: 283, feedLbs: 25, label: "Cattle" },
    pig: { icon: "🐖", gestation: 114, feedLbs: 6, label: "Pigs" },
    sheep: { icon: "🐑", gestation: 152, feedLbs: 3.5, label: "Sheep" },
    rabbit: { icon: "🐇", gestation: 31, feedLbs: 0.25, label: "Rabbits" },
    duck: { icon: "🦆", gestation: 28, feedLbs: 0.35, label: "Ducks" },
    turkey: { icon: "🦃", gestation: 28, feedLbs: 0.5, label: "Turkeys" },
    horse: { icon: "🐴", gestation: 340, feedLbs: 20, label: "Horses" },
    bee: { icon: "🐝", gestation: 0, feedLbs: 0, label: "Bees" },
  };

export { CROP_FAMILIES, ROTATION_RECS, ANIMAL_TYPES, getCropFamily };
