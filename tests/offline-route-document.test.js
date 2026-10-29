import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { routeToOfflineHtml } from '../src/offline-route-document.js';
import { planTravelDays } from '../src/offline-route.js';

const makePlan = (changes = {}) => ({ id: 'offline-1', name: 'The cabin walk', savedAt: '2026-10-28T12:00:00Z', travel: { hoursPerDay: 6, walkingSpeed: 4, drivingHours: 6, breakMinutes: 15 }, route: { mode: 'walk', walkingSpeed: 4, points: [{ name: 'Home', latitude: 0, longitude: 0 }, { name: 'Cabin', latitude: 0, longitude: .2 }], coordinates: [[0, 0], [.1, 0], [.2, 0]], instructions: [{ text: 'Walk east toward the cabin.', distanceKm: 40, timeSeconds: 36_000 }], avoidAreas: [], warnings: ['Saved directions exclude live closures.'], distanceKm: 40, durationSeconds: 36_000, calculatedAt: '2026-10-28T11:00:00Z' }, ...changes });

test('offline document is standalone with zero scripts, remote assets or active forms', () => {
  const html = routeToOfflineHtml(makePlan()); const $ = load(html);
  assert.equal($('script,link,img,iframe,object,embed,video,audio,source,form,base').length, 0);
  assert.equal($('[src],[srcset],[poster]').length, 0);
  assert.doesNotMatch($('style').text(), /@import|url\(/i);
  assert.ok($('style').text().length > 0);
  assert.equal($('svg .route-line').length, 1);
  const csp = $('meta[http-equiv="Content-Security-Policy"]').attr('content');
  for (const directive of ["default-src 'none'", "style-src 'unsafe-inline'", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.includes(directive));
  assert.ok($('*').toArray().every(element => Object.keys(element.attribs || {}).every(name => !/^on/i.test(name))));
  assert.match($('body').text(), /No sign-in, JavaScript or internet connection is needed/);
  assert.match($('figcaption').text(), /without a street basemap/);
});

test('all user names, provider instructions, warnings and avoidance labels render as text', () => {
  const malicious = '</style><script>alert(1)</script><img src=x onerror="evil()"> & "private"';
  const plan = makePlan(); plan.name = malicious; plan.route.points[0].name = malicious; plan.route.instructions[0].text = malicious; plan.route.warnings = [malicious];
  plan.route.avoidAreas = [{ name: malicious, latitude: .5, longitude: .5, radiusKm: 2 }];
  const html = routeToOfflineHtml(plan); const $ = load(html);
  assert.equal($('script,img').length, 0);
  assert.equal($('h1').text(), malicious);
  assert.equal($('li[data-direction="1"] p').text(), malicious);
  assert.equal($('tr[data-waypoint="1"] td').eq(1).text(), malicious);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal($('svg .map-waypoint title').first().text(), malicious);
  assert.ok($('body').text().includes(malicious));
});

test('daily stops, route markers and total rest time match the saved travel plan', () => {
  const plan = makePlan(), itinerary = planTravelDays(plan.route, plan.travel), $ = load(routeToOfflineHtml(plan));
  assert.equal($('tr[data-day-stop]').length, itinerary.days);
  assert.equal($('svg .map-day-stop').length, itinerary.stops.filter(stop => !stop.isDestination).length);
  assert.equal($('svg .map-waypoint').length, plan.route.points.length);
  assert.equal($('tr[data-destination="true"]').length, 1);
  assert.match($('tr[data-destination="true"]').text(), /Arrive at destination.*40 km.*0\.00000, 0\.20000/s);
  assert.ok($('.summary').text().includes('12h 30m'));
  assert.ok($('.pace').text().includes('2h 30m'));
  assert.ok($('.pace').text().includes('4 km/h'));
  assert.equal($('li[data-direction]').length, plan.route.instructions.length);
});

test('date-line projection unwraps saved geometry and keeps overnight markers on the short route', () => {
  const plan = makePlan(); plan.route.points = [{ name: 'West', latitude: 0, longitude: 179 }, { name: 'East', latitude: 0, longitude: -179 }]; plan.route.coordinates = [[179, 0], [-180, 0], [-179, 0]]; plan.route.distanceKm = 80; plan.travel = { ...plan.travel, hoursPerDay: 10, breakMinutes: 0 };
  const $ = load(routeToOfflineHtml(plan));
  const projected = $('.route-line').attr('points').split(' ').map(pair => pair.split(',').map(Number));
  assert.equal(projected.length, 3);
  assert.ok(projected[0][0] < projected[1][0] && projected[1][0] < projected[2][0]);
  assert.ok(projected.every(([x, y]) => x >= 40 && x <= 860 && y >= 40 && y <= 420));
  const midpoint = $('.map-day-stop').attr('transform').match(/translate\(([\d.]+) ([\d.]+)\)/).slice(1).map(Number);
  assert.ok(Math.abs(midpoint[0] - projected[1][0]) < .01);
  assert.match($('tr[data-day-stop="1"]').text(), /-180\.00000/);
});

test('invalid plans and travel settings cannot generate a misleading offline document', () => {
  assert.throws(() => routeToOfflineHtml(makePlan({ travel: { walkingSpeed: 0 } })));
  const incomplete = makePlan(); incomplete.route.instructions = [];
  assert.throws(() => routeToOfflineHtml(incomplete));
  const malformed = makePlan(); malformed.route.coordinates[0] = ['<script>', 0];
  assert.throws(() => routeToOfflineHtml(malformed));
});

test('driving export uses driving hours and provider duration rather than walking speed', () => {
  const plan = makePlan(); plan.route.mode = 'drive'; plan.route.distanceKm = 600; plan.route.durationSeconds = 43_200; plan.travel = { ...plan.travel, drivingHours: 6, hoursPerDay: 1, breakMinutes: 0 };
  const $ = load(routeToOfflineHtml(plan));
  assert.ok($('.pace').text().includes('Driving budget6 hours / day'));
  assert.equal($('tr[data-day-stop]').length, 2);
  assert.ok($('.summary').text().includes('12h 0m'));
  assert.doesNotMatch($('.pace').text(), /Walking speed/);
});

test('cycling export shows cycling pace and its own budget while retaining mapped time', () => {
  const plan = makePlan(); plan.name = 'Cycle to the cabin'; plan.route.mode = 'bike'; plan.route.cyclingSpeed = 15; plan.route.distanceKm = 120; plan.route.durationSeconds = 36_000;
  plan.travel = { ...plan.travel, cyclingHours: 5, cyclingSpeed: 10, drivingHours: 12, hoursPerDay: 1, breakMinutes: 0 };
  const $ = load(routeToOfflineHtml(plan));
  assert.match($('.subtitle').text(), /Cycling/); assert.match($('.pace').text(), /Cycling budget5 hours \/ day/);
  assert.match($('.pace').text(), /Cycling pace10 km\/h/); assert.doesNotMatch($('.pace').text(), /Driving|Walking/);
  assert.equal($('tr[data-day-stop]').length, 3); assert.equal($('tr[data-destination="true"]').length, 1);
  assert.match($('.summary').text(), /15h 0m/); assert.match($('body').text(), /Cycling pace changes scale the mapped movement estimate/);
});
