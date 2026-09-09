"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface EngagementRow {
  id: string;
  organization: string;
  scope: string | null;
  createdAt: string;
  updatedAt: string;
  entities: number;
  gaps: number;
}

type Filter = "all" | "active" | "archived";

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return `${Math.floor(day / 7)}w ago`;
}

export default function Home() {
  const router = useRouter();
  const [engagements, setEngagements] = useState<EngagementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [organization, setOrganization] = useState("");
  const [scope, setScope] = useState("");
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Load the index once on mount. `loading` starts true, so the fetch sets
  // state only on the way out — no synchronous setState in the effect body.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/engagements");
      const data = await res.json();
      if (cancelled) return;
      setEngagements(data.engagements);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function createEngagement(e: React.FormEvent) {
    e.preventDefault();
    if (!organization.trim()) return;
    setCreating(true);
    const res = await fetch("/api/engagements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization, scope: scope || undefined }),
    });
    const data = await res.json();
    if (res.ok && data.engagement) {
      // Straight into the new engagement's workspace — creating one is the
      // start of a capture session, not a reason to stay on the index.
      router.push(`/engagements/${data.engagement.id}`);
      return;
    }
    setCreating(false);
  }

  async function deleteEngagement(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/engagements/${id}`, { method: "DELETE" });
      setEngagements((rows) => rows.filter((r) => r.id !== id));
    } finally {
      setDeletingId(null);
      setPendingDeleteId(null);
    }
  }

  function startRename(row: EngagementRow) {
    setRenamingId(row.id);
    setRenameValue(row.organization);
  }

  async function commitRename(id: string) {
    const name = renameValue.trim();
    const original = engagements.find((r) => r.id === id)?.organization;
    if (!name || name === original) {
      setRenamingId(null);
      return;
    }
    setEngagements((rows) => rows.map((r) => (r.id === id ? { ...r, organization: name } : r)));
    setRenamingId(null);
    const res = await fetch(`/api/engagements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization: name }),
    });
    if (!res.ok && original) {
      // Roll back on failure — the optimistic update above assumed success.
      setEngagements((rows) => rows.map((r) => (r.id === id ? { ...r, organization: original } : r)));
    }
  }

  // "Active" / "archived" aren't modeled yet (no status field on Engagement) —
  // every engagement is "active" until that lands, so the filter is honest
  // about what it can actually distinguish today.
  const filtered = useMemo(() => {
    if (filter === "archived") return [];
    return engagements;
  }, [engagements, filter]);

  return (
    <div style={{ background: "var(--paper)" }} className="min-h-screen">
      <header
        className="flex items-center justify-between border-b px-6 py-3"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="flex items-center gap-2.5">
          <svg width="16" height="16" viewBox="0 0 256 256" aria-hidden>
            <circle cx="128" cy="128" r="128" fill="var(--ink)" />
            <path d="M128 45 L190 169 L66 169 Z" fill="var(--surface)" />
          </svg>
          <span className="font-mono text-sm font-bold uppercase tracking-wide" style={{ color: "var(--ink)" }}>
            Discovery Facilitator
          </span>
        </div>
        <nav className="flex items-center gap-6">
          <Link
            href="/"
            className="font-mono text-xs font-bold uppercase tracking-wide underline underline-offset-4"
            style={{ color: "var(--ink)" }}
          >
            Engagements
          </Link>
          <span
            className="font-mono text-xs uppercase tracking-wide"
            style={{ color: "var(--ink-faint)" }}
            aria-disabled
            title="Not available yet"
          >
            Preferences
          </span>
          <span
            className="flex items-center gap-1.5 border px-1.5 py-1"
            style={{ borderColor: "var(--border)" }}
          >
            <span
              className="flex h-4 w-4 items-center justify-center font-mono text-[0.6rem] font-bold"
              style={{ background: "var(--ink)", color: "var(--surface)" }}
            >
              U
            </span>
            <span className="font-mono text-xs" style={{ color: "var(--ink)" }}>
              you
            </span>
          </span>
        </nav>
      </header>

      {/* Hero */}
      <div className="grid grid-cols-1 border-b lg:grid-cols-[1fr_460px]" style={{ borderColor: "var(--border)" }}>
        <div className="px-6 py-14 sm:px-10">
          <p className="mb-3 font-mono text-xs uppercase tracking-widest" style={{ color: "var(--green-700)" }}>
            Process knowledge, captured as stated
          </p>
          <h1 className="mb-6 max-w-xl text-4xl font-bold leading-[1.1] tracking-tight" style={{ color: "var(--ink)" }}>
            Turn how work actually happens into structured, trustworthy knowledge.
          </h1>
          <p className="mb-8 max-w-xl text-base leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            Describe a process in your own words, live or written up after the fact. It becomes
            a record: steps, systems, people, pain points, exceptions. Each one tagged{" "}
            <span className="underline decoration-1 underline-offset-2" style={{ color: "var(--green-700)" }}>
              stated
            </span>
            ,{" "}
            <span className="underline decoration-1 underline-offset-2" style={{ color: "var(--brown-700)" }}>
              inferred
            </span>
            ,{" "}
            <span className="underline decoration-1 underline-offset-2" style={{ color: "var(--brown-700)" }}>
              estimated
            </span>{" "}
            or a known{" "}
            <span className="underline decoration-1 underline-offset-2" style={{ color: "var(--rust-700)" }}>
              gap
            </span>
            . Nothing is smoothed over, and the process plays back as a swim-lane diagram
            generated straight from that record.
          </p>

          <div className="flex flex-wrap items-center gap-2.5">
            <a href="#create" className="btn btn-primary">
              Start an engagement
            </a>
          </div>
        </div>

        <div className="border-t px-6 py-8 lg:border-t-0 lg:border-l" style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}>
          <span
            className="mb-3 block font-mono text-xs font-bold uppercase tracking-wide"
            style={{ color: "var(--ink-faint)" }}
          >
            Example — a captured pain point
          </span>

          {/* A real extracted record, field by field, each carrying the
              evidence state it was captured with. Static on purpose: this
              sells the mechanic to a first-time visitor, so it must not
              render zeroes on an empty instance the way an aggregate would. */}
          <div className="border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div
              className="flex items-center justify-between border-b px-3 py-2"
              style={{ borderColor: "var(--border-soft)", background: "var(--surface-sunken)" }}
            >
              {/* The engagement and process this was extracted from — a
                  first-time visitor needs the context, not the internal
                  ref code, which means nothing outside the workspace. */}
              <span className="font-mono text-xs font-bold" style={{ color: "var(--ink)" }}>
                Loan Covenant Monitoring
              </span>
              <span className="font-mono text-xs uppercase tracking-wide" style={{ color: "var(--ink-faint)" }}>
                Step 2
              </span>
            </div>

            {[
              {
                field: "description",
                value: "Covenant terms and due dates are interpreted and calculated by hand from long credit agreements.",
                state: "stated",
              },
              {
                field: "operational impact",
                value: "Manual interpretation raises error risk and workload.",
                state: "inferred",
              },
              {
                field: "frequency",
                value: "Ongoing, for every new covenant item.",
                state: "estimated",
              },
              {
                field: "root cause",
                // Gaps in the real product carry a note — the question to go
                // back and ask. Showing one without it would sell the weaker
                // half of the feature: that a field is merely blank.
                value: "Confirm whether the bottleneck is the agreement format or the lack of a covenant register — the answer decides whether this is worth automating.",
                state: "gap",
              },
            ].map(({ field, value, state }) => (
              <div
                key={field}
                className="border-b px-3 py-3 last:border-b-0"
                style={{ borderColor: "var(--border-soft)" }}
              >
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span
                    className="font-mono text-xs uppercase tracking-wide"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {field}
                  </span>
                  <span className={`badge badge-${state}`}>{state}</span>
                </div>
                {/* A gap isn't absence — it's a question the record is
                    holding open, so it gets the rust accent rather than the
                    faded treatment that would read as "nothing here". */}
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: state === "gap" ? "var(--rust-700)" : "var(--ink)" }}
                >
                  {state === "gap" ? "→ " : ""}
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4-step strip */}
      <div className="grid grid-cols-1 border-b sm:grid-cols-4" style={{ borderColor: "var(--border)" }}>
        {[
          ["1", "Capture", "Write up a process from memory, or take live notes while talking to the person who does the work."],
          ["2", "Structure", "The narrative is parsed into entities: steps, people, systems, pain points, exceptions, each marked stated, inferred, estimated, or a known gap."],
          ["3", "See the gaps", "The knowledge surface flags what's still missing: steps without exit criteria, systems with unconfirmed API access, anything marked an open gap. So you know what to ask next."],
          ["4", "Generate the artifact", "Play the record back as a swim-lane diagram, laid out by actor with gaps and escalation points marked, regenerated from the knowledge base on demand."],
        ].map(([num, title, body], i) => (
          <div
            key={title}
            className="border-b p-5 sm:border-b-0"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface-sunken)",
              borderRight: i < 3 ? "1px solid var(--border)" : undefined,
            }}
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className="flex h-5 w-5 items-center justify-center font-mono text-xs font-bold"
                style={{ background: "var(--ink)", color: "var(--surface)" }}
              >
                {num}
              </span>
              <span className="text-base font-bold" style={{ color: "var(--ink)" }}>
                {title}
              </span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              {body}
            </p>
          </div>
        ))}
      </div>

      {/* Engagements table */}
      <div className="px-6 py-8 sm:px-10" id="create">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-wide" style={{ color: "var(--ink-faint)" }}>
            Engagements ({engagements.length})
          </span>
          <div className="flex items-center gap-3 font-mono text-xs">
            {(["all", "active", "archived"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={filter === f ? "underline underline-offset-4" : ""}
                style={{ color: filter === f ? "var(--ink)" : "var(--ink-faint)", fontWeight: filter === f ? 700 : 400 }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="border" style={{ borderColor: "var(--border)" }}>
          <div
            className="grid grid-cols-[1.4fr_1.6fr_auto_auto_auto_auto] gap-4 border-b px-4 py-2 font-mono text-xs uppercase tracking-wide"
            style={{ borderColor: "var(--border)", background: "var(--surface-sunken)", color: "var(--ink-faint)" }}
          >
            <span>Name</span>
            <span>Scope</span>
            <span className="text-right">Entities</span>
            <span className="text-right">Gaps</span>
            <span className="text-right">Updated</span>
            <span />
          </div>

          {loading ? (
            <div className="px-4 py-6 text-sm" style={{ color: "var(--ink-soft)" }}>
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-6 text-sm" style={{ color: "var(--ink-soft)" }}>
              {filter === "archived" ? "No archived engagements." : "No engagements yet. Create one below."}
            </div>
          ) : (
            filtered.map((e) => {
              const empty = e.entities === 0;
              const confirming = pendingDeleteId === e.id;
              const renaming = renamingId === e.id;
              return (
                <div
                  key={e.id}
                  className="group grid grid-cols-[1.4fr_1.6fr_auto_auto_auto_auto] items-center gap-4 border-b px-4 py-3 text-sm last:border-b-0"
                  style={{ borderColor: "var(--border-soft)", background: confirming ? "var(--rust-100)" : undefined }}
                >
                  {renaming ? (
                    <input
                      autoFocus
                      className="border px-2 py-1 text-sm font-bold"
                      style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink)" }}
                      value={renameValue}
                      onChange={(ev) => setRenameValue(ev.target.value)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") commitRename(e.id);
                        if (ev.key === "Escape") setRenamingId(null);
                      }}
                      onBlur={() => commitRename(e.id)}
                    />
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Link
                        href={`/engagements/${e.id}`}
                        className="font-bold hover:underline"
                        style={{ color: empty ? "var(--ink-faint)" : "var(--ink)" }}
                      >
                        {e.organization}
                      </Link>
                      <button
                        onClick={(ev) => {
                          ev.preventDefault();
                          startRename(e);
                        }}
                        className="font-mono text-xs opacity-0 group-hover:opacity-100"
                        style={{ color: "var(--ink-faint)" }}
                        title="Rename"
                        aria-label={`Rename ${e.organization}`}
                      >
                        rename
                      </button>
                    </span>
                  )}
                  <Link href={`/engagements/${e.id}`} className="contents hover:opacity-70">
                    <span style={{ color: empty ? "var(--ink-faint)" : "var(--ink-soft)" }}>
                      {e.scope ?? "No scope set"}
                    </span>
                    <span className="text-right font-mono" style={{ color: empty ? "var(--ink-faint)" : "var(--ink)" }}>
                      {e.entities}
                    </span>
                    <span
                      className="text-right font-mono"
                      style={{ color: empty ? "var(--ink-faint)" : e.gaps > 0 ? "var(--rust-700)" : "var(--ink)" }}
                    >
                      {empty ? "—" : e.gaps}
                    </span>
                    <span className="text-right font-mono text-xs" style={{ color: "var(--ink-faint)" }}>
                      {timeAgo(e.updatedAt)}
                    </span>
                  </Link>
                  {confirming ? (
                    <span className="flex items-center justify-end gap-2 font-mono text-xs">
                      <button
                        onClick={() => deleteEngagement(e.id)}
                        disabled={deletingId === e.id}
                        className="font-bold uppercase"
                        style={{ color: "var(--rust-700)" }}
                      >
                        {deletingId === e.id ? "deleting…" : "confirm"}
                      </button>
                      <button onClick={() => setPendingDeleteId(null)} style={{ color: "var(--ink-faint)" }}>
                        cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setPendingDeleteId(e.id)}
                      className="justify-self-end font-mono text-xs opacity-0 group-hover:opacity-100"
                      style={{ color: "var(--ink-faint)" }}
                      title="Delete engagement"
                      aria-label={`Delete ${e.organization}`}
                    >
                      delete
                    </button>
                  )}
                </div>
              );
            })
          )}

          <form
            onSubmit={createEngagement}
            className="grid grid-cols-[1.4fr_1.6fr_auto] items-center gap-3 border-t px-4 py-3"
            style={{ borderColor: "var(--border)" }}
          >
            <input
              className="border px-2.5 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink)" }}
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="Name"
            />
            <input
              className="border px-2.5 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink)" }}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="Scope (optional)"
            />
            <button type="submit" disabled={creating || !organization.trim()} className="btn btn-primary justify-self-end">
              {creating ? "Creating…" : "+ Create"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
