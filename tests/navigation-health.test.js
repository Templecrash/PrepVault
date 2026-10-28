import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNavigationHealth } from '../src/navigation-health.js';

const food = (days, extra = {}) => ({id:'food',category:'food',subType:'cannedGoods',quantity:days,fields:{calories:2000,servings:1},...extra});
const water = (days, extra = {}) => ({id:'water',category:'water',subType:'storedWater',quantity:days,fields:{capacity:100},...extra});
const build = (items, rest = {}) => buildNavigationHealth({items,peopleCount:1,dailyCalTarget:2000,...rest});

test('food and water follow their own full-day thresholds', () => {
  for (const [days, expected] of [[0,'bad'],[6,'bad'],[7,'ok'],[29,'ok'],[30,'good']]) assert.equal(build([food(days)]).food.level,expected);
  for (const [days, expected] of [[0,'bad'],[2,'bad'],[3,'ok'],[13,'ok'],[14,'good']]) assert.equal(build([water(days)]).water.level,expected);
  assert.match(build([food(30)]).food.detail,/30 full days/);
  assert.match(build([water(14)]).water.detail,/14 full days/);
});

test('dependants, nutrition data and calorie target cannot be inferred into a good rating', () => {
  assert.equal(build([food(30)],{peopleCount:0}).food.level,'ok');
  assert.equal(build([water(14)],{peopleCount:0}).water.level,'ok');
  assert.equal(build([food(30)],{dailyCalTarget:0}).food.level,'ok');
  assert.equal(build([food(30),food(1,{id:'missing',fields:{}})]).food.level,'ok');
  assert.equal(build([food(30)],{peopleCount:2}).food.level,'ok');
});

test('water containers are not multiplied and source or treatment equipment adds no days', () => {
  assert.equal(build([water(1)]).water.level,'bad');
  assert.equal(build([water(200,{subType:'purificationDevice'})]).water.level,'bad');
  assert.equal(build([{category:'water',subType:'well',quantity:50}]).water.level,'bad');
});

test('missing and invalid quantities never create green inventory status', () => {
  for (const quantity of [undefined,null,'',NaN,Infinity,-1,'unknown']) {
    assert.notEqual(build([food(1,{quantity})]).food.level,'good');
    assert.notEqual(build([{category:'tools',quantity}]).preps.level,'good');
  }
  assert.equal(build([]).preps.level,'bad');
  assert.equal(build([{category:'tools',quantity:0}]).preps.level,'bad');
  assert.equal(build([{category:'tools',quantity:1}]).preps.level,'good');
  assert.equal(build([{category:'tools',quantity:1},{category:'tools',quantity:0}]).preps.level,'ok');
});

test('urgent reminders override recorded coverage and unrelated property alerts are ignored', () => {
  const stocked = [food(30),water(14),{id:'tool',category:'tools',quantity:1}];
  const result=build(stocked,{alerts:[{id:'food',category:'food',severity:'critical'},{id:'water',category:'water',ac:'#f59e0b'},{id:'tool',category:'tools',ac:'#ef4444'}]});
  assert.equal(result.food.level,'bad');
  assert.equal(result.water.level,'ok');
  assert.equal(result.preps.level,'bad');
  assert.equal(build([food(30)],{alerts:[{id:'other-property-food',category:'food',severity:'critical'}]}).food.level,'good');
});

test('supplies excludes food, water and categories outside the supplied catalogue', () => {
  assert.equal(build([food(30),water(14)]).preps.level,'bad');
  assert.equal(build([{category:'fiction',quantity:100}],{supplyCategoryKeys:['tools']}).preps.level,'bad');
});

test('grab planning completeness is independent of grabbed flags', () => {
  const entry={name:'Bag',quantity:'1',location:'Hall',assignee:'Sam',grabbed:false};
  assert.equal(build([],{bugOutEntries:[entry]}).bugout.level,'good');
  assert.equal(build([],{bugOutEntries:[{...entry,grabbed:true}]}).bugout.level,'good');
  assert.equal(build([],{bugOutEntries:[{...entry,location:''}]}).bugout.level,'ok');
  assert.equal(build([],{bugOutEntries:[]}).bugout.level,'bad');
});

test('people and property statuses use recorded planning details', () => {
  assert.equal(build([],{contacts:[{name:'Sam',phone:'Radio channel 2'}]}).community.level,'good');
  assert.equal(build([],{contacts:[{name:'Sam'}]}).community.level,'ok');
  const input={propertyProfile:{completedAt:'2026-10-28'},mapSetups:{home:{image:{dataUrl:'test'}}},routes:[{propertyId:'home'}],activePropertyId:'home'};
  assert.equal(build([],input).property.level,'good');
  assert.equal(build([],{...input,activePropertyId:'cabin'}).property.level,'ok');
});

test('reference pages and unverified live services do not claim good health', () => {
  const result=build([food(60),water(60)]);
  for(const key of ['surveillance','board','manuals','emergency','dependencies','simulate']) assert.equal(result[key].level,'unknown');
});

test('code ratings do not inspect or expose secret values, and invalid dates are incomplete', () => {
  const result=build([],{codes:[{label:'Gate',value:'SECRET',lastChanged:'not-a-date'}]});
  assert.equal(result.codes.level,'ok');
  assert.equal(JSON.stringify(result).includes('SECRET'),false);
});


test('a warning cannot upgrade critically low recorded food or water coverage', () => {
  const result = build([food(2),water(1)],{alerts:[{id:'food',category:'food',ac:'#f59e0b'},{id:'water',category:'water',severity:'warning'}]});
  assert.equal(result.food.level,'bad');
  assert.equal(result.water.level,'bad');
});

test('code rotation follows the same current, due-soon and overdue windows as Codes', () => {
  const now=Date.parse('2026-10-28T12:00:00Z');
  const dated=days=>({lastChanged:new Date(now-days*86400000).toISOString()});
  for(const [days,expected] of [[-1,'ok'],[0,'good'],[25,'good'],[26,'ok'],[30,'ok'],[31,'bad']]) {
    assert.equal(build([],{codes:[dated(days)],now}).codes.level,expected);
  }
});
