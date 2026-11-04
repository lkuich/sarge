import assert from 'node:assert/strict';
import { PrismaClient } from '../apps/api/node_modules/@prisma/client/default.js';
import { neonConfig } from '../apps/worker/node_modules/@neondatabase/serverless/index.mjs';
import { runScheduledMaintenance } from '../apps/worker/src/data-maintenance.ts';
// Node 24+. Create an empty local database, apply the Prisma migrations, then run
// SARGE_MAINTENANCE_TEST_DATABASE_URL=postgresql://.../sarge_maintenance_test... node scripts/verify-data-maintenance.mjs
// This deliberately refuses non-local databases and never resets existing data.
const databaseUrl = process.env.SARGE_MAINTENANCE_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set SARGE_MAINTENANCE_TEST_DATABASE_URL to a migrated, empty local test database.');
const parsedUrl = new URL(databaseUrl);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname), 'Only loopback PostgreSQL hosts are allowed.');
assert.ok(parsedUrl.pathname.startsWith('/sarge_maintenance_test'), 'Database name must start with sarge_maintenance_test.');
let afterTransaction, beforeTransaction, afterQuery;
const db = new PrismaClient({datasources:{db:{url:databaseUrl}}});
const encode = rows => {
  const fields = Object.keys(rows[0] ?? {}).map(name => ({name, dataTypeID:25}));
  return { fields, rows: rows.map(row => fields.map(({name}) => row[name] == null ? null : String(row[name]))), rowCount:rows.length, command:'SELECT' };
};
neonConfig.fetchFunction = async (_url, init) => {
  const body = JSON.parse(init.body);
  const query = async (tx, q) => {
    const result = encode(await tx.$queryRawUnsafe(q.query, ...q.params));
    if (afterQuery) await afterQuery(q.query);
    return result;
  };
  try {
    if (body.queries && beforeTransaction) await beforeTransaction(body.queries);
    const result = body.queries
      ? await db.$transaction(async tx => { const rows=[]; for(const q of body.queries) rows.push(await query(tx,q)); return rows; }, {timeout:60_000})
      : await query(db, body);
    if (body.queries && afterTransaction) await afterTransaction(result);
    return new Response(JSON.stringify(body.queries ? {results:result} : result), {headers:{'content-type':'application/json'}});
  } catch(error) { return new Response(JSON.stringify({message:error.message}), {status:400}); }
};
const run = () => runScheduledMaintenance('postgresql://local:test@example.invalid/local');
const now = new Date();
const old = new Date(Date.now() - 200 * 86400000);
async function tenant(id, planId = 'growth', paid = false) {
 await db.workspace.create({data:{id, slug:id, name:id, planId, stripeSubscriptionId: paid ? `sub_${id}` : null}});
 await db.workspacePrivacySettings.create({data:{id:`privacy_${id}`,workspaceId:id}});
 await db.notificationPreference.create({data:{id:`pref_${id}`,workspaceId:id,userId:'fixture',email:'fixture@example.com',category:'tracking'}});
 return id;
}
async function site(id, workspaceId, events=1) {
 await db.site.create({data:{id, workspaceId,name:id,customDomain:`${id}.example.com`, endpointHost:`${id}.sargetrack.app`}});
 await db.siteEnvironment.create({data:{id:`env_${id}`,siteId:id,environment:'production',endpointHost:`env_${id}.sargetrack.app`}});
 await db.$executeRawUnsafe(`INSERT INTO "Event" (id,"siteId","siteEnvironmentId",name,"occurredAt","sessionId","userId") SELECT $1 || n::text,$2,$3,'page.view',NOW(),'fixture','fixture' FROM generate_series(1,$4::int) n`, `${id}_event_`, id, `env_${id}`, events);
 await db.apiToken.create({data:{id:`token_${id}`,siteEnvironmentId:`env_${id}`,name:'fixture',scope:'events:read',tokenHash:`hash_${id}`}});
 await db.publicVerificationToken.create({data:{id:`verify_${id}`,siteEnvironmentId:`env_${id}`,tokenHash:'fixture',expiresAt:now,createdByUserId:'fixture'}});
 await db.diagnosticRun.create({data:{id:`run_${id}`,siteId:id,siteEnvironmentId:`env_${id}`,status:'completed',eventWindowStart:now,eventWindowEnd:now,startedAt:now,completedAt:now}});
 await db.diagnosticFinding.create({data:{id:`finding_${id}`,runId:`run_${id}`,siteId:id,siteEnvironmentId:`env_${id}`,ruleId:'fixture',severity:'info',title:'fixture',summary:'fixture',recommendation:'fixture',agentPrompt:'fixture',evidence:[]}});
 await db.webhookEndpoint.create({data:{id:`webhook_${id}`,siteId:id,siteEnvironmentId:`env_${id}`,name:'fixture',url:'https://fixture.example.com',signingSecret:'fixture'}});
 await db.projectShare.create({data:{id:`share_${id}`,siteId:id,email:'fixture@example.com',role:'view',invitedByUserId:'fixture'}});
 await db.sitePrivacySettings.create({data:{id:`privacy_${id}`,siteId:id}});
 await db.notificationDelivery.create({data:{id:`notice_${id}`,workspaceId,siteEnvironmentId:`env_${id}`,recipientEmail:'fixture@example.com',category:'tracking',fingerprint:id,subject:'fixture',status:'sent'}});
 return id;
}
async function request(id, scope, workspace, targetSiteId=null, extra={}) {
 return db.deletionRequest.create({data:{id,scope,targetWorkspaceId:workspace,targetSiteId,requestedByUserId:'fixture',...extra}});
}
try {
 assert.equal(await db.workspace.count(), 0, 'Test database must contain no workspaces.');
 assert.equal(await db.site.count(), 0, 'Test database must contain no sites.');
 assert.equal(await db.event.count(), 0, 'Test database must contain no events.');
 assert.equal(await db.deletionRequest.count(), 0, 'Test database must contain no deletion requests.');
 await tenant('scoped'); await site('target','scoped',5001); await site('sibling','scoped');
 await request('delete_target','site','scoped','target');
 let sawPartial = false;
 afterTransaction = async result => {
   const last = result.at(-1);
   if (last?.fields[0]?.name === 'status' && last.rows[0]?.[0] === 'pending') {
     sawPartial=true;
     assert.equal(await db.event.count({where:{siteId:'target'}}),1);
     assert.ok(await db.site.findUnique({where:{id:'target'}}));
     assert.ok(await db.apiToken.findUnique({where:{id:'token_target'}}));
   }
 };
 assert.equal((await run()).completed,1); assert.ok(sawPartial); afterTransaction=null;
 assert.ok(await db.workspace.findUnique({where:{id:'scoped'}}));
 assert.ok(await db.site.findUnique({where:{id:'sibling'}}));
 for(const table of ['siteEnvironment','apiToken','publicVerificationToken','diagnosticRun','diagnosticFinding','webhookEndpoint','projectShare','sitePrivacySettings','notificationDelivery']) {
   assert.equal(await db[table].count(),1, `${table} target cascade left only sibling`);
 }
 assert.equal((await db.deletionRequest.findUnique({where:{id:'delete_target'}})).status,'completed');
 await request('delete_scoped','workspace','scoped'); assert.equal((await run()).completed,1);
 for(const table of ['workspace','site','siteEnvironment','apiToken','publicVerificationToken','diagnosticRun','diagnosticFinding','webhookEndpoint','projectShare','sitePrivacySettings','notificationDelivery','notificationPreference','workspacePrivacySettings']) assert.equal(await db[table].count(),0,table);
 await tenant('paid','growth',true); await site('paid_site','paid');
 await request('delete_paid','workspace','paid'); assert.equal((await run()).failed,1);
 assert.ok(await db.site.findUnique({where:{id:'paid_site'}})); assert.equal(await db.event.count({where:{siteId:'paid_site'}}),1);
 await site('paid_allowed_site','paid');
 await request('delete_paid_site','site','paid','paid_allowed_site'); assert.equal((await run()).completed,1);
 assert.ok((await db.deletionRequest.findUnique({where:{id:'delete_paid_site'}})).completedAt);
 await db.workspace.update({where:{id:'paid'},data:{billingStatus:'past_due'}});
 await db.deletionRequest.update({where:{id:'delete_paid'},data:{updatedAt:old}});
 assert.equal((await run()).failed,1); assert.ok(await db.site.findUnique({where:{id:'paid_site'}}));
 await db.workspace.update({where:{id:'paid'},data:{billingStatus:'canceled'}});
 await db.deletionRequest.update({where:{id:'delete_paid'},data:{updatedAt:old}});
 assert.equal((await run()).completed,1);
 await tenant('stale'); await site('stale_site','stale');
 await request('delete_stale','site','stale','stale_site',{status:'processing',startedAt:old}); assert.equal((await run()).completed,1);
 await tenant('other'); await site('other_site','other');
 await request('mismatch','site','stale','other_site'); assert.equal((await run()).completed,1);
 assert.ok(await db.site.findUnique({where:{id:'other_site'}}));
 await tenant('fenced'); await site('fenced_site','fenced'); await request('fenced_request','site','fenced','fenced_site');
 let fenced = false;
 beforeTransaction = async queries => {
   if (!fenced && queries.some(q => q.query.includes('DELETE FROM "Site"'))) {
     fenced=true;
     await db.deletionRequest.update({where:{id:'fenced_request'},data:{startedAt:new Date(Date.now()+60_000)}});
   }
 };
 assert.equal((await run()).completed,0); beforeTransaction=null;
 assert.ok(fenced); assert.ok(await db.site.findUnique({where:{id:'fenced_site'}}));
 assert.equal(await db.event.count({where:{siteId:'fenced_site'}}),1);
 await db.deletionRequest.update({where:{id:'fenced_request'},data:{startedAt:old}});
 assert.equal((await run()).completed,1);
 await tenant('locking'); await site('locking_site','locking'); await request('locking_request','workspace','locking');
 let checkedLocks=false;
 afterQuery = async query => {
   if (checkedLocks || !query.includes('SELECT id FROM "Site" WHERE id IN') || !query.endsWith('FOR UPDATE')) return;
   checkedLocks=true;
   await assert.rejects(db.$transaction(async tx => {
     await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '100ms'");
     await tx.event.create({data:{id:'concurrent_event',siteId:'locking_site',siteEnvironmentId:'env_locking_site',name:'page.view',occurredAt:now,sessionId:'fixture',userId:'fixture'}});
   }), /lock timeout/);
   await assert.rejects(db.$transaction(async tx => {
     await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '100ms'");
     await tx.site.create({data:{id:'concurrent_project',workspaceId:'locking',name:'fixture',customDomain:'new.example.com',endpointHost:'new.sargetrack.app'}});
   }), /lock timeout/);
 };
 assert.equal((await run()).completed,1); afterQuery=null; assert.ok(checkedLocks);
 await tenant('rollback'); await site('rollback_site','rollback');
 await db.$executeRawUnsafe(`CREATE FUNCTION reject_fixture_delete() RETURNS trigger AS $$ BEGIN IF OLD.id='rollback_site' THEN RAISE EXCEPTION 'fixture rollback'; END IF; RETURN OLD; END $$ LANGUAGE plpgsql`);
 await db.$executeRawUnsafe(`CREATE TRIGGER reject_fixture_delete BEFORE DELETE ON "Site" FOR EACH ROW EXECUTE FUNCTION reject_fixture_delete()`);
 await request('delete_rollback','site','rollback','rollback_site'); assert.equal((await run()).failed,1);
 assert.equal(await db.event.count({where:{siteId:'rollback_site'}}),1); assert.ok(await db.diagnosticFinding.findUnique({where:{id:'finding_rollback_site'}}));
 await db.$executeRawUnsafe(`DROP TRIGGER reject_fixture_delete ON "Site"`);
 for(const plan of ['free','starter','growth','scale','unknown']) {
   await tenant(`ret_${plan}`,plan); await site(`ret_site_${plan}`,`ret_${plan}`);
   await db.event.create({data:{id:`old_${plan}`,siteId:`ret_site_${plan}`,siteEnvironmentId:`env_ret_site_${plan}`,name:'page.view',occurredAt:old,sessionId:'fixture',userId:'fixture'}});
 }
 assert.equal((await run()).expiredEvents,3);
 assert.ok(await db.event.findUnique({where:{id:'old_scale'}})); assert.ok(await db.event.findUnique({where:{id:'old_unknown'}}));
 for(const plan of ['free','starter','growth']) assert.equal(await db.event.count({where:{siteId:`ret_site_${plan}`}}),1);
 await db.$executeRawUnsafe(`INSERT INTO "Event" (id,"siteId","siteEnvironmentId",name,"occurredAt","sessionId","userId") SELECT 'expired_batch_' || n::text,'ret_site_free','env_ret_site_free','page.view',NOW()-INTERVAL '8 days','fixture','fixture' FROM generate_series(1,5001) n`);
 assert.equal((await run()).expiredEvents,5000); assert.equal((await run()).expiredEvents,1);
 await db.event.create({data:{id:'upgrade_lock',siteId:'ret_site_free',siteEnvironmentId:'env_ret_site_free',name:'page.view',occurredAt:old,sessionId:'fixture',userId:'fixture'}});
 await db.$transaction(async tx => {
   await tx.workspace.update({where:{id:'ret_free'},data:{planId:'scale'}});
   assert.equal((await run()).expiredEvents,0);
 },{timeout:60000});
 assert.ok(await db.event.findUnique({where:{id:'upgrade_lock'}}));
 assert.equal((await run()).expiredEvents,0);
 await tenant('concurrent'); await site('concurrent_site','concurrent'); await request('delete_concurrent','site','concurrent','concurrent_site');
 const concurrent=await Promise.all([run(),run()]); assert.equal(concurrent.reduce((sum,r)=>sum+r.completed,0),1);
 assert.equal(await db.site.count({where:{id:'concurrent_site'}}),0);
 console.log('Actual PostgreSQL checks passed: scoped/batched deletion, complete FK cleanup, rollback, paid guard/retry, stale recovery/fencing, concurrent claims, ingestion/project locks, retention bounds and plan-change locking.');
} finally { await db.$disconnect(); }
