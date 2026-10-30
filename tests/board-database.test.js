import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';

const hash = text => createHash('sha256').update(text).digest('hex');
const signature = 'prepvault_board.board_action(text,jsonb,text,text,boolean)';
test('anonymous board migration enforces isolated permissions, identities and shared controls', async t => {
  const db = new PGlite();
  const a = hash('a'), b = hash('b'), ip = hash('network');
  let serial = 0;
  const call = async (action, input = {}, author = a, owner = false, network = ip) =>
    (await db.query(`SELECT prepvault_board.board_action($1,$2::jsonb,$3,$4,$5) AS result`, [action,JSON.stringify(input),author,network,owner])).rows[0].result;
  const create = (extra={}, author=hash(`creator${++serial}`)) => call('create',{title:'Water storage ideas',body:'How do you rotate your stored water?',country:'CA',region:'ON',...extra},author,false,hash(`net${serial}`));
  const clearRates = () => db.exec('DELETE FROM prepvault_board.rate_limits');
  try {
    await db.exec(`CREATE ROLE board_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
      CREATE ROLE unrelated_visitor NOLOGIN;
      CREATE SCHEMA prepvault;
      CREATE TABLE prepvault.private_owner_data(value text);
      INSERT INTO prepvault.private_owner_data VALUES('private');
      REVOKE ALL ON SCHEMA prepvault FROM PUBLIC;`);
    const migration=await readFile(new URL('../neon/migrations/20261027000100_anonymous_board.sql',import.meta.url),'utf8');
    await db.exec(migration);
    await db.exec(`GRANT USAGE ON SCHEMA prepvault_board TO board_runtime; GRANT EXECUTE ON FUNCTION ${signature} TO board_runtime;`);
    await t.test('repeatable migration leaves private data intact and grants no public access',async()=>{
      await db.exec(migration);
      assert.equal((await db.query('SELECT value FROM prepvault.private_owner_data')).rows[0].value,'private');
      assert.deepEqual((await db.query('SELECT proconfig FROM pg_proc WHERE oid=$1::regprocedure',[signature])).rows[0].proconfig,['search_path=""']);
      await db.exec('SET ROLE unrelated_visitor');
      try { await assert.rejects(call('list'),e=>e.code==='42501'); } finally { await db.exec('RESET ROLE'); }
      await db.exec('SET ROLE board_runtime');
      try {
        for(const q of ['SELECT * FROM prepvault_board.messages','SELECT * FROM prepvault_board.reports','SELECT * FROM prepvault_board.rate_limits','SELECT * FROM prepvault.private_owner_data','CREATE TABLE prepvault_board.bad(id int)']) await assert.rejects(db.query(q),e=>e.code==='42501');
        assert.deepEqual((await call('list')).threads,[]);
      } finally { await db.exec('RESET ROLE'); }
    });
    await t.test('public listing filters country/region and exposes only a display alias and ownership flag',async()=>{
      const local=await create({},a);
      await create({country:'US',region:'NY'});
      await create({region:'BC'});
      const result=await call('list',{country:'CA',region:'ON'},b);
      assert.deepEqual(result.threads.map(x=>x.id),[local.id]);
      assert.equal(result.threads[0].owned,false);
      assert.equal((await call('thread',{id:local.id},a)).thread.owned,true);
      assert.equal(result.threads[0].alias,`Neighbor ${a.slice(0,8).toUpperCase()}`);
      for(const secret of [a,b,ip,'private']) assert.ok(!JSON.stringify(result).includes(secret));
      assert.equal((await call('list',{country:'CA'})).threads.length,2);
      assert.equal((await call('list')).threads.length,3);
    });
    await t.test('reply inherits location and cannot target another reply or removed thread',async()=>{
      const root=await create({},a);
      const reply=await call('reply',{threadId:root.id,body:'Rotation reminder',country:'US',region:'ZZ'},b);
      assert.ok(reply.id);
      const actual=(await db.query('SELECT country,region FROM prepvault_board.messages WHERE id=$1',[reply.id])).rows[0];
      assert.deepEqual(actual,{country:'CA',region:'ON'});
      assert.equal((await call('reply',{threadId:reply.id,body:'nested'},a)).error,'not_found');
      assert.equal((await call('thread',{id:root.id},a)).thread.replyCount,1);
      assert.equal((await call('remove',{id:root.id},a)).ok,true);
      assert.equal((await call('reply',{threadId:root.id,body:'later'},b)).error,'not_found');
      const gone=await call('thread',{id:root.id},b);
      assert.equal(gone.thread.removed,true);assert.equal(gone.thread.body,'');
      assert.equal((await call('report',{id:reply.id,reason:'unsafe'},a)).ok,true, 'visible replies under removed roots remain reportable');
    });
    await t.test('other browsers cannot remove posts; own removal erases text and leaves reply tombstones',async()=>{
      await clearRates();
      const root=await create({},a);
      const reply=await call('reply',{threadId:root.id,body:'Personal note'},b);
      assert.equal((await call('remove',{id:reply.id},a)).error,'forbidden');
      assert.equal((await call('remove',{id:reply.id},b)).ok,true);
      const result=await call('thread',{id:root.id},a);
      assert.equal(result.replies[0].removed,true);assert.equal(result.replies[0].body,'');assert.equal(result.replies[0].alias,'Anonymous');
      assert.equal(result.thread.replyCount,0);
      assert.equal((await db.query('SELECT body FROM prepvault_board.messages WHERE id=$1',[reply.id])).rows[0].body,'');
    });
    await t.test('reports are idempotent, do not auto-hide, and moderation requires server owner authority',async()=>{
      await clearRates();
      const root=await create({},a);
      for(let n=0;n<3;n++) assert.equal((await call('report',{id:root.id,reason:'spam'},b)).ok,true);
      assert.equal((await call('moderation',{},b)).error,'forbidden');
      assert.equal((await call('moderate',{id:root.id,decision:'hide',owner:true},b)).error,'forbidden');
      let queue=await call('moderation',{},a,true);
      assert.equal(queue.reports.find(r=>r.id===root.id).reportCount,1);
      assert.deepEqual(queue.reports.find(r=>r.id===root.id).reasons,['spam']);
      assert.ok((await call('thread',{id:root.id},b)).thread);
      assert.equal((await call('moderate',{id:root.id,decision:'dismiss'},a,true)).ok,true);
      assert.ok(!(await call('moderation',{},a,true)).reports.some(r=>r.id===root.id));
      await call('report',{id:root.id,reason:'unsafe'},hash('different reporter'));
      assert.equal((await call('moderate',{id:root.id,decision:'hide'},a,true)).ok,true);
      assert.equal((await call('thread',{id:root.id},b)).error,'not_found');
      assert.ok(!(await call('list',{},b)).threads.some(r=>r.id===root.id));
    });
    await t.test('shared counters limit parallel writes and rotating browser identities on one network',async()=>{
      await clearRates();
      const requests=Array.from({length:10},(_,i)=>call('create',{title:`Post ${i}`,body:'Same browser',country:'US',region:''},a,false,ip));
      const results=await Promise.all(requests);
      assert.equal(results.filter(r=>r.id).length,6);assert.equal(results.filter(r=>r.error==='throttled').length,4);
      await clearRates();
      const networks=await Promise.all(Array.from({length:23},(_,i)=>call('create',{title:`Network post ${i}`,body:'Different cookies',country:'CA',region:''},hash(`browser-${i}`),false,ip)));
      assert.equal(networks.filter(r=>r.id).length,20);assert.equal(networks.filter(r=>r.error==='throttled').length,3);
    });
    await t.test('pagination is bounded and has no duplicate or missing threads',async()=>{
      await clearRates();
      for(let i=0;i<35;i++) await create({country:'NZ',region:'',title:`NZ thread ${i}`});
      const first=await call('list',{country:'NZ'},b);assert.equal(first.threads.length,30);assert.ok(first.nextCursor);
      const second=await call('list',{country:'NZ',cursor:first.nextCursor},b);assert.equal(second.threads.length,5);assert.equal(second.nextCursor,null);
      assert.equal(new Set([...first.threads,...second.threads].map(r=>r.id)).size,35);
    });
    await t.test('database independently bounds content and rejects invalid authority and IDs',async()=>{
      for(const args of [{title:''},{body:''},{title:'x'.repeat(121)},{body:'x'.repeat(4001)},{country:'ZZZ'}]) assert.equal((await create(args)).error,'invalid_request');
      assert.equal((await call('create',{},null)).error,'invalid_request');
      assert.equal((await call('thread',{id:'not uuid'})).error,'invalid_request');
      assert.equal((await call('list',{cursor:{at:'bad date',id:'bad'}})).error,'invalid_request');
    });
  } finally { await db.close(); }
});
