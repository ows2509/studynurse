# StudyNurse v0.4.0

## 텍스트 자동정리
편집 모드의 `⚡ 텍스트 자동정리`에서 여러 주제를 한 번에 붙여넣고 미리보기 후 카드로 생성합니다.

지원 제목: `<주제명>`, `# 주제명`, `## 주제명`
지원 분류: `VOCAB:`, `단어:`, `TRANS:`, `TRANSLATION:`, `해석:`, `번역:`
지원 O/X: `❎`, `❌`, `[X]`, `🅾️`, `⭕`, `[O]`
일반 목록: `-`, `*`, `•`

자동정리로 생성된 카드는 편집 화면에만 추가되며 DB에는 즉시 저장되지 않습니다. 반드시 최종 `[저장]` 버튼을 눌러야 Supabase에 반영됩니다.

## 기존 DB 보존
`supabase_upgrade_0.4.0.sql`은 현재 `study_documents`를 삭제하거나 덮어쓰지 않고 `upgrade-baseline-v0.4.0` revision만 남깁니다.

## 업그레이드
```bash
cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.4.0
chmod +x upgrade_from_previous.sh verify_version.sh serve_wsl.sh
./upgrade_from_previous.sh
```

Supabase PROD SQL Editor에서 `supabase_upgrade_0.4.0.sql` 실행 후:
```bash
git add -A
git commit -m "StudyNurse v0.4.0"
git push
```

운영: https://ows2509.github.io/studynurse/
DEV: https://ows2509.github.io/studynurse/?dev=1
