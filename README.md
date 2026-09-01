# StudyNurse v0.4.3
- Rich Text 툴바는 편집모드에서만 동작
- 편집 텍스트 클릭/커서/선택 시에만 표시
- 선택 영역 유지 후 서식 적용
- 스크롤 시 화면 상단 sticky 유지
- 다른 영역 클릭 시 숨김
- v0.4.2 기능과 DB 유지
- ZIP에 .git 미포함, 이전 실제 Git 계승 후 origin fetch

WSL:
cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.4.3
chmod +x upgrade_from_previous.sh verify_version.sh serve_wsl.sh
./upgrade_from_previous.sh
Supabase: supabase_upgrade_0.4.3.sql
배포: git add -A && git commit -m "StudyNurse v0.4.3" && git rebase origin/main && git push
