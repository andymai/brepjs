import { useState } from 'react';
import type { BimTreeNode } from 'brepjs-bim';
import { usePlaygroundStore } from '../../stores/playgroundStore';

// Spatial-structure categories render with a folder-ish glyph; everything else
// (walls, beams, openings, …) is a leaf element.
const SPATIAL = new Set(['PROJECT', 'SITE', 'BUILDING', 'STOREY']);

function TreeRow({ node, depth }: { node: BimTreeNode; depth: number }) {
  const spatial = SPATIAL.has(node.category);
  return (
    <li>
      <div
        className="flex items-center gap-1.5 py-0.5 pr-2 text-xs"
        style={{ paddingLeft: 8 + depth * 14 }}
        title={node.category}
      >
        <span className={spatial ? 'text-[#4ACECC]' : 'text-gray-500'} aria-hidden>
          {spatial ? '▸' : '·'}
        </span>
        <span className={spatial ? 'font-medium text-gray-200' : 'text-gray-300'}>
          {node.label}
        </span>
        {!spatial && <span className="text-[10px] text-gray-500">{node.category}</span>}
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((c) => (
            <TreeRow key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Read-only overlay showing a BIM model's IFC spatial structure (project → site
 * → building → storey → elements). Renders only when the current example
 * exposed a tree via `present(shape, { bimTree })`.
 */
export default function BimTreePanel() {
  const bimTree = usePlaygroundStore((s) => s.bimTree);
  const [collapsed, setCollapsed] = useState(false);

  if (!bimTree?.root) return null;

  return (
    <div className="absolute right-3 top-3 z-10 flex max-h-[70%] w-64 flex-col overflow-hidden rounded-md border border-border-subtle bg-surface/95 shadow-lg backdrop-blur">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between border-b border-border-subtle px-3 py-1.5 text-left text-xs font-medium text-gray-300 hover:text-white"
        title={collapsed ? 'Expand BIM model tree' : 'Collapse BIM model tree'}
        aria-expanded={!collapsed}
      >
        <span>BIM Model</span>
        <span className="text-[10px] text-gray-500">
          {bimTree.elementCount} element{bimTree.elementCount === 1 ? '' : 's'}{' '}
          {collapsed ? '▸' : '▾'}
        </span>
      </button>
      {!collapsed && (
        <ul className="overflow-auto py-1">
          <TreeRow node={bimTree.root} depth={0} />
        </ul>
      )}
    </div>
  );
}
