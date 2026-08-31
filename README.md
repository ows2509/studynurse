# StudyNurse v0.4.1

v0.4.0 자동정리 기능이 표시되지 않던 JavaScript 문법 오류 수정판입니다.

## 변경
- 자동정리 코드 삽입 오류 수정
- `node --check app.js` 문법 검증 통과
- 편집모드 상단에 `⚡ 자동정리` 버튼 고정 표시
- `<주제명>`, `# 주제명`, `## 주제명` 다중 카드 분리
- VOCAB/단어 자동 분류
- TRANS/TRANSLATION/해석/번역 자동 분류
- ❎/❌/[X], 🅾️/⭕/[O] 자동 정리
- 미리보기 후 카드 생성
- 카드 생성만으로 DB 저장하지 않음
- 최종 `저장` 버튼에서만 Supabase 반영
- 기존 드래그앤드롭/이미지/DEV-PROD 기능 유지
- 기존 DB 비파괴 유지

## 업그레이드
```bash
cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.4.1
chmod +x upgrade_from_previous.sh verify_version.sh serve_wsl.sh
./upgrade_from_previous.sh
```

Supabase PROD SQL Editor:
`supabase_upgrade_0.4.1.sql`

배포:
```bash
git add -A
git commit -m "StudyNurse v0.4.1"
git push
```
