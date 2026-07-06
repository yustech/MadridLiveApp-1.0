#!/bin/bash

# Test with "usr_102" format workerId
NOW=$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')

curl -X POST http://localhost:3000/api/mysql/shifts \
  -H "Content-Type: application/json" \
  -d '{
    "workerId": "usr_102",
    "dateString": "'$NOW'",
    "timespan": "00:00 - Presente",
    "durationLabel": "In Progress",
    "location": "Main Stage",
    "status": "active",
    "startedAt": "'$NOW'"
  }' 2>/dev/null | jq .
