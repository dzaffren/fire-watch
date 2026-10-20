# Gzip committed files with `GzipFile(mtime=0)`, not `gzip.compress`

**Learned:** 2026-10-20 · **From:** landing-page build

On Python 3.12, `gzip.compress(raw, 9, mtime=0)` writes OS byte `03` in the header, and
`gzip.GzipFile(..., mtime=0)` writes `ff`. The deflate body is the same. The globe files were made
the second way, so `globe-day` matched them only once it used `GzipFile`.

When a command must redo a committed `.gz` byte for byte, compare `tail -c +11` of both files
first: same body, different header means the writer, not the data.
