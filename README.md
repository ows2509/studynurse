# StudyNurse v0.4.2
신기능:
- Sx:, Tx:, Cz:, Cx: 자동 Bold
- Rich Text: Bold, Underline, 연노랑 형광펜, 검정/진한핑크 글씨
- 단어장 자동 수집 및 항목 삭제
- 기출문제 추가/삭제, 항목 추가/삭제, O/X 토글
- O/X에서 X 활성 시 핑크 표시
- 2-depth 카테고리 구조 유지: Adult > Cardio/Urinary...
- 소카테고리 추가/인라인 이름수정/삭제/DND 순서변경
- 기존 자동정리, 이미지, 문단 DND, 수동 저장 정책 유지
- 기존 DB 비파괴 유지

업그레이드:
cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.4.2
chmod +x upgrade_from_previous.sh verify_version.sh serve_wsl.sh
./upgrade_from_previous.sh

Supabase PROD SQL Editor: supabase_upgrade_0.4.2.sql
git add -A
git commit -m "StudyNurse v0.4.2"
git push
