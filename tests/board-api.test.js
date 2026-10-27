import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoardHandler } from '../api/board.js';
import { boardIdentity, networkBucket } from '../api/_lib/board-identity.js';
import { createBoardService } from '../api/_lib/board-service.js';
import { createBoardStore } from '../api/_lib/board-store.js';

const now=()=>Date.parse('2026-10-27T01:00:00Z');
const env={BOARD_DATABASE_URL:'postgres://runtime:not-real@example.test/db',BOARD_COOKIE_SECRET:'s'.repeat(48),VERCEL:'1'};
const rootId='11111111-1111-4111-8111-111111111111';
const body={action:'create',title:'Rainwater plans',body:'What should I consider?',country:'CA',region:'ON'};
const defaultHeaders={host:'prep.example',origin:'https://prep.example','content-type':'application/json','x-vercel-forwarded-for':'198.51.100.5'};
async function request(handler,input,overrides={}) {
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};
  await handler({method:'POST',body:input,...overrides,headers:{...defaultHeaders,...overrides.headers}},res);
  return res;
}
function setup({owner=null,result={id:rootId},environment=env,failAuth=false}={}) {
  const calls=[],auth=[];
  const service=createBoardService({perform:async(...args)=>{calls.push(args);return structuredClone(result);}});
  const handler=createBoardHandler({env:environment,now,random:()=> 'x'.repeat(43),authenticate:async req=>{auth.push(req);if(failAuth)throw Error('sensitive auth detail');return owner;},getService:()=>service});
  const signed=boardIdentity({headers:defaultHeaders},{secret:env.BOARD_COOKIE_SECRET},{now,random:()=> 'x'.repeat(43),vercel:true}).cookie.split(';')[0];
  return {handler,calls,auth,cookie:signed};
}

