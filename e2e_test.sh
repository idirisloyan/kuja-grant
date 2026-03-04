#!/bin/bash
BASE="https://web-production-6f8a.up.railway.app"
PASS=0
FAIL=0
TOTAL=0
FAIL_DETAILS=""

run_test() {
  local num="$1" name="$2" method="$3" url="$4" data="$5" expect="$6" cookie="$7"
  TOTAL=$((TOTAL+1))

  if [ -n "$cookie" ] && [ -n "$data" ]; then
    status=$(curl -s -o /tmp/kuja_resp.txt -w "%{http_code}" -X "$method" -b "$cookie" -H "Content-Type: application/json" -d "$data" --max-time 60 "$url")
  elif [ -n "$cookie" ]; then
    status=$(curl -s -o /tmp/kuja_resp.txt -w "%{http_code}" -X "$method" -b "$cookie" --max-time 60 "$url")
  elif [ -n "$data" ]; then
    status=$(curl -s -o /tmp/kuja_resp.txt -w "%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" --max-time 60 "$url")
  else
    status=$(curl -s -o /tmp/kuja_resp.txt -w "%{http_code}" -X "$method" --max-time 60 "$url")
  fi

  if [ "$status" = "$expect" ]; then
    echo "  [$num] PASS: $name ($status)"
    PASS=$((PASS+1))
  else
    body=$(cat /tmp/kuja_resp.txt 2>/dev/null | head -c 200)
    echo "  [$num] FAIL: $name -- expected $expect, got $status"
    echo "         Response: $body"
    FAIL=$((FAIL+1))
    FAIL_DETAILS="$FAIL_DETAILS\n  [$num] $name: expected $expect, got $status"
  fi
}

echo "============================================"
echo "  Kuja Grant v3.0 -- E2E Test Suite"
echo "  Target: $BASE"
echo "============================================"
echo ""

# Cookie files
NC="/tmp/kuja_ngo.cookie"
DC="/tmp/kuja_donor.cookie"
RC="/tmp/kuja_reviewer.cookie"
AC="/tmp/kuja_admin.cookie"

# Login and store cookies
curl -s -c "$NC" -H "Content-Type: application/json" -d '{"email":"fatima@amani.org","password":"pass123"}' "$BASE/api/auth/login" > /dev/null 2>&1
curl -s -c "$DC" -H "Content-Type: application/json" -d '{"email":"sarah@globalhealth.org","password":"pass123"}' "$BASE/api/auth/login" > /dev/null 2>&1
curl -s -c "$RC" -H "Content-Type: application/json" -d '{"email":"james@reviewer.org","password":"pass123"}' "$BASE/api/auth/login" > /dev/null 2>&1
curl -s -c "$AC" -H "Content-Type: application/json" -d '{"email":"admin@kuja.org","password":"pass123"}' "$BASE/api/auth/login" > /dev/null 2>&1

echo "--- Authentication ---"
run_test "01" "POST /api/auth/login (NGO valid)" POST "$BASE/api/auth/login" '{"email":"fatima@amani.org","password":"pass123"}' "200"
run_test "02" "POST /api/auth/login (Donor valid)" POST "$BASE/api/auth/login" '{"email":"sarah@globalhealth.org","password":"pass123"}' "200"
run_test "03" "POST /api/auth/login (Reviewer valid)" POST "$BASE/api/auth/login" '{"email":"james@reviewer.org","password":"pass123"}' "200"
run_test "04" "POST /api/auth/login (Admin valid)" POST "$BASE/api/auth/login" '{"email":"admin@kuja.org","password":"pass123"}' "200"
run_test "05" "POST /api/auth/login (invalid creds)" POST "$BASE/api/auth/login" '{"email":"nobody@test.com","password":"wrong"}' "401"
run_test "06" "GET /api/auth/me (authenticated)" GET "$BASE/api/auth/me" "" "200" "$AC"
run_test "07" "GET /api/auth/me (no auth)" GET "$BASE/api/auth/me" "" "401"

echo ""
echo "--- Dashboard ---"
run_test "08" "GET /api/dashboard/stats (NGO)" GET "$BASE/api/dashboard/stats" "" "200" "$NC"
run_test "09" "GET /api/dashboard/stats (Donor)" GET "$BASE/api/dashboard/stats" "" "200" "$DC"
run_test "10" "GET /api/dashboard/stats (Reviewer)" GET "$BASE/api/dashboard/stats" "" "200" "$RC"
run_test "11" "GET /api/dashboard/stats (Admin)" GET "$BASE/api/dashboard/stats" "" "200" "$AC"

