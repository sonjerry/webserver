# Railway 배포 설정 가이드

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

## 2. 데이터베이스 스키마 및 초기 데이터 적용

### 방법 1: MySQL Workbench 사용 (가장 쉬움, 권장)

1. **MySQL Workbench 설치** (없는 경우):
   - https://dev.mysql.com/downloads/workbench/ 에서 다운로드 및 설치

2. **Railway에서 연결 정보 확인**:
   - Railway 대시보드 → **MySQL 서비스** 선택
   - **Connect** 버튼 클릭 → **Public Networking** 탭
   - 연결 정보 확인:
     - Host: `mainline.proxy.rlwy.net`
     - Port: `28992`
     - User: `root`
     - Password: `YtVcIUKmlGByYIKVqonxpxuNnTuTnYcs`
     - Database: `railway`

3. **MySQL Workbench에서 연결**:
   - MySQL Workbench 실행
   - **+** 버튼 클릭하여 새 연결 생성
   - Connection Name: `Railway MySQL`
   - Hostname: `mainline.proxy.rlwy.net`
   - Port: `28992`
   - Username: `root`
   - Password: `YtVcIUKmlGByYIKVqonxpxuNnTuTnYcs`
   - Default Schema: `railway`
   - **Test Connection** 클릭 → 성공하면 OK
   - 연결을 더블클릭하여 접속

4. **데이터베이스 선택** (중요!):
   - 왼쪽 **SCHEMAS** 패널에서 `railway` 데이터베이스를 더블클릭
   - 또는 `railway`를 우클릭 → **Set as Default Schema** 선택
   - 또는 SQL 편집기 맨 위에 `USE railway;` 입력

5. **db.sql 실행**:
   - **File** → **Open SQL Script** → `db.sql` 파일 선택
   - 또는 상단 SQL 편집기에 `db.sql` 내용을 복사해서 붙여넣기
   - ⚡ (Execute) 버튼 클릭 또는 `Ctrl+Shift+Enter`
   - 실행 완료 메시지 확인

### 방법 2: DBeaver 사용

1. **DBeaver 설치** (없는 경우):
   - https://dbeaver.io/download/ 에서 다운로드 및 설치

2. **새 연결 생성**:
   - DBeaver 실행 → **Database** → **New Database Connection**
   - **MySQL** 선택 → **Next**
   - 연결 정보 입력:
     - Host: `mainline.proxy.rlwy.net`
     - Port: `28992`
     - Database: `railway`
     - Username: `root`
     - Password: `YtVcIUKmlGByYIKVqonxpxuNnTuTnYcs`
   - **Test Connection** → **Finish**

3. **SQL 실행**:
   - 연결 선택 → 우클릭 → **SQL Editor** → **New SQL Script**
   - `db.sql` 파일 내용을 복사해서 붙여넣기
   - **Execute SQL Script** 버튼 클릭 (▶️) 또는 `Alt+X`

### 방법 3: 명령줄 사용 (MySQL 클라이언트 설치 필요)

Windows에서 MySQL 클라이언트가 설치되어 있다면:

```bash
mysql -h mainline.proxy.rlwy.net -P 28992 -u root -p railway < db.sql
```

비밀번호 입력: `YtVcIUKmlGByYIKVqonxpxuNnTuTnYcs`

### 초기 로그인 계정

`db.sql` 실행 후 다음 계정으로 로그인할 수 있습니다:

- **Admin**: `admin@example.com`
- **Instructor**: `instructor@example.com`
- **Student**: `student@example.com`

## 3. 서비스 설정 확인

### Node.js 서비스 설정

1. Railway 대시보드 → Node.js 서비스 → **Settings** 탭
2. **Root Directory**: `server` (또는 자동 감지)
3. **Start Command**: `npm start`
4. **Build Command**: `npm install` (자동)

## 4. 배포 확인

1. Railway 대시보드에서 서비스가 **Running** 상태인지 확인
2. **Settings** → **Generate Domain** 클릭하여 공개 URL 생성
3. 브라우저에서 생성된 URL로 접속:
   - 예: `https://your-app-name.up.railway.app`
   - 로그인 페이지가 표시되면 성공!
4. 초기 계정으로 로그인 테스트:
   - `admin@example.com`으로 로그인 시도

## 5. 문제 해결

### 데이터베이스 연결 오류

- Railway 로그에서 `❌ Database connection failed` 메시지 확인
- 환경 변수가 올바르게 설정되었는지 확인
- `DB_HOST`가 `mysql.railway.internal`인지 확인 (같은 프로젝트 내부 통신)

### 로그인 실패 (401 또는 500)

- `db.sql` 파일이 제대로 실행되었는지 확인
- Railway MySQL에서 `Users` 테이블에 데이터가 있는지 확인:
  ```sql
  SELECT * FROM Users;
  ```
- Railway 로그에서 데이터베이스 연결 및 쿼리 에러 확인

### 정적 파일이 로드되지 않음

- `client` 폴더가 `server` 폴더 안에 있는지 확인
- Railway 로그에서 `✅ Using client path: ...` 메시지 확인

## 6. 추가 참고사항

- Railway의 무료 플랜은 일정 시간 비활성 시 서비스가 슬립 모드로 전환됩니다
- 프로덕션 환경에서는 초기 계정의 이메일을 실제 이메일로 변경하세요
- 업로드된 파일은 Railway의 임시 스토리지에 저장되므로, 영구 저장이 필요하면 S3 등 외부 스토리지 사용 권장

