const HOUR = 3600000;
const disruption = /\b(evacuat\w*|shelter.in.place|lockdown|outage|blackout|boil.water|contaminat\w*|road closure|roads? closed|transit.{0,20}(?:suspend|disrupt)|public safety (?:alert|warning)|severe.{0,20}warning|flood warning|wildfire|shooting|hazardous spill)\b/i;
const resolved = /\b(lifted|resolved|restored|reopened|all.clear|cancelled|canceled|ended|no longer|drill|exercise|anniversary)\b/i;

// A recent report about disruption is a reading priority, not a live alert.
export function newsPriority(article, now = Date.now()) {
  const date = Date.parse(article.publishedAt || article.observedAt);
  return Number.isFinite(date) && date <= now + HOUR && date >= now - 72 * HOUR && disruption.test(article.title || '') && !resolved.test(article.title || '') ? 1 : 0;
}

export function priorityBriefing(articles, now = Date.now()) {
  const ordered = [...articles].sort((a, b) => newsPriority(b, now) - newsPriority(a, now) || (Date.parse(b.publishedAt || b.observedAt) || 0) - (Date.parse(a.publishedAt || a.observedAt) || 0));
  const near = ordered.filter(article => ['local', 'regional'].includes(article.relevance?.scope));
  const wider = ordered.filter(article => ['national', 'macro'].includes(article.relevance?.scope));
  const chosen = [...near.slice(0, 2), ...wider.slice(0, 1)];
  for (const article of ordered) { if (chosen.length === 3) break; if (!chosen.includes(article)) chosen.push(article); }
  return chosen;
}
