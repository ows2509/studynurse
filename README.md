# StudyNurse v0.2.3

외부 배포 준비 버전입니다.

## 웹에서 해야 할 작업

### 1. GitHub
GitHub에서 빈 저장소 `studynurse` 생성.

WSL:
```bash
cd /mnt/c/ows/CODING/Studynurse/StudyNurse-v0.2.3
chmod +x serve_wsl.sh verify_version.sh prepare_github.sh
./prepare_github.sh
```

그 후 본인 GitHub ID로:
```bash
git remote add origin https://github.com/<YOUR_GITHUB_ID>/studynurse.git
git push -u origin main
```

GitHub 웹:
`Settings > Pages > Source > GitHub Actions`

### 2. Supabase
Supabase에서 새 프로젝트 생성.

SQL Editor에서 `supabase_schema.sql` 전체 실행.

Project URL과 Publishable/Anon Key를 `config.js`에 입력.

예:
```js
window.STUDYNURSE_CONFIG = {
  version: "0.2.3",
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseAnonKey: "sb_publishable_...",
  datasetKey: "main"
};
```

다시:
```bash
git add .
git commit -m "Connect Supabase"
git push
```

이후 동생에게 GitHub Pages 주소만 전달하면 됩니다.

v0.2.3은 계정 없는 단일 사용자 편의를 우선하므로 익명 읽기/쓰기를 허용합니다.
공개 범위가 커지면 추후 인증/RLS 강화가 필요합니다.
