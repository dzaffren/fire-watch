# Go back to the fires table before opening a second fire in an e2e

**Learned:** 2026-10-22 · **From:** origin-confidence build

In the tool, opening a fire swaps the concession's fires table for the fire view. A second
`getByRole("row")…click()` then finds no row and waits out the whole 30 s test.

Click `Fires in <concession id>` first, then open the next fire's row.
