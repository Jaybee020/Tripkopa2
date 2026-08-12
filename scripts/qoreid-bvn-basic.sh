#!/usr/bin/env bash
set -euo pipefail

QOREID_BASE_URL="${QOREID_BASE_URL:-https://api.qoreid.com}"

required_vars=(
  QOREID_CLIENT_ID
  QOREID_CLIENT_SECRET
  BVN
  FIRST_NAME
  LAST_NAME
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required environment variable: ${var_name}" >&2
    exit 1
  fi
done

TOKEN="$(
  curl -sS -X POST "${QOREID_BASE_URL}/token" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    --data "{\"clientId\":\"${QOREID_CLIENT_ID}\",\"secret\":\"${QOREID_CLIENT_SECRET}\"}" \
  | jq -r '.accessToken'
)"

if [[ -z "${TOKEN}" || "${TOKEN}" == "null" ]]; then
  echo "QoreID token request did not return accessToken" >&2
  exit 1
fi

payload="$(
  jq -n \
    --arg firstname "${FIRST_NAME}" \
    --arg lastname "${LAST_NAME}" \
    --arg email "${EMAIL:-}" \
    --arg phone "${PHONE:-}" \
    '{
      firstname: $firstname,
      lastname: $lastname
    }
    + (if $email == "" then {} else {email: $email} end)
    + (if $phone == "" then {} else {phone: $phone} end)'
)"

curl -sS -X POST "${QOREID_BASE_URL}/v1/ng/identities/bvn-basic/${BVN}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  --data "${payload}"
