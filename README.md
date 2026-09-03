# StudyNurse v0.5.4 Hotfix

원인 확정:
v0.5.3 app.js에서 bind() 함수 정의가 누락되어 데이터는 보이지만 편집/퀴즈 버튼이 무반응이었습니다.

수정:
- v0.4.5의 검증된 bind() 복원
- v0.5.x 퀴즈 이벤트 연결 추가
- 진단 버튼 추가
- 진단 화면에서 Version / CLOUD-LOCAL / Category/Card 수 / 편집·퀴즈 onclick / DND 핸들 / Service Worker 상태 확인
- Supabase 직접 읽기 테스트 버튼 추가
- 기존 CLOUD 95카드 로딩, DB 비파괴 유지

배포:
cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.5.4
chmod +x upgrade_from_previous.sh verify_version.sh serve_wsl.sh
./upgrade_from_previous.sh

Supabase: supabase_upgrade_0.5.4.sql

git add -A
git commit -m "StudyNurse v0.5.4"
git rebase origin/main
git push
