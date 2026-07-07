#!/bin/bash

for i in {1..5}; do
  curl -s -X POST http://localhost:3000/api/mysql/staff \
    -H "Content-Type: application/json" \
    -d '{
      "idCode": "TEST-'$RANDOM'",
      "name": "Test Staff '$i'",
      "role": "Technician",
      "roleLabel": "TECH",
      "status": "inactive",
      "location": "Base"
    }' | jq -r '.id' || echo "Error"
done
