# Hand over `!` commands with no `<placeholder>` in them

**Learned:** 2026-10-16 · **From:** fire-record ship

A `setup.sh` command handed to the user with `ALERT_EMAIL=<your email>` was pasted as is. Bash read
`<your` as input from a file named `your` and stopped before the script ran. Fill the real value, or
leave `NAME=` empty so the script's `: "${NAME:?}"` guard stops it with a clear message.

The `!` shell also keeps its working directory: after `! cd api && …`, the next `! cd api && …`
fails. Start each handed-over command with an absolute `cd`.
