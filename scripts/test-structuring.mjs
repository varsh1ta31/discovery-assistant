// Structuring Agent regression suite.
//
// Two layers, because the agent has two distinct failure modes and only one
// of them needs a model:
//
//   Layer 1 (default, no network, no database): the persistence contract in
//   apply.ts. Runs against a fake transaction and asserts the shape of what
//   would be written. This is where the orphaning defect lived — records
//   created with neither processId nor stepId, invisible to every view — so
//   that case is pinned first and hardest.
//
//   Layer 2 (--model): extraction quality against real narratives, calling
//   the live model. Asserts the lessons from docs/reviews/*.md still hold:
//   non-walkthrough sections get mined, enumerated lists come back complete,
//   exceptions land on the step they arise from, metrics survive without
//   values, access constraints stay separate from API availability. Opt-in
//   because it costs tokens and is non-deterministic; run it after editing
//   prompt.ts.
//
// Usage:
//   node scripts/test-structuring.mjs            # layer 1 only
//   node scripts/test-structuring.mjs --model    # both
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const cache = new Map();

// Compiles the pure TypeScript modules in-process. Same approach as
// test-current-state.mjs: no build step, and the module graph is stubbed at
// its edges so nothing reaches a database or a model unless we mean it to.
let prismaStub = null;
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', js)((name) => {
    if (name === '@/lib/db') return { get prisma() { return prismaStub; } };
    if (name === '@/lib/model') return { getModelProvider() { throw new Error('Unexpected model call'); } };
    if (name.startsWith('@/generated/prisma/enums')) return {};
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), `${name}.ts`));
    return require(name);
  }, module, module.exports);
  return module.exports;
}

const { applyStructuringOutput } = load('src/lib/agents/structuring/apply.ts');
const { buildSystemInstruction } = load('src/lib/agents/structuring/prompt.ts');
const { structuringAgentOutputSchema } = load('src/lib/agents/structuring/schema.ts');

// --- Layer 1: persistence contract ----------------------------------------

// A fake transaction recording every create/update. Each model returns rows
// with generated ids so downstream lookups in apply.ts resolve normally.
function fakeTx() {
  const writes = [];
  let seq = 0;
  const model = (name) => ({
    create: async ({ data }) => {
      const row = { id: `${name}-${++seq}`, ...data };
      writes.push({ model: name, op: 'create', data });
      return row;
    },
    update: async ({ where, data }) => {
      writes.push({ model: name, op: 'update', where, data });
      return { id: where.id, ...data };
    },
    upsert: async ({ create }) => {
      writes.push({ model: name, op: 'upsert', data: create });
      return { id: `${name}-${++seq}`, ...create };
    },
    // The EKB starts empty in these fixtures, so entity resolution always
    // takes the "create new" path and nothing depends on prior state.
    findFirst: async () => null,
    findMany: async () => [],
  });
  const tx = {
    captureSession: model('captureSession'),
    process: model('process'),
    processStep: model('processStep'),
    persona: model('persona'),
    systemApplication: model('systemApplication'),
    painPoint: model('painPoint'),
    exception: model('exception'),
    metric: model('metric'),
    provenance: model('provenance'),
    stepPersona: model('stepPersona'),
    stepSystem: model('stepSystem'),
  };
  return { tx, writes };
}

async function applyFixture(entities, notes = []) {
  const { tx, writes } = fakeTx();
  prismaStub = { $transaction: async (fn) => fn(tx) };
  const output = { entities, lowConfidenceNotes: notes };
  // Everything under test must satisfy the real schema — a fixture that
  // couldn't come back from the model would prove nothing.
  structuringAgentOutputSchema.parse(output);
  const result = await applyStructuringOutput(output, {
    engagementId: 'eng', contributorId: 'contrib', mode: 'WRITE_UP',
    sourceType: 'narrative', rawText: 'fixture',
  });
  prismaStub = null;
  return { writes, result };
}

const field = (value, evidenceState = 'STATED') => ({ value, evidenceState });
const NONE = field('');

const PROCESS = {
  kind: 'PROCESS', existingId: '', name: 'Test Process',
  purpose: field('Purpose'), trigger: field('Trigger'), outcome: field('Outcome'),
};
const STEP = {
  kind: 'PROCESS_STEP', existingId: '', processName: 'Test Process', order: 1,
  stage: 'Phase', activity: 'Analyst reviews the item.', personaRoles: [],
  entryTrigger: field('Item arrives'), exitCriteria: field('Reviewed'),
  systemsRead: [], systemsWritten: [], isEscalationPoint: false,
};

const creates = (writes, model) => writes.filter((w) => w.model === model && w.op === 'create');

