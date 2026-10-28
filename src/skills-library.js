// Short, original reading prompts. Full instructions remain with the named publishers.
// Linked websites are not bundled or downloaded by the Skills page.
export const SKILLS_REVIEWED_AT = '2026-10-28';
export const SKILL_CONTEXTS = { 'bug-in': 'Bug in', 'bug-out': 'Bug out' };
export const SKILL_LEVELS = { beginner: 'Beginner', practice: 'Practice first', training: 'Training required' };
export const SKILL_CATEGORIES = {
  'fire-warmth': 'Fire & warmth',
  'first-aid': 'First aid',
  water: 'Water',
  food: 'Food',
  'shelter-building': 'Shelter & building',
  navigation: 'Navigation',
  communication: 'Communication',
  evacuation: 'Evacuation',
  power: 'Power',
  sanitation: 'Sanitation',
  weather: 'Severe weather',
};

const source = (publisher, title, url) => ({ publisher, title, url, checkedAt: SKILLS_REVIEWED_AT });
const npsEssentials = source('National Park Service', 'Ten Essentials', 'https://www.nps.gov/articles/10essentials.htm');

export const SURVIVAL_SKILLS = [
  {
    id: 'make-fire', title: 'Start and extinguish a campfire', category: 'fire-warmth', icon: 'sun',
    contexts: ['bug-out'], level: 'practice',
    description: 'Build a small cooking or warming fire where fires are permitted.',
    checklist: [
      'Check restrictions; keep water ready and gear away.',
      'Arrange dry kindling and wood with air gaps; light the firestarter.',
      'Keep it small and attended. Douse and stir until completely cold.',
    ],
    caution: 'Use a designated outdoor fire area. Never light a campfire inside a tent or building; avoid gasoline and other accelerants.',
    sources: [source('National Park Service', 'Campfires: building, tending and extinguishing', 'https://www.nps.gov/articles/campfires.htm')],
    handbookIds: ['cert-basic-training'], keywords: ['make fire', 'firemaking', 'tinder', 'matches', 'lighter', 'cooking', 'wood'],
  },
  {
    id: 'stay-warm', title: 'Stay warm and recognize hypothermia', category: 'fire-warmth', icon: 'sun',
    contexts: ['bug-in', 'bug-out'], level: 'beginner',
    description: 'Recognize cold stress and protect someone while help is coming.',
    checklist: [
      'Treat confusion, slurred speech or severe cold exposure as urgent; call emergency services.',
      'Move into shelter and replace wet clothing with dry layers.',
      'Warm the body’s centre; handle the person gently.',
    ],
    caution: 'Hypothermia is a medical emergency. Never give drinks to an unconscious person. Read the full guidance before choosing a warming method.',
    sources: [source('CDC', 'Preventing Hypothermia', 'https://www.cdc.gov/winter-weather/prevention/index.html')],
    handbookIds: ['are-you-ready'], keywords: ['cold', 'winter', 'insulation', 'blankets', 'exposure'],
  },
  {
    id: 'stop-bleeding', title: 'Control life-threatening bleeding', category: 'first-aid', icon: 'plus',
    contexts: ['bug-in', 'bug-out'], level: 'training',
    description: 'Immediate first aid, with hands-on instruction for tourniquets and wound packing.',
    checklist: [
      'Make sure the scene is safe; call emergency services.',
      'Use gloves if available and press firmly on the wound with a dressing.',
      'Maintain pressure and monitor breathing and responsiveness until help arrives.',
    ],
    caution: 'Begin direct pressure promptly. Tourniquets and wound packing need training; follow the emergency dispatcher. Do not pull out an embedded object—apply pressure around it.',
    sources: [source('American Red Cross', 'Life-threatening external bleeding', 'https://www.redcross.org/take-a-class/resources/learn-first-aid/bleeding-life-threatening-external')],
    handbookIds: ['cert-basic-training'], keywords: ['stop bleeding', 'blood', 'hemorrhage', 'haemorrhage', 'trauma', 'tourniquet', 'bandage'],
  },
  {
    id: 'protect-wounds', title: 'Clean and protect minor wounds', category: 'first-aid', icon: 'plus',
    contexts: ['bug-in', 'bug-out'], level: 'beginner',
    description: 'Reduce infection risk when normal services and clean water are limited.',
    checklist: [
      'Wash a minor open wound with soap and clean water.',
      'Cover it with a clean, waterproof bandage.',
      'Keep it out of floodwater; get prompt care for redness, swelling or drainage.',
    ],
    caution: 'Severe bleeding, deep wounds, bites and embedded objects need medical care. This checklist is for minor wounds only.',
    sources: [source('CDC', 'Personal hygiene during an emergency: protect wounds', 'https://www.cdc.gov/water-emergency/safety/guidelines-for-personal-hygiene-during-an-emergency.html')],
    handbookIds: ['emergency-wound-care'], keywords: ['cuts', 'scrapes', 'infection', 'bandages'],
  },
  {
    id: 'safe-water', title: 'Make drinking water safer', category: 'water', icon: 'water',
    contexts: ['bug-in', 'bug-out'], level: 'practice',
    description: 'Choose safe water and understand what boiling can and cannot remove.',
    checklist: [
      'Use safe bottled water when available.',
      'For germs: clarify cloudy water, then boil for 1 minute; 3 minutes above 6,500 ft / 1,981 m.',
      'Cool and store in sanitized, covered containers.',
    ],
    caution: 'Boiling or disinfecting cannot make fuel-, chemical- or radioactive-contaminated water safe. Use another source. Follow local advisories and the full guide for treatment options.',
    sources: [source('CDC', 'How to Make Water Safe in an Emergency', 'https://www.cdc.gov/water-emergency/about/')],
    handbookIds: ['emergency-drinking-water'], keywords: ['purify', 'purification', 'filter', 'boil', 'disinfect', 'hydration'],
  },
  {
    id: 'food-outage', title: 'Keep food safe during an outage', category: 'food', icon: 'ration',
    contexts: ['bug-in', 'bug-out'], level: 'beginner',
    description: 'Use temperatures and time to decide what can be kept.',
    checklist: [
      'Keep refrigerator and freezer doors closed.',
      'An unopened fridge stays cold about 4 hours; check food temperatures.',
      'Use the FDA’s discard guidance. Never rely on appearance or smell to judge safety.',
    ],
    caution: 'Cooking does not make improperly stored food reliably safe. Do not eat food that contacted floodwater; consult the guide for sealed-container exceptions.',
    sources: [source('FDA', 'Food and Water Safety During Power Outages and Floods', 'https://www.fda.gov/food/buy-store-serve-safe-food/food-and-water-safety-during-power-outages-and-floods')],
    handbookIds: ['food-water-emergencies'], keywords: ['refrigerator', 'freezer', 'cooking', 'perishable', 'food poisoning'],
  },
  {
    id: 'temporary-shelter', title: 'Prepare a temporary shelter', category: 'shelter-building', icon: 'home',
    contexts: ['bug-out'], level: 'practice',
    description: 'Plan a tent or tarp setup, bedding and protection from weather.',
    checklist: [
      'Choose a tent and sleeping bag suited to the expected weather.',
      'Place a sleeping pad beneath your bedding.',
      'Where permitted, use rope and a tarp as a rain shelter or wind screen.',
    ],
    caution: 'Practice your shelter setup before relying on it. A tarp or tent does not provide tornado protection; follow severe-weather shelter guidance.',
    sources: [source('National Park Service', 'Camping: shelter and bedding', 'https://www.nps.gov/subjects/camping/what-to-bring.htm')],
    handbookIds: ['are-you-ready'], keywords: ['build', 'building', 'bivy', 'tent', 'tarp', 'rope', 'camping'],
  },
  {
    id: 'repair-kit', title: 'Prepare for basic equipment repairs', category: 'shelter-building', icon: 'settings',
    contexts: ['bug-in', 'bug-out'], level: 'practice',
    description: 'Assemble tools for repairing the equipment you actually carry.',
    checklist: [
      'Pack repair tape, scissors and a suitable multi-tool.',
      'Add tools specific to your equipment and trip.',
      'Keep equipment instructions with the kit and practise routine repairs before departure.',
    ],
    caution: 'Use the equipment maker’s repair instructions. Structural, gas and electrical repairs require appropriate qualified help.',
    sources: [npsEssentials],
    handbookIds: ['are-you-ready'], keywords: ['build', 'fix', 'tools', 'maintenance', 'duct tape', 'knife'],
  },
  {
    id: 'safe-room', title: 'Plan a storm safe room', category: 'shelter-building', icon: 'home',
    contexts: ['bug-in'], level: 'training',
    description: 'Find FEMA’s engineered construction plans for a home or small business.',
    checklist: [
      'Review the full FEMA P-320 design and site criteria.',
      'Discuss local hazards and permits with a qualified designer and building official.',
      'Use the specified materials, connections and tested door assembly.',
    ],
    caution: 'This is a planned construction project with professional design and building oversight. An improvised reinforced room is not equivalent to a compliant safe room.',
    sources: [source('FEMA', 'Taking Shelter from the Storm · FEMA P-320 (2021)', 'https://www.fema.gov/sites/default/files/documents/fema_taking-shelter-from-the-storm_p-320.pdf')],
    handbookIds: ['are-you-ready'], keywords: ['build', 'building', 'construction', 'plans', 'storm cellar', 'tornado'],
  },
  {
    id: 'navigate', title: 'Navigate with a map and compass', category: 'navigation', icon: 'compass',
    contexts: ['bug-out'], level: 'practice',
    description: 'Prepare navigation tools that do not depend on a live phone connection.',
    checklist: [
      'Carry a physical map and compass; learn to use them.',
      'Download maps before leaving.',
      'Carry spare power for electronic navigation and check the route before setting out.',
    ],
    caution: 'A downloaded map does not confirm current road or trail access. Practise navigation in familiar terrain before relying on it during an evacuation.',
    sources: [npsEssentials],
    handbookIds: ['are-you-ready'], keywords: ['directions', 'GPS', 'offline maps', 'route', 'orientation'],
  },
  {
    id: 'communications', title: 'Reconnect when networks are busy', category: 'communication', icon: 'radio',
    contexts: ['bug-in', 'bug-out'], level: 'beginner',
    description: 'Give your household a simple contact and meeting plan.',
    checklist: [
      'Write down contacts and meeting places; give everyone a copy.',
      'Choose an out-of-town contact.',
      'Practise short check-in texts stating your safety and location; keep a battery-powered radio for alerts.',
    ],
    caution: 'A communication plan needs a fallback when networks fail. Arrange meeting places and check-ins before an emergency.',
    sources: [source('FEMA / Ready.gov', 'Family Emergency Communication Plan', 'https://www.ready.gov/sites/default/files/2020-03/family-emergency-communication-planning-document.pdf')],
    handbookIds: ['are-you-ready'], keywords: ['radio', 'phone', 'text', 'contacts', 'signal', 'family'],
  },
  {
    id: 'evacuate', title: 'Leave safely with a go-bag', category: 'evacuation', icon: 'map',
    contexts: ['bug-out'], level: 'beginner',
    description: 'Prepare the decisions, supplies and routes needed for an orderly departure.',
    checklist: [
      'Follow evacuation instructions and the routes authorities specify.',
      'Take your kit, medications, identification, phone and pets.',
      'Tell your contact where you are going when safe; return only when authorities permit.',
    ],
    caution: 'Do not cross floodwater on foot or by vehicle. Plan accessible transport and support for everyone in your household ahead of time.',
    sources: [source('Public Safety Canada', 'Pocket Guide to Emergencies: evacuation orders', 'https://www.getprepared.gc.ca/cnt/rsrcs/pblctns/pcktgdtmrgncs/')],
    handbookIds: ['are-you-ready'], keywords: ['bugout', 'bug out bag', 'get home', 'leave', 'escape', 'go bag'],
  },
  {
    id: 'generator-co', title: 'Use backup power without CO exposure', category: 'power', icon: 'bolt',
    contexts: ['bug-in', 'bug-out'], level: 'practice',
    description: 'Position fuel-burning equipment safely and recognize the role of CO alarms.',
    checklist: [
      'Run generators outdoors, at least 6 m / 20 ft from buildings.',
      'Direct exhaust away from openings.',
      'Use working carbon monoxide alarms; if an alarm sounds, get outside and call emergency services.',
    ],
    caution: 'Never run a fuel-burning generator in a house, garage or shed. Keep outdoor fuel-burning cooking and heating equipment outside, too.',
    sources: [source('Health Canada', 'Carbon monoxide: preventing exposure', 'https://www.canada.ca/en/health-canada/services/air-quality/pollutants/carbon-monoxide/preventing-exposure.html')],
    handbookIds: ['generator-safety'], keywords: ['electricity', 'generator', 'carbon monoxide', 'CO', 'heating', 'outage'],
  },
  {
    id: 'sanitation', title: 'Maintain hygiene with limited water', category: 'sanitation', icon: 'water',
    contexts: ['bug-in', 'bug-out'], level: 'beginner',
    description: 'Set up handwashing and keep drinking water separate from waste.',
    checklist: [
      'Use a clean water jug as a temporary handwashing station.',
      'Wash with soap and safe water for 20 seconds.',
      'Without soap and water, use at least 60% alcohol sanitizer; follow local sanitation advice.',
    ],
    caution: 'Sanitizer is less effective on visibly dirty hands and does not remove all germs or chemicals. Never bathe in sewage-contaminated water.',
    sources: [source('CDC', 'Guidelines for Personal Hygiene During an Emergency', 'https://www.cdc.gov/water-emergency/safety/guidelines-for-personal-hygiene-during-an-emergency.html')],
    handbookIds: ['emergency-drinking-water', 'disaster-response-safety'], keywords: ['toilet', 'waste', 'sewage', 'handwashing', 'cleaning'],
  },
  {
    id: 'storm-shelter', title: 'Choose shelter during a tornado', category: 'weather', icon: 'shield',
    contexts: ['bug-in', 'bug-out'], level: 'beginner',
    description: 'Know where to go before a severe-weather warning arrives.',
    checklist: [
      'Go to your designated shelter when a tornado warning is issued.',
      'Use a basement or a small interior room on the lowest floor of a sturdy building.',
      'Avoid windows and protect your head.',
    ],
    caution: 'Mobile homes and vehicles are poor tornado shelters. Identify a sturdy shelter in advance. Different hazards require different shelter choices; follow local instructions.',
    sources: [source('National Weather Service', 'What to do During a Tornado', 'https://www.weather.gov/safety/tornado-during')],
    handbookIds: ['are-you-ready'], keywords: ['storm', 'weather', 'wind', 'warning', 'shelter in place'],
  },
  {
    id: 'safe-cleanup', title: 'Assess damage before cleanup', category: 'shelter-building', icon: 'settings',
    contexts: ['bug-in'], level: 'training',
    description: 'Identify when to stay out and what protection cleanup requires.',
    checklist: [
      'Stay out of damaged buildings until officials confirm they are safe.',
      'Leave if you smell gas or hear structural movement.',
      'Use appropriate protective equipment; never use electrical tools while standing in water.',
    ],
    caution: 'Do not attempt structural, gas or electrical repairs without qualified help. Damaged structures and contaminated floodwater can remain hazardous after a storm.',
    sources: [source('CDC', 'Prevent getting hurt or sick after a disaster', 'https://www.cdc.gov/natural-disasters/response/')],
    handbookIds: ['disaster-response-safety', 'cert-basic-training'], keywords: ['repair', 'rebuild', 'building', 'flood', 'debris', 'mold', 'cleanup'],
  },
];

export function filterSurvivalSkills({ query = '', category = 'all', context = 'all', level = 'all' } = {}) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return SURVIVAL_SKILLS.filter(skill => {
    if (category !== 'all' && skill.category !== category) return false;
    if (context !== 'all' && !skill.contexts.includes(context)) return false;
    if (level !== 'all' && skill.level !== level) return false;
    const searchable = [skill.title, skill.description, SKILL_CATEGORIES[skill.category], SKILL_LEVELS[skill.level], ...skill.contexts.map(value => SKILL_CONTEXTS[value]), ...skill.keywords, ...skill.checklist, skill.caution, ...skill.sources.map(item => `${item.publisher} ${item.title}`)].join(' ').toLowerCase();
    return terms.every(term => searchable.includes(term));
  });
}
