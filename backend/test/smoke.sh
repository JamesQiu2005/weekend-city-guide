#!/usr/bin/env bash
# End-to-end smoke test of the API contract. Usage: bash test/smoke.sh [BASE_URL]
set -euo pipefail
API="${1:-http://127.0.0.1:8787}"
pass=0; fail=0
ok()   { echo "  ✓ $1"; pass=$((pass+1)); }
no()   { echo "  ✗ $1"; echo "    $2"; fail=$((fail+1)); }
check(){ if eval "$2"; then ok "$1"; else no "$1" "$3"; fi; }
j()    { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const o=JSON.parse(d);console.log(eval('o'+process.argv[1]))})" "$1"; }
req()  { curl -sS -X "$1" "$API$2" -H "Content-Type: application/json" ${TOKEN:+-H "Authorization: Bearer $TOKEN"} ${3:+-d "$3"}; }
code() { curl -sS -o /dev/null -w "%{http_code}" -X "$1" "$API$2" -H "Content-Type: application/json" ${TOKEN:+-H "Authorization: Bearer $TOKEN"} ${3:+-d "$3"}; }

SAT=$(node -e "const t=new Date(Date.now()+8*36e5);const d=t.getUTCDay();t.setUTCDate(t.getUTCDate()+(((6-d+7)%7)||7));console.log(t.toISOString().slice(0,10))")
TODAY=$(node -e "console.log(new Date(Date.now()+8*36e5).toISOString().slice(0,10))")
echo "API=$API  next Saturday=$SAT"

H=$(req GET /v1/health); check "health" '[ "$(echo "$H" | j .ok)" = true ]' "$H"
P=$(req GET "/v1/places?city=%E4%B8%8A%E6%B5%B7"); check "16 places" '[ "$(echo "$P" | j .items.length)" = 16 ]' "$P"
F=$(req GET /v1/feed); check "feed has seeded public sessions" '[ "$(echo "$F" | j .items.length)" -ge 6 ]' "$F"
check "unauthenticated write → 401" '[ "$(code POST /v1/sessions "{}")" = 401 ]' ""

U=$(req POST /v1/users '{"name":"测试A","avatar":"🎻"}'); TOKEN=$(echo "$U" | j .token); A=$TOKEN
check "create user" '[ ${#TOKEN} = 64 ]' "$U"
S=$(req POST /v1/sessions "{\"title\":\"周六三站\",\"date\":\"$SAT\",\"visibility\":\"link\",\"cap\":2,\"budget\":{\"total\":300,\"mode\":\"AA\"},\"stops\":[{\"placeId\":\"a1\",\"time\":\"10:00\"},{\"placeId\":\"a7\",\"time\":\"14:00\",\"backupPlaceId\":\"a5\"},{\"placeId\":\"a8\",\"time\":\"18:00\"}]}")
SID=$(echo "$S" | j .session.id)
check "create 3-stop session" '[ "$(echo "$S" | j .session.stops.length)" = 3 ]' "$S"
check "estCost defaults to place avgCost (100+0+40)" '[ "$(echo "$S" | j .session.budget.estPerPerson)" = 140 ]' "$S"
check "perPerson = 300/2" '[ "$(echo "$S" | j .session.budget.perPerson)" = 150 ]' "$S"
check "status planning" '[ "$(echo "$S" | j .session.status)" = planning ]' "$S"
check "link session not in public feed" '! req GET /v1/feed | grep -q "$SID"' ""
C=$(code POST /v1/sessions '{"title":"x","date":"2020-01-01","stops":[{"placeId":"a1"}]}'); check "past date rejected" '[ "$C" = 400 ]' "$C"
C=$(code POST /v1/sessions "{\"title\":\"x\",\"date\":\"$SAT\",\"stops\":[{\"placeId\":\"zz\"}]}"); check "unknown place → 404" '[ "$C" = 404 ]' "$C"

TOKEN=""; check "link session readable without token" '[ "$(code GET /v1/sessions/$SID)" = 200 ]' ""
U2=$(req POST /v1/users '{"name":"测试B","avatar":"🐱"}'); TOKEN=$(echo "$U2" | j .token); B=$TOKEN
J=$(req POST /v1/sessions/$SID/join); check "B joins" '[ "$(echo "$J" | j .session.counts.members)" = 2 ]' "$J"
U3=$(req POST /v1/users '{"name":"测试C"}'); TOKEN=$(echo "$U3" | j .token)
check "C blocked: session full → 409" '[ "$(code POST /v1/sessions/$SID/join)" = 409 ]' ""
C=$(code POST /v1/sessions/$SID/entries '{"type":"note","text":"hi"}'); check "C cannot post entries → 403" '[ "$C" = 403 ]' "$C"

TOKEN=$B
E=$(req POST /v1/sessions/$SID/entries '{"type":"checkin","stopIdx":0,"text":"到了","amount":50,"rating":5,"coords":{"lat":31.1710,"lon":121.4600,"accuracy":30}}')
check "B verified checkin at stop 0" '[ "$(echo "$E" | j .entry.verified)" = true ]' "$E"
C=$(code POST /v1/sessions/$SID/entries '{"type":"checkin","stopIdx":0}'); check "duplicate checkin → 409" '[ "$C" = 409 ]' "$C"
TOKEN=$A
E=$(req POST /v1/sessions/$SID/entries '{"type":"checkin","stopIdx":0,"coords":{"lat":31.25,"lon":121.50}}')
check "A far-away checkin not verified" '[ "$(echo "$E" | j .entry.verified)" = false ]' "$E"
check "all arrived at stop 0" '[ "$(echo "$E" | j .session.stops[0].allArrived)" = true ]' "$E"
E=$(req POST /v1/sessions/$SID/entries '{"type":"spend","amount":120,"text":"午饭"}')
check "actualTotal = 50 + 120" '[ "$(echo "$E" | j .session.budget.actualTotal)" = 170 ]' "$E"

