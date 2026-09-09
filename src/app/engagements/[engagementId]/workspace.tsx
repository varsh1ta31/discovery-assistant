"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { hasUnconfirmedApiGap, isSpreadsheetFile } from "@/lib/systemAccess";

type CaptureMode = "WRITE_UP" | "LIVE";
type EvidenceState = "STATED" | "INFERRED" | "ESTIMATED" | "GAP" | null;

interface FragmentJob {
  id: string;
  text: string;
  status: "structuring" | "done" | "error";
  entitiesWritten?: number;
  flaggedForReview?: number;
  error?: string;
}

interface StepRef {
  id: string;
  label: string; // short, model-generated — see labels.ts
}

interface EntityLocation {
  kind: "step" | "process";
  id: string;
  label: string;
}

interface KnowledgeSnapshot {
  counts: {
    processes: number;
    steps: number;
    personas: number;
    systems: number;
    painPoints: number;
    exceptions: number;
  };
  gaps: {
    stepsMissingExitCriteria: number;
    systemsUnknownApi: number;
  };
  processes: Array<{
    id: string;
    name: string;
    evidenceState: EvidenceState;
    steps: Array<{
      id: string;
      activity: string;
      exitCriteria: string | null;
      evidenceState: EvidenceState;
      personas: Array<{ id: string; role: string }>;
      systems: Array<{ id: string; name: string; direction: "READ" | "WRITE" }>;
    }>;
  }>;
  personas: Array<{ id: string; role: string; steps: StepRef[] }>;
  systems: Array<{
    id: string;
    name: string;
    apiAvailability: string;
    // True once an SME has actually confirmed nobody knows — distinct from
    // apiAvailability sitting at its UNKNOWN default because it's simply
    // never come up yet.
    apiAvailabilityConfirmed: boolean;
    // Separate from apiAvailability on purpose: an API can exist and still be
    // unusable by an automated agent (scopes, RBAC, read-only, approval gates).
    // Shown alongside the access column so "yes" is never read as "unrestricted".
    accessConstraints: string | null;
    steps: Array<StepRef & { direction: "READ" | "WRITE" }>;
  }>;
  painPoints: Array<{ id: string; description: string; location: EntityLocation | null }>;
  exceptions: Array<{ id: string; scenario: string; location: EntityLocation | null }>;
}

const STAT_ORDER = [
  ["processes", "processes"],
  ["steps", "steps"],
  ["personas", "personas"],
  ["systems", "systems"],
  ["painPoints", "pain points"],
  ["exceptions", "exceptions"],
] as const;

function evidenceLabel(state: EvidenceState) {
  if (!state) return null;
  return state.toLowerCase();
}

