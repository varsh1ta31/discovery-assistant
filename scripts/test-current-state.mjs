import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const cache = new Map();
// Compile the pure TypeScript modules without calling a model or database.
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', js)((name) => {
    if (name === '@/lib/model') return { getModelProvider() { throw new Error('Unexpected model call in unit test'); } };
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), `${name}.ts`));
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const { validateFlow } = load('src/lib/agents/currentState/flow.ts');
const { buildCurrentState } = load('src/lib/agents/currentState/generate.ts');
const { buildPanels } = load('src/lib/agents/currentState/panels.ts');
const { unresolvedStepGaps } = load('src/lib/agents/currentState/gaps.ts');
const analyst = { id: 'analyst', role: 'Analyst' };
const manager = { id: 'manager', role: 'Manager' };
const activities = ['Analyst routes each exception according to reason.', 'Analyst corrects simple errors.', 'Analyst reviews duplicates.', 'Analyst checks next-day outcome; failures return to investigation.', 'Analyst prepares report for manager.', 'Analyst updates tracking throughout the day.'];
const process = { id: 'process', name: 'Test', purpose: null, trigger: null, outcome: null, steps: activities.map((activity, i) => ({
  id: `s${i+1}`, order: i+1, activity, stage: 'Phase', entryTrigger: null, exitCriteria: 'Recorded', isEscalationPoint: false,
  personas: [manager,analyst], systemLinks: [], painPoints: [], exceptions: [],
  unresolvedGaps: i === 1 ? ['correction destination needs confirmation'] : [],
})) };
const flow = { steps: process.steps.map(s => ({ stepId: s.id, label: s.activity, phase: 'Phase', primaryPersonaId: 'analyst', ownerEvidence: 'Analyst', context: '', mode: s.order >= 5 ? 'ONGOING' : 'MAIN' })), edges: [
  { from:'s1',to:'s2',kind:'CONDITIONAL',condition:'Simple error',evidence:activities[0] },
  { from:'s1',to:'s3',kind:'CONDITIONAL',condition:'Duplicate warning',evidence:activities[0] },
  { from:'s4',to:'s1',kind:'RETURN',condition:'Failed again',evidence:activities[3] },
] };
validateFlow(flow,process);
const artifact=buildCurrentState(process,flow);
assert.equal(artifact.swimLane.nodes[4].laneId,'analyst','Report belongs to preparer, not first participant');
const reversed={...process,steps:process.steps.map(s=>({...s,personas:[...s.personas].reverse()}))};
assert.deepEqual(buildCurrentState(reversed,flow).swimLane,artifact.swimLane,'Participant order must not affect ownership');
assert.equal(artifact.gapCount,1);
assert.deepEqual(artifact.swimLane.edges,flow.edges,'Do not invent sequential edges');
assert.ok(!artifact.swimLane.edges.some(e=>e.from==='s2'&&e.to==='s3'));
assert.equal(artifact.swimLane.edges.filter(e=>e.kind==='RETURN').length,1);
const panels=buildPanels(artifact);
assert.deepEqual(panels.map(p=>p.swimLane.nodes.length),[4,2]);
assert.deepEqual(panels.flatMap(p=>p.swimLane.nodes.map(n=>n.stepId)),process.steps.map(s=>s.id));
assert.ok(panels.every(p=>p.swimLane.edges.length===3),'Cross-panel edges remain available');
const unknown=structuredClone(flow); unknown.steps[0].primaryPersonaId=''; unknown.steps[0].ownerEvidence='';
assert.equal(buildCurrentState(process,unknown).swimLane.nodes[0].laneId,'__unassigned__');
for(const invalid of [
  {...flow,steps:flow.steps.slice(1)},
  {...flow,steps:[...flow.steps,flow.steps[0]]},
  {...flow,edges:[{...flow.edges[0],to:'invented'}]},
  {...flow,edges:[{...flow.edges[0],evidence:'Invented source'}]},
  {...flow,edges:[{...flow.edges[0],condition:''}]},
  {...flow,steps:flow.steps.map((s,i)=>i===0?{...s,primaryPersonaId:'outsider'}:s)},
]) assert.throws(()=>validateFlow(invalid,process));
const gap={attribute:'systemsWritten',evidenceState:'GAP',note:'Uncertain',flaggedForReview:true};
assert.deepEqual(unresolvedStepGaps([gap],{}),['correction destination needs confirmation']);
assert.deepEqual(unresolvedStepGaps([{...gap,evidenceState:'STATED',flaggedForReview:false},gap],{systemWriteUncertainty:'old'}),[],'Later answer retires stale gap');
console.log('Passed: evidence validation, stable ownership, conditional/return edges, gap precedence, panel coverage.');
const trackingFlow=structuredClone(flow);
trackingFlow.edges.push({from:'s4',to:'s6',kind:'SEQUENCE',condition:'',evidence:activities[5]});
validateFlow(trackingFlow,process);
assert.equal(trackingFlow.edges.at(-1).kind,'ASSOCIATION','Ongoing tracking must not become mandatory sequence');
const bypass=structuredClone(flow); bypass.edges.push({from:'s1',to:'s4',kind:'SEQUENCE',condition:'',evidence:activities[0]});
assert.throws(()=>validateFlow(bypass,process),/unconditional bypass/);
const responseProcess=structuredClone(process);
responseProcess.steps[0].exitCriteria='Financial Crime team responds';
responseProcess.steps[3].activity='Analyst resubmits payment';
const responseFlow=structuredClone(flow);
responseFlow.steps[3].label='Check payment';
responseFlow.edges=[{from:'s1',to:'s4',kind:'CONDITIONAL',condition:'Team responds',evidence:activities[0]}];
assert.throws(()=>validateFlow(responseFlow,responseProcess),/does not establish authorization/);
console.log('Passed: ongoing associations, branch labels, and response-versus-authorization safeguards.');
