# StudyNurse v0.5.1
- 카드 전체 DND ⋮⋮ 강제 표시 CSS 수정
- 기출 세트 DND ⋮⋮ 강제 표시 및 DND
- O/X 문제: '카드의 내용이다' 메타문구 제거
- 실제 학습 명제를 O/X로 제시
- 안전하게 반전 가능한 Sx/Tx/Cz/Cx 형식만 X 변형 대상으로 사용
- 정답 확인 시 ✓ 정답 / ✕ 오답, 내 선택, 실제 정답 표시
- 선택지 정답/오답 시각 표시
- 출처는 카테고리 > 카드 형태 유지
- 출처 클릭 시 해당 카테고리/카드로 이동 후 카드 강조
- 기존 Q&A, 4지선다, 수동 저장, DB 비파괴 유지

cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.5.1
chmod +x upgrade_from_previous.sh verify_version.sh serve_wsl.sh
./upgrade_from_previous.sh
Supabase: supabase_upgrade_0.5.1.sql
git add -A
git commit -m "StudyNurse v0.5.1"
git rebase origin/main
git push
