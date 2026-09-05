# StudyNurse v0.6.2

## 신규 입력 placeholder
- +개념 / +단어 / +번역 / 기출 / Q&A는 실제 빈 값으로 생성
- 안내문은 CSS placeholder로만 표시
- 클릭/포커스 시 바로 빈칸에서 입력 가능
- 안내문구는 DB에 저장되지 않음

## 퀴즈 오답/X 복습
- 오답인 경우 카드에 저장된 원문 표시
- 정답이 X인 문제도 원문 표시
- 합성 X 문제는 변형 전 실제 저장 문구를 표시
- [원문 바로가기] 클릭 시 퀴즈를 우측 하단 미니 패널로 최소화
- 해당 카드로 자동 이동/강조
- [퀴즈 계속] 클릭 시 같은 문제의 정답확인 상태 그대로 복귀
- 기존 상단 출처 클릭도 동일 방식

## 기존 안정화 유지
- Neurology qbank null 방어
- O/X 균형
- '-' 참고항목 퀴즈 제외
- #test 일반 제외 / 선택 시 단독범위
- 저장 / CLOUD-LOCAL / 자동정리 / DND
- 기존 DB 비파괴

## 배포
cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.6.2
chmod +x upgrade_from_previous.sh verify_version.sh serve_wsl.sh
./upgrade_from_previous.sh

Supabase:
supabase_upgrade_0.6.2.sql

git add -A
git commit -m "StudyNurse v0.6.2"
git rebase origin/main
git push
