# StudyNurse v0.7.4

Development roots:
- Windows: `E:\google_drive\02_CODING\CODING\Studynurse`
- WSL: `/mnt/e/google_drive/02_CODING/CODING/Studynurse`

Changes:
- Rich-text selection overlay is translucent so highlight/font color remains visible while selected.
- Rich-format toolbar button flashes after application.
- Short on-screen confirmation: `굵게 적용`, `하늘 형광펜 적용`, etc.
- v0.7.3 edge drawer retained.
- `upgrade_from_previous.sh` prints Supabase SQL and copies it to Windows clipboard with `clip.exe`.
- HTTPS StudyNurse origin is automatically switched to SSH.
- `deploy.sh` performs fetch/add/commit/rebase/push and stops safely on conflicts.
