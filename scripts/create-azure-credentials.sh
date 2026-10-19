#!/usr/bin/env bash
# Creates the Azure identity GitHub Actions uses to deploy CloudScope and prints
# the exact commands that store the credentials as repository secrets.
#
# Requirements: Azure CLI (`az`) logged in (`az login`) to the target subscription.
# Usage:  ./scripts/create-azure-credentials.sh [resource-group]
set -euo pipefail

RESOURCE_GROUP="${1:-cloudscope-rg}"
SP_NAME="cloudscope-github"

command -v az >/dev/null || { echo "Azure CLI is not installed: https://aka.ms/azure-cli"; exit 1; }
az account show >/dev/null 2>&1 || { echo "Not logged in. Run: az login"; exit 1; }

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"

echo "Subscription : $SUBSCRIPTION_ID"
echo "Tenant       : $TENANT_ID"
echo "Resource grp : $RESOURCE_GROUP"
echo

echo "▸ Creating resource group (no-op if it already exists)…"
az group create --name "$RESOURCE_GROUP" --location eastus --output none

echo "▸ Creating service principal '$SP_NAME' with Contributor on the subscription…"
# Contributor is needed because the Bicep template creates the resource group
# resources and role assignments; scope it to the resource group for less access.
CREDENTIALS="$(az ad sp create-for-rbac \
  --name "$SP_NAME" \
  --role Contributor \
  --scopes "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP" \
  --sdk-auth \
  --output json 2>/dev/null || true)"

if [ -z "$CREDENTIALS" ]; then
  echo "Could not create the service principal (it may already exist)."
  echo "Reset it instead:"
  echo "  az ad sp credential reset --name $SP_NAME --append --output json"
  exit 1
fi

echo "$CREDENTIALS" > azure-credentials.json
echo "▸ Wrote azure-credentials.json (git-ignored)."

cat <<EOF

──────────────────────────────────────────────────────────────────────
Add these repository secrets (Settings → Secrets and variables → Actions):

  AZURE_CREDENTIALS   = contents of azure-credentials.json
  AZURE_AD_TENANT_ID  = $TENANT_ID
  AZURE_AD_CLIENT_ID  = <your app registration client id, or $TENANT_ID>

Or with the GitHub CLI:

  gh secret set AZURE_CREDENTIALS  < azure-credentials.json
  gh secret set AZURE_AD_TENANT_ID -b "$TENANT_ID"
  gh secret set AZURE_AD_CLIENT_ID -b "<client-id>"

Then run the pipeline:

  gh workflow run deploy-azure.yml

Delete the local file when you are done:

  rm azure-credentials.json
──────────────────────────────────────────────────────────────────────
EOF
