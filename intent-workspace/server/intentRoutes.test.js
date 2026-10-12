import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createIntentRouter } from './intentRoutes.js';
import { generateSeed } from './data/seedData.js';
import { curated } from './plan.js';

test('HTTP intent requests validate inputs, preserve client context, clarify and fall back safely', async () => {
  const src=generateSeed(); let calls=0,received;
  const app=express(); app.use(express.json()); app.use(createIntentRouter({loadSourceImpl:async()=>src,env:{NVIDIA_API_KEY:'synthetic'},planImpl:async(text,current,opts)=>{calls++;received=opts;if(text==='Review overdue work') throw Error('Synthetic model outage');return curated('usage',{clientId:opts.clientId});}}));
  const server=app.listen(0,'127.0.0.1');
  try {
    await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
    const post=body=>fetch(`http://127.0.0.1:${server.address().port}/api/intent`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    for (const body of [{text:{}},{pick:'constructor',clientId:'northwind'},{pick:'usage',clientId:'unknown'},{text:'usage',clientId:{id:'northwind'}},{text:'usage',clientId:'northwind',current:{mode:'meeting',components:[{id:'fake',span:6}]}}]) assert.equal((await post(body)).status,400);
    for (const client of src.clients) for (const pick of ['meeting','usage','overdue','issues','updates','followups']) {
      const r=await post({pick,clientId:client.id});assert.equal(r.status,200);
      const result=await r.json();assert.equal(result.clientId,client.id);
      if(pick!=='overdue') assert.ok(result.plan.title.includes(client.name));
    }
    assert.equal(calls,0);
    let result=await (await post({text:'Review usage',clientId:'harborline'})).json();
    assert.equal(received.clientId,'harborline');assert.equal(received.src,src);assert.equal(result.clientId,'harborline');
    result=await (await post({text:'Review Surya usage',clientId:'harborline'})).json();assert.equal(result.clientId,'solstice');
    result=await (await post({text:'Prepare Utsav and Surya meeting',clientId:'harborline'})).json();assert.equal(result.status,'clarify');
    result=await (await post({text:'help',clientId:'harborline'})).json();assert.equal(result.status,'clarify');
    result=await (await post({text:'Send a payment',clientId:'harborline'})).json();assert.equal(result.status,'unsupported');
    result=await (await post({text:'Review overdue work',clientId:'harborline'})).json();assert.equal(result.plan.mode,'overdue');assert.equal(result.intent.fallback,true);
    const current=curated('meeting',{clientId:'harborline'}).plan;
    result=await (await post({text:'Also show overdue tasks',clientId:'harborline',current})).json();assert.equal(result.op,'patch');assert.ok(result.plan.components.some(c=>c.id==='overdue'));
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
