# Real Antigravity denial screenshot

`agy-dangerous-block.json` was extracted from a real `agy 1.2.7` headless run in an isolated HOME and workspace. The proposed `git push origin main` call was classified by the live Jev hook as `force_ask`, entered Antigravity's native permission flow, and was soft-denied because headless mode could not ask a user.

The command never reached `DONE`, and no side effects were observed.

`agy-dangerous-block.html` formats the sanitized `stream-json` evidence as a readable terminal view. The PNG is therefore a faithful rendered trace, not an unedited photograph of the interactive TUI. Conversation identifiers, credentials, token values, and raw transcripts are omitted.

Re-render the screenshot with Chrome:

```sh
google-chrome \
  --headless=new \
  --no-sandbox \
  --disable-gpu \
  --hide-scrollbars \
  --force-device-scale-factor=1 \
  --window-size=1400,900 \
  --screenshot="$PWD/assets/agy-dangerous-block.png" \
  "file://$PWD/docs/screenshots/agy-dangerous-block.html"
```
