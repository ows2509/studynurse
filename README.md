# StudyNurse v0.7.0

## 개발 경로
Windows:
E:\google_drive\02_CODING\CODING\Studynurse

WSL:
 /mnt/e/google_drive/02_CODING/CODING/Studynurse

## v0.7.0
- 2-depth 카테고리: 대카테고리 > 소카테고리
- 기존 Adult 데이터는 main/mainLabel을 그대로 사용
- + 대: 대카테고리 추가
- 대 수정 / 대 삭제
- 대카테고리 생성 시 '새 소카테고리' 자동 생성
- + 소: 현재 대카테고리에 소카테고리 추가
- 소카테고리 수정 시 다른 대카테고리로 이동 가능
- Rich Text 형광펜: 연노랑 / 하늘 / 연두
- 글자색: 검정 / 진한핑크 / 회색
- v0.6.2 기능 유지: placeholder, 퀴즈 원문복습/최소화, qbank null 방어, #test

## 적용
cd /mnt/e/google_drive/02_CODING/CODING/Studynurse/StudyNurse-v0.7.0
chmod +x upgrade_from_previous.sh verify_version.sh serve_wsl.sh
./upgrade_from_previous.sh

Supabase SQL Editor:
supabase_upgrade_0.7.0.sql

git add -A
git commit -m "StudyNurse v0.7.0"
git rebase origin/main
git push
