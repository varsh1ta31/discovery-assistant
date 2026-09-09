# Extraction reviews

Quality evaluations of the Structuring Agent and current-state generator, run
against **synthetic test narratives** — invented insurance-claims scenarios
written to exercise the agents, not accounts of any real organization. System
names appearing here (ClaimCenter, PayHub, PolicyAdmin and the like) are fixture
data.

Each review reads the agent's output against the source narrative and records
what it got right, what it missed, and what changed as a result. They are kept
because they are the origin of the rules in
[`src/lib/agents/structuring/prompt.ts`](../../src/lib/agents/structuring/prompt.ts):
every rule there was earned by a specific failure documented in one of these
files.

That link runs both ways — `npm test` asserts the prompt still carries each
rule, so deleting a review loses the *reason* a rule exists while the test
keeps enforcing it. Add a new review here when a fix to extraction quality is
prompted by observed output.
