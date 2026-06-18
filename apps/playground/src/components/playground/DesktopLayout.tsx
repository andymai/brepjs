import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import type { PlaygroundPanels } from '../../hooks/usePlaygroundPanels';
import EditorPanel from './EditorPanel';
import ViewerPanel from './ViewerPanelLazy';
import OutputPanel from './OutputPanel';
import CollapsedConsoleBar from './CollapsedConsoleBar';
import BimTreePanel from './BimTreePanel';
import FlatPatternPanel from './FlatPatternPanel';

interface Props {
  panels: PlaygroundPanels;
  onCodeChange: (code: string, opts?: { immediate?: boolean }) => void;
  formatRef: { current: (() => void) | null };
  jumpToLineRef: { current: ((line: number) => void) | null };
  onJumpToLine: (line: number) => void;
}

export default function DesktopLayout({
  panels,
  onCodeChange,
  formatRef,
  jumpToLineRef,
  onJumpToLine,
}: Props) {
  const isConsoleCollapsed = usePlaygroundStore((s) => s.isConsoleCollapsed);
  const isViewerCollapsed = usePlaygroundStore((s) => s.isViewerCollapsed);
  const storage = typeof window !== 'undefined' ? localStorage : undefined;
  const hLayout = useDefaultLayout({ id: 'playground-h', storage });
  const vLayout = useDefaultLayout({ id: 'playground-v', storage });

  return (
    <Group
      orientation="horizontal"
      defaultLayout={hLayout.defaultLayout}
      onLayoutChanged={hLayout.onLayoutChanged}
      className="flex-1 overflow-hidden"
    >
      {/* Left: editor + output */}
      <Panel
        id="editor-area"
        panelRef={panels.editorAreaPanelRef}
        collapsible
        collapsedSize="0%"
        minSize="20%"
        defaultSize="50%"
        onResize={panels.handleEditorAreaResize}
      >
        {/* Always-mounted: collapsing this Panel sends its width to 0% but
            we keep Monaco rendered so its undo stack, cursor position, and
            scroll state survive a toggle. The 0%-wide container hides the
            editor visually without remounting it. */}
        <Group
          orientation="vertical"
          defaultLayout={vLayout.defaultLayout}
          onLayoutChanged={vLayout.onLayoutChanged}
        >
          <Panel id="editor" defaultSize="80%" minSize="30%">
            <EditorPanel
              onCodeChange={onCodeChange}
              onFormat={formatRef}
              jumpToLineRef={jumpToLineRef}
            />
          </Panel>
          <Separator className="h-px bg-border-subtle" />
          <Panel
            id="console"
            panelRef={panels.consolePanelRef}
            collapsible
            collapsedSize="3.5%"
            minSize="15%"
            defaultSize="3.5%"
            onResize={panels.handleConsoleResize}
          >
            {isConsoleCollapsed ? (
              <CollapsedConsoleBar onExpand={panels.toggleConsole} />
            ) : (
              <OutputPanel onCollapse={panels.toggleConsole} onJumpToLine={onJumpToLine} />
            )}
          </Panel>
        </Group>
      </Panel>

      <Separator className="w-px bg-border-subtle" />

      {/* Right: 3D viewer */}
      <Panel
        id="viewer"
        panelRef={panels.viewerPanelRef}
        collapsible
        collapsedSize="0%"
        minSize="20%"
        defaultSize="50%"
        onResize={panels.handleViewerResize}
      >
        {isViewerCollapsed ? null : (
          <div className="relative h-full w-full">
            <ViewerPanel />
            {/* Overlays: each renders only when the current example exposes its
                data (BIM tree / sheet-metal flat pattern), so they never co-occur. */}
            <BimTreePanel />
            <FlatPatternPanel />
          </div>
        )}
      </Panel>
    </Group>
  );
}
