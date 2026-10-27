# DESIGN - shelf export

## Export module
`shelf/export.py` owns `dump()`. One function, no classes.

## CLI
The `export` subcommand prints `dump()`.

| flag | does |
|---|---|
| `--author` | filters by author |
| `--all` | every book |

### Flags
- `--author`

### Exit codes
- 0 on success

```
## not a heading - inside a fence
```

## Tests
| tests/test_export.py | 3 cases |

- tests/test_export.py
- tests/test_books.py