TOKEN=$B; check "non-organizer PATCH → 403" '[ "$(code PATCH /v1/sessions/$SID "{\"title\":\"x\"}")" = 403 ]' ""
TOKEN=$A
X=$(req PATCH /v1/sessions/$SID '{"visibility":"public","stops":[{"placeId":"a1","time":"10:00"},{"placeId":"a5","time":"14:00"},{"placeId":"a8","time":"18:00"}],"changeNote":"第 2 站因降雨换成了室内备选"}')
check "swap stop to backup" '[ "$(echo "$X" | j .session.stops[1].placeId)" = a5 ]' "$X"
check "system entry recorded" 'echo "$X" | grep -q "室内备选"' "$X"
check "public session appears in feed" 'req GET /v1/feed | grep -q "$SID"' ""
X=$(req PATCH /v1/sessions/$SID '{"closed":true}'); check "close → done" '[ "$(echo "$X" | j .session.status)" = done ]' "$X"

Q=$(req POST /v1/checkins '{"placeId":"a11","text":"草坪很舒服","rating":4}')
check "quick check-in → private solo session" '[ "$(echo "$Q" | j .session.visibility)" = private ] && [ "$(echo "$Q" | j .session.status)" = live ]' "$Q"
QID=$(echo "$Q" | j .session.id)
TOKEN=$B; check "private session hidden from others → 404" '[ "$(code GET /v1/sessions/$QID)" = 404 ]' ""
TOKEN=$A
M=$(req GET /v1/me); check "me stats: 2 checkins, 2 places" '[ "$(echo "$M" | j .stats.checkinsThisMonth)" = 2 ] && [ "$(echo "$M" | j .stats.placesVisited)" = 2 ]' "$M"
T=$(req GET /v1/me/trail); check "trail has 2 items" '[ "$(echo "$T" | j .items.length)" = 2 ]' "$T"

printf '\x89PNG\r\n\x1a\n0000' > /tmp/wk_smoke.png
MD=$(curl -sS -X POST "$API/v1/media" -H "Authorization: Bearer $A" -H "Content-Type: image/png" --data-binary @/tmp/wk_smoke.png)
KEY=$(echo "$MD" | j .key); check "upload media" '[[ "$KEY" == m_*.png ]]' "$MD"
check "fetch media" '[ "$(code GET /v1/media/$KEY)" = 200 ]' ""
E=$(req POST /v1/sessions/$QID/entries "{\"type\":\"photo\",\"photo\":\"$KEY\"}"); check "photo entry has photoUrl" 'echo "$E" | j .entry.photoUrl | grep -q "/v1/media/$KEY"' "$E"

W=$(req GET "/v1/weather?lat=31.23&lon=121.47&date=$TODAY"); check "weather today available" '[ "$(echo "$W" | j .available)" = true ]' "$W"
W=$(req GET "/v1/weather?lat=31.23&lon=121.47&date=2027-06-01"); check "weather beyond horizon" '[ "$(echo "$W" | j .reason)" = beyond_horizon ]' "$W"
G=$(req POST /v1/agent/plan '{"people":4,"budgetTotal":400,"likes":["展览","美食探店"],"rainy":true}')
check "agent plan draft" '[ "$(echo "$G" | j .draft.stops.length)" -ge 1 ] && [ "$(echo "$G" | j .estTotal)" -le 400 ]' "$G"
# AI 局长（LLM）门槛：未登录 401，未验证邮箱 403，邮箱格式错误 400
OLD=$TOKEN; TOKEN=""
AS=$(req GET /v1/agent/status); check "agent status (anon) not verified" '[ "$(echo "$AS" | j .verified)" = false ] && [ "$(echo "$AS" | j .perDay)" -ge 1 ]' "$AS"
check "agent chat without token → 401" '[ "$(code POST /v1/agent/chat "{}")" = 401 ]' ""
TOKEN=$(req POST /v1/users '{"name":"测试D"}' | j .token)
check "agent chat without email verification → 403" '[ "$(code POST /v1/agent/chat "{}")" = 403 ]' ""
check "agent email start rejects bad email → 400" '[ "$(code POST /v1/agent/email/start "{\"email\":\"nope\"}")" = 400 ]' ""
TOKEN=$OLD
check "CORS for github.io" 'curl -sSI -X OPTIONS "$API/v1/feed" -H "Origin: https://jamesqiu2005.github.io" | grep -qi "access-control-allow-origin: https://jamesqiu2005.github.io"' ""
check "CORS denied for other origin" '! curl -sSI -X OPTIONS "$API/v1/feed" -H "Origin: https://evil.example" | grep -qi "access-control-allow-origin"' ""

TOKEN=$A; check "delete session" '[ "$(code DELETE /v1/sessions/$SID)" = 204 ]' ""
echo; echo "passed $pass, failed $fail"; [ "$fail" = 0 ]
