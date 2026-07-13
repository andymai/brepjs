# Changelog

## [0.54.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.53.1...brepjs-cad-v0.54.0) (2026-07-13)


### Features

* **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
* **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
* **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
* **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
* **brepjs-cad:** grade judge quality against a reference exemplar ([#1731](https://github.com/andymai/brepjs/issues/1731)) ([9d4aaeb](https://github.com/andymai/brepjs/commit/9d4aaeb8e4830c6be78668854730367194b6a9e5))
* **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
* **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
* **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
* **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))


### Bug Fixes

* **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
* **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
* **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
* **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
* **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
* **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
* **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
* **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
* **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
* **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
* **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
* **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
* **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
* **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
* **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
* **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))
* **release:** unbreak Vercel — repin brepjs-cad to brepjs &gt;=18.0.0 ([#1711](https://github.com/andymai/brepjs/issues/1711)) ([78c780a](https://github.com/andymai/brepjs/commit/78c780a3ab2fcc78f26b32029df72795582e145c))

## [0.53.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.52.0...brepjs-cad-v0.53.0) (2026-07-13)


### Features

* **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
* **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
* **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
* **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
* **brepjs-cad:** grade judge quality against a reference exemplar ([#1731](https://github.com/andymai/brepjs/issues/1731)) ([9d4aaeb](https://github.com/andymai/brepjs/commit/9d4aaeb8e4830c6be78668854730367194b6a9e5))
* **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
* **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
* **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
* **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))


### Bug Fixes

* **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
* **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
* **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
* **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
* **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
* **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
* **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
* **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
* **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
* **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
* **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
* **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
* **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
* **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
* **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
* **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))
* **release:** unbreak Vercel — repin brepjs-cad to brepjs &gt;=18.0.0 ([#1711](https://github.com/andymai/brepjs/issues/1711)) ([78c780a](https://github.com/andymai/brepjs/commit/78c780a3ab2fcc78f26b32029df72795582e145c))

## [0.52.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.51.1...brepjs-cad-v0.52.0) (2026-07-13)


### Features

* **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
* **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
* **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
* **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
* **brepjs-cad:** grade judge quality against a reference exemplar ([#1731](https://github.com/andymai/brepjs/issues/1731)) ([9d4aaeb](https://github.com/andymai/brepjs/commit/9d4aaeb8e4830c6be78668854730367194b6a9e5))
* **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
* **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
* **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
* **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))


### Bug Fixes

* **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
* **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
* **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
* **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
* **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
* **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
* **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
* **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
* **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
* **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
* **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
* **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
* **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
* **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
* **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
* **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))
* **release:** unbreak Vercel — repin brepjs-cad to brepjs &gt;=18.0.0 ([#1711](https://github.com/andymai/brepjs/issues/1711)) ([78c780a](https://github.com/andymai/brepjs/commit/78c780a3ab2fcc78f26b32029df72795582e145c))

## [0.51.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.50.0...brepjs-cad-v0.51.0) (2026-07-13)


### Features

* **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
* **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
* **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
* **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
* **brepjs-cad:** grade judge quality against a reference exemplar ([#1731](https://github.com/andymai/brepjs/issues/1731)) ([9d4aaeb](https://github.com/andymai/brepjs/commit/9d4aaeb8e4830c6be78668854730367194b6a9e5))
* **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
* **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
* **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
* **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))


### Bug Fixes

* **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
* **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
* **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
* **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
* **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
* **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
* **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
* **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
* **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
* **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
* **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
* **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
* **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
* **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
* **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
* **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))
* **release:** unbreak Vercel — repin brepjs-cad to brepjs &gt;=18.0.0 ([#1711](https://github.com/andymai/brepjs/issues/1711)) ([78c780a](https://github.com/andymai/brepjs/commit/78c780a3ab2fcc78f26b32029df72795582e145c))

## [0.50.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.49.1...brepjs-cad-v0.50.0) (2026-07-13)


### Features

* **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
* **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
* **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
* **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
* **brepjs-cad:** grade judge quality against a reference exemplar ([#1731](https://github.com/andymai/brepjs/issues/1731)) ([9d4aaeb](https://github.com/andymai/brepjs/commit/9d4aaeb8e4830c6be78668854730367194b6a9e5))
* **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
* **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
* **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
* **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))


### Bug Fixes

* **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
* **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
* **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
* **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
* **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
* **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
* **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
* **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
* **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
* **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
* **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
* **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
* **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
* **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
* **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
* **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))
* **release:** unbreak Vercel — repin brepjs-cad to brepjs &gt;=18.0.0 ([#1711](https://github.com/andymai/brepjs/issues/1711)) ([78c780a](https://github.com/andymai/brepjs/commit/78c780a3ab2fcc78f26b32029df72795582e145c))

## [0.49.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.48.0...brepjs-cad-v0.49.0) (2026-07-13)


### Features

* **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
* **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
* **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
* **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
* **brepjs-cad:** grade judge quality against a reference exemplar ([#1731](https://github.com/andymai/brepjs/issues/1731)) ([9d4aaeb](https://github.com/andymai/brepjs/commit/9d4aaeb8e4830c6be78668854730367194b6a9e5))
* **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
* **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
* **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
* **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))


### Bug Fixes

* **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
* **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
* **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
* **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
* **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
* **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
* **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
* **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
* **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
* **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
* **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
* **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
* **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
* **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
* **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
* **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))
* **release:** unbreak Vercel — repin brepjs-cad to brepjs &gt;=18.0.0 ([#1711](https://github.com/andymai/brepjs/issues/1711)) ([78c780a](https://github.com/andymai/brepjs/commit/78c780a3ab2fcc78f26b32029df72795582e145c))

## [0.48.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.47.1...brepjs-cad-v0.48.0) (2026-07-13)


### Features

* **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
* **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
* **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
* **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
* **brepjs-cad:** grade judge quality against a reference exemplar ([#1731](https://github.com/andymai/brepjs/issues/1731)) ([9d4aaeb](https://github.com/andymai/brepjs/commit/9d4aaeb8e4830c6be78668854730367194b6a9e5))
* **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
* **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
* **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
* **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))


### Bug Fixes

* **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
* **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
* **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
* **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
* **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
* **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
* **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
* **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
* **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
* **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
* **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
* **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
* **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
* **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
* **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
* **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))
* **release:** unbreak Vercel — repin brepjs-cad to brepjs &gt;=18.0.0 ([#1711](https://github.com/andymai/brepjs/issues/1711)) ([78c780a](https://github.com/andymai/brepjs/commit/78c780a3ab2fcc78f26b32029df72795582e145c))

## [0.47.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.46.0...brepjs-cad-v0.47.0) (2026-07-13)


### Features

* **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
* **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
* **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
* **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
* **brepjs-cad:** grade judge quality against a reference exemplar ([#1731](https://github.com/andymai/brepjs/issues/1731)) ([9d4aaeb](https://github.com/andymai/brepjs/commit/9d4aaeb8e4830c6be78668854730367194b6a9e5))
* **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
* **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
* **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
* **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))


### Bug Fixes

* **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
* **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
* **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
* **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
* **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
* **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
* **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
* **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
* **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
* **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
* **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
* **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
* **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
* **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
* **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
* **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))
* **release:** unbreak Vercel — repin brepjs-cad to brepjs &gt;=18.0.0 ([#1711](https://github.com/andymai/brepjs/issues/1711)) ([78c780a](https://github.com/andymai/brepjs/commit/78c780a3ab2fcc78f26b32029df72795582e145c))

## [0.46.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.45.1...brepjs-cad-v0.46.0) (2026-07-13)


### Features

* **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
* **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
* **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
* **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
* **brepjs-cad:** grade judge quality against a reference exemplar ([#1731](https://github.com/andymai/brepjs/issues/1731)) ([9d4aaeb](https://github.com/andymai/brepjs/commit/9d4aaeb8e4830c6be78668854730367194b6a9e5))
* **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
* **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
* **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
* **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))


### Bug Fixes

* **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
* **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
* **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
* **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
* **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
* **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
* **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
* **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
* **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
* **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
* **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
* **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
* **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
* **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
* **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
* **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))
* **release:** unbreak Vercel — repin brepjs-cad to brepjs &gt;=18.0.0 ([#1711](https://github.com/andymai/brepjs/issues/1711)) ([78c780a](https://github.com/andymai/brepjs/commit/78c780a3ab2fcc78f26b32029df72795582e145c))

## [0.45.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.44.1...brepjs-cad-v0.45.0) (2026-07-07)

### Features

- **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
- **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
- **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
- **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
- **brepjs-cad:** grade judge quality against a reference exemplar ([#1731](https://github.com/andymai/brepjs/issues/1731)) ([9d4aaeb](https://github.com/andymai/brepjs/commit/9d4aaeb8e4830c6be78668854730367194b6a9e5))
- **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
- **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
- **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
- **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))

### Bug Fixes

- **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
- **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
- **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
- **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
- **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
- **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
- **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
- **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
- **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
- **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
- **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
- **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
- **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
- **brepjs-cad:** load .ts parts via native type-stripping ([#1207](https://github.com/andymai/brepjs/issues/1207)) ([198078b](https://github.com/andymai/brepjs/commit/198078becf570614c0cbf61537714fc94c2de43a))
- **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
- **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
- **brepjs-cad:** run CLI via bin symlink + quality pass ([#1206](https://github.com/andymai/brepjs/issues/1206)) ([ac5b1fe](https://github.com/andymai/brepjs/commit/ac5b1feee3c5b424c37716ca06c397f7898838f1))
- **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))
- **release:** unbreak Vercel — repin brepjs-cad to brepjs &gt;=18.0.0 ([#1711](https://github.com/andymai/brepjs/issues/1711)) ([78c780a](https://github.com/andymai/brepjs/commit/78c780a3ab2fcc78f26b32029df72795582e145c))

## [0.44.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.43.0...brepjs-cad-v0.44.0) (2026-06-26)

### Features

- **brepjs-cad:** grade judge quality against a reference exemplar ([#1731](https://github.com/andymai/brepjs/issues/1731)) ([9d4aaeb](https://github.com/andymai/brepjs/commit/9d4aaeb8e4830c6be78668854730367194b6a9e5))

## [0.43.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.42.1...brepjs-cad-v0.43.0) (2026-06-26)

### Features

- **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
- **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
- **brepjs-cad:** CLI subcommands + verify hints + gridfinity examples + eval harness ([#1204](https://github.com/andymai/brepjs/issues/1204)) ([4d57198](https://github.com/andymai/brepjs/commit/4d5719874b5f5e685a4f909fd2d2363c0331770b))
- **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
- **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
- **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
- **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
- **brepjs-cad:** rename from brepjs-agent + make npm-publishable (publish held) ([#1201](https://github.com/andymai/brepjs/issues/1201)) ([630bbba](https://github.com/andymai/brepjs/commit/630bbbab4885604bd4d5fb2148584a6572c8d99c))
- **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
- **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))

### Bug Fixes

- **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
- **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
- **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
- **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
- **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
- **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
- **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
- **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
- **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
- **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
- **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
- **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
- **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
- **brepjs-cad:** load .ts parts via native type-stripping ([#1207](https://github.com/andymai/brepjs/issues/1207)) ([198078b](https://github.com/andymai/brepjs/commit/198078becf570614c0cbf61537714fc94c2de43a))
- **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
- **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
- **brepjs-cad:** run CLI via bin symlink + quality pass ([#1206](https://github.com/andymai/brepjs/issues/1206)) ([ac5b1fe](https://github.com/andymai/brepjs/commit/ac5b1feee3c5b424c37716ca06c397f7898838f1))
- **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))
- **release:** unbreak Vercel — repin brepjs-cad to brepjs &gt;=18.0.0 ([#1711](https://github.com/andymai/brepjs/issues/1711)) ([78c780a](https://github.com/andymai/brepjs/commit/78c780a3ab2fcc78f26b32029df72795582e145c))

## [0.42.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.41.0...brepjs-cad-v0.42.0) (2026-06-26)

### Features

- **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
- **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
- **brepjs-cad:** CLI subcommands + verify hints + gridfinity examples + eval harness ([#1204](https://github.com/andymai/brepjs/issues/1204)) ([4d57198](https://github.com/andymai/brepjs/commit/4d5719874b5f5e685a4f909fd2d2363c0331770b))
- **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
- **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
- **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
- **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
- **brepjs-cad:** rename from brepjs-agent + make npm-publishable (publish held) ([#1201](https://github.com/andymai/brepjs/issues/1201)) ([630bbba](https://github.com/andymai/brepjs/commit/630bbbab4885604bd4d5fb2148584a6572c8d99c))
- **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
- **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))

### Bug Fixes

- **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
- **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
- **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
- **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
- **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
- **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
- **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
- **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
- **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
- **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
- **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
- **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
- **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
- **brepjs-cad:** load .ts parts via native type-stripping ([#1207](https://github.com/andymai/brepjs/issues/1207)) ([198078b](https://github.com/andymai/brepjs/commit/198078becf570614c0cbf61537714fc94c2de43a))
- **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
- **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
- **brepjs-cad:** run CLI via bin symlink + quality pass ([#1206](https://github.com/andymai/brepjs/issues/1206)) ([ac5b1fe](https://github.com/andymai/brepjs/commit/ac5b1feee3c5b424c37716ca06c397f7898838f1))
- **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))
- **release:** unbreak Vercel — repin brepjs-cad to brepjs &gt;=18.0.0 ([#1711](https://github.com/andymai/brepjs/issues/1711)) ([78c780a](https://github.com/andymai/brepjs/commit/78c780a3ab2fcc78f26b32029df72795582e145c))

## [0.41.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.40.1...brepjs-cad-v0.41.0) (2026-06-26)

### Features

- **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
- **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
- **brepjs-cad:** CLI subcommands + verify hints + gridfinity examples + eval harness ([#1204](https://github.com/andymai/brepjs/issues/1204)) ([4d57198](https://github.com/andymai/brepjs/commit/4d5719874b5f5e685a4f909fd2d2363c0331770b))
- **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
- **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
- **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
- **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
- **brepjs-cad:** rename from brepjs-agent + make npm-publishable (publish held) ([#1201](https://github.com/andymai/brepjs/issues/1201)) ([630bbba](https://github.com/andymai/brepjs/commit/630bbbab4885604bd4d5fb2148584a6572c8d99c))
- **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
- **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))

### Bug Fixes

- **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
- **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
- **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
- **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
- **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
- **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
- **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
- **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
- **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
- **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
- **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
- **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
- **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
- **brepjs-cad:** load .ts parts via native type-stripping ([#1207](https://github.com/andymai/brepjs/issues/1207)) ([198078b](https://github.com/andymai/brepjs/commit/198078becf570614c0cbf61537714fc94c2de43a))
- **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
- **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
- **brepjs-cad:** run CLI via bin symlink + quality pass ([#1206](https://github.com/andymai/brepjs/issues/1206)) ([ac5b1fe](https://github.com/andymai/brepjs/commit/ac5b1feee3c5b424c37716ca06c397f7898838f1))
- **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))
- **release:** unbreak Vercel — repin brepjs-cad to brepjs &gt;=18.0.0 ([#1711](https://github.com/andymai/brepjs/issues/1711)) ([78c780a](https://github.com/andymai/brepjs/commit/78c780a3ab2fcc78f26b32029df72795582e145c))

## [0.40.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.39.0...brepjs-cad-v0.40.0) (2026-06-25)

### Features

- **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
- **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
- **brepjs-cad:** CLI subcommands + verify hints + gridfinity examples + eval harness ([#1204](https://github.com/andymai/brepjs/issues/1204)) ([4d57198](https://github.com/andymai/brepjs/commit/4d5719874b5f5e685a4f909fd2d2363c0331770b))
- **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
- **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
- **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
- **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
- **brepjs-cad:** rename from brepjs-agent + make npm-publishable (publish held) ([#1201](https://github.com/andymai/brepjs/issues/1201)) ([630bbba](https://github.com/andymai/brepjs/commit/630bbbab4885604bd4d5fb2148584a6572c8d99c))
- **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
- **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))

### Bug Fixes

- **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
- **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
- **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
- **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
- **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
- **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
- **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
- **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
- **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
- **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
- **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
- **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
- **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
- **brepjs-cad:** load .ts parts via native type-stripping ([#1207](https://github.com/andymai/brepjs/issues/1207)) ([198078b](https://github.com/andymai/brepjs/commit/198078becf570614c0cbf61537714fc94c2de43a))
- **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
- **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
- **brepjs-cad:** run CLI via bin symlink + quality pass ([#1206](https://github.com/andymai/brepjs/issues/1206)) ([ac5b1fe](https://github.com/andymai/brepjs/commit/ac5b1feee3c5b424c37716ca06c397f7898838f1))
- **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))
- **release:** unbreak Vercel — repin brepjs-cad to brepjs &gt;=18.0.0 ([#1711](https://github.com/andymai/brepjs/issues/1711)) ([78c780a](https://github.com/andymai/brepjs/commit/78c780a3ab2fcc78f26b32029df72795582e145c))

## [0.39.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.38.1...brepjs-cad-v0.39.0) (2026-06-25)

### Features

- **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
- **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
- **brepjs-cad:** CLI subcommands + verify hints + gridfinity examples + eval harness ([#1204](https://github.com/andymai/brepjs/issues/1204)) ([4d57198](https://github.com/andymai/brepjs/commit/4d5719874b5f5e685a4f909fd2d2363c0331770b))
- **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
- **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
- **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
- **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
- **brepjs-cad:** rename from brepjs-agent + make npm-publishable (publish held) ([#1201](https://github.com/andymai/brepjs/issues/1201)) ([630bbba](https://github.com/andymai/brepjs/commit/630bbbab4885604bd4d5fb2148584a6572c8d99c))
- **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
- **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))

### Bug Fixes

- **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
- **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
- **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
- **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
- **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
- **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
- **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
- **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
- **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
- **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
- **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
- **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
- **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
- **brepjs-cad:** load .ts parts via native type-stripping ([#1207](https://github.com/andymai/brepjs/issues/1207)) ([198078b](https://github.com/andymai/brepjs/commit/198078becf570614c0cbf61537714fc94c2de43a))
- **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
- **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
- **brepjs-cad:** run CLI via bin symlink + quality pass ([#1206](https://github.com/andymai/brepjs/issues/1206)) ([ac5b1fe](https://github.com/andymai/brepjs/commit/ac5b1feee3c5b424c37716ca06c397f7898838f1))
- **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))
- **release:** unbreak Vercel — repin brepjs-cad to brepjs &gt;=18.0.0 ([#1711](https://github.com/andymai/brepjs/issues/1711)) ([78c780a](https://github.com/andymai/brepjs/commit/78c780a3ab2fcc78f26b32029df72795582e145c))

## [0.38.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.39...brepjs-cad-v0.38.0) (2026-06-25)

### Features

- **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
- **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
- **brepjs-cad:** CLI subcommands + verify hints + gridfinity examples + eval harness ([#1204](https://github.com/andymai/brepjs/issues/1204)) ([4d57198](https://github.com/andymai/brepjs/commit/4d5719874b5f5e685a4f909fd2d2363c0331770b))
- **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
- **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
- **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
- **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
- **brepjs-cad:** rename from brepjs-agent + make npm-publishable (publish held) ([#1201](https://github.com/andymai/brepjs/issues/1201)) ([630bbba](https://github.com/andymai/brepjs/commit/630bbbab4885604bd4d5fb2148584a6572c8d99c))
- **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
- **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))

### Bug Fixes

- **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
- **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
- **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
- **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
- **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
- **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
- **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
- **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
- **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
- **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
- **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
- **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
- **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
- **brepjs-cad:** load .ts parts via native type-stripping ([#1207](https://github.com/andymai/brepjs/issues/1207)) ([198078b](https://github.com/andymai/brepjs/commit/198078becf570614c0cbf61537714fc94c2de43a))
- **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
- **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
- **brepjs-cad:** run CLI via bin symlink + quality pass ([#1206](https://github.com/andymai/brepjs/issues/1206)) ([ac5b1fe](https://github.com/andymai/brepjs/commit/ac5b1feee3c5b424c37716ca06c397f7898838f1))
- **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))
- **release:** unbreak Vercel — repin brepjs-cad to brepjs &gt;=18.0.0 ([#1711](https://github.com/andymai/brepjs/issues/1711)) ([78c780a](https://github.com/andymai/brepjs/commit/78c780a3ab2fcc78f26b32029df72795582e145c))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - brepjs bumped from >=18.0.0 to >=18.117.1

## [0.37.39](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.39) (2026-06-25)

## [0.37.38](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.38) (2026-06-25)

## [0.37.37](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.37) (2026-06-25)

## [0.37.36](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.36) (2026-06-25)

## [0.37.35](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.35) (2026-06-25)

## [0.37.34](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.34) (2026-06-25)

## [0.37.33](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.33) (2026-06-25)

## [0.37.32](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.32) (2026-06-25)

## [0.37.31](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.31) (2026-06-25)

## [0.37.30](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.30) (2026-06-25)

## [0.37.29](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.29) (2026-06-25)

## [0.37.28](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.28) (2026-06-25)

## [0.37.27](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.27) (2026-06-25)

## [0.37.26](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.26) (2026-06-25)

## [0.37.25](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.25) (2026-06-25)

## [0.37.24](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.24) (2026-06-25)

## [0.37.23](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.23) (2026-06-25)

## [0.37.22](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.22) (2026-06-25)

## [0.37.21](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.21) (2026-06-25)

## [0.37.20](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.20) (2026-06-25)

## [0.37.19](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.19) (2026-06-25)

## [0.37.18](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.18) (2026-06-25)

## [0.37.17](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.17) (2026-06-25)

## [0.37.16](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.16) (2026-06-25)

## [0.37.15](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.15) (2026-06-25)

## [0.37.14](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.14) (2026-06-25)

## [0.37.13](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.13) (2026-06-25)

## [0.37.12](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.12) (2026-06-25)

## [0.37.11](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.11) (2026-06-25)

## [0.37.10](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.10) (2026-06-25)

## [0.37.9](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.9) (2026-06-25)

## [0.37.8](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.8) (2026-06-25)

## [0.37.7](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.7) (2026-06-25)

## [0.37.6](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.6) (2026-06-25)

## [0.37.5](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.5) (2026-06-25)

## [0.37.4](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.4) (2026-06-25)

## [0.37.3](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.3) (2026-06-25)

## [0.37.2](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.2) (2026-06-25)

## [0.37.1](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.37.0...brepjs-cad-v0.37.1) (2026-06-25)

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - brepjs bumped from ^18.83.2 to ^18.117.1

## [0.37.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.36.1...brepjs-cad-v0.37.0) (2026-06-25)

### Features

- **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
- **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
- **brepjs-cad:** CLI subcommands + verify hints + gridfinity examples + eval harness ([#1204](https://github.com/andymai/brepjs/issues/1204)) ([4d57198](https://github.com/andymai/brepjs/commit/4d5719874b5f5e685a4f909fd2d2363c0331770b))
- **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
- **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
- **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
- **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
- **brepjs-cad:** rename from brepjs-agent + make npm-publishable (publish held) ([#1201](https://github.com/andymai/brepjs/issues/1201)) ([630bbba](https://github.com/andymai/brepjs/commit/630bbbab4885604bd4d5fb2148584a6572c8d99c))
- **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
- **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))

### Bug Fixes

- **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
- **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
- **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
- **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
- **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
- **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
- **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
- **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
- **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
- **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
- **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
- **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
- **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
- **brepjs-cad:** load .ts parts via native type-stripping ([#1207](https://github.com/andymai/brepjs/issues/1207)) ([198078b](https://github.com/andymai/brepjs/commit/198078becf570614c0cbf61537714fc94c2de43a))
- **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
- **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
- **brepjs-cad:** run CLI via bin symlink + quality pass ([#1206](https://github.com/andymai/brepjs/issues/1206)) ([ac5b1fe](https://github.com/andymai/brepjs/commit/ac5b1feee3c5b424c37716ca06c397f7898838f1))
- **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))

## [0.36.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.35.0...brepjs-cad-v0.36.0) (2026-06-25)

### Features

- **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
- **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
- **brepjs-cad:** CLI subcommands + verify hints + gridfinity examples + eval harness ([#1204](https://github.com/andymai/brepjs/issues/1204)) ([4d57198](https://github.com/andymai/brepjs/commit/4d5719874b5f5e685a4f909fd2d2363c0331770b))
- **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
- **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
- **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
- **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
- **brepjs-cad:** rename from brepjs-agent + make npm-publishable (publish held) ([#1201](https://github.com/andymai/brepjs/issues/1201)) ([630bbba](https://github.com/andymai/brepjs/commit/630bbbab4885604bd4d5fb2148584a6572c8d99c))
- **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
- **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))

### Bug Fixes

- **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
- **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
- **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
- **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
- **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
- **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
- **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
- **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
- **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
- **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
- **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
- **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
- **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
- **brepjs-cad:** load .ts parts via native type-stripping ([#1207](https://github.com/andymai/brepjs/issues/1207)) ([198078b](https://github.com/andymai/brepjs/commit/198078becf570614c0cbf61537714fc94c2de43a))
- **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
- **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
- **brepjs-cad:** run CLI via bin symlink + quality pass ([#1206](https://github.com/andymai/brepjs/issues/1206)) ([ac5b1fe](https://github.com/andymai/brepjs/commit/ac5b1feee3c5b424c37716ca06c397f7898838f1))
- **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))

## [0.35.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.34.1...brepjs-cad-v0.35.0) (2026-06-25)

### Features

- **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
- **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
- **brepjs-cad:** CLI subcommands + verify hints + gridfinity examples + eval harness ([#1204](https://github.com/andymai/brepjs/issues/1204)) ([4d57198](https://github.com/andymai/brepjs/commit/4d5719874b5f5e685a4f909fd2d2363c0331770b))
- **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
- **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
- **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
- **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
- **brepjs-cad:** rename from brepjs-agent + make npm-publishable (publish held) ([#1201](https://github.com/andymai/brepjs/issues/1201)) ([630bbba](https://github.com/andymai/brepjs/commit/630bbbab4885604bd4d5fb2148584a6572c8d99c))
- **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
- **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))

### Bug Fixes

- **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
- **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
- **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
- **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
- **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
- **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
- **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
- **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
- **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
- **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
- **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
- **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
- **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
- **brepjs-cad:** load .ts parts via native type-stripping ([#1207](https://github.com/andymai/brepjs/issues/1207)) ([198078b](https://github.com/andymai/brepjs/commit/198078becf570614c0cbf61537714fc94c2de43a))
- **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
- **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
- **brepjs-cad:** run CLI via bin symlink + quality pass ([#1206](https://github.com/andymai/brepjs/issues/1206)) ([ac5b1fe](https://github.com/andymai/brepjs/commit/ac5b1feee3c5b424c37716ca06c397f7898838f1))
- **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))

## [0.34.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.33.1...brepjs-cad-v0.34.0) (2026-06-25)

### Features

- **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
- **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
- **brepjs-cad:** CLI subcommands + verify hints + gridfinity examples + eval harness ([#1204](https://github.com/andymai/brepjs/issues/1204)) ([4d57198](https://github.com/andymai/brepjs/commit/4d5719874b5f5e685a4f909fd2d2363c0331770b))
- **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
- **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
- **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
- **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
- **brepjs-cad:** rename from brepjs-agent + make npm-publishable (publish held) ([#1201](https://github.com/andymai/brepjs/issues/1201)) ([630bbba](https://github.com/andymai/brepjs/commit/630bbbab4885604bd4d5fb2148584a6572c8d99c))
- **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
- **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))

### Bug Fixes

- **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
- **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
- **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
- **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
- **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
- **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
- **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
- **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
- **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
- **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
- **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
- **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
- **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
- **brepjs-cad:** load .ts parts via native type-stripping ([#1207](https://github.com/andymai/brepjs/issues/1207)) ([198078b](https://github.com/andymai/brepjs/commit/198078becf570614c0cbf61537714fc94c2de43a))
- **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
- **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
- **brepjs-cad:** run CLI via bin symlink + quality pass ([#1206](https://github.com/andymai/brepjs/issues/1206)) ([ac5b1fe](https://github.com/andymai/brepjs/commit/ac5b1feee3c5b424c37716ca06c397f7898838f1))
- **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))

## [0.33.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.32.0...brepjs-cad-v0.33.0) (2026-06-24)

### Features

- **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
- **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
- **brepjs-cad:** CLI subcommands + verify hints + gridfinity examples + eval harness ([#1204](https://github.com/andymai/brepjs/issues/1204)) ([4d57198](https://github.com/andymai/brepjs/commit/4d5719874b5f5e685a4f909fd2d2363c0331770b))
- **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
- **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
- **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
- **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
- **brepjs-cad:** rename from brepjs-agent + make npm-publishable (publish held) ([#1201](https://github.com/andymai/brepjs/issues/1201)) ([630bbba](https://github.com/andymai/brepjs/commit/630bbbab4885604bd4d5fb2148584a6572c8d99c))
- **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
- **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))

### Bug Fixes

- **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
- **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
- **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
- **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
- **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
- **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
- **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
- **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
- **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
- **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
- **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
- **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
- **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
- **brepjs-cad:** load .ts parts via native type-stripping ([#1207](https://github.com/andymai/brepjs/issues/1207)) ([198078b](https://github.com/andymai/brepjs/commit/198078becf570614c0cbf61537714fc94c2de43a))
- **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
- **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
- **brepjs-cad:** run CLI via bin symlink + quality pass ([#1206](https://github.com/andymai/brepjs/issues/1206)) ([ac5b1fe](https://github.com/andymai/brepjs/commit/ac5b1feee3c5b424c37716ca06c397f7898838f1))
- **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))

## [0.32.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.31.2...brepjs-cad-v0.32.0) (2026-06-24)

### Features

- **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
- **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
- **brepjs-cad:** CLI subcommands + verify hints + gridfinity examples + eval harness ([#1204](https://github.com/andymai/brepjs/issues/1204)) ([4d57198](https://github.com/andymai/brepjs/commit/4d5719874b5f5e685a4f909fd2d2363c0331770b))
- **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
- **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
- **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
- **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
- **brepjs-cad:** rename from brepjs-agent + make npm-publishable (publish held) ([#1201](https://github.com/andymai/brepjs/issues/1201)) ([630bbba](https://github.com/andymai/brepjs/commit/630bbbab4885604bd4d5fb2148584a6572c8d99c))
- **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
- **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))

### Bug Fixes

- **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
- **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
- **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))
- **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
- **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
- **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
- **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
- **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
- **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
- **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
- **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
- **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
- **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
- **brepjs-cad:** load .ts parts via native type-stripping ([#1207](https://github.com/andymai/brepjs/issues/1207)) ([198078b](https://github.com/andymai/brepjs/commit/198078becf570614c0cbf61537714fc94c2de43a))
- **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
- **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
- **brepjs-cad:** run CLI via bin symlink + quality pass ([#1206](https://github.com/andymai/brepjs/issues/1206)) ([ac5b1fe](https://github.com/andymai/brepjs/commit/ac5b1feee3c5b424c37716ca06c397f7898838f1))
- **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))

## [0.31.1](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.31.0...brepjs-cad-v0.31.1) (2026-06-23)

### Bug Fixes

- **brepjs-cad:** bore detector misses full-cylinder through-holes ([#1551](https://github.com/andymai/brepjs/issues/1551)) ([#1586](https://github.com/andymai/brepjs/issues/1586)) ([b6d61eb](https://github.com/andymai/brepjs/commit/b6d61eb6d88e2e4a3aa1c55b78dc2e76315ebc02))

## [0.31.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.30.1...brepjs-cad-v0.31.0) (2026-06-22)

### Features

- **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
- **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
- **brepjs-cad:** CLI subcommands + verify hints + gridfinity examples + eval harness ([#1204](https://github.com/andymai/brepjs/issues/1204)) ([4d57198](https://github.com/andymai/brepjs/commit/4d5719874b5f5e685a4f909fd2d2363c0331770b))
- **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
- **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
- **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
- **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
- **brepjs-cad:** rename from brepjs-agent + make npm-publishable (publish held) ([#1201](https://github.com/andymai/brepjs/issues/1201)) ([630bbba](https://github.com/andymai/brepjs/commit/630bbbab4885604bd4d5fb2148584a6572c8d99c))
- **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
- **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))

### Bug Fixes

- **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
- **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
- **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
- **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
- **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
- **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
- **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
- **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
- **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
- **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
- **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
- **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
- **brepjs-cad:** load .ts parts via native type-stripping ([#1207](https://github.com/andymai/brepjs/issues/1207)) ([198078b](https://github.com/andymai/brepjs/commit/198078becf570614c0cbf61537714fc94c2de43a))
- **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
- **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
- **brepjs-cad:** run CLI via bin symlink + quality pass ([#1206](https://github.com/andymai/brepjs/issues/1206)) ([ac5b1fe](https://github.com/andymai/brepjs/commit/ac5b1feee3c5b424c37716ca06c397f7898838f1))
- **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))

## [0.30.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.29.0...brepjs-cad-v0.30.0) (2026-06-22)

### Features

- **brepjs-cad:** add airfoils.md feature recipe (swept fans/props/impellers) ([#1566](https://github.com/andymai/brepjs/issues/1566)) ([8c786db](https://github.com/andymai/brepjs/commit/8c786db69ead59edcdc9d0f8525e43324552e4db))
- **brepjs-cad:** aimed section cut for the design judge (Phase 3) ([#1543](https://github.com/andymai/brepjs/issues/1543)) ([40e5acd](https://github.com/andymai/brepjs/commit/40e5acd54318d768dc5a620403d17d43e358e698))
- **brepjs-cad:** decomposed, cross-checked design-judge rubric (Phase 1.5) ([#1539](https://github.com/andymai/brepjs/issues/1539)) ([8059b6d](https://github.com/andymai/brepjs/commit/8059b6d701ae5980e6bb11f51695aa102fe2bb43))
- **brepjs-cad:** deterministic body/interference metrics for the design judge (Phase 1) ([#1531](https://github.com/andymai/brepjs/issues/1531)) ([d296b54](https://github.com/andymai/brepjs/commit/d296b545f2d7084b861683d61b626ace4747a371))
- **brepjs-cad:** kernel-anchored Set-of-Marks for the design judge ([#1545](https://github.com/andymai/brepjs/issues/1545)) ([2b6f5b4](https://github.com/andymai/brepjs/commit/2b6f5b436f2a73c96747cc71f83afc8715765cd0))
- **brepjs-cad:** reliable internal-bore detection for the design judge (keystone) ([#1542](https://github.com/andymai/brepjs/issues/1542)) ([0d780c3](https://github.com/andymai/brepjs/commit/0d780c3b73c2551dab2f04a6ff31bf9ec8cae2ab))
- **brepjs-cad:** surface fragmentation in verify --check (the [#1](https://github.com/andymai/brepjs/issues/1) design defect) ([#1560](https://github.com/andymai/brepjs/issues/1560)) ([45a4f6e](https://github.com/andymai/brepjs/commit/45a4f6e268331b7816cd9957fbdab4c0893b2000))
- **brepjs-cad:** xray internal-reveal shot for the design judge (Phase 2a) ([#1540](https://github.com/andymai/brepjs/issues/1540)) ([eca5bc9](https://github.com/andymai/brepjs/commit/eca5bc9ad20fc7947132d647952245cfe466a7f4))

### Bug Fixes

- **brepjs-cad:** add a triangular-gusset recipe to the implement skill (bracket/enclosure eval) ([#1571](https://github.com/andymai/brepjs/issues/1571)) ([346d042](https://github.com/andymai/brepjs/commit/346d0423fefa3bd163f4075f69bf96d478543bf5))
- **brepjs-cad:** add the "realize the designed object" bar to the implement skill ([#1563](https://github.com/andymai/brepjs/issues/1563)) ([e150357](https://github.com/andymai/brepjs/commit/e1503570aaf271ebef1e39d48be9c70a5ffe8f03))
- **brepjs-cad:** close gear-teeth edge cases found by /eval-skill (ring, worm tip relief, GT2) ([#1548](https://github.com/andymai/brepjs/issues/1548)) ([4bd0494](https://github.com/andymai/brepjs/commit/4bd049401f3affcc3f38e3a31bb9520653a3e89c))
- **brepjs-cad:** code + hint the degenerate-edge (duplicate-vertex) verify failure ([#1550](https://github.com/andymai/brepjs/issues/1550)) ([502dffc](https://github.com/andymai/brepjs/commit/502dffc4a2ae495ae5c98b0c7966721abe0d5f48))
- **brepjs-cad:** correct spur-gear example flanks + add root fillet ([#1528](https://github.com/andymai/brepjs/issues/1528)) ([6971c6b](https://github.com/andymai/brepjs/commit/6971c6befa1fea36a8c2f3ee89c4aa20946020c7))
- **brepjs-cad:** exploded-joint legibility + disjoint-compound caveat (basics eval) ([#1565](https://github.com/andymai/brepjs/issues/1565)) ([9d06121](https://github.com/andymai/brepjs/commit/9d0612111a595e57fcfca6fd191ed9169fc2c062))
- **brepjs-cad:** handle brepjs/playground refs + summarize body relations in the digest ([#1547](https://github.com/andymai/brepjs/issues/1547)) ([b0acef0](https://github.com/andymai/brepjs/commit/b0acef0ad80cdd61f0d2683f1e6d0ece0cae028e))
- **brepjs-cad:** heal 6 implement-skill findings from the full-flywheel re-run ([#1568](https://github.com/andymai/brepjs/issues/1568)) ([f63bf3d](https://github.com/andymai/brepjs/commit/f63bf3d5a0aa638d06e11dd7e2c27e84dbf74746))
- **brepjs-cad:** heal implement + polish skills from clean-room eval ([#1526](https://github.com/andymai/brepjs/issues/1526)) ([0645e16](https://github.com/andymai/brepjs/commit/0645e163e1d8759c95406d0f9526d0aa3b5dd480))
- **brepjs-cad:** heal implement skill — deep-stack bounds extremes aren't datums ([#1529](https://github.com/andymai/brepjs/issues/1529)) ([5ed366f](https://github.com/andymai/brepjs/commit/5ed366f266b3e6e50ae4b54d5779aa05453e894a))
- **brepjs-cad:** heal implement skill from the eval flywheel (3 findings) ([#1552](https://github.com/andymai/brepjs/issues/1552)) ([51def82](https://github.com/andymai/brepjs/commit/51def82db4e0600e85f45e4dd828cc9caee58d15))
- **brepjs-cad:** heal implement skill from the full-corpus eval flywheel (4 findings) ([#1554](https://github.com/andymai/brepjs/issues/1554)) ([3cfc28e](https://github.com/andymai/brepjs/commit/3cfc28ed8b82c46330f1d75f1e98c13fd4d65a06))
- **brepjs-cad:** make blind-judge reference adaptation render multi-body parts at scale ([#1530](https://github.com/andymai/brepjs/issues/1530)) ([18d4523](https://github.com/andymai/brepjs/commit/18d4523c85e1b22496bb5c0b8fb382a1146429c6))
- **brepjs-cad:** polish skill — bosses on shells must fuse, or they float (eval finding) ([#1553](https://github.com/andymai/brepjs/issues/1553)) ([07cbf93](https://github.com/andymai/brepjs/commit/07cbf93e47fbf880df53bc2a1cee05bf0d17e2d5))
- **brepjs-cad:** teach worm-wheel and rack tooth recipes; fix gear-build contradiction ([#1544](https://github.com/andymai/brepjs/issues/1544)) ([b0da85f](https://github.com/andymai/brepjs/commit/b0da85f218d463e0f1ef0ca8760cec54b4814b02))

## [0.29.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.28.0...brepjs-cad-v0.29.0) (2026-06-20)

### Features

- **brepjs-cad:** CLI subcommands + verify hints + gridfinity examples + eval harness ([#1204](https://github.com/andymai/brepjs/issues/1204)) ([4d57198](https://github.com/andymai/brepjs/commit/4d5719874b5f5e685a4f909fd2d2363c0331770b))
- **brepjs-cad:** rename from brepjs-agent + make npm-publishable (publish held) ([#1201](https://github.com/andymai/brepjs/issues/1201)) ([630bbba](https://github.com/andymai/brepjs/commit/630bbbab4885604bd4d5fb2148584a6572c8d99c))

### Bug Fixes

- **brepjs-cad:** load .ts parts via native type-stripping ([#1207](https://github.com/andymai/brepjs/issues/1207)) ([198078b](https://github.com/andymai/brepjs/commit/198078becf570614c0cbf61537714fc94c2de43a))
- **brepjs-cad:** run CLI via bin symlink + quality pass ([#1206](https://github.com/andymai/brepjs/issues/1206)) ([ac5b1fe](https://github.com/andymai/brepjs/commit/ac5b1feee3c5b424c37716ca06c397f7898838f1))

## [0.28.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.27.0...brepjs-verify-v0.28.0) (2026-06-19)

### Features

- **brepjs-verify:** fan out the eval across sharded CI runners ([#1503](https://github.com/andymai/brepjs/issues/1503)) ([8eb1f69](https://github.com/andymai/brepjs/commit/8eb1f690588e418e4b884e1294ba91b679667d61))

### Bug Fixes

- **brepjs-verify:** chamfer-fragility + unwrap/TS2322 SKILL.md rules ([#1506](https://github.com/andymai/brepjs/issues/1506)) ([0f24004](https://github.com/andymai/brepjs/commit/0f24004983effbd85545372b167f472eed35ec96))

## [0.27.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.26.0...brepjs-verify-v0.27.0) (2026-06-19)

### Features

- **brepjs-verify:** enrich experiment traces with request + code ([#1502](https://github.com/andymai/brepjs/issues/1502)) ([5b9141f](https://github.com/andymai/brepjs/commit/5b9141f8107794683d3ef7945466e326132d4a6d))
- **brepjs-verify:** Langfuse observability foundation ([#1498](https://github.com/andymai/brepjs/issues/1498)) ([78c81f3](https://github.com/andymai/brepjs/commit/78c81f3b3e4890cbd3abc2474fcc5b7e4926bd3e))
- **brepjs-verify:** looped skill eval + Langfuse v5 telemetry ([#1494](https://github.com/andymai/brepjs/issues/1494)) ([06a7e7c](https://github.com/andymai/brepjs/commit/06a7e7c6e882fe795122141dce1e4c04933f3fdc))

### Bug Fixes

- **brepjs-verify:** SKILL.md import rule — eval-driven self-heal ([#1501](https://github.com/andymai/brepjs/issues/1501)) ([550d2ba](https://github.com/andymai/brepjs/commit/550d2ba08849a1692ff237d1a79a28afd88b9053))
- **brepjs-verify:** three deferred Langfuse-eval follow-ups ([#1500](https://github.com/andymai/brepjs/issues/1500)) ([90b63bd](https://github.com/andymai/brepjs/commit/90b63bd6a2f277db6ec634f2bbecadf1379f4e4d))

## [0.26.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.25.1...brepjs-verify-v0.26.0) (2026-06-18)

### Features

- **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
- **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
- native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
- **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
- **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
- **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
- **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
- **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
- **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
- **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
- **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
- **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
- **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
- **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
- **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
- **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
- **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
- **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
- **brepkit:** build CCW circular arcs as exact Circle edges ([#1413](https://github.com/andymai/brepjs/issues/1413)) ([03f17f9](https://github.com/andymai/brepjs/commit/03f17f94abe9f68fbe56c39ff72f267b55575415))
- **ci:** unbreak main — unpin viewer devDep and clear OSV vulns ([#1426](https://github.com/andymai/brepjs/issues/1426)) ([cccd507](https://github.com/andymai/brepjs/commit/cccd50736afb93c78d8a92f79e6d81a2979027f3))
- **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
- **verify:** relax brepjs-viewer devDep to \* so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))
- **verify:** unpin brepjs-viewer devDep to workspace wildcard ([#1408](https://github.com/andymai/brepjs/issues/1408)) ([ab1d331](https://github.com/andymai/brepjs/commit/ab1d331908b5fd6d20a1e1cb2ab81aeaf6ad004a))

## [0.25.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.24.3...brepjs-verify-v0.25.0) (2026-06-18)

### Features

- **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
- **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
- native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
- **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
- **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
- **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
- **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
- **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
- **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
- **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
- **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
- **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
- **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
- **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
- **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
- **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
- **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
- **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
- **brepkit:** build CCW circular arcs as exact Circle edges ([#1413](https://github.com/andymai/brepjs/issues/1413)) ([03f17f9](https://github.com/andymai/brepjs/commit/03f17f94abe9f68fbe56c39ff72f267b55575415))
- **ci:** unbreak main — unpin viewer devDep and clear OSV vulns ([#1426](https://github.com/andymai/brepjs/issues/1426)) ([cccd507](https://github.com/andymai/brepjs/commit/cccd50736afb93c78d8a92f79e6d81a2979027f3))
- **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
- **verify:** relax brepjs-viewer devDep to \* so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))
- **verify:** unpin brepjs-viewer devDep to workspace wildcard ([#1408](https://github.com/andymai/brepjs/issues/1408)) ([ab1d331](https://github.com/andymai/brepjs/commit/ab1d331908b5fd6d20a1e1cb2ab81aeaf6ad004a))

## [0.24.2](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.24.1...brepjs-verify-v0.24.2) (2026-06-16)

### Bug Fixes

- **brepkit:** build CCW circular arcs as exact Circle edges ([#1413](https://github.com/andymai/brepjs/issues/1413)) ([03f17f9](https://github.com/andymai/brepjs/commit/03f17f94abe9f68fbe56c39ff72f267b55575415))

## [0.24.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.24.0...brepjs-verify-v0.24.1) (2026-06-15)

### Bug Fixes

- **ci:** unbreak main — unpin viewer devDep and clear OSV vulns ([#1426](https://github.com/andymai/brepjs/issues/1426)) ([cccd507](https://github.com/andymai/brepjs/commit/cccd50736afb93c78d8a92f79e6d81a2979027f3))

## [0.24.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.23.1...brepjs-verify-v0.24.0) (2026-06-15)

### Features

- **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
- **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
- native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
- **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
- **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
- **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
- **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
- **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
- **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
- **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
- **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
- **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
- **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
- **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
- **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
- **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
- **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
- **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
- **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
- **verify:** relax brepjs-viewer devDep to \* so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))
- **verify:** unpin brepjs-viewer devDep to workspace wildcard ([#1408](https://github.com/andymai/brepjs/issues/1408)) ([ab1d331](https://github.com/andymai/brepjs/commit/ab1d331908b5fd6d20a1e1cb2ab81aeaf6ad004a))

## [0.23.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.23.0...brepjs-verify-v0.23.1) (2026-06-15)

## [0.23.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.22.1...brepjs-verify-v0.23.0) (2026-06-15)

### Features

- **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
- **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
- native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
- **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
- **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
- **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
- **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
- **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
- **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
- **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
- **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
- **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
- **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
- **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
- **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
- **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
- **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
- **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
- **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
- **verify:** relax brepjs-viewer devDep to \* so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))
- **verify:** unpin brepjs-viewer devDep to workspace wildcard ([#1408](https://github.com/andymai/brepjs/issues/1408)) ([ab1d331](https://github.com/andymai/brepjs/commit/ab1d331908b5fd6d20a1e1cb2ab81aeaf6ad004a))

## [0.22.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.22.0...brepjs-verify-v0.22.1) (2026-06-15)

## [0.22.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.21.2...brepjs-verify-v0.22.0) (2026-06-15)

### Features

- **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
- **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
- native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
- **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
- **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
- **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
- **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
- **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
- **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
- **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
- **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
- **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
- **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
- **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
- **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
- **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
- **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
- **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
- **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
- **verify:** relax brepjs-viewer devDep to \* so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))
- **verify:** unpin brepjs-viewer devDep to workspace wildcard ([#1408](https://github.com/andymai/brepjs/issues/1408)) ([ab1d331](https://github.com/andymai/brepjs/commit/ab1d331908b5fd6d20a1e1cb2ab81aeaf6ad004a))

## [0.21.2](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.21.1...brepjs-verify-v0.21.2) (2026-06-15)

## [0.21.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.21.0...brepjs-verify-v0.21.1) (2026-06-15)

### Bug Fixes

- **verify:** unpin brepjs-viewer devDep to workspace wildcard ([#1408](https://github.com/andymai/brepjs/issues/1408)) ([ab1d331](https://github.com/andymai/brepjs/commit/ab1d331908b5fd6d20a1e1cb2ab81aeaf6ad004a))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - brepjs bumped from ^18.0.0 to ^18.83.2
  - devDependencies
    - brepjs-viewer bumped from \* to 0.2.1

## [0.21.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.20.1...brepjs-verify-v0.21.0) (2026-06-15)

### Features

- **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
- **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
- native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
- **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
- **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
- **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
- **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
- **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
- **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
- **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
- **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
- **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
- **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
- **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
- **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
- **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
- **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
- **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
- **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
- **verify:** relax brepjs-viewer devDep to \* so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.20.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.20.0...brepjs-verify-v0.20.1) (2026-06-15)

## [0.20.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.19.1...brepjs-verify-v0.20.0) (2026-06-15)

### Features

- **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
- **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
- native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
- **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
- **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
- **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
- **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
- **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
- **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
- **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
- **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
- **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
- **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
- **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
- **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
- **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
- **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
- **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
- **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
- **verify:** relax brepjs-viewer devDep to \* so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.19.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.19.0...brepjs-verify-v0.19.1) (2026-06-15)

## [0.19.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.18.1...brepjs-verify-v0.19.0) (2026-06-15)

### Features

- **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
- **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
- native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
- **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
- **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
- **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
- **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
- **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
- **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
- **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
- **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
- **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
- **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
- **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
- **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
- **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
- **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
- **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
- **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
- **verify:** relax brepjs-viewer devDep to \* so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.18.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.18.0...brepjs-verify-v0.18.1) (2026-06-15)

## [0.18.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.17.1...brepjs-verify-v0.18.0) (2026-06-15)

### Features

- **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
- **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
- native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
- **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
- **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
- **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
- **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
- **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
- **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
- **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
- **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
- **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
- **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
- **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
- **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
- **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
- **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
- **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
- **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
- **verify:** relax brepjs-viewer devDep to \* so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.17.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.17.0...brepjs-verify-v0.17.1) (2026-06-15)

## [0.17.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.16.2...brepjs-verify-v0.17.0) (2026-06-15)

### Features

- **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
- **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
- native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
- **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
- **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
- **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
- **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
- **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
- **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
- **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
- **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
- **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
- **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
- **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
- **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
- **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
- **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
- **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
- **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
- **verify:** relax brepjs-viewer devDep to \* so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.16.2](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.16.1...brepjs-verify-v0.16.2) (2026-06-15)

## [0.16.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.16.0...brepjs-verify-v0.16.1) (2026-06-15)

## [0.16.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.15.1...brepjs-verify-v0.16.0) (2026-06-15)

### Features

- **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
- **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
- native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
- **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
- **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
- **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
- **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
- **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
- **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
- **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
- **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
- **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
- **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
- **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
- **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
- **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
- **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
- **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
- **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
- **verify:** relax brepjs-viewer devDep to \* so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.15.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.15.0...brepjs-verify-v0.15.1) (2026-06-15)

### Dependencies

- The following workspace dependencies were updated
  - devDependencies
    - brepjs-viewer bumped from \* to 0.2.1

## [0.15.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.14.0...brepjs-verify-v0.15.0) (2026-06-15)

### Features

- **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
- **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
- native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
- **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
- **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
- **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
- **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
- **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
- **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
- **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
- **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
- **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
- **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
- **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
- **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
- **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
- **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
- **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
- **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
- **verify:** relax brepjs-viewer devDep to \* so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.14.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.13.1...brepjs-verify-v0.14.0) (2026-06-15)

### Features

- **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
- **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
- native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
- **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
- **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
- **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
- **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
- **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
- **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
- **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
- **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
- **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
- **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
- **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
- **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
- **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
- **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
- **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
- **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
- **verify:** relax brepjs-viewer devDep to \* so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.13.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.12.2...brepjs-verify-v0.13.0) (2026-06-15)

### Features

- **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
- **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
- native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
- **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
- **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
- **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
- **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
- **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
- **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
- **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
- **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
- **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
- **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
- **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
- **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
- **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
- **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
- **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
- **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
- **verify:** relax brepjs-viewer devDep to \* so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.12.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.12.0...brepjs-verify-v0.12.1) (2026-06-15)

### Bug Fixes

- **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))

## [0.12.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.11.1...brepjs-verify-v0.12.0) (2026-06-15)

### Features

- **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
- **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
- native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
- **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
- **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
- **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
- **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
- **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
- **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
- **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
- **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
- **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
- **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
- **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
- **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
- **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
- **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
- **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
- **verify:** relax brepjs-viewer devDep to \* so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.11.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.10.1...brepjs-verify-v0.11.0) (2026-06-14)

### Features

- **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
- **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
- native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
- **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
- **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
- **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
- **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
- **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
- **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
- **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
- **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
- **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
- **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
- **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
- **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
- **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
- **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
- **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
- **verify:** relax brepjs-viewer devDep to \* so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.10.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.9.1...brepjs-verify-v0.10.0) (2026-06-14)

### Features

- **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
- **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
- native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
- **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
- **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
- **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
- **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
- **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
- **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
- **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
- **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
- **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
- **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
- **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
- **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
- **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
- **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
- **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
- **verify:** relax brepjs-viewer devDep to \* so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.9.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.8.0...brepjs-verify-v0.9.0) (2026-06-13)

### Features

- native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))

### Bug Fixes

- **verify:** relax brepjs-viewer devDep to \* so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.8.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.7.1...brepjs-verify-v0.8.0) (2026-06-13)

### Features

- **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
- **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
- **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
- **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
- **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
- **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
- **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
- **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
- **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
- **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
- **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
- **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
- **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
- **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
- **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))

## [0.7.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.7.0...brepjs-verify-v0.7.1) (2026-06-13)

### Bug Fixes

- **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))

## [0.7.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.6.0...brepjs-verify-v0.7.0) (2026-06-10)

### Features

- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
- **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))

## [0.6.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.5.1...brepjs-verify-v0.6.0) (2026-06-09)

### Features

- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))

## [0.5.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.4.1...brepjs-verify-v0.5.0) (2026-06-08)

### Features

- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))

## [0.4.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.3.0...brepjs-verify-v0.4.0) (2026-06-04)

### Features

- **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))

## [0.3.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.2.1...brepjs-verify-v0.3.0) (2026-06-04)

### Features

- **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
- **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))

### Bug Fixes

- **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))

## [0.2.1](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.2.0...brepjs-cad-v0.2.1) (2026-06-04)

### Bug Fixes

- **brepjs-cad:** load .ts parts via native type-stripping ([#1207](https://github.com/andymai/brepjs/issues/1207)) ([198078b](https://github.com/andymai/brepjs/commit/198078becf570614c0cbf61537714fc94c2de43a))

## [0.2.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.1.0...brepjs-cad-v0.2.0) (2026-06-04)

### Features

- **brepjs-cad:** CLI subcommands + verify hints + gridfinity examples + eval harness ([#1204](https://github.com/andymai/brepjs/issues/1204)) ([4d57198](https://github.com/andymai/brepjs/commit/4d5719874b5f5e685a4f909fd2d2363c0331770b))
- **brepjs-cad:** rename from brepjs-agent + make npm-publishable (publish held) ([#1201](https://github.com/andymai/brepjs/issues/1201)) ([630bbba](https://github.com/andymai/brepjs/commit/630bbbab4885604bd4d5fb2148584a6572c8d99c))

### Bug Fixes

- **brepjs-cad:** run CLI via bin symlink + quality pass ([#1206](https://github.com/andymai/brepjs/issues/1206)) ([ac5b1fe](https://github.com/andymai/brepjs/commit/ac5b1feee3c5b424c37716ca06c397f7898838f1))
- **opencascade:** prevent LTO stripping of custom bindings ([#666](https://github.com/andymai/brepjs/issues/666)) ([977dd75](https://github.com/andymai/brepjs/commit/977dd757e162d6fa47152b14aa31bac4edd9ae82))

## Changelog