// The regression that motivated this suite. A pain point, exception or
// metric the model didn't tie to a step must still belong to the process.
// Setting neither leaves the record unreachable: every view queries by
// processId or stepId, so an orphan is silently lost, and it stayed lost
// across three engagements until a hand audit found 42 of them.
{
  const { writes } = await applyFixture([
    PROCESS, STEP,
    { kind: 'PAIN_POINT', existingId: '', relatedStepActivity: '', description: 'Process-wide friction', operationalImpact: NONE, frequency: NONE },
    { kind: 'EXCEPTION', existingId: '', relatedStepActivity: '', scenario: 'Escalation trigger spanning the process', frequency: NONE, currentResolutionMethod: field('Escalate to manager') },
    { kind: 'METRIC', existingId: '', relatedStepActivity: '', label: 'Cycle time', category: 'speed', currentValue: NONE, target: NONE },
  ]);

  for (const model of ['painPoint', 'exception', 'metric']) {
    const [row] = creates(writes, model);
    assert.ok(row, `${model} should have been created`);
    assert.ok(row.data.processId, `${model} with no step must fall back to the process, not orphan`);
    assert.ok(!row.data.stepId, `${model} without a named step must not invent one`);
  }
}

// The same three, when the model does name a step, attach to that step and
// must not also carry a processId — the step already implies the process,
// and setting both would double-count them in any view that unions the two.
{
  const { writes } = await applyFixture([
    PROCESS, STEP,
    { kind: 'PAIN_POINT', existingId: '', relatedStepActivity: STEP.activity, description: 'Step-local friction', operationalImpact: NONE, frequency: NONE },
    { kind: 'EXCEPTION', existingId: '', relatedStepActivity: STEP.activity, scenario: 'Step-local failure', frequency: NONE, currentResolutionMethod: NONE },
    { kind: 'METRIC', existingId: '', relatedStepActivity: STEP.activity, label: 'Step duration', category: 'speed', currentValue: NONE, target: NONE },
  ]);

  for (const model of ['painPoint', 'exception', 'metric']) {
    const [row] = creates(writes, model);
    assert.ok(row.data.stepId, `${model} naming a step must attach to it`);
    assert.ok(!row.data.processId, `${model} attached to a step must not also set processId`);
  }
}

// A follow-up capture that answers a question without restating the process
// — the shape of every clarifying submission — still has to attach. This is
// the case the original bug hit hardest: touchedProcess is only set by the
// step loop, so a submission with no steps had nothing to fall back to.
{
  const { writes } = await applyFixture([
    PROCESS,
    { kind: 'EXCEPTION', existingId: '', relatedStepActivity: '', scenario: 'Answer to "what goes wrong?"', frequency: NONE, currentResolutionMethod: field('Defined routing path') },
  ]);
  const [row] = creates(writes, 'exception');
  assert.ok(row.data.processId, 'A process-only submission must still anchor its exceptions');
}

// accessConstraints and decisionAuthority are the fields the FNOL review
// found missing entirely. They must reach the database and carry provenance,
// or the extraction silently drops the authorization story again.
{
  const { writes } = await applyFixture([
    PROCESS, STEP,
    { kind: 'SYSTEM', existingId: '', name: 'Payments', apiAvailability: { value: 'YES', evidenceState: 'STATED' }, dataHeld: field('Payment records'), accessConstraints: field('Read-only; approval required for writes') },
    { kind: 'PERSONA', existingId: '', role: 'Adjuster', isExternal: false, responsibilities: field('Handles claims'), decisionAuthority: field('Approves up to a stated limit') },
  ]);

  const [system] = creates(writes, 'systemApplication');
  assert.equal(system.data.accessConstraints, 'Read-only; approval required for writes');
  const [persona] = creates(writes, 'persona');
  assert.equal(persona.data.decisionAuthority, 'Approves up to a stated limit');

  const attrs = creates(writes, 'provenance').map((p) => p.data.attribute);
  for (const attribute of ['accessConstraints', 'decisionAuthority']) {
    assert.ok(attrs.includes(attribute), `${attribute} must carry provenance`);
  }
}

// An available API is not permission to use it. A system may state YES and
// still be constrained, and the two must never collapse into one field.
{
  const { writes } = await applyFixture([
    PROCESS, STEP,
    { kind: 'SYSTEM', existingId: '', name: 'CMS', apiAvailability: { value: 'YES', evidenceState: 'STATED' }, dataHeld: NONE, accessConstraints: field('Scoped, RBAC, audit-logged') },
  ]);
  const [system] = creates(writes, 'systemApplication');
  assert.equal(system.data.apiAvailability, 'YES');
  assert.ok(system.data.accessConstraints, 'A YES API must still be able to carry restrictions');
}

