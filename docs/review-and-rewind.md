# Reviewing edits and rewind

When agents edit files in your project, Amethyst tracks every change per file and per turn so you can review diffs, keep or reject individual edits, or rewind an entire chat and its files back to an earlier point.

## The Edits strip and Review window

At the bottom of a chat, the **Edits** strip shows how many files the chat has modified:

- **Expand the strip** to see each changed file with individual **Keep** and **Reject** buttons.
- **Keep all / Reject all** accepts or reverts every pending file edit in the chat.
- **Review** opens the dedicated Review window showing every changed file with inline diffs, where you can:
  - review changes per file or per turn,
  - keep or reject individual files,
  - undo a reject if you change your mind,
  - edit a file directly before keeping it.

You can also ask an agent to open the Review window for you at a specific file:

```powershell
amethyst chat review Q20 --file src/app.ts
```

## Rewind with restore points

Amethyst automatically records file checkpoints (restore points) before turns that edit files.

### How rewind works

1. Trigger **Rewind** on any earlier message in a chat.
2. Amethyst forks the chat back to that point and shows a checklist of every file changed since then:
   - Files changed only by that chat are pre-selected to restore.
   - Files that were also modified outside the chat (by you or another agent) are grouped under **check these** and left unchecked by default so you do not overwrite unrelated work by accident.
3. Confirm to restore the selected files and continue from that turn.
4. If you change your mind, **Undo** restores both the files and the chat state.

### Storage and limits

- Restore points are stored outside your repository under `%LOCALAPPDATA%\Amethyst\checkpoints` (Amethyst never touches your git staging area or creates extra git commits for checkpoints).
- Very large files (over 50 MB) and the `.amethyst/` folder are skipped automatically.
- Restore points can be turned off in **Settings -> Agents**. When off, you can still view per-tool diffs on each tool card in the chat.
