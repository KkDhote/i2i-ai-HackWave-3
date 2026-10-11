import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';

const router = Router();
const safe = fn => (req,res,next) => Promise.resolve(fn(req,res)).catch(next);
const s = (v,n=300) => String(v??'').trim().slice(0,n);
const ago = (iso,days=7) => !iso || !Number.isFinite(Date.parse(iso)) || Date.now()-Date.parse(iso)>days*86400000;
const allowed = new Set(['accept','reject','defer','note']);
async function state(){
  const db = await getDb();
  const [goals, tasks, journal, approvals] = await Promise.all([
    db.collection('iw_goals').find({}).sort({updatedAt:-1}).limit(100).toArray(),
    db.collection('iw_tasks').find({}).limit(1000).toArray(),
    db.collection('iw_decisions').find({}).sort({createdAt:-1}).limit(100).toArray(),
    db.collection('iw_approvals').find({}).sort({createdAt:-1}).limit(100).toArray()
  ]);
  return {db, goals, tasks, journal, approvals};
}
const done = t => ['done','completed','closed'].includes(String(t.status).toLowerCase());
const normalize = v => JSON.parse(JSON.stringify(v));
function analyze(goals,tasks){
  const radar=[], conflicts=[], recs=[];
  for(const g of goals){
    const related = tasks.filter(t => g.taskKeys?.includes(taskKey(t)));
    // Reuse the identical deterministic key generation from P0.
    const missing = (g.taskKeys?.length||0) - related.length;
    const overdue = related.filter(t => !done(t)&&Date.parse(t.dueAt)<Date.now());
    const blocked = related.filter(t => !done(t)&&t.blocker);
    if(missing) radar.push({goalId:g.id,goal:g.title,kind:'missing_tasks',severity:'high',message:`${missing} linked task(s) not found`,evidence:{taskKeys:g.taskKeys}});
    if(blocked.length) radar.push({goalId:g.id,goal:g.title,kind:'blocked',severity:'high',message:`${blocked.length} blocked task(s)`,evidence:blocked.map(t=>({title:t.title,blocker:t.blocker}))});
    if(overdue.length) radar.push({goalId:g.id,goal:g.title,kind:'overdue',severity:'high',message:`${overdue.length} overdue task(s)`,evidence:overdue.map(t=>({title:t.title,dueAt:t.dueAt}))});
    if(g.status==='active'&&ago(g.updatedAt,7)&&related.some(t=>!done(t))) radar.push({goalId:g.id,goal:g.title,kind:'stalled',severity:'medium',message:'No goal update in 7 days (inactivity signal; task activity not tracked)',evidence:{updatedAt:g.updatedAt}});
    if(ago(g.updatedAt,3)) radar.push({goalId:g.id,goal:g.title,kind:'freshness',severity:'medium',message:'Goal record is over 3 days old; verify its evidence',evidence:{updatedAt:g.updatedAt}});
    if(blocked.length) recs.push({id:`unblock-${g.id}`,goalId:g.id,title:`Unblock ${g.title}`,recommendation:`Resolve blocker for ${blocked[0].title}`,evidence:[{source:'iw_tasks',task:blocked[0].title,blocker:blocked[0].blocker}],verification:'Human confirmation required'});
    if(overdue.length) recs.push({id:`late-${g.id}`,goalId:g.id,title:`Review overdue work: ${g.title}`,recommendation:`Prioritize ${overdue[0].title}`,evidence:[{source:'iw_tasks',task:overdue[0].title,dueAt:overdue[0].dueAt}],verification:'Verify current owner and due date'});
  }
  for(let i=0;i<goals.length;i++) for(let j=i+1;j<goals.length;j++){
    const a=goals[i],b=goals[j]; if(a.status!=='active'||b.status!=='active')continue;
    const common=(a.taskKeys||[]).filter(k=>(b.taskKeys||[]).includes(k));
    if(common.length) conflicts.push({a:a.title,b:b.title,kind:'shared_task_dependency',message:'Goals share tasks; possible scheduling/resource conflict (not a proven contradiction)',taskKeys:common});
  }
  return {radar,conflicts,recommendations:recs,generatedAt:new Date().toISOString()};
}
import { createHash } from 'node:crypto';
function taskKey(t){return createHash('sha256').update(JSON.stringify([t.clientId??'',t.title??'',t.owner??''])).digest('hex').slice(0,20)}
router.get('/api/mentor/status',safe(async(req,res)=>{
 const {goals,tasks,journal,approvals}=await state();
 const a=analyze(goals,tasks);
 res.json({...a,goalCount:goals.length,taskCount:tasks.length,recentDecisions:normalize(journal).map(({_id,...d})=>d).slice(0,25),approvals:normalize(approvals).map(({_id,...d})=>d).slice(0,25),integrations:{calendar:'not_connected',email:'not_connected',projectTools:'local_mongodb_tasks'},notes:'Signals are deterministic and task-linked; shared tasks indicate potential conflict, not proven contradiction.'});
}));
router.post('/api/mentor/decisions',safe(async(req,res)=>{
 const {goalId,decision,rationale,evidenceRefs=[]}=req.body||{};
 if(!allowed.has(decision)||!s(rationale)||!Array.isArray(evidenceRefs))return res.status(400).json({error:'decision (accept/reject/defer/note), rationale, evidenceRefs required'});
 const db=await getDb();const entry={id:randomUUID(),goalId:s(goalId,80)||null,decision,rationale:s(rationale,1200),evidenceRefs:evidenceRefs.slice(0,15).map(x=>s(x,200)),createdAt:new Date().toISOString()};
 await db.collection('iw_decisions').insertOne(entry);const {_id,...out}=entry;res.status(201).json(out);
}));
router.post('/api/mentor/approvals',safe(async(req,res)=>{
 const {goalId,action,preview}=req.body||{};
 if(!s(action)||!s(preview))return res.status(400).json({error:'Action and preview required'});
 const db=await getDb();const doc={id:randomUUID(),goalId:s(goalId,80)||null,action:s(action,200),preview:s(preview,1200),state:'pending',createdAt:new Date().toISOString()};
 await db.collection('iw_approvals').insertOne(doc);const {_id,...out}=doc;res.status(201).json(out);
}));
router.patch('/api/mentor/approvals/:id',safe(async(req,res)=>{
 const decision=req.body?.decision;
 if(!['approved','rejected'].includes(decision))return res.status(400).json({error:'decision must be approved or rejected'});
 const db=await getDb();const result=await db.collection('iw_approvals').updateOne({id:req.params.id,state:'pending'},{$set:{state:decision,reviewedAt:new Date().toISOString()}});
 if(!result.modifiedCount)return res.status(409).json({error:'Approval not pending or not found'});
 res.json({id:req.params.id,state:decision,executed:false,note:'Approval recorded; no external action sent.'});
}));
router.post('/api/mentor/simulate',safe(async(req,res)=>{
 const id=s(req.body?.goalId,80), extra=Number(req.body?.completeAdditional??0);
 if(!Number.isInteger(extra)||extra<0||extra>100)return res.status(400).json({error:'completeAdditional must be 0..100 integer'});
 const {goals,tasks}=await state();const g=goals.find(x=>x.id===id);if(!g)return res.status(404).json({error:'Goal not found'});
 const related=tasks.filter(t=>g.taskKeys?.includes(taskKey(t)));
 const actual=related.filter(done).length, total=g.taskKeys?.length||0;
 const predicted=Math.min(total,actual+extra);
 res.json({goalId:id,baseline:total?Math.round(actual/total*100):0,simulated:total?Math.round(predicted/total*100):0,assumption:`${Math.min(extra,Math.max(0,total-actual))} additional linked tasks completed`,disclaimer:'Scenario calculation only. No tasks or goals changed.'});
}));
router.get('/api/mentor/handoff',safe(async(req,res)=>{
 const {goals,tasks}=await state();const signals=analyze(goals,tasks);
 res.json({generatedAt:new Date().toISOString(),goals:goals.map(g=>({title:g.title,status:g.status,updatedAt:g.updatedAt,linkedTaskCount:g.taskKeys?.length||0})),topGaps:signals.radar.slice(0,10),recommendations:signals.recommendations.slice(0,10),format:'team_handoff_brief',source:'local MongoDB',externalDelivery:false});
}));
router.get('/api/mentor/evaluation',safe(async(req,res)=>{
 const {goals,tasks}=await state();const a=analyze(goals,tasks);
 res.json({kind:'adaptive_workspace_health',goalCount:goals.length,linkedTasks:goals.reduce((n,g)=>n+(g.taskKeys?.length||0),0),taskCount:tasks.length,gapSignals:a.radar.length,recommendations:a.recommendations.length,methodology:'Counts from current database snapshot. Not a user-study or AI-vs-fixed comparison.',fixedDashboardBenchmark:{status:'requires_measured_user_study',tasks:['client meeting','usage investigation','overdue work'],metrics:['completion time','click count','task correctness']}});
}));
export default router;
