// Coarse, user-selected place labels only. Never accept provider queries or URLs.
const ISO_COUNTRIES = new Set(('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' '));
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });

function placeLabel(value, required) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string') throw new Error('Choose a city, region and country from your saved locations.');
  const label = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  // Quoted exact phrases prevent place names such as And from becoming operators.
  if ((!label && required) || label.length > 80 || (label && !/^[\p{L}\p{M}\p{N} .,’'-]+$/u.test(label)) || (label && !/\p{L}/u.test(label))) throw new Error('Use a valid city or region name of up to 80 characters.');
  return label;
}

export function readBriefingLocation(query = {}) {
  const keys = Object.keys(query);
  if (!keys.length) return null;
  if (keys.some(key => !['city', 'region', 'countryCode'].includes(key))) throw new Error('Only city, region and countryCode are supported for this briefing.');
  const city = placeLabel(query.city, true);
  const region = placeLabel(query.region, false);
  const countryCode = typeof query.countryCode === 'string' ? query.countryCode.trim().toUpperCase() : '';
  if (!ISO_COUNTRIES.has(countryCode)) throw new Error('Choose a valid two-letter country code for this location.');
  return { city, region, countryCode };
}

export const briefingLocationKey = location => location ? JSON.stringify([location.city.toLocaleLowerCase('en'), location.region.toLocaleLowerCase('en'), location.countryCode]) : 'global';
export const briefingCountryName = countryCode => countryNames.of(countryCode);
