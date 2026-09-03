# StudyNurse v0.4.5
- 카드 바깥 왼쪽 중앙 ⋮⋮ : 카드 전체 DND
- 카드 내부 ⋮⋮ : 문단/이미지/HTML DND
- 상단 소카테고리 ⋮⋮ : Cardio/Urinary/Emergency/Endo/Reproductive 순서 DND 유지
- 순서 변경은 저장 버튼에서만 DB 반영
- 기존 DB 비파괴

cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.4.5
chmod +x upgrade_from_previous.sh verify_version.sh serve_wsl.sh
./upgrade_from_previous.sh
Supabase: supabase_upgrade_0.4.5.sql
git add -A
git commit -m "StudyNurse v0.4.5"
git rebase origin/main
git push
