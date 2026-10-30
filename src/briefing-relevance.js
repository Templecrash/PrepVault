const PLACE_NAME = /^[\p{L}\p{M}\p{N} .,’'-]+$/u;
export function normalizeBriefingLocation(value) {
  if (!value) return null;
  const city = String(value.city ?? value.name ?? '').normalize('NFC').trim();
  const region = String(value.region ?? '').normalize('NFC').trim();
  const countryCode = String(value.countryCode ?? '').toUpperCase();
  if (city.length < 2 || city.length > 80 || region.length > 80 || !PLACE_NAME.test(city) || (region && !PLACE_NAME.test(region)) || !/^[A-Z]{2}$/.test(countryCode)) throw new Error('Choose a city from your watchlist to focus the news.');
  return { city: city.replace(/ +/g, ' '), region: region.replace(/ +/g, ' '), countryCode };
}
export function briefingLocationKey(value) {
  const location = normalizeBriefingLocation(value);
  return location ? JSON.stringify([location.city.toLocaleLowerCase('en'), location.region.toLocaleLowerCase('en'), location.countryCode]) : 'global';
}

const words = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const mentions = (text, phrase) => Boolean(phrase && ` ${words(text)} `.includes(` ${words(phrase)} `));
const COUNTRY_WORDS = {
  CA: ['Canada', 'Canadian', 'Canadians'], US: ['United States', 'US', 'U.S.', 'USA', 'American', 'Americans'],
  GB: ['United Kingdom', 'UK', 'U.K.', 'Britain', 'British', 'England', 'Scotland', 'Wales'],
  JP: ['Japan', 'Japanese'], AU: ['Australia', 'Australian'], NZ: ['New Zealand'],
};
const scopeOrder = { local: 0, regional: 1, national: 2, macro: 3 };
const geographicImpact = topics => topics.includes('public-safety') ? 'Check the police or city notice for the affected streets and current instructions.'
  : topics.includes('food-water') ? 'Check whether this changes your water use, food availability or stored supplies.'
  : topics.includes('infrastructure') ? 'Check your backup power, communications and transport plans against the reported disruption.'
    : topics.includes('disasters') ? 'Check official local instructions and whether your routes or property are affected.'
      : topics.includes('health') ? 'Check the applicable public-health notice and your household’s essential supplies.'
        : topics.includes('conflict') ? 'Follow official security and travel guidance for the affected area.'
          : 'Compare the reported guidance with your household supplies and emergency plan.';

function widerImpact(article, text) {
  // Only include a distant story when its text identifies a plausible route to
  // household disruption. These are planning considerations, not local alerts.
  const disruption = /\b(disrupt\w*|shortage|outage|attack|war|conflict|strike|closure|closed|blockade|crisis|ban|surge|rise|rising|sanctions|tariffs|threat|escalat\w*)\b/i.test(text);
  if (/\b(hormuz|suez|panama canal|red sea)\b/i.test(text) && disruption) return {
    reason: 'The report concerns a major international shipping route.',
    impact: 'Disruption could affect fuel prices and deliveries. Check availability before relying on a resupply.',
  };
  const energyMarket = /\b(global|international|exports?|imports?|markets?|barrel|opec|crude)\b|\b(oil|energy)\b.{0,35}\bprices?\b|\bprices?\b.{0,35}\b(oil|energy)\b/i.test(text);
  if (energyMarket && /\b(oil|gas|fuel|energy)\b.{0,65}\b(prices?|shortage|suppl\w*|crisis|exports?|markets?)\b|\b(prices?|shortage|crisis|exports?)\b.{0,65}\b(oil|gas|fuel|energy)\b/i.test(text) && disruption) return {
    reason: 'The report describes energy prices, supply or export disruption.',
    impact: 'This could affect heating, transport or generator fuel costs and availability; a local shortage is not confirmed.',
  };
  if (/\b(global|worldwide|international|cross.border|exports?|imports?|trade|tariffs)\b/i.test(text) && /\b(food|grain|wheat|fertili[sz]er|supply chain|shipping|freight|trade)\b/i.test(text) && disruption) return {
    reason: 'The report links disruption to international trade or essential supplies.',
    impact: 'Watch for food-price changes or delivery delays that could affect your next resupply.',
  };
  if (/\b(global|worldwide|international|cross.border|widespread|multiple countries)\b/i.test(text) && /\b(cyberattack|cyber attack|ransomware|internet|telecom\w*|satellite|gps|banking|payment|cloud)\b/i.test(text) && disruption) return {
    reason: 'The report describes disruption to widely used digital services.',
    impact: 'Check whether your communications or payment providers are affected and keep offline alternatives available.',
  };
  if (/\b(public health emergency of international concern|global health emergency)\b/i.test(text) || /\bpandemic\b/i.test(text) && /\b(declar\w*|spread\w*|outbreak|warning|surge|cases)\b/i.test(text)) return {
    reason: 'The report concerns an international public-health issue.',
    impact: 'Check current advice from your own public-health authority; this report alone does not establish a local outbreak.',
  };
  if (article.topics?.includes('conflict') && /\b(nuclear (?:threat|attack|strike|war)|world war|military escalation|military invasion|full.scale invasion|war expands|regional war)\b|\bnato\b.{0,45}\b(threat\w*|war|attack|strike|escalat\w*)\b/i.test(text)) return {
    reason: 'The report concerns wider military or nuclear security developments.',
    impact: 'Monitor official travel guidance and energy or supply-chain developments. No direct local threat is inferred.',
  };
  return null;
}

export function articleRelevance(article, locationValue) {
  const location = normalizeBriefingLocation(locationValue);
  let title = article.title || '';
  // A publisher named "CityNews Ottawa" does not put an overseas event in Ottawa.
  for (const separator of [' - ', ' – ', ' — ']) {
    const suffix = `${separator}${article.source || ''}`;
    if (article.source && title.toLowerCase().endsWith(suffix.toLowerCase())) title = title.slice(0, -suffix.length);
  }
  const text = `${title} ${article.summary || ''}`;
  const topics = article.topics || [];
  if (!topics.length) return null;
  if (/\b(call for recognition|award ceremony|demand transparency|actuarial modelling|model forecasts|modelling supports|visits .{0,40} for discussions|alien invasion|home invasion|pandemic.era|film review|science fiction|fictional|video game)\b/i.test(text)) return null;
  if (location) {
    const countries = article.countries || [];
    let countryName = '';
    try { countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(location.countryCode); } catch { /* Country code remains usable. */ }
    const aliases = COUNTRY_WORDS[location.countryCode] || [countryName];
    // Avoid treating the ordinary English pronoun "us" as US geographic evidence.
    const explicitCountryMatch = aliases.filter(value => value !== 'US').some(value => mentions(text, value)) || (location.countryCode === 'US' && /\bUS\b/.test(text));
    const countryMatch = countries.includes(location.countryCode) || explicitCountryMatch;
    const cityMatch = mentions(text, location.city);
    const regionMatch = location.region && mentions(text, location.region);
    const retrievalMatches = article.retrievalCountryCode === location.countryCode;
    const foreignPolicyOnly = /\b(statement|minister|ambassador|diplomat\w*|pledges?|donat\w*|condemn\w*|humanitarian aid|humanitarian assistance)\b/i.test(text)
      && countries.some(code => code !== location.countryCode) && !/\b(domestic|nationwide|across the country|at home)\b/i.test(text);
    const conflictingCountry = countries.length > 0 && !countryMatch && !(regionMatch && retrievalMatches);
    if (cityMatch && !foreignPolicyOnly && !conflictingCountry && (regionMatch || countryMatch || retrievalMatches)) return {
      scope: 'local', label: location.city, reason: `The report mentions ${location.city} in the context of your selected area.`, impact: geographicImpact(topics),
    };
    if (regionMatch && !foreignPolicyOnly && !conflictingCountry && (countryMatch || retrievalMatches)) return {
      scope: 'regional', label: location.region, reason: `The report mentions ${location.region}; confirm whether it applies to ${location.city}.`, impact: geographicImpact(topics),
    };
    if (!foreignPolicyOnly && article.retrievalEvidence === 'regional-feed' && retrievalMatches && !conflictingCountry && !explicitCountryMatch && location.region && words(article.retrievalRegion) === words(location.region)) return {
      scope: 'regional', label: `${location.region} coverage`, reason: `From regional reporting for ${location.region}; the story may concern another community in the region.`, impact: geographicImpact(topics),
    };
    if (countryMatch && !foreignPolicyOnly && (explicitCountryMatch || /\b(nationwide|across the country|national warning|federal warning)\b/i.test(text))) return {
      scope: 'national', label: countryName || location.countryCode, reason: `The report mentions ${countryName || location.countryCode}. Check its stated coverage for your area.`, impact: geographicImpact(topics),
    };
  }
  const impact = widerImpact(article, text);
  return impact ? { scope: 'macro', label: 'Wider effects', ...impact } : null;
}

export function selectRelevantBriefing(articles, location, { topic = 'all', scope = 'all' } = {}) {
  const seen = new Set();
  return articles.flatMap(article => {
    if (topic !== 'all' && !article.topics?.includes(topic)) return [];
    const relevance = articleRelevance(article, location);
    if (!relevance || (scope !== 'all' && !(scope === 'local' ? ['local', 'regional'].includes(relevance.scope) : relevance.scope === scope))) return [];
    const identity = words(article.title).replace(/ (?:cbc news|reuters|associated press)$/, '');
    if (seen.has(identity)) return [];
    seen.add(identity); return [{ ...article, relevance }];
  }).sort((a, b) => scopeOrder[a.relevance.scope] - scopeOrder[b.relevance.scope]
    || (Date.parse(b.publishedAt || b.observedAt) || 0) - (Date.parse(a.publishedAt || a.observedAt) || 0));
}
