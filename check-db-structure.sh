#!/bin/bash

# Get the first staff row's full details
curl -s "http://localhost:3000/api/mysql/staff" | jq '.[0]'
