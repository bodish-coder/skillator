# F115 keyboard evidence

Mode: mounted native primitive tree, real SDK ui.focus/ui.press/ui.input/ui.select event chains; mocked filesystem and process effects. No letter-to-press test dispatcher was introduced.

Installed SDK Button.hotkey accepts a lowercase letter/digit; plain buttons show a three-cell `a: ` prefix. Duplicate active keys are later-wins in the host, so the new cross-context tests assert uniqueness. The SDK Mounted.key method dispatches Client onKey only, not primitive Button hotkeys. It was not used.

Verified bindings and existing action effects: reconcile a/p/n and current-row o; Accept all and picked-success exact argv and one application per selected row; immediate board refresh; refusal, stays-only and empty-picked handling; existing page/form effect suites retained. All 403 plugin tests pass.

Input protection: actual ui.focus events disarm bindings on Ticket, Handle, Name, Emails, setup Token/URL/Port and Build Name inputs. Unknown, absent and other-form focus are rejected. Tests type action-letter strings through mounted Input, assert no binding, and restore bindings only on eligible controls. Entry resets occur before form-state transitions. Mounted input is not raw terminal typing proof. Native Select values remain handled by ui.select, with arrows/Enter unchanged and no selector letter dispatcher.

Repeated targeting: one current row/branch/stage/run binds its letter; tests move focus between two eligible targets and include finished runs. Current-target defaults are documented in the README. Confirmation keys remain distinct; ordinary Team/setup letters are suppressed in their confirmation contexts.

NOT CHECKED: physical terminal keyboard delivery, native Input precedence under raw keys, physical mouse delivery, and the owner's B17 failure. No isolated interactive host/input harness was available in this build seat; no native keyboard success is claimed. Owner live check: c/a, c/p after selecting a proposal, c/n; type action letters in each Input, Tab to an action and use its letter; verify the current loaded revision and exact one-time effect/refresh. B17 remains unresolved and the consuming ui.press handlers were preserved.
