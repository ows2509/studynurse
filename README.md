# StudyNurse v0.3.1

## 핵심 변경

### 1. 자동 저장 제거
편집 중에는 Supabase DB에 자동 저장하지 않습니다.

- `저장` 버튼을 눌렀을 때만 DB 반영
- `편집 종료`를 눌렀는데 저장하지 않은 변경이 있으면 경고
- `저장하지 않고 종료`를 확인하면 편집 시작 전 상태로 되돌림
- 새로고침/페이지 종료 시에도 미저장 변경 경고
- 백그라운드 전환으로 자동 저장하지 않음

### 2. DEV / PROD 분리
기본 주소:

    https://ows2509.github.io/studynurse/

PROD 설정 `config.js` 사용.

DEV 주소:

    https://ows2509.github.io/studynurse/?dev=1

`config.dev.js` 사용.

DEV Supabase를 별도 프로젝트로 만들면 운영 DB를 건드리지 않고 기능 시험이 가능합니다.
DEV 설정이 비어 있으면 DEV 모드는 브라우저 로컬 DB만 사용합니다.

### 3. 이미지 업로드 설정
이미지 선택 후 즉시 올리지 않고 설정 창이 표시됩니다.

프리셋:
- 원본 유지
- 고화질: 최대 2560px / 품질 90%
- 기본: 최대 1600px / 품질 84%
- 용량 절약: 최대 1024px / 품질 74%

추가 기능:
- 좌/우/상/하 자르기
- 0/90/180/270도 회전
- 표시 크기 25/50/75/100%
- 원본 용량과 변환 후 예상 용량 표시

### 4. 문단 + 이미지 드래그 앤 드롭
개념 문단, HTML 블록, 이미지가 동일한 `blocks` 구조로 관리됩니다.

EDIT 모드에서 블록 왼쪽 `⋮⋮` 영역을 잡고 위/아래로 드래그하면:
- 이미지 ↔ 개념 문단
- 이미지 ↔ HTML 블록
- 개념 문단 ↔ 개념 문단

순서를 자유롭게 바꿀 수 있습니다.

위/아래 이동 버튼은 넣지 않았습니다.
이미지 자체의 기본 브라우저 드래그는 차단했습니다.

### 5. 기존 DB 보존
기존 `study_documents/main` payload를 삭제하거나 seed 데이터로 덮어쓰지 않습니다.

구버전:
- bullets
- images
- customHtml

을 v0.3.1 최초 로드 시 `blocks`로 비파괴 변환합니다.
기존 필드도 계속 동기화해서 남겨 둡니다.

`supabase_upgrade_0.3.1.sql` 실행 시 현재 운영 DB를
`study_revision_log`에 `upgrade-baseline-v0.3.1`로 한 번 보존합니다.

## 업그레이드 절차

압축 해제:

    C:\ows\CODING\Studynurse\StudyNurse-v0.3.1

WSL:

    cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.3.1
    chmod +x upgrade_from_previous.sh verify_version.sh serve_wsl.sh
    ./upgrade_from_previous.sh

스크립트가 기존 v0.3.0 또는 v0.2.3에서:
- 실제 PROD Supabase config
- Git 저장소/remote/history

를 자동 탐색해 계승합니다.

## PROD Supabase
Supabase SQL Editor에서:

    supabase_upgrade_0.3.1.sql

전체 실행.

기존 study_documents 데이터는 삭제되지 않습니다.

확인:
- `study_documents/main` 기존 행 유지
- `study_revision_log`에 `upgrade-baseline-v0.3.1`
- `studynurse-images` Storage bucket 유지/생성

## DEV Supabase (선택)
테스트 전용 Supabase 프로젝트를 하나 더 생성하고 같은:

    supabase_upgrade_0.3.1.sql

을 실행합니다.

그 뒤 `config.dev.js`에 DEV Project URL / Publishable Key를 입력합니다.

DEV 접속:

    https://ows2509.github.io/studynurse/?dev=1

상단에 빨간색 `DEV` 표시가 나옵니다.

## 배포
PROD SQL 적용 및 테스트 후:

    git add -A
    git commit -m "StudyNurse v0.3.1"
    git push

GitHub Pages 주소는 변경 없습니다.

    https://ows2509.github.io/studynurse/

## 주의
이미지 파일은 `업로드` 버튼을 누르는 순간 Supabase Storage에 파일 자체가 올라갑니다.
다만 카드 DB의 이미지 참조와 순서는 `저장` 버튼을 눌렀을 때만 반영됩니다.
편집을 취소하면 사용되지 않는 이미지 파일이 Storage에 남을 수 있으며, 이후 정리 기능을 추가할 수 있습니다.
