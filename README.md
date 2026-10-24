# Notion 월력 캘린더

Notion 데이터베이스를 원본으로 쓰는 월간 캘린더 웹앱입니다. 휴대폰 홈 화면에 추가하면 앱처럼 동작합니다(PWA).

## 기능
- 6주 고정 월력, 일요일·공휴일 빨간색, 공휴일 이름 표시, 앞뒤 달 날짜 흐리게
- Notion 일정을 색상 칩으로 표시, 여러 날 일정은 주 단위로 이어지는 막대
- 칸이 부족하면 `+N` 표시, 날짜를 누르면 그날 일정 목록
- 일정 추가·수정·삭제(삭제는 Notion 휴지통으로 이동), 하루 종일/시간 지정, 분류 선택
- 제목 검색(데이터베이스 전체), 월 선택, 좌우·상하 스와이프로 달 이동
- 앱으로 돌아오면 Notion 변경분 자동 반영

## Notion 준비
1. https://www.notion.so/profile/integrations 에서 **내부 통합**을 만들고 시크릿을 복사합니다.
2. 캘린더로 쓸 데이터베이스를 엽니다. 다음 속성이 필요합니다.
   | 속성 | 유형 | 비고 |
   |---|---|---|
   | 이름 | 제목 | 일정 제목 |
   | 날짜 | 날짜 | 종료일·시간 포함 가능 |
   | 분류 | 선택 또는 상태 | 선택: 옵션 색상이 칩 색이 됨 |
   속성 이름은 자유이며, 첫 제목·날짜·선택 속성을 자동으로 찾습니다.
3. 데이터베이스 우측 상단 `···` → **연결** → 만든 통합을 추가합니다.
4. 데이터베이스 URL의 32자리 ID를 복사합니다. (`notion.so/xxxx?v=...`에서 `?` 앞 32자)

칩 색상 예: 파랑 = 일반 일정, 노랑 = 생일, 주황 = 모임. Notion에서 선택 옵션의 색을 바꾸면 그대로 반영됩니다.

## 실행
```bash
cp .env.example .env   # NOTION_TOKEN, NOTION_DATABASE_ID 입력
npm start              # http://localhost:3000
npm test               # 네트워크 없이 API 점검
```
토큰이 없으면 **데모 모드**로 실행됩니다.

## 배포 (Vercel)
1. 이 저장소를 Vercel에 Import (Framework: Other).
2. Environment Variables에 `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `APP_PASSCODE`(권장) 입력.
3. 배포된 주소를 휴대폰에서 열고 **홈 화면에 추가**.

`APP_PASSCODE`를 설정하지 않으면 주소를 아는 누구나 일정을 수정할 수 있습니다.

## 구조
```
public/      화면 (index.html, app.js, app.css)
lib/         notion.js(Notion API 2025-09-03, data source), holidays.js, router.js, demo.js
api/index.js Vercel 함수
server.js    로컬 서버 (의존성 없음)
```

## 공휴일
Google 대한민국 공휴일 ICS를 받아 12시간 캐시하고, 실패하면 `lib/holidays.js`의 내장 2026년 표(노동절·제헌절 공휴일 지정 반영)를 씁니다. 2027년 이후는 피드에 의존하므로, 피드가 막힌 환경이라면 내장 표를 해마다 갱신해야 합니다. 다른 피드는 `HOLIDAY_ICS_URL`로 지정합니다.
