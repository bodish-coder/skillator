# remote-cerebro channels

A channel is five calls: `poll(offset)`, `send(chat, text)`, `ask(chat, text,
buttons)`, `editButtons(chat, msg, text)`, `answerCallback(id, text)`. Updates are
Telegram-shaped whatever the channel, so the auth code is the same for all of them.

## Telegram (v1, the phone channel)

Outbound HTTPS long-polling (`getUpdates`, 25 s). No inbound port, no hosting.
Cost, stated at every arming: **bot chats are not end-to-end encrypted; Telegram's
servers see every prompt and reply.**

Setup, once, by the owner (never by an agent):

1. In Telegram, message `@BotFather`, send `/newbot`, pick a name. Copy the token.
2. Find your numeric user id: message `@userinfobot` (or any id bot) and copy the
   number. A `@username` is refused: usernames change hands.
3. Create the credentials file outside every repo:

   ```sh
   mkdir -p ~/.config/skillator
   printf 'CEREBRO_TG_TOKEN=%s\nCEREBRO_TG_USER=%s\n' '<token>' '<numeric id>' > ~/.config/skillator/cerebro.env
   chmod 600 ~/.config/skillator/cerebro.env
   ```

   Windows (PowerShell), then strip inherited access so only you can read it:

   ```powershell
   New-Item -ItemType Directory -Force "$env:USERPROFILE\.config\skillator" | Out-Null
   notepad "$env:USERPROFILE\.config\skillator\cerebro.env"
   icacls "$env:USERPROFILE\.config\skillator\cerebro.env" /inheritance:r /grant:r "$($env:USERNAME):F"
   ```

4. `cerebro doctor` must say `creds: ok`. The arm refuses a file that anyone but
   you (and SYSTEM) can read, or one inside a git worktree.
5. Open a private chat with the new bot and press Start. Pair from that chat only.

The token is never a CLI argument, never printed, never logged, redacted from any
error text, and on the denylist so the agent cannot read the file.

Phone lost or token leaked: BotFather `/revoke` for the bot, then `cerebro stop`.
A new arming always needs a new pairing code at the desk.

## file (selftest; same user, local disk only)

`--channel file:<DIR>`: `<DIR>/inbox/*.json` holds Telegram-shaped updates (one per
file, consumed on read), `<DIR>/outbox.jsonl` receives every send, ask, edit and
callback answer. Needs `CEREBRO_FILE_USER=<numeric id>` for the allowlist. It is
what `cerebro selftest` drives.

It has no authentication of its own: `CEREBRO_FILE_USER` is not a secret, so
anything that can write a JSON file into `inbox/` drives the agent, and anything
that can read `outbox.jsonl` sees every reply. The arm therefore refuses a UNC or
other network folder, a folder owned by another user, and one any other account
can read or write (POSIX `chmod 700`; Windows: only you, SYSTEM and
Administrators). A folder cerebro creates is made `0700`. Not for a LAN share.

## Deferred

- **Tailscale or LAN web adapter**: removes the third-party plaintext; needs
  Tailscale installed (new setup, owner decision 1).
- **Matrix**: end-to-end rooms; behind the same five calls.
- **ntfy.sh**: rejected. A guessed or leaked public topic is remote code execution.
- **Exposed local web UI** (port-forward, ngrok, cloudflared): rejected. An inbound
  listener is the thing this design avoids.
