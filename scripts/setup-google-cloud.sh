#!/usr/bin/env bash
# One-time Google Cloud setup so GitHub Actions can publish to the Chrome Web Store
# with no stored secret (Workload Identity Federation).
#
# Run it in Google Cloud Shell (console.cloud.google.com, the >_ icon, top right)
# with your project selected. Safe to run more than once.
set -euo pipefail

GITHUB_REPO="matmeylan/live-copy-editor"   # owner/name on GitHub
BRANCH="main"                              # only runs on this branch may publish
SA_NAME="cws-publisher"
POOL="github"
PROVIDER="github"

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
if [[ -z "$PROJECT_ID" ]]; then
  echo "No project selected. Run: gcloud config set project <your-project-id>" >&2
  exit 1
fi
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
echo "Project: $PROJECT_ID ($PROJECT_NUMBER)"

# GitHub numeric IDs survive repo renames, unlike names.
read -r OWNER_ID REPO_ID < <(curl -fsS "https://api.github.com/repos/$GITHUB_REPO" | jq -r '"\(.owner.id) \(.id)"')
if [[ ! "$OWNER_ID" =~ ^[0-9]+$ || ! "$REPO_ID" =~ ^[0-9]+$ ]]; then
  echo "Could not look up $GITHUB_REPO on GitHub. Is the name right and the repo public?" >&2
  exit 1
fi
echo "GitHub repo: $GITHUB_REPO (owner id $OWNER_ID, repo id $REPO_ID)"

echo "Enabling APIs..."
gcloud services enable chromewebstore.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com --project "$PROJECT_ID"

echo "Service account..."
gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT_ID" \
    --display-name="Chrome Web Store publisher (GitHub Actions)"

echo "Workload identity pool..."
gcloud iam workload-identity-pools describe "$POOL" --project "$PROJECT_ID" --location=global >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --project "$PROJECT_ID" --location=global \
    --display-name="GitHub Actions"

CONDITION="assertion.repository_owner_id == '$OWNER_ID' && assertion.repository_id == '$REPO_ID' && assertion.ref == 'refs/heads/$BRANCH'"
MAPPING="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref"

echo "GitHub OIDC provider..."
if gcloud iam workload-identity-pools providers describe "$PROVIDER" --project "$PROJECT_ID" \
     --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER" --project "$PROJECT_ID" \
    --location=global --workload-identity-pool="$POOL" \
    --attribute-mapping="$MAPPING" --attribute-condition="$CONDITION"
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --project "$PROJECT_ID" \
    --location=global --workload-identity-pool="$POOL" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="$MAPPING" --attribute-condition="$CONDITION"
fi

echo "Allowing the repo to act as the service account..."
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" --project "$PROJECT_ID" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository_id/$REPO_ID" \
  >/dev/null

cat <<DONE

Done. Two things left, outside Google Cloud:

1) Chrome Web Store Developer Dashboard > Account > Service account:
   add   $SA_EMAIL

2) GitHub repo > Settings > Secrets and variables > Actions,
   add these repository secrets:

   CWS_WIF_PROVIDER     projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER
   CWS_SERVICE_ACCOUNT  $SA_EMAIL
   CWS_PUBLISHER_ID     <from the dashboard URL, after /devconsole/>
   CWS_EXTENSION_ID     <the 32-letter item ID>
DONE
