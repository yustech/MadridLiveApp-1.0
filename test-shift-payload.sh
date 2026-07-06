#!/bin/bash

# Test payload without endedAt
curl -X POST http://localhost:3000/api/mysql/shifts \
  -H "Content-Type: application/json" \
  -d '{
    "workerId": 1,
    "dateString": "2026-07-06T23:52:28.036Z",
    "timespan": "00:00 - Presente",
    "durationLabel": "In Progress",
    "location": "Main Stage",
    "status": "active",
    "startedAt": "'$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')'"
  }' 2>/dev/null | jq .
