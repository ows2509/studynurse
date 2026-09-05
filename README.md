# StudyNurse v0.6.0 Production Release

- 신규 카테고리 클릭 안정화
- 기출 날짜/제목/내용 Rich Text 편집
- 기출 O/X/- 드롭다운, - 는 퀴즈 제외
- 자동정리 Sx/Tx/Cz/Cx/Nx/Dx/Rx/Px/Hx/Lt/Rt 자동 Bold
- VOCAB 본문 크기 축소
- O/X 퀴즈 가능한 범위에서 50:50 균형
- #test 퀴즈 제외/선택 시 예외 유지
- 기존 DB 비파괴

배포:
cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.6.0
chmod +x upgrade_from_previous.sh verify_version.sh serve_wsl.sh
./upgrade_from_previous.sh
Supabase: supabase_upgrade_0.6.0.sql
git add -A
git commit -m "StudyNurse v0.6.0"
git rebase origin/main
git push
