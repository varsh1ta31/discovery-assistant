"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import type { CurrentStateArtifact, SwimLaneNode } from "@/lib/agents/currentState/types";
import { buildPanels } from "@/lib/agents/currentState/panels";

export default function CurrentStateView({
  engagementId,
  processId,
}: {
  engagementId: string;
  processId: string;
}) {
  const [artifact, setArtifact] = useState<CurrentStateArtifact | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/processes/${processId}/current-state`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to generate current-state artifact");
        }
        const data = await res.json();
        if (!cancelled) setArtifact(data.artifact);
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : "Unable to generate the current-state artifact. Please reload to try again.");
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [engagementId, processId]);

  useEffect(() => {
    if (!artifact) return;
    const previousTitle = document.title;
    const processName = artifact.processName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim() || "Process";
    document.title = `${processName} - Current State`;
    return () => { document.title = previousTitle; };
  }, [artifact]);

  async function downloadArtifact() {
    await document.fonts.ready;
    // Allow font layout and the size observer to settle before print pagination.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    window.print();
  }

  return (
    <div className="current-state-page flex min-h-screen flex-col" style={{ background: "var(--paper)" }}>
      <header
        className="print-hide flex items-center justify-between border-b px-6 py-3"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest">
          <Link href={`/engagements/${engagementId}`} style={{ color: "var(--ink-faint)" }}>
            ← Back to engagement
          </Link>
        </div>
        {artifact && (
          <button className="btn btn-primary" onClick={downloadArtifact}>
            Download
          </button>
        )}
      </header>

      {error && (
        <div className="p-6">
          <div
            className="border px-3 py-2 text-sm"
            style={{ borderColor: "var(--rust-700)", background: "var(--rust-100)", color: "var(--rust-700)" }}
          >
            {error}
          </div>
        </div>
      )}

      {!artifact && !error && (
        <CurrentStateLoading />
      )}

      {artifact && (
        <div className="artifact-viewport w-full overflow-x-auto">
          {artifact.swimLane.nodes.length === 0 ? <p className="p-6">No steps captured yet for this process.</p> : buildPanels(artifact).map((panel, index, panels) => (
            <SwimLaneSlide key={index} artifact={panel} fullArtifact={artifact} panelIndex={index} panelCount={panels.length} />
          ))}
        </div>
      )}
      <style>{`
        @media print {
          .print-hide { display: none !important; }
          html, body { display: block !important; height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; background: white !important; }
          .current-state-page { display: block !important; min-height: 0 !important; }
          .artifact-viewport { display: block !important; overflow: visible !important; }
          .slide-frame { margin: 0 !important; break-inside: avoid; page-break-inside: avoid; break-after: page; }
          .slide-frame:last-child { break-after: auto; }
          .slide-legend { break-inside: avoid; page-break-inside: avoid; }
          * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
function CurrentStateLoading() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-10" aria-labelledby="current-state-loading-title" aria-busy="true">
      <h1 id="current-state-loading-title" className="text-xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
        Generating current-state artifact
      </h1>
      <div className="current-state-progress relative mt-5 h-1.5 overflow-hidden" role="progressbar" aria-label="Generating current-state artifact" style={{ background: "var(--border-soft)" }}>
        <div className="current-state-progress-bar absolute inset-y-0 w-1/3" style={{ background: "var(--ink)" }} />
      </div>
      <div className="mt-10 border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="flex items-center gap-4 px-5 py-4 font-mono" role="status" style={{ background: "var(--primary-100)" }}>
          <span className="h-2 w-2 shrink-0 rounded-full motion-safe:animate-pulse" aria-hidden="true" style={{ background: "var(--green-700)" }} />
          <span className="flex-1 text-sm font-medium">Building the diagram from captured process knowledge</span>
          <span className="text-xs sm:text-sm" style={{ color: "var(--green-700)" }}>running</span>
        </div>
        <ul aria-label="What the artifact includes">
          {[
            "Process steps grouped into phases",
            "Owning teams and handoffs",
            "System interactions and escalation points",
            "Unresolved gaps in the captured process",
          ].map((label) => (
            <li key={label} className="flex items-center gap-4 border-t px-5 py-4 font-mono text-sm" style={{ borderColor: "var(--border-soft)", color: "var(--ink-faint)" }}>
              <span className="w-2 shrink-0 text-center" aria-hidden="true">·</span>
              {label}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-9 max-w-4xl font-mono text-xs leading-relaxed" style={{ color: "var(--ink-faint)" }}>
        Your diagram will appear here when it’s ready. Keep this page open while it’s generated from the latest captured process knowledge.
      </p>
      <style>{`
        @keyframes current-state-progress {
          from { transform: translateX(-100%); }
          to { transform: translateX(300%); }
        }
        .current-state-progress-bar { animation: current-state-progress 1.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .current-state-progress-bar { animation: none; width: 100%; opacity: 0.4; }
        }
      `}</style>
    </section>
  );
}

const LANE_LABEL_WIDTH = 160;
const CARD_GUTTER = 32;
const PHASE_TINTS = ["#eeede6", "transparent"];
const LANE_RULE = "1px solid #e7e5dc";
const LANE_ROW_MIN_HEIGHT = 220;

function SwimLaneSlide({ artifact, fullArtifact, panelIndex, panelCount }: {
  artifact: CurrentStateArtifact; fullArtifact: CurrentStateArtifact; panelIndex: number; panelCount: number;
}) {
  const { lanes, nodes, phases } = artifact.swimLane;
  const localIds = new Set(nodes.map(node => node.stepId));
  const localEdges = artifact.swimLane.edges.filter(edge => localIds.has(edge.from) && localIds.has(edge.to));
  const relevantEdges = artifact.swimLane.edges.filter(edge => localIds.has(edge.from) || localIds.has(edge.to));
  const pageName = `current-state-${panelIndex}`;
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [exportSize, setExportSize] = useState<{ width: number; height: number } | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const laneRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [overlayGeometry, setOverlayGeometry] = useState<{
    width: number;
    height: number;
    cardEdges: Map<string, { left: number; right: number; y: number; bottom: number }>;
  } | null>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || lanes.length === 0) return;

    function measure() {
      const gridEl = gridRef.current;
      if (!gridEl) return;
      const frame = frameRef.current;
      if (frame) {
        const width = Math.ceil(frame.offsetWidth);
        const height = Math.ceil(frame.offsetHeight);
        setExportSize((previous) => previous?.width === width && previous?.height === height ? previous : { width, height });
      }
      const gridRect = gridEl.getBoundingClientRect();
      if (gridRect.height === 0 || gridRect.width === 0) return;
      const firstLane = laneRefs.current.get(lanes[0]?.laneId ?? "")?.getBoundingClientRect();
      const overlayTop = firstLane?.top ?? gridRect.top;
      const overlayLeft = firstLane ? firstLane.right : gridRect.left;
      const width = gridRect.right - overlayLeft;
      const height = gridRect.bottom - overlayTop;
      if (width === 0 || height === 0) return;
      const cardEdges = new Map<string, { left: number; right: number; y: number; bottom: number }>();
      cardRefs.current.forEach((el, stepId) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        cardEdges.set(stepId, {
          left: rect.left - overlayLeft,
          right: rect.right - overlayLeft,
          y: rect.top + rect.height / 2 - overlayTop,
          bottom: rect.bottom - overlayTop,
        });
      });
      setOverlayGeometry({ width, height, cardEdges });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    if (frameRef.current) observer.observe(frameRef.current);
    return () => observer.disconnect();
  }, [lanes, nodes]);

  if (nodes.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
        No steps captured yet for this process.
      </p>
    );
  }

  const laneIndexById = new Map(lanes.map((lane, i) => [lane.laneId, i]));

  const columnCount = Math.max(...nodes.map((n) => n.column)) + 1;
  const rowCount = lanes.length;
  const headerRowCount = phases.length > 0 ? 1 : 0;
  const slideWidth = 1248;
  const slideHeight = Math.max(700, 280 + rowCount * LANE_ROW_MIN_HEIGHT);

  return (
    <div
      ref={frameRef}
      className="slide-frame mx-auto mb-8 flex flex-col"
      style={{
        "--paper": "#f8f7f3",
        "--ink": "#20201c",
        "--ink-soft": "#55544a",
        "--ink-faint": "#807e6d",
        "--border": "#77766f",
        "--border-soft": "#dedcd0",
        "--surface": "#fffdfa",
        "--rust-700": "#b6532d",
        "--rust-100": "#fcf4ee",
        background: "var(--paper)",
        width: slideWidth,
        flexShrink: 0,
        page: pageName,
        minHeight: slideHeight,
        padding: "24px 32px 18px",
      } as React.CSSProperties}
    >
      <style>{`@media print { @page ${pageName} { size: ${exportSize?.width ?? slideWidth}px ${(exportSize?.height ?? slideHeight) + 4}px; margin: 0; } }`}</style>
      <div className="flex flex-none items-end justify-between gap-6 border-b-2 pb-3" style={{ borderColor: "var(--border)" }}>
        <div><p className="mb-1 font-mono text-[0.6rem] uppercase tracking-widest" style={{ color: "var(--ink-faint)" }}>
          Current state{panelCount > 1 ? ` · ${panelIndex + 1} / ${panelCount}` : ""}
        </p>
        <h1 className="text-[26px] font-bold leading-tight" style={{ color: "var(--ink)" }}>
          {artifact.processName}
        </h1></div>
      </div>
      <div
        ref={gridRef}
        className="relative min-h-0 border-b"
        style={{
          borderColor: "var(--border)",
          display: "grid",
          gridTemplateColumns: `${LANE_LABEL_WIDTH}px repeat(${columnCount}, minmax(0, 1fr))`,
          gridTemplateRows: `${phases.length > 0 ? "32px " : ""}repeat(${rowCount}, minmax(${LANE_ROW_MIN_HEIGHT}px, auto))`,
          columnGap: 0,
          rowGap: 0,
        }}
      >
        {phases.map((phase, phaseIndex) => (
          <div
            key={`phase-tint-${phase.name}-${phase.startColumn}`}
            style={{
              gridColumn: `${phase.startColumn + 2} / span ${phase.endColumn - phase.startColumn + 1}`,
              gridRow: `1 / span ${headerRowCount + rowCount}`,
              background: PHASE_TINTS[phaseIndex % PHASE_TINTS.length],
            }}
          />
        ))}
        {phases.map((phase) => {
          const span = phase.endColumn - phase.startColumn + 1;
          const startCol = phase.startColumn + 2; // +1 for 1-indexing, +1 for the label column
          return (
            <div
              key={`phase-header-${phase.name}-${phase.startColumn}`}
              className="flex min-h-0 items-center justify-center border-b py-1 text-center font-mono uppercase tracking-wide"
              style={{
                gridColumn: `${startCol} / span ${span}`,
                gridRow: 1,
                borderColor: "var(--border-soft)",
                color: "var(--ink-soft)",
                fontSize: "11px",
                letterSpacing: "0.14em",
                lineHeight: 1.3,
                overflowWrap: "break-word",
              }}
            >
              <span className="px-1">{phase.name}</span>
            </div>
          );
        })}
        {lanes.slice(0, -1).map((lane, i) => (
          <div
            key={`rule-${lane.laneId}`}
            style={{
              gridColumn: "1 / -1",
              gridRow: i + 1 + headerRowCount,
              borderBottom: LANE_RULE,
              alignSelf: "end",
            }}
          />
        ))}
        {lanes.map((lane, i) => (
          <div
            key={lane.laneId}
            ref={(el) => {
              laneRefs.current.set(lane.laneId, el);
            }}
            className="flex items-center pr-7 py-2 font-bold"
            style={{
              gridColumn: 1,
              gridRow: i + 1 + headerRowCount,
              borderColor: "var(--border)",
              background: "transparent",
              color: "var(--ink)",
              fontSize: "15px",
              lineHeight: 1.2,
              minHeight: LANE_ROW_MIN_HEIGHT,
            }}
          >
            {lane.label}
          </div>
        ))}
        {nodes.map((node) => (
          <div
            key={node.stepId}
            style={{
              gridColumn: node.column + 2,
              gridRow: (laneIndexById.get(node.laneId) ?? 0) + 1 + headerRowCount,
              display: "flex",
              alignItems: "stretch",
              padding: `20px ${CARD_GUTTER / 2}px ${28 + localEdges.filter(edge => nodes.find(n => n.stepId === edge.from)?.laneId === node.laneId).length * 16}px`,
              minWidth: 0,
              minHeight: LANE_ROW_MIN_HEIGHT,
            }}
          >
            <StepCard
              node={node}
              cardRef={(el) => {
                cardRefs.current.set(node.stepId, el);
              }}
            />
          </div>
        ))}
        <div
          style={{
            gridColumn: `2 / -1`,
            gridRow: `${1 + headerRowCount} / span ${rowCount}`,
            position: "relative",
            pointerEvents: "none",
          }}
        >
          {overlayGeometry && (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              style={{ zIndex: 1 }}
              viewBox={`0 0 ${overlayGeometry.width} ${overlayGeometry.height}`}
              preserveAspectRatio="none"
            >
              <defs>
                <marker
                  id={`${pageName}-arrow`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth={6}
                  markerHeight={6}
                  markerUnits="userSpaceOnUse"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-faint)" />
                </marker>
                <marker
                  id={`${pageName}-arrow-esc`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth={6}
                  markerHeight={6}
                  markerUnits="userSpaceOnUse"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--rust-700)" />
                </marker>
              </defs>
              {localEdges.map((edge, i) => {
                const from = overlayGeometry.cardEdges.get(edge.from);
                const to = overlayGeometry.cardEdges.get(edge.to);
                if (!from || !to) return null;
                const edgeNumber = fullArtifact.swimLane.edges.indexOf(edge) + 1;
                const stroke = (edge.kind === "SEQUENCE" || edge.kind === "ASSOCIATION") ? "var(--ink-faint)" : "var(--rust-700)";
                const sourceLane = nodes.find(n => n.stepId === edge.from)?.laneId;
                const railIndex = localEdges.slice(0, i).filter(e => nodes.find(n => n.stepId === e.from)?.laneId === sourceLane).length;
                const railY = from.bottom + 16 + railIndex * 16;
                // Each step has its own column. Route non-adjacent and return
                // edges through the reserved gutter beneath the source card.
                const x1 = from.right;
                const x2 = to.left - 1;
                const path = `M ${x1} ${from.y} H ${x1 + 10} V ${railY} H ${x2 - 10} V ${to.y} H ${x2}`;
                return (
                  <g key={`${edge.from}-${edge.to}-${edge.kind}-${edge.condition}`}>
                    <path d={path} fill="none" stroke={stroke} strokeWidth={1.3}
                      strokeDasharray={edge.kind === "RETURN" || edge.kind === "ASSOCIATION" ? "5 3" : undefined}
                      markerEnd={edge.kind === "ASSOCIATION" ? undefined : `url(#${pageName}-${edge.kind === "SEQUENCE" ? "arrow" : "arrow-esc"})`} />
                    <rect x={(x1 + x2) / 2 - 12} y={railY - 7} width={24} height={14} fill="var(--paper)" />
                    <text x={(x1 + x2) / 2} y={railY + 4} textAnchor="middle" fontSize={11} fill={stroke}>E{edgeNumber}</text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
      {relevantEdges.length > 0 && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 pt-4 text-[13px]" aria-label="Flow paths">
          {relevantEdges.map(edge => {
            const from = fullArtifact.swimLane.nodes.find(node => node.stepId === edge.from)!;
            const to = fullArtifact.swimLane.nodes.find(node => node.stepId === edge.to)!;
            const pageFor = (stepId: string) => Math.floor(fullArtifact.swimLane.nodes.findIndex(node => node.stepId === stepId) / 4) + 1;
            const reference = (node: SwimLaneNode) => `${String(node.order).padStart(2, "0")}${localIds.has(node.stepId) ? "" : ` (panel ${pageFor(node.stepId)})`}`;
            return <div key={`${edge.from}-${edge.to}-${edge.kind}-${edge.condition}`} title={edge.evidence} style={{ color: "var(--ink-soft)" }}>
              <span className="font-mono" style={{ color: "var(--ink-faint)" }}>E{fullArtifact.swimLane.edges.indexOf(edge) + 1} </span>
              <span className="font-mono">{reference(from)} {edge.kind === "ASSOCIATION" ? "···" : "→"} {reference(to)}</span>
              {edge.condition ? ` · ${edge.condition}` : " · sequence / handoff"}
              {edge.kind === "RETURN" ? " · return" : edge.kind === "ASSOCIATION" ? " · ongoing association" : ""}
            </div>;
          })}
        </div>
      )}
      {artifact.alsoInvolvedRoles.length > 0 && (
        <div
          className="flex flex-none flex-wrap items-center gap-2 pt-3 pb-5"
          style={{ borderColor: "var(--border-soft)" }}
        >
          <span
            className="font-mono text-[11px] uppercase tracking-widest"
            style={{ color: "var(--ink-faint)" }}
          >
            Also involved
          </span>
          {artifact.alsoInvolvedRoles.map((role) => (
            <span
              key={role}
              className="border font-mono text-[11px]"
              style={{ padding: "1px 6px", borderColor: "var(--border)", color: "var(--ink)", background: "var(--surface)" }}
            >
              {role}
            </span>
          ))}
        </div>
      )}

      <div
        className="slide-legend mt-auto flex flex-none flex-wrap items-center gap-5 border-t pt-3 font-mono text-[11px]"
        style={{ borderColor: "var(--border-soft)", color: "var(--ink-soft)" }}
      >
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 border" style={{ borderColor: "var(--border)" }} />
          process step
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 border-dashed"
            style={{ borderColor: "var(--rust-700)", borderWidth: 1 }}
          />
          escalation point
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="18" height="8" style={{ flex: "none" }}>
            <line x1="0" y1="4" x2="18" y2="4" stroke="var(--ink-faint)" strokeWidth={1.25} />
          </svg>
          sequence / handoff
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="18" height="8" style={{ flex: "none" }}>
            <line x1="0" y1="4" x2="18" y2="4" stroke="var(--rust-700)" strokeWidth={1.25}  />
          </svg>
          escalation path
        </span>
        <span>⇢ return / retry</span>
        <span>┄ ongoing association</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3.5 border" style={{ background: PHASE_TINTS[0], borderColor: "var(--border-soft)" }} />
          phase band
        </span>
        {nodes.some(node => node.isGap) && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 border" style={{ borderColor: "var(--rust-700)", background: "var(--rust-100)" }} />
            gap — unresolved information
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span
            className="border font-mono"
            style={{ fontSize: "0.56rem", padding: "0 3px", borderColor: "var(--border-soft)", color: "var(--ink-soft)" }}
          >
            System · r/w
          </span>
          system read / write
        </span>
        {artifact.alsoInvolvedRoles.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="font-mono" style={{ fontSize: "0.56rem", color: "var(--ink-faint)" }}>
              + name
            </span>
            also involved on that step
          </span>
        )}
      </div>
    </div>
  );
}

function StepCard({ node, cardRef }: { node: SwimLaneNode; cardRef?: (el: HTMLDivElement | null) => void }) {

  const systems = new Map<string, { directions: Set<string>; title: string }>();
  for (const system of node.systemsTouched) {
    const entry = systems.get(system.name) ?? { directions: new Set<string>(), title: system.name };
    entry.directions.add(system.direction === "WRITE" ? "w" : "r");
    systems.set(system.name, entry);
  }
  const allChips = [
    ...node.alsoInvolved.map(role => ({ kind: "role" as const, key: role, label: role })),
    ...[...systems].map(([name, system]) => ({ kind: "system" as const, key: name,
      label: `${name} · ${[...system.directions].sort().join("/")}`, title: system.title })),
  ];
  const isRust = node.isEscalationPoint || node.isGap;
  return (
    <div
      ref={cardRef}
      className="relative flex w-full min-w-0 flex-col border p-3"
      style={{
        zIndex: 2,
        minHeight: 180,
        borderColor: isRust ? "var(--rust-700)" : "var(--border)",
        borderWidth: 1,
        borderStyle: node.isEscalationPoint ? "dashed" : "solid",
        background: isRust ? "var(--rust-100)" : "var(--surface)",
      }}
      title={node.activity}
    >
      <div
        className="mb-0.5 flex flex-none items-baseline justify-between font-mono"
        style={{ fontSize: "12px", color: "var(--ink-faint)" }}
      >
        <span>{String(node.order).padStart(2, "0")}</span>
        <span className="flex items-center gap-1">
          {node.isEscalationPoint && <span style={{ color: "var(--rust-700)", fontWeight: 700 }}>esc</span>}
          {node.isGap && <span style={{ color: "var(--rust-700)", fontWeight: 700 }}>gap</span>}
        </span>
      </div>
      <div
        className="font-medium"
        style={{
          fontSize: "18px",
          lineHeight: 1.3,
          color: "var(--ink)",
          overflowWrap: "break-word",
        }}
      >
        {node.shortLabel}
      </div>
      {(node.context || node.mode !== "MAIN") && <p className="mt-2 text-[13px] leading-snug" style={{ color: "var(--ink-soft)" }}>
        {node.mode === "ONGOING" ? "Ongoing · " : node.mode === "CONDITIONAL" ? "Conditional · " : ""}{node.context}
      </p>}
      {allChips.length > 0 && (
        <div className="mt-auto flex min-w-0 flex-none flex-wrap gap-0.5 pt-3">
          {allChips.map((chip) => (
            <span
              key={`${chip.kind}-${chip.key}`}
              className="font-mono"
              style={{
                border: chip.kind === "system" ? "1px solid var(--border-soft)" : undefined,
                fontSize: "12px",
                padding: chip.kind === "role" ? "0" : "0 2px",
                borderColor: chip.kind === "role" ? "var(--ink-faint)" : "var(--border-soft)",
                color: "var(--ink-faint)",
                background: chip.kind === "role" ? "transparent" : "#f0efe8",
                
                maxWidth: "100%",
                overflowWrap: "break-word",
                lineHeight: 1.25,
              }}
              title={chip.kind === "role" ? `Also involved: ${chip.label}` : chip.title}
            >
              {chip.kind === "role" ? `+ ${chip.label}` : chip.label}
            </span>
          ))}
        </div>
      )}
      {node.isGap && (
        <div
          className="mt-0.5 flex-none font-mono"
          style={{ fontSize: "12px", color: "var(--rust-700)", lineHeight: 1.2 }}
        >
          {node.gapReasons.map(reason => <p key={reason}>⚠ {reason}</p>)}
        </div>
      )}
    </div>
  );
}