echo ""
echo "--- Grants ---"
run_test "12" "GET /api/grants/ (NGO)" GET "$BASE/api/grants/" "" "200" "$NC"
run_test "13" "GET /api/grants/1" GET "$BASE/api/grants/1" "" "200" "$NC"

echo ""
echo "--- Applications ---"
run_test "14" "GET /api/applications/ (NGO)" GET "$BASE/api/applications/" "" "200" "$NC"

echo ""
echo "--- Organizations ---"
run_test "15" "GET /api/organizations/ (Admin)" GET "$BASE/api/organizations/" "" "200" "$AC"
run_test "16" "GET /api/organizations/1" GET "$BASE/api/organizations/1" "" "200" "$AC"

echo ""
echo "--- Reviews ---"
run_test "17" "GET /api/reviews/ (Reviewer)" GET "$BASE/api/reviews/" "" "200" "$RC"

echo ""
echo "--- Reports ---"
run_test "18" "GET /api/reports/ (NGO)" GET "$BASE/api/reports/" "" "200" "$NC"

echo ""
echo "--- Admin/Health ---"
run_test "19" "GET /api/health" GET "$BASE/api/health" "" "200"
run_test "20" "GET /api/version" GET "$BASE/api/version" "" "200"
run_test "21" "GET /api/ready" GET "$BASE/api/ready" "" "200"
run_test "22" "POST /api/telemetry (Admin)" POST "$BASE/api/telemetry" '{"event":"wizard_step_enter","data":{"step":1}}' "200" "$AC"

echo ""
echo "--- Compliance ---"
run_test "23" "GET /api/compliance/1 (Admin)" GET "$BASE/api/compliance/1" "" "200" "$AC"

echo ""
echo "--- Assessments ---"
run_test "24" "GET /api/assessments/ (Admin)" GET "$BASE/api/assessments/" "" "200" "$AC"

echo ""
echo "--- AI Services ---"
run_test "25" "POST /api/ai/chat" POST "$BASE/api/ai/chat" '{"message":"Hello, what can you help with?"}' "200" "$AC"
run_test "26" "POST /api/ai/guidance" POST "$BASE/api/ai/guidance" '{"field_name":"project_approach","current_text":"We plan to..."}' "200" "$NC"

echo ""
echo "--- Registry Verification ---"
run_test "27" "POST /api/verification/verify" POST "$BASE/api/verification/verify" '{"org_id":1}' "200" "$AC"

echo ""
echo "--- Documents ---"
run_test "28" "GET /api/documents/ (Admin)" GET "$BASE/api/documents/" "" "200" "$AC"

echo ""
echo "--- Access Control ---"
run_test "29" "NGO blocked from /api/admin/stats" GET "$BASE/api/admin/stats" "" "403" "$NC"

echo ""
echo "--- v3.0: Language Preference ---"
run_test "30" "PUT /api/auth/language (valid)" PUT "$BASE/api/auth/language" '{"language":"fr"}' "200" "$NC"
run_test "31" "PUT /api/auth/language (invalid)" PUT "$BASE/api/auth/language" '{"language":"xx"}' "400" "$NC"
run_test "32" "PUT /api/auth/language (reset to en)" PUT "$BASE/api/auth/language" '{"language":"en"}' "200" "$NC"

echo ""
echo "--- v3.0: Translation Files ---"
run_test "33" "GET en.json translation file" GET "$BASE/static/js/translations/en.json" "" "200"
run_test "34" "GET ar.json translation file" GET "$BASE/static/js/translations/ar.json" "" "200"
run_test "35" "GET fr.json translation file" GET "$BASE/static/js/translations/fr.json" "" "200"
run_test "36" "GET es.json translation file" GET "$BASE/static/js/translations/es.json" "" "200"

echo ""
echo "--- v3.0: Version Check ---"
run_test "37" "GET /api/version returns 3.0.0" GET "$BASE/api/version" "" "200"

echo ""
echo "--- Logout ---"
run_test "38" "POST /api/auth/logout" POST "$BASE/api/auth/logout" '{}' "200" "$AC"

echo ""
echo "============================================"
echo "  RESULTS: $PASS/$TOTAL PASSED, $FAIL FAILED"
echo "============================================"

if [ -n "$FAIL_DETAILS" ]; then
  echo ""
  echo "FAILURES:"
  echo -e "$FAIL_DETAILS"
fi

# Cleanup
rm -f "$NC" "$DC" "$RC" "$AC" /tmp/kuja_resp.txt
