# Railway 배포 가이드

## 1. Railway 환경 변수 설정

Railway 대시보드에서 **Node.js 서비스**의 **Variables** 탭으로 이동하여 다음 환경 변수를 추가하세요:

### 필수 환경 변수

```
DB_HOST=mysql.railway.internal
DB_USER=root
DB_PASSWORD=YtVcIUKmlGByYIKVqonxpxuNnTuTnYcs
DB_NAME=railway
JWT_SECRET=your_super_secret_jwt_key_here_change_this_to_random_string
```

### 환경 변수 설명

- **DB_HOST**: `mysql.railway.internal` (같은 프로젝트 내부 서비스 간 통신용)
- **DB_USER**: `root` (MySQL 사용자)
- **DB_PASSWORD**: Railway MySQL에서 제공한 비밀번호
- **DB_NAME**: `railway` (데이터베이스 이름)
- **JWT_SECRET**: JWT 토큰 서명용 비밀키 (임의의 긴 문자열로 변경 권장)

## 2. 데이터베이스 스키마 적용

### 방법 1: Railway MySQL에 직접 접속

1. Railway 대시보드에서 **MySQL 서비스** 선택
2. **Connect** 버튼 클릭 → **Public Networking** 탭에서 연결 정보 확인
3. MySQL 클라이언트(MySQL Workbench, DBeaver 등)로 접속:
   - Host: `mainline.proxy.rlwy.net`
   - Port: `28992`
   - User: `root`
   - Password: `YtVcIUKmlGByYIKVqonxpxuNnTuTnYcs`
   - Database: `railway`
4. `db.sql` 파일의 내용을 실행하여 테이블 생성

### 방법 2: Railway CLI 사용

```bash
railway connect mysql
mysql -u root -p railway < db.sql
```

## 3. 서비스 설정 확인

### Node.js 서비스 설정

**⚠️ 중요: `client` 폴더 접근을 위해 프로젝트 루트를 Root Directory로 설정해야 합니다**

**권장 설정:**
1. Railway 대시보드 → Node.js 서비스 → **Settings** 탭
2. **Root Directory**: `.` (프로젝트 루트) 또는 비워두기
3. **Start Command**: `cd server && npm start`
4. **Build Command**: `cd server && npm install` (또는 자동)

이렇게 설정하면:
- 전체 프로젝트 구조(`client/`, `server/`)가 Railway에 포함됩니다
- `server/app.js`에서 `../client` 경로로 `client` 폴더에 접근할 수 있습니다

**만약 Root Directory를 `server`로 설정한 경우:**
- `client` 폴더가 Railway 빌드에 포함되지 않을 수 있습니다
- 이 경우 Root Directory를 프로젝트 루트(`.`)로 변경하세요

## 4. 배포 확인 및 서버 링크 확인

### 서버 URL 확인 방법

1. Railway 대시보드에서 **Node.js 서비스** 클릭
2. 상단에 **"Public URL"** 또는 **"Domain"** 섹션 확인
   - 예: `https://your-app-name.up.railway.app`
3. URL이 보이지 않으면:
   - **Settings** 탭 클릭
   - **Generate Domain** 버튼 클릭
   - 자동으로 URL이 생성됩니다

### 배포 상태 확인

1. Railway 대시보드에서 서비스가 **Running** 상태인지 확인
2. 브라우저에서 생성된 URL로 접속:
   - 예: `https://your-app-name.up.railway.app`
   - 로그인 페이지(`index.html`)가 표시되면 성공!
3. API 테스트:
   - `https://your-app-name.up.railway.app/health` 접속
   - `{"status":"ok"}` 응답이 오면 서버 정상 작동

## 5. 문제 해결

### 데이터베이스 연결 오류

- 환경 변수가 올바르게 설정되었는지 확인
- `DB_HOST`가 `mysql.railway.internal`인지 확인 (같은 프로젝트 내부 통신)

### 포트 오류

- `app.js`에서 이미 `process.env.PORT`를 사용하므로 별도 설정 불필요
- Railway가 자동으로 포트를 할당합니다

### 정적 파일이 로드되지 않음 / "페이지를 찾을 수 없습니다" 에러

**가장 흔한 원인: Root Directory 설정 문제**

1. **Railway 설정 확인**:
   - Railway 대시보드 → 서비스 → **Settings** → **Root Directory**
   - Root Directory가 `server`로 설정되어 있으면 → `.` (프로젝트 루트)로 변경
   - Start Command를 `cd server && npm start`로 변경

2. **Railway 로그 확인**:
   - Railway 대시보드 → 서비스 → **Deployments** → 최신 배포 → **View Logs**
   - 다음 메시지 확인:
     - `✅ Using client path: ...` → 정상
     - `❌ Client directory not found` → Root Directory 설정 문제
     - `__dirname: /app/server` → 정상 (Root Directory가 `.`인 경우)
     - `__dirname: /app` → Root Directory가 `server`로 잘못 설정됨

3. **브라우저 개발자 도구 확인**:
   - Network 탭에서 파일 요청 상태 확인
   - 404 에러가 나는 파일 경로 확인

4. **재배포**:
   - 설정 변경 후 자동으로 재배포되거나, 수동으로 **Redeploy** 클릭

## 6. 추가 참고사항

- Railway의 무료 플랜은 일정 시간 비활성 시 서비스가 슬립 모드로 전환됩니다
- 프로덕션 환경에서는 도메인 연결 및 HTTPS 설정을 고려하세요
- 업로드된 파일은 Railway의 임시 스토리지에 저장되므로, 영구 저장이 필요하면 S3 등 외부 스토리지 사용 권장

