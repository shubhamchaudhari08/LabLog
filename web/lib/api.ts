/**
 * Calls into FastAPI, carrying the signed-in user's own credential.
 *
 * This is the whole reason tool calls detour through the browser rather than
 * letting AssemblyAI hit our endpoints directly: the request arrives already
 * authenticated as the user, so authorization is a property of the transport
 * rather than something we reconstruct from a correlation table — or worse,
 * from an identity the model asserts (research.md R-003).
 */

import { env } from './env';
import { getAccessToken } from './supabase';
import type { ProtocolSummary } from './queries/useExperiment';
import type { BootstrapResponse, ToolOutcome } from './voiceClient/types';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function fetchBootstrap(experimentId: string): Promise<BootstrapResponse> {
  const response = await fetch(
    `${env.apiUrl}/voice/bootstrap?experiment_id=${encodeURIComponent(experimentId)}`,
    { headers: await authHeaders() },
  );

  if (!response.ok) {
    if (response.status === 403) throw new Error('You do not have access to this experiment.');
    if (response.status === 502) throw new Error('The voice service is unavailable right now.');
    throw new Error(`Could not start the voice session (${response.status}).`);
  }
  return response.json();
}

export interface ToolRequest {
  tool: string;
  args: Record<string, unknown>;
  experiment_id: string;
  session_id: string | null;
}

export async function callTool(request: ToolRequest): Promise<ToolOutcome> {
  const response = await fetch(`${env.apiUrl}/tools`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(request),
  });

  // Tool-level failures come back as HTTP 200 with success:false — they are
  // conversational outcomes, not transport errors. Only auth and transport
  // failures are non-2xx, which is what lets us tell the two apart here
  // without parsing bodies (contracts/tools-api.md).
  if (response.status === 401) {
    return { success: false, error: 'UNAUTHENTICATED', message: 'Your session expired.' };
  }
  if (response.status === 403) {
    return {
      success: false,
      error: 'FORBIDDEN',
      message: "You don't have access to that experiment.",
    };
  }
  if (!response.ok) {
    return {
      success: false,
      error: 'TRANSPORT_ERROR',
      message: "I couldn't reach the record system, so that wasn't saved.",
    };
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Settings — the measurement vocabulary, read-only (api/app/tools/vocabulary.py)
// ---------------------------------------------------------------------------

export interface MeasurementType {
  name: string;
  units: string[];
  default_unit: string;
  spoken_units: string[];
  dimensionless: boolean;
}

export async function fetchMeasurementTypes(): Promise<MeasurementType[]> {
  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}/settings/measurement-types`, { headers: await authHeaders() });
  } catch {
    throw new Error("Couldn't reach the LabLog API. Check that it is running.");
  }
  if (!response.ok) throw new Error(`Could not load measurement types (${response.status}).`);
  return response.json();
}

// ---------------------------------------------------------------------------
// Protocols — created from the Protocols screen (contracts/protocols-api.md in
// specs/002). Failures come back as HTTP 200 with success:false, like /tools.
// ---------------------------------------------------------------------------

export interface ProtocolDraft {
  protocol_code: string;
  name: string;
  version: string;
  steps: { name: string; readings: { type: string; unit?: string }[] }[];
}

export type CreateProtocolResult =
  | { success: true; protocol: ProtocolSummary }
  | { success: false; error: string; message: string; detail?: Record<string, unknown> };

export async function createProtocol(draft: ProtocolDraft): Promise<CreateProtocolResult> {
  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}/protocols`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(draft),
    });
  } catch {
    throw new Error("Couldn't reach the LabLog API, so the protocol wasn't saved.");
  }
  if (response.status === 401) {
    return {
      success: false,
      error: 'UNAUTHENTICATED',
      message: 'Your session expired. Sign in again; your form is kept.',
    };
  }
  if (!response.ok) throw new Error(`The protocol wasn't saved (${response.status}).`);
  return response.json();
}
