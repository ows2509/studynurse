# StudyNurse v0.5.6 Quiz Hotfix

- 정답 확인 후 [다음] 정상 이동
- 마지막 문제 후 결과/정답률 표시
- O/X 지시문과 실제 문제 문장 분리
- 붙어 있는 ⭕/⛔ 문장을 개별 문제 문장으로 분리
- #으로 시작하는 카테고리는 일반 퀴즈와 4지선다 오답 후보에서 제외
- 단, 현재 선택 카테고리가 #test라면 #test만 퀴즈에 사용
- 검색/편집/저장/DND에는 영향 없음
- v0.5.5 저장/자동정리 안정화 유지
- DB 비파괴

배포:
cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.5.6
chmod +x upgrade_from_previous.sh verify_version.sh serve_wsl.sh
./upgrade_from_previous.sh
Supabase: supabase_upgrade_0.5.6.sql
git add -A
git commit -m "StudyNurse v0.5.6"
git rebase origin/main
git push
