# DESIGN - shelf export

## Export module
`shelf/export.py` owns `dump()`. One function, no classes.

## CLI
The `export` subcommand prints `dump()`.

### Flags
- `--author`

### Exit codes
- 0 on success

```
## not a heading - inside a fence
```

## Tests
- tests/test_export.py
- tests/test_books.py
