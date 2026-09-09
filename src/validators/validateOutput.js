import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ajv = new Ajv({ allErrors: true });

function loadSchema(name) {
  const p = path.join(__dirname, '..', 'schemas', name);
  return JSON.parse(readFileSync(p, 'utf-8'));
}

const validateTripInput = ajv.compile(loadSchema('tripInput.schema.json'));
const validateNarrative = ajv.compile(loadSchema('llmNarrativeOutput.schema.json'));
const validatePlannerOutput = ajv.compile(loadSchema('plannerOutput.schema.json'));

export function checkTripInput(data) {
  const ok = validateTripInput(data);
  return { ok, errors: validateTripInput.errors };
}

// Validates the LLM's raw response against the narrow narrative schema.
// Called before that response is trusted for anything -- if it fails (bad
// JSON, missing field, an LLM that added an extra field), the caller falls
// back to plain template text instead of crashing the request. This is the
// "reliability" guarantee: a flaky LLM response can degrade the wording of a
// plan, never break it.
export function checkNarrative(raw) {
  let parsed;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    return { ok: false, errors: [{ message: 'LLM response was not valid JSON' }], data: null };
  }
  const ok = validateNarrative(parsed);
  return { ok, errors: validateNarrative.errors, data: ok ? parsed : null };
}

// Defense-in-depth sanity check on our OWN assembled output before it goes
// out over the wire. This should always pass -- if it doesn't, that's a bug
// in aiPlannerService, not bad luck with the LLM, so callers only log it
// rather than fail the request the user is waiting on.
export function checkPlannerOutput(data) {
  const ok = validatePlannerOutput(data);
  return { ok, errors: validatePlannerOutput.errors };
}

function stripCodeFence(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}
