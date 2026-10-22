#!/usr/bin/env bash
# One-time Azure setup for Fire Watch, with the spec's cost guardrails.
# Safe to rerun: each step skips what already exists.
#
# Needs: az logged in to the Fire Watch subscription, and
#   GITHUB_REPO          owner/name of the GitHub repo
#   ALERT_EMAIL          where budget alerts go
#   READER_DATABASE_URL  Neon URL for the firewatch_reader role (infra/neon-reader.sql)
#   IMAGE                ghcr.io/<owner>/firewatch-api@sha256:<digest>, pushed and public. By digest:
#                        Deploy can re-push a tag, which would change the recorder job's code (D21)
#   OWNER_DATABASE_URL   Neon owner URL, for the recorder job
#   RECORDER_PRIVATE_KEY, FIRMS_MAP_KEY, RPC_URL   the recorder's, as in .env
#   FIRE_RUNS_ADDRESS    the FireRuns contract the recorder seals its run roots on (D103)
set -euo pipefail

: "${GITHUB_REPO:?}" "${ALERT_EMAIL:?}" "${READER_DATABASE_URL:?}" "${IMAGE:?}" "${OWNER_DATABASE_URL:?}"
: "${RECORDER_PRIVATE_KEY:?}" "${FIRMS_MAP_KEY:?}" "${RPC_URL:?}" "${FIRE_RUNS_ADDRESS:?}"
[[ "$IMAGE" == *@sha256:* ]] || { echo "IMAGE must be pinned by digest: ghcr.io/<owner>/firewatch-api@sha256:<digest>" >&2; exit 1; }

RG=firewatch
LOCATION=southeastasia
SWA_LOCATION=eastasia
SUB=$(az account show --query id -o tsv)

az group create -n "$RG" -l "$LOCATION" -o none

if ! az monitor log-analytics workspace show -g "$RG" -n firewatch-logs -o none 2>/dev/null; then
  az monitor log-analytics workspace create -g "$RG" -n firewatch-logs -l "$LOCATION" -o none
fi
az monitor log-analytics workspace update -g "$RG" -n firewatch-logs --quota 0.1 --retention-time 30 -o none
LOGS_ID=$(az monitor log-analytics workspace show -g "$RG" -n firewatch-logs --query customerId -o tsv)
LOGS_KEY=$(az monitor log-analytics workspace get-shared-keys -g "$RG" -n firewatch-logs --query primarySharedKey -o tsv)

if ! az containerapp env show -g "$RG" -n firewatch-env -o none 2>/dev/null; then
  az containerapp env create -g "$RG" -n firewatch-env -l "$LOCATION" \
    --logs-workspace-id "$LOGS_ID" --logs-workspace-key "$LOGS_KEY" -o none
fi

if ! az staticwebapp show -g "$RG" -n firewatch-web -o none 2>/dev/null; then
  az staticwebapp create -g "$RG" -n firewatch-web -l "$SWA_LOCATION" --sku Free -o none
fi
SITE="https://$(az staticwebapp show -g "$RG" -n firewatch-web --query defaultHostname -o tsv)"

if ! az containerapp show -g "$RG" -n firewatch-api -o none 2>/dev/null; then
  az containerapp create -g "$RG" -n firewatch-api --environment firewatch-env \
    --image "$IMAGE" --ingress external --target-port 8000 \
    --min-replicas 0 --max-replicas 1 --cpu 0.25 --memory 0.5Gi \
    --secrets "database-url=$READER_DATABASE_URL" \
    --env-vars DATABASE_URL=secretref:database-url "ALLOWED_ORIGIN=$SITE" -o none
fi
API="https://$(az containerapp show -g "$RG" -n firewatch-api --query properties.configuration.ingress.fqdn -o tsv)"

if ! az containerapp job show -g "$RG" -n firewatch-recorder -o none 2>/dev/null; then
  az containerapp job create -g "$RG" -n firewatch-recorder --environment firewatch-env \
    --trigger-type Schedule --cron-expression "0 * * * *" \
    --parallelism 1 --replica-completion-count 1 --replica-retry-limit 0 --replica-timeout 3000 \
    --image "$IMAGE" --command record-hotspots --cpu 0.25 --memory 0.5Gi \
    --secrets "database-url=$OWNER_DATABASE_URL" "recorder-private-key=$RECORDER_PRIVATE_KEY" \
      "firms-map-key=$FIRMS_MAP_KEY" \
    --env-vars DATABASE_URL=secretref:database-url RECORDER_PRIVATE_KEY=secretref:recorder-private-key \
      FIRMS_MAP_KEY=secretref:firms-map-key "RPC_URL=$RPC_URL" "FIRE_RUNS_ADDRESS=$FIRE_RUNS_ADDRESS" -o none
