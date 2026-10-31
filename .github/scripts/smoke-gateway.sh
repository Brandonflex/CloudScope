#!/usr/bin/env bash
set -euo pipefail

# This is a disposable CI-only secret, never a deployed credential.
export GatewayAuthentication__SharedSecret='ci-only-gateway-secret-0123456789abcdef'
export ASPNETCORE_ENVIRONMENT=Production
export ASPNETCORE_URLS=http://127.0.0.1:5099
export Platform__StorageProvider=InMemory
export Platform__SeedDemoData=true
export Discovery__Enabled=false
export Discovery__StartupDelaySeconds=120
export Swagger__Enabled=false

dotnet run --project src/server/CloudScope.Api/CloudScope.Api.csproj --configuration Release --no-build --no-launch-profile > /tmp/cloudscope-smoke.log 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT
base=http://127.0.0.1:5099
ready=false
for _ in {1..60}; do
  if curl -fsS "$base/health" > /dev/null; then ready=true; break; fi
  if ! kill -0 "$pid" 2>/dev/null; then break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then cat /tmp/cloudscope-smoke.log; exit 1; fi

[[ $(curl -sS -o /dev/null -w '%{http_code}' "$base/api/meta") == 401 ]]
[[ $(curl -sS -o /dev/null -w '%{http_code}' -H 'X-CloudScope-Gateway-Key: wrong' "$base/hubs/notifications/negotiate?negotiateVersion=1" -X POST) == 401 ]]
header="X-CloudScope-Gateway-Key: $GatewayAuthentication__SharedSecret"
curl -fsS -X POST -H "$header" "$base/api/meta/demo" > /dev/null
id=$(curl -fsS -H "$header" "$base/api/resources?pageSize=500" | jq -r '[.items[] | select(.id | contains("/"))][0].id // empty')
[[ -n "$id" ]]
for route in resources/by-id resources/relationships resources/blast-radius; do
  curl -fsS -H "$header" --get --data-urlencode "id=$id" "$base/api/$route" > /dev/null
done
curl -fsS -H "$header" --get --data-urlencode "resourceId=$id" "$base/api/graph/subgraph" > /dev/null
