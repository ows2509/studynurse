# StudyNurse v0.3.0

## 가장 중요한 업그레이드 원칙

v0.3.0은 기존 Supabase `study_documents` 데이터를 초기화하지 않습니다.

- `DROP TABLE study_documents` 없음
- 기존 `study_documents/main.payload` 삭제 없음
- 기존 데이터를 seed.json으로 덮어쓰지 않음
- 클라우드 데이터가 있으면 항상 클라우드 데이터를 우선 로드
- 기존 JSON 구조에 없는 새 필드만 런타임에서 추가
- 업그레이드 직전 DB payload를 `study_revision_log`에 baseline으로 보존
- 이후 삭제 등 중요 변경 전 revision snapshot 보존

## 신기능

1. 카드 이미지 추가/삭제
   - Supabase Storage `studynurse-images`
   - 최대 10MB
   - JPEG/PNG/WebP/GIF
   - DB에는 이미지 URL만 저장

2. HTML 직접 편집
   - 카드별 `</> HTML`
   - 실시간 미리보기
   - table/div/span/b/u/i 등 HTML 사용 가능
   - script/iframe/이벤트 핸들러/javascript URL은 자동 제거

3. 카테고리 추가
   - EDIT 모드에서 Cardio/Urinary/... 우측 `+`
   - 카테고리 추가/이름 수정/삭제 가능

4. 변경 이력
   - `study_revision_log`
   - v0.3.0 업그레이드 직전 baseline 자동 보존
   - 수동 저장 또는 중요 삭제 작업 시 snapshot
   - 일반 자동저장은 최대 10분 간격 checkpoint로 제한

## 기존 v0.2.3에서 업그레이드

압축 해제:

    C:\ows\CODING\Studynurse\StudyNurse-v0.3.0

WSL:

    cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.3.0
    chmod +x upgrade_from_0.2.3.sh verify_version.sh serve_wsl.sh
    ./upgrade_from_0.2.3.sh

이 스크립트는 이전 v0.2.3 폴더에서:
- 실제 Supabase URL/Publishable Key가 들어간 config.js
- .git 저장소/remote/history

를 v0.3.0으로 계승합니다.

## 반드시 먼저 Supabase DB 업그레이드

Supabase Dashboard > SQL Editor에서:

    supabase_upgrade_0.3.0.sql

전체 내용을 한 번 실행합니다.

이 SQL은 기존 study_documents 데이터를 삭제하지 않습니다.

실행 후 확인:
- Table Editor > study_documents : 기존 main 행 유지
- Table Editor > study_revision_log : upgrade-baseline-v0.3.0 행 존재
- Storage > studynurse-images bucket 존재

## 웹 버전 배포

SQL 실행 후 WSL:

    cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.3.0
    git add -A
    git commit -m "StudyNurse v0.3.0"
    git push

GitHub Pages는 기존 main / root 설정을 그대로 사용합니다.

접속 주소도 변경 없음:

    https://ows2509.github.io/studynurse/

## 주의

현재는 계정/PIN 없는 단일 사용자 구조입니다.
Supabase 익명 쓰기가 허용되므로 주소가 널리 공개될 경우 추후 인증/RLS 강화가 필요합니다.

Secret/service_role key는 config.js에 넣지 마세요.
