import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { evidenceState, parseHistoricalEvidence, routeForPath, visibleSummaries, type ScenarioKey } from './portal.js';

const evidencePath=path.resolve(import.meta.dirname,'..','..','evidence','aws-real-benchmark-latest.json');

test('portal routes resolve every required product page and reject unknown paths',()=>{
  for(const route of ['/','/learn','/scenarios','/setup','/infra','/benchmarks','/operations','/demo'])assert.equal(routeForPath(route),route);
  assert.equal(routeForPath('/not-a-route'),'/');
});

test('retained AWS evidence is the exact historical run and is never labelled live',async()=>{
  const evidence=parseHistoricalEvidence(await readFile(evidencePath,'utf8'));
  assert.equal(evidence.runId,'383ff454-5dd0-449f-ab75-b56ba62c0bd3');
  assert.equal(evidence.mode,'AWS_REAL');
  assert.equal(evidence.summaries.length,12);
  assert.equal(evidence.rawSamples.length,1200);
  assert.equal(evidenceState(false,evidence),'HISTORICAL AWS_REAL');
  assert.equal(evidenceState(true,evidence),'LIVE AWS_REAL');
});

test('scenario filters keep underlying evidence values and rescale by visibility',async()=>{
  const evidence=parseHistoricalEvidence(await readFile(evidencePath,'utf8'));
  const selected=new Set<ScenarioKey>(['AWS_REAL_SINGAPORE','AWS_REAL_HANOI']);
  const filtered=visibleSummaries(evidence,selected);
  assert.equal(filtered.length,8);
  assert.equal(filtered.some(item=>item.scenario==='AWS_REAL_HYBRID'),false);
  assert.deepEqual([...new Set(filtered.map(item=>item.queryCount))],[1,5,10,20]);
  assert.equal(filtered.find(item=>item.scenario==='AWS_REAL_HANOI'&&item.queryCount===1)?.metrics.p50,41.905);
});

test('missing evidence and absent endpoints remain NOT_DEPLOYED',()=>{
  assert.equal(evidenceState(false,null),'NOT_DEPLOYED');
});