export default function EngagementWorkspace({ engagementId }: { engagementId: string }) {
  const [organization, setOrganization] = useState<string | null>(null);
  const [contributorId, setContributorId] = useState<string | null>(null);
  const [mode, setMode] = useState<CaptureMode>("WRITE_UP");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    entitiesWritten: number;
    flaggedForReview: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeSnapshot | null>(null);
  const [fragmentJobs, setFragmentJobs] = useState<FragmentJob[]>([]);
  const [activeStat, setActiveStat] = useState<string>("systems");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  // Guards against out-of-order responses: the mount-time load, a StrictMode
  // double-invoke of it, and a post-submit reload can all be in flight at
  // once (structuring calls take several seconds), and fetches don't
  // resolve in the order they were sent. Without this, an older in-flight
  // response can land after a newer one and clobber freshly-written
  // knowledge with a stale snapshot — the symptom being that the surface
  // only shows the new entities after a full remount (leave the page, come
  // back) forces a clean reload with nothing older left racing it.
  const loadKnowledgeRequestId = useRef(0);
  const loadKnowledge = useCallback(async () => {
    const requestId = ++loadKnowledgeRequestId.current;
    const res = await fetch(`/api/engagements/${engagementId}/knowledge`);
    if (res.ok && requestId === loadKnowledgeRequestId.current) {
      const snapshot = await res.json();
      if (requestId === loadKnowledgeRequestId.current) setKnowledge(snapshot);
    }
  }, [engagementId]);

  useEffect(() => {
    (async () => {
      const engRes = await fetch(`/api/engagements/${engagementId}`);
      if (engRes.ok) {
        const { engagement } = await engRes.json();
        setOrganization(engagement.organization);
      }

      const contribRes = await fetch(`/api/engagements/${engagementId}/contributors`);
      if (contribRes.ok) {
        const { contributors } = await contribRes.json();
        if (contributors.length > 0) {
          setContributorId(contributors[0].id);
        } else {
          const created = await fetch(`/api/engagements/${engagementId}/contributors`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Facilitator", role: "facilitator" }),
          });
          if (created.ok) {
            const { contributor } = await created.json();
            setContributorId(contributor.id);
          }
        }
      }

      await loadKnowledge();
    })();
  }, [engagementId, loadKnowledge]);

  // Write-up mode: the facilitator is present and waiting on the response
  // (§6.2) — a single blocking submit that surfaces the result is the right
  // fit, since there's nothing else to be doing meanwhile.
  async function submitWriteUp() {
    if (!text.trim() || !contributorId) return;
    setSubmitting(true);
    setError(null);
    setLastResult(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/capture/narrative`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contributorId, mode, text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Structuring failed");
      } else {
        setLastResult(data.result);
        setText("");
        await loadKnowledge();
      }
    } catch {
      setError("Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  // Live mode: the facilitator is mid-conversation and can't wait on a
  // structuring call before capturing the next thing said (§6.2, §10.3 —
  // gaps are parked, not asked live). Each fragment fires independently;
  // the textarea clears immediately so note-taking never blocks.
  function captureFragment() {
    if (!text.trim() || !contributorId) return;
    const fragmentText = text;
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setText("");
    setFragmentJobs((jobs) => [{ id: jobId, text: fragmentText, status: "structuring" }, ...jobs]);

    fetch(`/api/engagements/${engagementId}/capture/narrative`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contributorId, mode: "LIVE", text: fragmentText }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setFragmentJobs((jobs) =>
            jobs.map((j) => (j.id === jobId ? { ...j, status: "error", error: data.error } : j))
          );
        } else {
          await loadKnowledge();
          setFragmentJobs((jobs) =>
            jobs.map((j) =>
              j.id === jobId
                ? {
                    ...j,
                    status: "done",
                    entitiesWritten: data.result.entitiesWritten,
                    flaggedForReview: data.result.flaggedForReview,
                  }
                : j
            )
          );
        }
      })
      .catch(() => {
        setFragmentJobs((jobs) =>
          jobs.map((j) => (j.id === jobId ? { ...j, status: "error", error: "Request failed" } : j))
        );
      });
  }

  function handleSubmitClick() {
    if (mode === "LIVE") captureFragment();
    else submitWriteUp();
  }

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mode === "LIVE" && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      captureFragment();
    } else if (mode === "WRITE_UP" && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submitWriteUp();
    }
  }

  const extracting = submitting || fragmentJobs.some((job) => job.status === "structuring");
  const knowledgePending = !knowledge || extracting;

  const totalEntities = knowledge
    ? Object.values(knowledge.counts).reduce((a, b) => a + b, 0)
    : 0;

  function startRename() {
    setRenameValue(organization ?? "");
    setRenaming(true);
  }

  async function commitRename() {
    const name = renameValue.trim();
    setRenaming(false);
    if (!name || name === organization) return;
    const previous = organization;
    setOrganization(name);
    const res = await fetch(`/api/engagements/${engagementId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization: name }),
    });
    if (!res.ok) setOrganization(previous); // roll back on failure
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--paper)" }}>
      <header
        className="flex items-center justify-between border-b px-6 py-3"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="flex items-center gap-2.5">
          <svg width="16" height="16" viewBox="0 0 256 256" aria-hidden>
            <circle cx="128" cy="128" r="128" fill="var(--ink)" />
            <path d="M128 45 L190 169 L66 169 Z" fill="var(--surface)" />
          </svg>
          <Link
            href="/"
            className="font-mono text-xs uppercase tracking-widest"
            style={{ color: "var(--ink-faint)" }}
          >
            Engagements
          </Link>
          <span className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>
            /
          </span>
          {renaming ? (
            <input
              autoFocus
              className="border px-2 py-0.5 text-base font-bold"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink)" }}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              onBlur={commitRename}
            />
          ) : (
            <h1
              className="cursor-text text-base font-bold hover:underline"
              style={{ color: "var(--ink)" }}
              onClick={startRename}
              title="Click to rename"
            >
              {organization ?? "…"}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-3 font-mono text-xs" style={{ color: "var(--ink-faint)" }}>
          <span>{totalEntities} entities</span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--primary)" }}
            />
            live
          </span>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 md:grid-cols-2">
        {/* Capture surface */}
        <section
          className="border-r p-5"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <span
              className="font-mono text-xs font-bold uppercase tracking-wide"
              style={{ color: "var(--ink-faint)" }}
            >
              Capture
            </span>
            <div
              className="flex border font-mono text-xs"
              style={{ borderColor: "var(--border)" }}
            >
              {(["WRITE_UP", "LIVE"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="px-3 py-1 font-bold lowercase"
                  style={
                    mode === m
                      ? { background: "var(--ink)", color: "var(--surface)" }
                      : { color: "var(--ink-soft)" }
                  }
                >
                  {m === "WRITE_UP" ? "write-up" : "live"}
                </button>
              ))}
            </div>
          </div>

          <textarea
            className="mb-3 w-full border p-3 font-mono text-sm"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              color: "var(--ink)",
              minHeight: 220,
              opacity: mode === "WRITE_UP" && submitting ? 0.6 : 1,
            }}
            placeholder={
              mode === "LIVE"
                ? "type what's being said. press enter to capture a fragment and keep going_"
                : "describe how the process works, in your own words_"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            disabled={mode === "WRITE_UP" && submitting}
          />

          <div className="flex items-center gap-2.5">
            <button
              className="btn btn-primary"
              onClick={handleSubmitClick}
              disabled={(mode === "WRITE_UP" && submitting) || !text.trim() || !contributorId}
            >
              {mode === "WRITE_UP" ? (submitting ? "Structuring…" : "Submit") : "Capture fragment"}
            </button>
            <span className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>
              {mode === "LIVE" ? "or press enter" : "⏎ ⌘+enter"}
            </span>
          </div>

          {mode === "WRITE_UP" && error && (
            <div
              className="mt-3 border px-3 py-2 font-mono text-sm"
              style={{ borderColor: "var(--rust-700)", background: "var(--rust-100)", color: "var(--rust-700)" }}
            >
              {error}
            </div>
          )}
          {mode === "WRITE_UP" && lastResult && (
            <div
              className="mt-3 border px-3 py-2 font-mono text-sm"
              style={{ borderColor: "var(--green-700)", background: "var(--green-100)", color: "var(--green-700)" }}
            >
              extract ok · wrote {lastResult.entitiesWritten} entities
              {lastResult.flaggedForReview > 0
                ? ` · ${lastResult.flaggedForReview} conflicts`
                : " · 0 conflicts"}
            </div>
          )}

          {mode === "LIVE" && fragmentJobs.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {fragmentJobs.map((job) => (
                <div
                  key={job.id}
                  className="border px-3 py-2 font-mono text-sm"
                  style={{
                    borderColor:
                      job.status === "error"
                        ? "var(--rust-700)"
                        : job.status === "structuring"
                          ? "var(--border)"
                          : "var(--green-700)",
                    background:
                      job.status === "error"
                        ? "var(--rust-100)"
                        : job.status === "structuring"
                          ? "var(--surface-sunken)"
                          : "var(--green-100)",
                  }}
                >
                  <div style={{ color: "var(--ink-soft)" }} className="mb-1 truncate text-xs italic">
                    &ldquo;{job.text}&rdquo;
                  </div>
                  {job.status === "structuring" && (
                    <span style={{ color: "var(--ink-soft)" }}>structuring…</span>
                  )}
                  {job.status === "done" && (
                    <span style={{ color: "var(--green-700)" }}>
                      wrote {job.entitiesWritten} entities
                      {job.flaggedForReview ? ` · ${job.flaggedForReview} flagged for review` : ""}
                    </span>
                  )}
                  {job.status === "error" && (
                    <span style={{ color: "var(--rust-700)" }}>{job.error ?? "structuring failed"}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-6">
            <span
              className="mb-2 block font-mono text-xs font-bold uppercase tracking-wide"
              style={{ color: "var(--ink-faint)" }}
            >
              Open questions
            </span>
            {/* Each gap named against the specific entity it's on — "3 systems
                with unknown API access" tells you there's a problem but not
                what to actually ask the SME next time you talk to them. A
                *confirmed* unknown (someone was asked and the honest answer
                is "nobody knows") isn't an open question anymore — it's a
                settled fact you can build the artifact on — so it's
                excluded here and shown instead as "unknown (confirmed)" in
                the systems table below. */}
            <ul className="flex flex-col gap-1.5 font-mono text-sm" style={{ color: "var(--ink-soft)" }}>
              {knowledge?.systems
                .filter(hasUnconfirmedApiGap)
                .map((s) => <li key={s.id}>→ {s.name}: API access unknown</li>)}
              {knowledge?.processes.flatMap((p) =>
                p.steps
                  .filter((s) => !s.exitCriteria)
                  .map((s) => (
                    <li key={s.id}>
                      → {p.name} — &ldquo;{s.activity}&rdquo;: no exit criteria
                    </li>
                  ))
              )}
              {knowledge &&
                knowledge.gaps.systemsUnknownApi === 0 &&
                knowledge.gaps.stepsMissingExitCriteria === 0 && <li>→ no open gaps right now</li>}
            </ul>
          </div>
        </section>

        {/* Knowledge surface */}
        <section className="p-6 lg:p-8" aria-label="Knowledge surface" aria-busy={knowledgePending} style={{ background: "var(--surface-sunken)" }}>
          <div className="mb-3 flex items-center justify-between">
            <span
              className="font-mono text-xs font-bold uppercase tracking-wide"
              style={{ color: "var(--ink-faint)" }}
            >
              Knowledge surface
            </span>
            {knowledgePending && (
              <span role="status" className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest" style={{ color: "var(--green-700)" }}>
                <span aria-hidden="true" className="h-2.5 w-2.5 border motion-safe:animate-pulse" style={{ background: "var(--primary)", borderColor: "var(--green-700)" }} />
                {extracting ? "Extracting" : "Loading"}
              </span>
            )}
            {/* Only unambiguous with exactly one process — with several,
                stick to each process card's own button below rather than
                guess which one this should point at. */}
            {!knowledgePending && knowledge && knowledge.processes.length === 1 && knowledge.processes[0].steps.length > 0 && (
              <Link
                href={`/engagements/${engagementId}/processes/${knowledge.processes[0].id}/current-state`}
                className="btn btn-primary"
                style={{ padding: "0.35rem 0.75rem", fontSize: "0.68rem" }}
              >
                Current state →
              </Link>
            )}
          </div>

          <div className="mt-6 grid grid-cols-3 border" style={{ borderColor: totalEntities === 0 && !knowledgePending ? "var(--border-soft)" : "var(--border)", borderStyle: totalEntities === 0 && !knowledgePending ? "dashed" : "solid" }}>
            {STAT_ORDER.map(([key, label], i) => {
              const count = knowledge?.counts[key] ?? 0;
              const empty = totalEntities === 0 && !knowledgePending;
              const pending = knowledgePending && count === 0;
              const active = !empty && !pending && activeStat === key;
              return (
                <button key={key} onClick={() => setActiveStat(key)} disabled={empty || pending}
                  aria-pressed={active} aria-label={`${label}: ${pending ? "loading" : count}`}
                  className="min-w-0 px-4 py-5 text-left"
                  style={{ borderRight: i % 3 !== 2 ? `1px ${empty ? "dashed" : "solid"} var(--border-soft)` : undefined,
                    borderBottom: i < 3 ? `1px ${empty ? "dashed" : "solid"} var(--border-soft)` : undefined,
                    background: active ? "var(--primary-100)" : empty ? "var(--paper)" : "var(--surface)" }}>
                  {pending ? (
                    <span aria-hidden="true" className="mb-2 block h-9 w-14 motion-safe:animate-pulse" style={{ background: "var(--surface-sunken)" }} />
                  ) : (
                    <span className="mb-2 block font-mono text-4xl font-bold leading-none" style={{ color: empty ? "var(--border-soft)" : "var(--ink)" }}>{String(count).padStart(2, "0")}</span>
                  )}
                  <span className="font-mono text-[0.65rem] uppercase tracking-widest" style={{ color: active ? "var(--green-700)" : "var(--ink-faint)" }}>{label}</span>
                </button>
              );
            })}
          </div>

          {totalEntities === 0 && !knowledgePending && (
            <div className="mt-7">
              <div className="border-l-[3px] pl-5" style={{ borderColor: "var(--ink)" }}>
                <h2 className="text-xl font-bold" style={{ color: "var(--ink)" }}>Nothing captured yet</h2>
                <p className="mt-3 font-mono text-sm leading-7" style={{ color: "var(--ink-soft)" }}>
                  Describe a process in the capture panel to start building your knowledge surface. Details inferred from your notes are marked <span style={{ color: "var(--brown-700)" }}>inferred</span>.
                </p>
              </div>
              <p className="mt-7 font-mono text-xs uppercase tracking-widest" style={{ color: "var(--ink-faint)" }}>Try starting with</p>
              <ul className="mt-3 space-y-2 font-mono text-sm" style={{ color: "var(--ink-soft)" }}>
                <li>→ who starts the process, and what triggers it</li>
                <li>→ which systems and teams are involved</li>
                <li>→ where delays or exceptions happen</li>
              </ul>
            </div>
          )}

          {knowledge && (
            <div className="mt-6 flex flex-col gap-4">
              {knowledge.processes.map((p) => (
                <div key={p.id} className="border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <div
                    className="flex items-center justify-between border-b px-3 py-2"
                    style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}
                  >
                    <div className="flex items-baseline gap-2">
                      <span
                        className="font-mono text-[0.65rem] uppercase tracking-wide"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        Process
                      </span>
                      <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>
                        {p.name}
                      </span>
                    </div>
                    <span className="flex items-center gap-3">
                      <span className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>
                        {p.steps.length} step{p.steps.length === 1 ? "" : "s"}
                      </span>
                      {/* With a single process the heading-level button
                          above already points here — a second, identical
                          button on the card would just be clutter. This
                          one earns its place once there's more than one
                          process to disambiguate between. */}
                      {p.steps.length > 0 && knowledge.processes.length > 1 && (
                        <Link
                          href={`/engagements/${engagementId}/processes/${p.id}/current-state`}
                          className="btn btn-primary"
                          style={{ padding: "0.35rem 0.75rem", fontSize: "0.68rem" }}
                        >
                          Current state →
                        </Link>
                      )}
                    </span>
                  </div>
                  {p.steps.length === 0 ? (
                    <div className="px-3 py-2 text-sm" style={{ color: "var(--ink-soft)" }}>
                      No steps captured yet
                    </div>
                  ) : (
                    <ul>
                      {p.steps.map((s, i) => (
                        <li
                          key={s.id}
                          className="flex flex-col gap-1.5 border-t px-3 py-2 text-sm first:border-t-0"
                          style={{ borderColor: "var(--border-soft)" }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex items-baseline gap-2">
                              <span className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              <span style={{ color: "var(--ink)" }}>{s.activity}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              {!s.exitCriteria && (
                                <span className="badge badge-gap">no exit criteria</span>
                              )}
                              {evidenceLabel(s.evidenceState) && (
                                <span className={`badge badge-${evidenceLabel(s.evidenceState)}`}>
                                  {evidenceLabel(s.evidenceState)}
                                </span>
                              )}
                            </span>
                          </div>
                          {(s.personas.length > 0 || s.systems.length > 0) && (
                            <div className="flex flex-wrap items-center gap-1.5 pl-6">
                              {s.personas.map((persona) => (
                                <span key={persona.id} className="chip">
                                  {persona.role}
                                </span>
                              ))}
                              {s.systems.map((sys) => (
                                <span key={`${sys.id}-${sys.direction}`} className="chip">
                                  {sys.name} · {sys.direction.toLowerCase()}
                                </span>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              {knowledge.systems.length > 0 && (
                <div className="border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <div
                    className="grid grid-cols-[1fr_140px_1.4fr] gap-3 border-b px-3 py-2 font-mono text-[0.65rem] uppercase tracking-wide"
                    style={{ borderColor: "var(--border)", background: "var(--surface-sunken)", color: "var(--ink-faint)" }}
                  >
                    <span>System / data source</span>
                    <span>API access</span>
                    <span>Used in</span>
                  </div>
                  <ul>
                    {knowledge.systems.map((s) => {
                      const fileResource = isSpreadsheetFile(s.name);
                      const isUnknown = s.apiAvailability === "UNKNOWN";
                      // Three states, not two: known (green), confirmed
                      // unknown — someone was actually asked, this is the
                      // real answer (neutral, not a red flag), and
                      // unconfirmed unknown — still an open question (rust).
                      const color = fileResource ? "var(--ink-faint)" : !isUnknown
                        ? "var(--green-700)"
                        : s.apiAvailabilityConfirmed
                          ? "var(--ink-faint)"
                          : "var(--rust-700)";
                      return (
                        <li
                          key={s.id}
                          className="grid grid-cols-[1fr_140px_1.4fr] items-start gap-3 border-t px-3 py-2 text-sm first:border-t-0"
                          style={{ borderColor: "var(--border-soft)" }}
                        >
                          <span style={{ color: "var(--ink)" }}>
                            {s.name}
                            {/* An available API is not the same as permission
                                to call it. Where the SME stated a restriction,
                                it sits with the system rather than behind a
                                green "yes" that reads as unrestricted. */}
                            {s.accessConstraints && (
                              <span
                                className="mt-0.5 block text-xs"
                                style={{ color: "var(--ink-faint)" }}
                              >
                                {s.accessConstraints}
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-xs lowercase" style={{ color }}>
                            {fileResource ? "file-based · n/a" : isUnknown && s.apiAvailabilityConfirmed
                              ? "unknown (confirmed)"
                              : s.apiAvailability.toLowerCase()}
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5">
                            {s.steps.length === 0 ? (
                              <span className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>
                                —
                              </span>
                            ) : (
                              s.steps.map((step) => (
                                <span key={`${step.id}-${step.direction}`} className="chip chip-wrap">
                                  {step.label} · {step.direction.toLowerCase()}
                                </span>
                              ))
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {knowledge.personas.length > 0 && (
                <div className="border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <div
                    className="grid grid-cols-[1fr_auto] gap-3 border-b px-3 py-2 font-mono text-[0.65rem] uppercase tracking-wide"
                    style={{ borderColor: "var(--border)", background: "var(--surface-sunken)", color: "var(--ink-faint)" }}
                  >
                    <span>Persona</span>
                    <span>Steps</span>
                  </div>
                  {/* Who's on which step is already visible as chips in the
                      steps table above — repeating the full list here per
                      persona just piles up chips for anyone in several
                      steps. A count is enough; the steps table is where you
                      go to see which ones. */}
                  <ul>
                    {knowledge.personas.map((persona) => (
                      <li
                        key={persona.id}
                        className="grid grid-cols-[1fr_auto] items-center gap-3 border-t px-3 py-2 text-sm first:border-t-0"
                        style={{ borderColor: "var(--border-soft)" }}
                      >
                        <span style={{ color: "var(--ink)" }}>{persona.role}</span>
                        <span
                          className="font-mono text-xs"
                          style={{ color: persona.steps.length === 0 ? "var(--rust-700)" : "var(--ink-faint)" }}
                        >
                          {persona.steps.length === 0 ? "unlinked" : persona.steps.length}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {knowledge.painPoints.length > 0 && (
                <div className="border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <div
                    className="grid grid-cols-[1fr_auto] gap-3 border-b px-3 py-2 font-mono text-[0.65rem] uppercase tracking-wide"
                    style={{ borderColor: "var(--border)", background: "var(--surface-sunken)", color: "var(--ink-faint)" }}
                  >
                    <span>Pain point</span>
                    <span>Where</span>
                  </div>
                  <ul>
                    {knowledge.painPoints.map((pp) => (
                      <li
                        key={pp.id}
                        className="grid grid-cols-[1fr_auto] items-center gap-3 border-t px-3 py-2 text-sm first:border-t-0"
                        style={{ borderColor: "var(--border-soft)" }}
                      >
                        <span style={{ color: "var(--ink)" }}>{pp.description}</span>
                        <span className="chip chip-wrap" style={{ justifySelf: "end" }}>
                          {pp.location ? pp.location.label : "unlinked"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {knowledge.exceptions.length > 0 && (
                <div className="border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <div
                    className="grid grid-cols-[1fr_auto] gap-3 border-b px-3 py-2 font-mono text-[0.65rem] uppercase tracking-wide"
                    style={{ borderColor: "var(--border)", background: "var(--surface-sunken)", color: "var(--ink-faint)" }}
                  >
                    <span>Exception</span>
                    <span>Where</span>
                  </div>
                  <ul>
                    {knowledge.exceptions.map((ex) => (
                      <li
                        key={ex.id}
                        className="grid grid-cols-[1fr_auto] items-center gap-3 border-t px-3 py-2 text-sm first:border-t-0"
                        style={{ borderColor: "var(--border-soft)" }}
                      >
                        <span style={{ color: "var(--ink)" }}>{ex.scenario}</span>
                        <span className="chip chip-wrap" style={{ justifySelf: "end" }}>
                          {ex.location ? ex.location.label : "unlinked"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            </div>
          )}
          {knowledgePending && (
            <div aria-hidden="true" className="mt-6 border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <div className="border-b px-5 py-4" style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}>
                <div className="h-3 w-2/3 motion-safe:animate-pulse" style={{ background: "var(--border-soft)" }} />
              </div>
              {[0, 1].map((row) => (
                <div key={row} className="flex items-center gap-4 border-b px-5 py-5 last:border-b-0" style={{ borderColor: "var(--border-soft)" }}>
                  <span className="h-3 w-6 motion-safe:animate-pulse" style={{ background: "var(--surface-sunken)" }} />
                  <span className="h-3 w-2/3 motion-safe:animate-pulse" style={{ background: "var(--surface-sunken)" }} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
