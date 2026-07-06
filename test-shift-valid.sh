#!/bin/bash

# Get a valid worker ID
WORKER_ID=$(curl -s http://localhost:3000/api/mysql/staff | jq -r '.[0].id' | sed 's/usr_//')

echo "Using Worker ID: $WORKER_ID"

# Test payload without endedAt using valid worker
curl -X POST http://localhost:3000/api/mysql/shifts \
  -H "Content-Type: application/json" \
  -d '{
    "workerId": '"$WORKER_ID"',
    "dateString": "2026-07-06T23:52:28.036Z",
    "timespan": "00:00 - Presente",
    "durationLabel": "In Progress",
    "location": "Main Stage",
    "status": "active",
    "startedAt": "'$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')'"
  }' 2>/dev/null | jq .
