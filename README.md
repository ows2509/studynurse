# StudyNurse v0.3.2

v0.3.1 드래그 앤 드롭 버그 수정 버전입니다.

## 수정 사항
- 드래그 핸들 눌림만 되고 이동하지 않던 문제 수정
- 작은 핸들 자체가 아닌 document 전체에서 Pointer Event 추적
- `elementFromPoint()`로 현재 포인터 아래 문단/이미지 블록 판별
- 마우스와 터치 동일 로직
- 6px 이동 전에는 단순 클릭으로 처리
- 드래그 중 텍스트 선택/브라우저 이미지 드래그 차단
- 이미지 ↔ 개념 문단 ↔ HTML 블록 순서 변경
- 위/아래 이동 버튼 없음
- 이동 후에도 DB 자동 저장 안 함
- `저장` 버튼을 눌러야 PROD/DEV DB 반영

## DB
기존 `study_documents` 데이터는 변경/초기화하지 않습니다.

`supabase_upgrade_0.3.2.sql`은 현재 DB를 revision log에
`upgrade-baseline-v0.3.2`로 보존하는 용도만 수행합니다.

## 업그레이드
압축 해제:
`C:\ows\CODING\Studynurse\StudyNurse-v0.3.2`

WSL:
```bash
cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.3.2
chmod +x upgrade_from_previous.sh verify_version.sh serve_wsl.sh
./upgrade_from_previous.sh
```

Supabase PROD SQL Editor에서:
`supabase_upgrade_0.3.2.sql`

그 후:
```bash
git add -A
git commit -m "StudyNurse v0.3.2"
git push
```

운영:
https://ows2509.github.io/studynurse/

DEV:
https://ows2509.github.io/studynurse/?dev=1
