# StudyNurse v0.5.3 Hotfix

v0.5.2에서 데이터는 정상 표시되지만 편집/퀴즈 버튼이 동작하지 않는 문제 수정.

원인:
초기화가 render() -> bind() -> render() 순서였고,
마지막 render()가 이벤트가 연결된 버튼 DOM을 다시 생성했습니다.

수정:
- 초기화 순서를 render() -> bind()로 고정
- 마지막 중복 render 제거
- v0.5.2 CLOUD 로딩/DND/퀴즈 수정 유지
- 기존 DB 비파괴

WSL:
cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.5.3
chmod +x upgrade_from_previous.sh verify_version.sh serve_wsl.sh
./upgrade_from_previous.sh

Supabase: supabase_upgrade_0.5.3.sql

git add -A
git commit -m "StudyNurse v0.5.3"
git rebase origin/main
git push
