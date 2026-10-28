import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateMetrics, parseServerTiming, type Sample } from './metrics';
const sample = (ms:number, index:number, ok=true):Sample => ({ timestamp:new Date(index*1000).toISOString(), scenario:'local', origin:'test', destination:'/health', method:'GET', path:'/health', payloadBytes:0, status:ok?200:0, ok, requestId:String(index), clientElapsedMs:ms, serverTiming:null, serverAppMs:null, dbMs:null });
describe('calculateMetrics',()=>{ it('uses measured samples for percentiles and variation',()=>{ const value=calculateMetrics([sample(10,1),sample(20,2),sample(40,3)])!; assert.equal(value.p50,20); assert.equal(value.httpVariation,15); assert.equal(value.count,3); }); it('reports failures as timeouts',()=>{ assert.equal(calculateMetrics([sample(10,1),sample(20,2,false)])?.timeoutRate,50); }); it('returns null for not tested',()=>assert.equal(calculateMetrics([]),null)); });
describe('parseServerTiming',()=>it('extracts server and database durations',()=>assert.deepEqual(parseServerTiming('app;dur=8.31, db;dur=5.22'),{app:8.31,db:5.22})));
