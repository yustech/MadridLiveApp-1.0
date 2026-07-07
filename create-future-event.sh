#!/bin/bash

# Create a future event (15 days from now)
FUTURE_DAY=$(($(date +%d) + 15))
FUTURE_MONTH=$(date +%m)

curl -X POST http://localhost:3000/api/mysql/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Madrid Summer Beats 2026",
    "location": "Estadio Santiago Bernabeu",
    "dateDay": "'$FUTURE_DAY'",
    "dateMonth": "'$FUTURE_MONTH'",
    "doorsOpen": "19:00",
    "requiredStaff": 100
  }' 2>/dev/null | jq .

