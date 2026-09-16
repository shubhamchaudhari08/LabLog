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
