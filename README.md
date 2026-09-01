# StudyNurse v0.4.4

## 수정사항

1. 기출 CRUD/OX 사용 시 화면 위치 유지
- 기출 항목 추가/삭제
- 기출 섹션 추가/삭제
- O ↔ X 토글
- 기출 DND 정렬
위 동작 후 전체 render가 발생해도 기존 scrollY를 복원합니다.

2. 기출 펼침/접힘 상태 유지
- 열려 있던 기출 드롭박스는 O/X 토글이나 항목 추가 후에도 계속 열린 상태 유지
- 사용자가 직접 접었을 때만 닫힘

3. 상단 기능 버튼 Sticky
편집 모드 진입 시 아래 버튼을 Rich Text 편집기와 같은 sticky dock으로 이동:
- 편집 종료
- 자동정리
- 저장
- Rich Text 서식

따라서 긴 페이지를 아래로 내려가도 화면 상단에서 계속 사용할 수 있습니다.

4. 기존 기능/DB 정책 유지
- 자동저장 없음
- 저장 버튼 클릭 시에만 DB 반영
- 기존 StudyNurse DB 비파괴
- ZIP에 .git 미포함

## 배포

cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.4.4
chmod +x upgrade_from_previous.sh verify_version.sh serve_wsl.sh
./upgrade_from_previous.sh

Supabase:
supabase_upgrade_0.4.4.sql

git add -A
git commit -m "StudyNurse v0.4.4"
git rebase origin/main
git push