// A metric named without a value is the normal case, not a failed
// extraction. It must persist with currentValue absent so the missing number
// becomes a question someone can ask, rather than being dropped.
{
  const { writes } = await applyFixture([
    PROCESS, STEP,
    { kind: 'METRIC', existingId: '', relatedStepActivity: '', label: 'First-contact SLA attainment', category: 'speed', currentValue: NONE, target: NONE },
  ]);
  const [metric] = creates(writes, 'metric');
  assert.equal(metric.data.currentValue, undefined, 'An unquantified metric keeps a null value');
  assert.equal(metric.data.attributes.label, 'First-contact SLA attainment', 'The measure name must survive');
}

// Absent fields must not be written as empty strings. The empty-string
// sentinel means "not mentioned"; persisting it would turn silence into a
// stated blank answer and hide a real gap.
{
  const { writes } = await applyFixture([
    PROCESS,
    { ...STEP, exitCriteria: NONE, entryTrigger: NONE },
  ]);
  const [step] = creates(writes, 'processStep');
  assert.equal(step.data.exitCriteria, undefined, 'Undefined exit criteria stays a gap, never an empty string');
  const provAttrs = creates(writes, 'provenance').map((p) => p.data.attribute);
  assert.ok(!provAttrs.includes('exitCriteria'), 'An unmentioned field must not claim provenance');
}

console.log('Passed: orphan prevention, step/process exclusivity, access constraints, decision authority, unquantified metrics, empty-field handling.');

// --- Prompt content -------------------------------------------------------

// The prompt is the only durable memory between reviews: it is rebuilt per
// capture, so every rule in it reaches every future extraction. Nothing else
// carries a lesson forward, which makes silent deletion the real risk. These
// assertions name the review that earned each rule so a future edit has to
// be deliberate.
{
  const instruction = buildSystemInstruction('WRITE_UP');
  const required = [
    [/not the numbered walkthrough|non-walkthrough|trailing section/i, 'mine sections outside the step walkthrough (FNOL review, finding 3-5)'],
    [/step it actually arises from|clustering|concentrated on a single step/i, 'map exceptions to their own step (FNOL review, finding 3)'],
    [/METRIC|metric/i, 'extract metrics named without values (FNOL review, finding 4)'],
    [/accessConstraints/i, 'access constraints separate from API availability (FNOL review, finding 1)'],
    [/decisionAuthority/i, 'decision authority and financial limits (FNOL review, finding 6)'],
    [/spreadsheet|workbook/i, 'file resources kept as named resources (Payment Exceptions review)'],
    [/do not assert writes to all possible systems|uncertainty/i, 'uncertain write destinations (Payment Exceptions review)'],
    [/NOT_MENTIONED/i, 'confirmed unknown vs never asked'],
  ];
  for (const [pattern, why] of required) {
    assert.match(instruction, pattern, `Prompt lost the rule for: ${why}`);
  }
  assert.match(buildSystemInstruction('LIVE'), /LIVE/, 'Live mode guidance must still be selected');
}

console.log('Passed: prompt retains every rule earned by a prior review.');

// --- Layer 2: extraction quality (opt-in, calls the model) ----------------

if (!process.argv.includes('--model')) {
  console.log('\nSkipped model-backed extraction eval (pass --model to run it).');
  process.exit(0);
}

const dotenv = (await import('dotenv')).default;
dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', quiet: true });
const Anthropic = (await import('@anthropic-ai/sdk')).default;
const { betaZodOutputFormat } = await import('@anthropic-ai/sdk/helpers/beta/zod');

