# Prove tests for pause 2 code with a mutant

**Learned:** 2026-10-22 · **From:** origin-confidence build

Pause 2 had already written the page code, so every new unit test passed the first time it ran.
A test that never failed proves nothing. Chunk B broke the code briefly for each test and saw it
fail, and one fixture turned out to hide a broken flag behind another caveat.

When `/build` adds tests for code that pause 2 wrote, break the code once for each test and watch
it fail before restoring it. Do the same for an e2e: changing one threshold is enough.

A test that matches a paragraph by its first words leaves the rest unpinned. In pack-claims, putting
back the old first-pass sentence passed every unit test, because the method test matched only "A
detection joins a fire…". Match the whole paragraph, or the sentence that changed.
