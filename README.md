# StudyNurse v0.5.5 Production Hotfix

## 핵심 수정
- 편집 / 저장 / 자동정리 / 퀴즈 / 진단을 document 이벤트 위임 방식으로 변경
- sticky dock으로 버튼이 이동하거나 화면이 재렌더링돼도 버튼 이벤트 유지
- 저장 3단계 상태 표시
- IndexedDB 5초, Supabase 12초 타임아웃
- revision log 오류가 실제 문서 저장을 막지 않음
- 성공/실패 alert 및 진단 정보 강화
- 자동정리 미리보기는 선택사항
- 입력 후 바로 [카드 생성] 활성화
- [카드 생성] 시 현재 textarea를 다시 파싱
- 기존 CLOUD DB 비파괴

## 배포
cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.5.5
chmod +x upgrade_from_previous.sh verify_version.sh serve_wsl.sh
./upgrade_from_previous.sh

Supabase: supabase_upgrade_0.5.5.sql

git add -A
git commit -m "StudyNurse v0.5.5"
git rebase origin/main
git push