fi

az rest --method put \
  --url "https://management.azure.com/subscriptions/$SUB/providers/Microsoft.Consumption/budgets/firewatch-monthly?api-version=2024-08-01" \
  --body "$(cat <<JSON
{"properties": {
  "category": "Cost", "amount": 1, "timeGrain": "Monthly",
  "timePeriod": {"startDate": "$(date -u +%Y-%m-01)T00:00:00Z", "endDate": "2027-12-31T00:00:00Z"},
  "notifications": {
    "actual50":   {"enabled": true, "operator": "GreaterThanOrEqualTo", "threshold": 50,  "thresholdType": "Actual",     "contactEmails": ["$ALERT_EMAIL"]},
    "actual100":  {"enabled": true, "operator": "GreaterThanOrEqualTo", "threshold": 100, "thresholdType": "Actual",     "contactEmails": ["$ALERT_EMAIL"]},
    "forecast100":{"enabled": true, "operator": "GreaterThanOrEqualTo", "threshold": 100, "thresholdType": "Forecasted", "contactEmails": ["$ALERT_EMAIL"]}
  }}}
JSON
)" -o none

APP_ID=$(az ad app list --display-name firewatch-github --query "[0].appId" -o tsv)
[ -n "$APP_ID" ] || APP_ID=$(az ad app create --display-name firewatch-github --query appId -o tsv)
SP_ID=$(az ad sp show --id "$APP_ID" --query id -o tsv 2>/dev/null || az ad sp create --id "$APP_ID" --query id -o tsv)
# New repos sign with owner and repo IDs in the subject (repo:owner@123/name@456), so ask GitHub.
PREFIX=$(gh api "repos/$GITHUB_REPO/actions/oidc/customization/sub" --jq '.sub_claim_prefix // empty')
SUBJECT="${PREFIX:-repo:$GITHUB_REPO}:ref:refs/heads/main"
CRED="{\"name\": \"main\", \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"$SUBJECT\", \"audiences\": [\"api://AzureADTokenExchange\"]}"
CURRENT=$(az ad app federated-credential list --id "$APP_ID" --query "[?name=='main'].subject" -o tsv)
if [ -z "$CURRENT" ]; then
  az ad app federated-credential create --id "$APP_ID" --parameters "$CRED" -o none
elif [ "$CURRENT" != "$SUBJECT" ]; then
  az ad app federated-credential update --id "$APP_ID" --federated-credential-id main --parameters "$CRED" -o none
fi
RG_SCOPE="/subscriptions/$SUB/resourceGroups/$RG"
grant() {
  if [ -z "$(az role assignment list --assignee "$SP_ID" --role "$1" --scope "$2" --query "[0].id" -o tsv)" ]; then
    az role assignment create --assignee-object-id "$SP_ID" --assignee-principal-type ServicePrincipal \
      --role "$1" --scope "$2" -o none
  fi
}
# GitHub can change the API but not the recorder job, which holds the wallet key (D21).
# If Deploy's `az containerapp update` is refused (O13), also grant Contributor on firewatch-env.
grant Contributor "$RG_SCOPE/providers/Microsoft.App/containerApps/firewatch-api"
grant Reader "$RG_SCOPE"
GROUP_CONTRIBUTOR=$(az role assignment list --assignee "$SP_ID" --role Contributor --scope "$RG_SCOPE" --query "[0].id" -o tsv)
[ -z "$GROUP_CONTRIBUTOR" ] || az role assignment delete --ids "$GROUP_CONTRIBUTOR" -o none

TOKEN_NOTE="az staticwebapp secrets list -g $RG -n firewatch-web --query properties.apiKey -o tsv | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN -R $GITHUB_REPO"
cat <<DONE

Done. Site: $SITE   API: $API
Set these on the GitHub repo, then rerun the Deploy workflow:
  gh variable set AZURE_CLIENT_ID -R $GITHUB_REPO -b $APP_ID
  gh variable set AZURE_TENANT_ID -R $GITHUB_REPO -b $(az account show --query tenantId -o tsv)
  gh variable set AZURE_SUBSCRIPTION_ID -R $GITHUB_REPO -b $SUB
  gh variable set API_URL -R $GITHUB_REPO -b $API
  gh variable set RPC_URL -R $GITHUB_REPO -b https://sepolia.base.org
  gh variable set CONTRACT_ADDRESS -R $GITHUB_REPO -b <FireRecords address on Base Sepolia>
  gh variable set FIRE_RUNS_ADDRESS -R $GITHUB_REPO -b $FIRE_RUNS_ADDRESS
  gh variable set GOOGLE_MAPS_KEY -R $GITHUB_REPO -b <production Maps key, locked to $SITE/*>
  $TOKEN_NOTE
DONE