test('anonymous session provides a secure browser cookie but never identity hashes or credentials',async()=>{
  const {handler,calls,auth}=setup({result:{ok:true}});
  const r=await request(handler,{action:'session'});
  assert.equal(r.statusCode,200);assert.deepEqual(Object.keys(r.body).sort(),['alias','canModerate']);assert.equal(r.body.canModerate,false);
  assert.match(r.body.alias,/^Neighbor [A-F0-9]{8}$/);assert.match(r.headers['set-cookie'],/^__Host-pv_board=/);
  for(const part of ['HttpOnly','Secure','SameSite=Strict','Path=/','Max-Age=2592000'])assert.ok(r.headers['set-cookie'].includes(part));
  assert.equal(auth.length,1);assert.equal(calls[0][2].owner,false);
  assert.ok(!JSON.stringify(r.body).includes(calls[0][2].authorKey));
  assert.match(r.headers['cache-control'],/no-store/);assert.equal(r.headers['vary'],'Origin, Cookie');
});
test('valid browser identity can post without owner authentication and cannot forge authority or alias',async()=>{
  const {handler,calls,auth,cookie}=setup();
  const r=await request(handler,{...body,owner:true,authorKey:'attack',networkKey:'attack',alias:'Owner',email:'private@example.test',phone:'+15555550123'},{headers:{cookie}});
  assert.equal(r.statusCode,200);assert.equal(auth.length,0);
  assert.deepEqual(calls[0][1],{title:body.title,body:body.body,country:'CA',region:'ON'});
  assert.equal(calls[0][2].owner,false);assert.match(calls[0][2].authorKey,/^[a-f0-9]{64}$/);assert.match(calls[0][2].networkKey,/^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(calls).includes('198.51.100.5'),false);assert.equal(JSON.stringify(calls).includes('private@example.test'),false);
});
test('write actions reject missing, tampered, expired, duplicated or oversized anonymous cookies',async()=>{
  const {handler,calls,cookie}=setup();
  const expired=boardIdentity({headers:defaultHeaders},{secret:env.BOARD_COOKIE_SECRET},{now:()=>now()-31*86400000,random:()=> 'x'.repeat(43),vercel:true}).cookie.split(';')[0];
  for(const invalid of ['',cookie.slice(0,-1)+'a',expired,`${cookie}; ${cookie}`,'x'.repeat(17000)]) {
    for(const action of [body,{action:'reply',threadId:rootId,body:'reply'},{action:'report',id:rootId,reason:'spam'},{action:'remove',id:rootId}]) {
      const r=await request(handler,action,{headers:{cookie:invalid}});assert.equal(r.statusCode,401);
    }
  }
  assert.equal(calls.length,0);
});
test('origin, method, JSON format and body bounds are checked before storage',async()=>{
  const {handler,calls,cookie}=setup();
  const cases=[
    [{headers:{origin:'https://evil.test',cookie}},403],
    [{headers:{origin:'null',cookie}},403],
    [{headers:{origin:undefined,cookie}},403],
    [{headers:{'sec-fetch-site':'cross-site',cookie}},403],
    [{headers:{'content-type':'text/plain',cookie}},415],
    [{method:'GET'},405],
    [{body:'not-json'},400],
    [{body:[]},400],
    [{body:{action:'create',body:'a'.repeat(25000)}},413],
    [{headers:{'content-length':'25000'}},413],
  ];
  for(const [options,status]of cases)assert.equal((await request(handler,body,options)).statusCode,status);
  assert.equal(calls.length,0);
});
test('country/region and bounded text/IDs/cursors are validated before database access',async()=>{
  const {handler,calls,cookie}=setup();
  const bad=[{...body,country:'ZZ'},{...body,region:'NY'},{...body,title:''},{...body,title:'x'.repeat(121)},{...body,body:'x'.repeat(4001)},{...body,body:'text\u0000'},{action:'reply',threadId:rootId,body:'x'.repeat(2001)},{action:'thread',id:'invalid'},{action:'list',region:'ON'},{action:'list',country:'CA',region:'ZZZ'},{action:'list',cursor:'a'.repeat(257)},{action:'report',id:rootId,reason:'bad'},{action:'moderate',id:rootId,decision:'erase'}];
  for(const input of bad)assert.equal((await request(handler,input,{headers:{cookie}})).statusCode,400,JSON.stringify(input).slice(0,120));
  assert.equal(calls.length,0);
});
test('owner moderation is resolved from fresh owner authentication only',async()=>{
  for(const action of [{action:'moderation'},{action:'moderate',id:rootId,decision:'hide'}]) {
    const denied=setup();const r=await request(denied.handler,{...action,owner:true});assert.equal(r.statusCode,403);assert.equal(denied.calls.length,0);
    const allowed=setup({owner:{id:'verified-owner'},result:{ok:true}});const yes=await request(allowed.handler,action);assert.equal(yes.statusCode,200);assert.equal(allowed.auth.length,1);assert.equal(allowed.calls[0][2].owner,true);
    const failed=setup({failAuth:true});assert.equal((await request(failed.handler,action)).statusCode,503);assert.equal(failed.calls.length,0);
  }
});
test('private sign-in outage does not block public browsing or expose auth errors',async()=>{
  const {handler}=setup({failAuth:true,result:{ok:true}});
  const r=await request(handler,{action:'session'});assert.equal(r.statusCode,200);assert.equal(r.body.canModerate,false);assert.equal(JSON.stringify(r).includes('sensitive'),false);
});
test('missing configuration/storage failure fail closed with no leaked database detail',async()=>{
  for(const environment of [{},{...env,BOARD_COOKIE_SECRET:'short'},{...env,BOARD_DATABASE_URL:''}]) {
    const {handler,calls}=setup({environment});assert.equal((await request(handler,{action:'session'})).statusCode,503);assert.equal(calls.length,0);
  }
  const store=createBoardStore({query:async()=>{throw Error(env.BOARD_DATABASE_URL);}});
  assert.deepEqual(await store.perform('list',{}, {authorKey:'a',networkKey:'b'}),{error:'unavailable'});
});
test('storage errors retain safe status and Retry-After while raw failures stay generic',async()=>{
  for(const [code,status]of [['not_found',404],['forbidden',403],['throttled',429],['DB_SECRET',503]]) {
    const {handler,cookie}=setup({result:{error:code}});const r=await request(handler,{action:'remove',id:rootId},{headers:{cookie}});assert.equal(r.statusCode,status);
    if(status===429)assert.equal(r.headers['retry-after'],'60');
    assert.ok(!JSON.stringify(r.body).includes('DB_SECRET'));
  }
});
test('pagination cursors roundtrip safely and store queries bind all values',async()=>{
  const calls=[];const store=createBoardStore({query:async(...args)=>{calls.push(args);return [{result:{threads:[],nextCursor:{at:new Date(now()).toISOString(),id:rootId}}}];}});
  const service=createBoardService(store);const identity={authorKey:'a'.repeat(64),networkKey:'b'.repeat(64),owner:false};
  const result=await service.perform('list',{country:'CA',region:'ON'},identity);
  assert.equal(typeof result.nextCursor,'string');await service.perform('list',{cursor:result.nextCursor},identity);
  assert.match(calls[0][0],/\$1::text, \$2::jsonb, \$3::text, \$4::text, \$5::boolean/);
  assert.deepEqual(JSON.parse(calls[1][1][1]).cursor,{at:new Date(now()).toISOString(),id:rootId});
});
test('network rate keys rotate daily, ignore untrusted forwarding headers and bucket IPv6 /64s',()=>{
  const config={secret:env.BOARD_COOKIE_SECRET};
  const make=(headers,options={})=>boardIdentity({headers:{...defaultHeaders,...headers},socket:{remoteAddress:'127.0.0.1'}},config,{now,random:()=> 'x'.repeat(43),vercel:true,...options});
  assert.equal(make({'x-forwarded-for':'8.8.8.8'}).networkKey,make({'x-forwarded-for':'1.1.1.1'}).networkKey);
  assert.notEqual(make({}).networkKey,make({}, {now:()=>now()+86400000}).networkKey);
  assert.equal(networkBucket('2001:db8:1234:5678::1'),networkBucket('2001:db8:1234:5678:aaaa:bbbb:cccc:dddd'));
  assert.equal(networkBucket('::ffff:192.0.2.1'),'192.0.2.1');
  assert.throws(()=>make({'x-vercel-forwarded-for':''}));
  assert.equal(make({'x-vercel-forwarded-for':'8.8.8.8'},{vercel:false}).networkKey,make({'x-vercel-forwarded-for':'1.1.1.1'},{vercel:false}).networkKey);
});
