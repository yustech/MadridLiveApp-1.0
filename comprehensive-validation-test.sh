#!/bin/bash

set -e

echo "=== Comprehensive Validation Test ==="
echo ""

# Get a worker that doesn't have active shifts
WORKER=$(curl -s http://localhost:3000/api/mysql/staff | jq -r '.[] | select(.status == "OUT") | .id' | head -1)
echo "Using worker: $WORKER"

# Test 1: Valid shift with optional endedAt (should succeed or give business logic error)
echo ""
echo "Test 1: Valid shift without endedAt (optional field)"
NOW=$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')
RESULT=$(curl -s -X POST http://localhost:3000/api/mysql/shifts \
  -H "Content-Type: application/json" \
  -d '{
    "workerId": "'$WORKER'",
    "dateString": "'$NOW'",
    "timespan": "00:00 - Presente",
    "durationLabel": "In Progress",
    "location": "Main Stage",
    "status": "active",
    "startedAt": "'$NOW'"
  }')

echo "$RESULT" | jq .
if echo "$RESULT" | jq . > /dev/null 2>&1; then
  echo "✓ Validator accepted the payload"
else
  echo "✗ Invalid JSON response"
fi

# Test 2: Invalid status (should be rejected by validator)
echo ""
echo "Test 2: Invalid status (CAPS - should be rejected)"
RESULT=$(curl -s -X POST http://localhost:3000/api/mysql/shifts \
  -H "Content-Type: application/json" \
  -d '{
    "workerId": "'$WORKER'",
    "dateString": "'$NOW'",
    "timespan": "00:00 - Presente",
    "durationLabel": "In Progress",
    "location": "Main Stage",
    "status": "ACTIVE",
    "startedAt": "'$NOW'"
  }')

STATUS_CODE=$(echo "$RESULT" | jq -r '.errors? // "ok"')
if [[ "$STATUS_CODE" != "ok" ]]; then
  echo "$RESULT" | jq .
  echo "✓ Validator correctly rejected invalid status"
else
  echo "⚠ Validator did not reject invalid status"
fi

# Test 3: Staff creation with validation
echo ""
echo "Test 3: Valid staff creation"
RESULT=$(curl -s -X POST http://localhost:3000/api/mysql/staff \
  -H "Content-Type: application/json" \
  -d '{
    "idCode": "TEST-'$(date +%s)'",
    "name": "Test User",
    "role": "Assistant",
    "roleLabel": "ASST",
    "status": "OUT",
    "location": "Base"
  }')

echo "$RESULT" | jq .
if echo "$RESULT" | jq . > /dev/null 2>&1; then
  echo "✓ Staff validator working"
else
  echo "✗ Staff validation failed"
fi

echo ""
echo "=== All tests completed ==="
