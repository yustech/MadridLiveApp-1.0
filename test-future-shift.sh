#!/bin/bash

WORKER="usr_102"
NOW=$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')

curl -X POST http://localhost:3000/api/mysql/shifts \
  -H "Content-Type: application/json" \
  -d '{
    "workerId": "'$WORKER'",
    "dateString": "'$NOW'",
    "timespan": "00:00 - Presente",
    "durationLabel": "In Progress",
    "location": "Estadio Santiago Bernabeu",
    "status": "active",
    "startedAt": "'$NOW'"
  }' 2>/dev/null | jq .

