# StudyNurse v0.5.2 Emergency Build

## 핵심 수정
- Supabase CLOUD 데이터를 초기 화면에 먼저 렌더링
- bind() 오류가 발생해도 학습 데이터 화면은 유지
- selectedCategory가 없거나 유효하지 않으면 첫 카테고리 자동 선택
- CLOUD 성공 후 LOCAL 데이터가 다시 화면을 덮지 않음
- 데이터 소스 배지: CLOUD / LOCAL / ERROR
- legacy category: main/sub → mainLabel/subLabel/title 호환
- 카드 전체 DND 핸들 강제 표시
- 기출 세트 DND 핸들 강제 표시
- O/X "○○ 카드의 내용이다" 문장 제거
- O/X는 실제 학습 명제 참/거짓 방식
- 정답/오답/내 선택/정답 표시
- 출처 클릭 시 해당 카드로 이동 + 강조
- Service Worker chrome-extension Cache 오류 차단
- 기존 DB/95개 카드 비파괴

## 배포
cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.5.2
chmod +x upgrade_from_previous.sh verify_version.sh serve_wsl.sh
./upgrade_from_previous.sh

Supabase:
supabase_upgrade_0.5.2.sql

git add -A
git commit -m "StudyNurse v0.5.2"
git rebase origin/main
git push
