# StudyNurse v0.7.5 Emergency Rich-Text Hotfix

Root cause fixed:
- Clicking a rich-text toolbar button stole focus from contenteditable and collapsed/lost the selected Range.
- Formatting therefore had no valid text selection to modify.

Fix:
- Capture selected Range from contenteditable.
- Prevent toolbar mousedown/pointerdown from stealing selection.
- Restore the exact Range before `execCommand`.
- Re-capture the formatted Range afterward.
- Bold, underline, yellow/sky/green highlight, black/pink/gray font, clear-format use the same protected path.
- v0.7.4 SQL clipboard automation and deploy.sh retained.
