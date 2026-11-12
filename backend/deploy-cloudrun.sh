#!/usr/bin/env bash
# Deploys the backend to Cloud Run. Safe to re-run: setup steps are idempotent.
# Usage: SUPABASE_SERVICE_KEY=... ./deploy-cloudrun.sh   (key only needed on first run or to rotate it)
set -euo pipefail

PROJECT="${PROJECT:-jityai-507114}"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-lexora-backend}"
SA="${SERVICE}@${PROJECT}.iam.gserviceaccount.com"
SUPABASE_URL="${SUPABASE_URL:-https://kpilkcpfjklxwcbcicpc.supabase.co}"

cd "$(dirname "$0")"

echo "▶ Enabling APIs"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com aiplatform.googleapis.com --project "$PROJECT"

echo "▶ Service account (runtime identity — this is what ADC uses on Cloud Run)"
gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$SERVICE" --display-name "Lexora backend" --project "$PROJECT"
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role roles/aiplatform.user \
  --condition=None --quiet >/dev/null

echo "▶ Supabase service key → Secret Manager"
if ! gcloud secrets describe supabase-service-key --project "$PROJECT" >/dev/null 2>&1; then
  : "${SUPABASE_SERVICE_KEY:?Set SUPABASE_SERVICE_KEY for the first deploy}"
  printf '%s' "$SUPABASE_SERVICE_KEY" | gcloud secrets create supabase-service-key --data-file=- --project "$PROJECT"
elif [ -n "${SUPABASE_SERVICE_KEY:-}" ]; then
  printf '%s' "$SUPABASE_SERVICE_KEY" | gcloud secrets versions add supabase-service-key --data-file=- --project "$PROJECT"
fi
# Grant access to this one secret only — the project is shared with other apps
gcloud secrets add-iam-policy-binding supabase-service-key --member "serviceAccount:$SA" \
  --role roles/secretmanager.secretAccessor --project "$PROJECT" --quiet >/dev/null

echo "▶ Deploying"
# timeout 3600: long document generation can take up to ~10 min
# memory 1Gi: OCR (tesseract) and large PDF parsing
gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --service-account "$SA" \
  --allow-unauthenticated \
  --timeout 3600 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances "${MIN_INSTANCES:-0}" \
  --max-instances 10 \
  --set-env-vars "SUPABASE_URL=${SUPABASE_URL},LLM_PROVIDER=vertex,GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=${GOOGLE_CLOUD_LOCATION:-asia-south1},GEMINI_MODEL=${GEMINI_MODEL:-gemini-3.5-flash}" \
  --set-secrets "SUPABASE_SERVICE_KEY=supabase-service-key:latest"

URL=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')
echo "✅ Deployed: $URL"
curl -s "$URL/api/health" && echo
echo "Set REACT_APP_API_URL=$URL/api in the frontend (Vercel env) and redeploy it."