// A compact narrative carrying every shape the reviews found mishandled: a
// numbered walkthrough, then a trailing section holding the exception
// routing, an authorization distinction, and an enumerated list of monitored
// measures. Deliberately not one of the stored captures — those are what the
// prompt was tuned against, so passing on them proves less.
const NARRATIVE = `
Vendor invoice approval, end to end.

1. Invoice arrives
Vendors email invoices to a shared mailbox, or upload them through the supplier portal.
A Payables Clerk logs each one in the Invoice Register.

2. Match to purchase order
The clerk matches the invoice to a PO in the ERP. Matched invoices move straight to approval.

3. Approval
A Cost Centre Owner approves the invoice in the ERP. Approved invoices queue for payment.

What happens when something goes wrong?
Most problems have a defined path and never reach a manager.
A missing PO number goes back to the vendor for correction. A price mismatch goes to the
Procurement Analyst. A duplicate invoice is cancelled by the clerk. A suspected fraudulent
invoice triggers a referral to Financial Control.
We reserve manager escalation for approval delays past 10 days, disputed vendor relationships,
and any invoice above the Cost Centre Owner's approval limit, which moves up the delegation chain.

Systems and access
The ERP exposes an API, but Finance is not authorised to call it directly — access goes through
the integration platform, with scoped credentials and full audit logging. Payment release is
restricted regardless of API availability and requires dual authorisation. The supplier portal
has an API we can read from but not write to. The shared mailbox has no API at all.

What I watch
I track invoice cycle time, first-pass match rate, the proportion of invoices needing manual
intervention, approval turnaround, escalation volumes, and duplicate-payment incidents.
I don't have current figures to hand for any of them.
`.trim();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const model = process.env.CLAUDE_MODEL ?? 'claude-sonnet-5';
const response = await anthropic.beta.messages.parse({
  model,
  max_tokens: 16000,
  thinking: { type: 'disabled' },
  system: buildSystemInstruction('WRITE_UP'),
  output_format: betaZodOutputFormat(structuringAgentOutputSchema),
  messages: [{
    role: 'user',
    content: `No entities exist yet in this engagement's EKB.\n\n---\n\nNarrative to structure:\n\n${NARRATIVE}`,
  }],
});

const out = response.parsed_output ?? response.parsed;
assert.ok(out, 'Model returned no parsed output');
const of = (kind) => out.entities.filter((e) => e.kind === kind);

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const steps = of('PROCESS_STEP');
check(steps.length >= 3, `Expected the 3 walkthrough steps, got ${steps.length}`);

// The finding that recurs across both reviews: trailing sections get
// under-mined relative to the numbered steps.
const exceptions = of('EXCEPTION');
const text = (e) => `${e.scenario} ${e.currentResolutionMethod?.value ?? ''}`.toLowerCase();
for (const [needle, label] of [
  [/missing po|po number/, 'missing PO number'],
  [/price mismatch/, 'price mismatch'],
  [/duplicate/, 'duplicate invoice'],
  [/fraud/, 'suspected fraud'],
]) {
  check(exceptions.some((e) => needle.test(text(e))), `Exception not extracted: ${label}`);
}
check(exceptions.length >= 5, `Trailing exception section under-mined: ${exceptions.length} exceptions`);

// Exceptions clustered on one step is the signature of the FNOL defect.
const located = exceptions.filter((e) => e.relatedStepActivity);
const distinctSteps = new Set(located.map((e) => e.relatedStepActivity)).size;
check(exceptions.length === 0 || distinctSteps !== 1 || located.length < exceptions.length,
  'Every exception landed on the same step — routing paths were not mapped to where they arise');

// Metrics named without values must survive as records.
const metrics = of('METRIC');
check(metrics.length >= 5, `Expected the 6 monitored measures, got ${metrics.length}`);
check(metrics.every((m) => !m.currentValue.value),
  'No figures were given; a metric must not invent one');

// The authorization distinction — the FNOL review's most important finding.
const systems = of('SYSTEM');
const erp = systems.find((s) => /erp/i.test(s.name));
check(!!erp, 'ERP not extracted as a system');
if (erp) {
  check(!!erp.accessConstraints.value,
    'ERP states an API exists but Finance cannot call it directly — that belongs in accessConstraints');
  check(!/not authoris|integration platform|scoped/i.test(erp.dataHeld.value ?? ''),
    'Access restrictions were flattened into dataHeld instead of accessConstraints');
}
const mailbox = systems.find((s) => /mailbox/i.test(s.name));
check(!mailbox || mailbox.apiAvailability.value === 'NO',
  `Shared mailbox is stated to have no API; got ${mailbox?.apiAvailability.value}`);

// Approval limits are a hard control on any payment automation.
const personas = of('PERSONA');
const owner = personas.find((p) => /cost centre owner|cost center owner/i.test(p.role));
check(!!owner, 'Cost Centre Owner not extracted');
check(!owner || !!owner.decisionAuthority.value,
  'The stated approval limit and delegation chain belong in decisionAuthority');

// An exception and a pain point are different things.
const painPoints = of('PAIN_POINT');
const overlap = painPoints.filter((pp) =>
  exceptions.some((e) => e.scenario.toLowerCase() === pp.description.toLowerCase()));
check(overlap.length === 0, `Same observation stored as both exception and pain point: ${overlap.map((p) => p.description).join('; ')}`);

console.log(`\nModel eval (${model}): ${steps.length} steps, ${exceptions.length} exceptions, ` +
  `${metrics.length} metrics, ${systems.length} systems, ${personas.length} personas.`);

if (failures.length) {
  console.error(`\nFAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('Passed: trailing-section coverage, exception routing, unquantified metrics, access constraints, decision authority.');
