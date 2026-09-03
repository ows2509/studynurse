# StudyNurse v0.5.0
- StudyNurse 제목 옆 버전 상시 표시
- 기존 카드/문단/카테고리 DND 유지
- Q&A 기출: 질문/정답 편집, VIEW에서 정답 마스킹/확인
- 랜덤 퀴즈: OX / 4지선다 / 혼합, 현재 카테고리 또는 전체
- 카드 내용/VOCAB/Q&A만 문제 재료로 사용
- 정답 확인 및 출처 카드 표시, 종료 시 퀴즈 폐기
- 기존 DB 비파괴/수동 저장 정책 유지

cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.5.0
chmod +x upgrade_from_previous.sh verify_version.sh serve_wsl.sh
./upgrade_from_previous.sh
Supabase: supabase_upgrade_0.5.0.sql
git add -A
git commit -m "StudyNurse v0.5.0"
git rebase origin/main
git push
