# ADR-0010: Changing a retained aperture

**Status**: Deferred
**Date**: 2026-11-26
**Authors**: viktar-b

## Context

An Opening identifies a void in the host's retained Body. Moving the Opening on its own can put a Window in solid wall. Deleting the Opening record leaves the physical hole in place. Step 3 preserves that Body and disables the host recipe's analytical quantities and geometry encoding when its Opening is deleted. Moving the host carries its placement descendants.

## Decision for future review

Evaluate an explicit authoring command for relocating or closing an aperture. Decide which recipe hosts can regenerate a replacement Body, when the caller supplies a finished Body, and how to update or remove the affected Opening and filling. For an arbitrary authored Roof, decide which geometric checks can establish that the supplied Body matches the declared void. Record the supported shapes, tolerances and failure diagnostics before offering that guarantee. This decision belongs to authoring. Step 4 can qualify exchange of an already-cut Body independently.

## Acceptance

- Give a Wall with a Window, a Slab with multiple openings and an already-cut Roof distinct tests. Inspect material at the old and new locations, retained volume, unaffected openings and filler placement.
- Change the host Body, void definition and affected relationships atomically. A rejected edit must preserve caller solids, document ownership, stable identities and the original graph.
- Inspect IFC quantities, void and fill endpoints and reimported material. Reloading an already-cut Body must preserve its occupied volume without another subtraction.

[Body authority](0002-authored-body-authority.md) · [IFC exchange qualification](0006-ifc-exchange-adapter.md)
