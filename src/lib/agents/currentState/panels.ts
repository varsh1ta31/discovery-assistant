import type { CurrentStateArtifact } from "./types";

/** Keep slide text readable without discarding any steps or inventing edges
 * between panels. Original step numbers remain the cross-panel references.
 */
export function buildPanels(artifact: CurrentStateArtifact, limit = 4): CurrentStateArtifact[] {
  const panels: CurrentStateArtifact[] = [];
  const all = artifact.swimLane.nodes;
  for (let offset = 0; offset < all.length; offset += limit) {
    const nodes = all.slice(offset, offset + limit).map((node, column) => ({ ...node, column }));
    const usedLanes = new Set(nodes.map(node => node.laneId));
    const phases: CurrentStateArtifact["swimLane"]["phases"] = [];
    for (const node of nodes) {
      const previous = phases.at(-1);
      if (previous?.name === node.phase) previous.endColumn = node.column;
      else phases.push({ name: node.phase, startColumn: node.column, endColumn: node.column });
    }
    panels.push({ ...artifact, swimLane: { ...artifact.swimLane, nodes, phases,
      lanes: artifact.swimLane.lanes.filter(lane => usedLanes.has(lane.laneId)),
    } });
  }
  return panels;
}
