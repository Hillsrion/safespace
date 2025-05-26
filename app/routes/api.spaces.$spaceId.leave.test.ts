import { json, type ActionFunctionArgs } from '@remix-run/node';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { action } from './api.spaces.$spaceId.leave'; // Assuming co-location
import * as authServer from '~/services/auth.server';
import * as spaceQueries from '~/db/repositories/spaces/queries.server';

vi.mock('~/services/auth.server');
vi.mock('~/db/repositories/spaces/queries.server');

describe('API Route - /api/spaces/:spaceId/leave', () => {
  const mockUserId = 'user_123';
  const mockUserEmail = 'test@example.com';
  const mockSpaceId = 'space_abc';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('successfully leaves a space for authenticated user', async () => {
    vi.spyOn(authServer, 'getCurrentUser').mockResolvedValue({ id: mockUserId, email: mockUserEmail });
    vi.spyOn(spaceQueries, 'removeUserFromSpace').mockResolvedValue({ count: 1 });

    const request = new Request(`http://localhost/api/spaces/${mockSpaceId}/leave`, { method: 'POST' });
    const response = await action({ request, params: { spaceId: mockSpaceId }, context: {} } as unknown as ActionFunctionArgs);
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(responseBody.success).toBe(true);
    expect(responseBody.message).toBe(`Successfully left space ${mockSpaceId}`);
    expect(spaceQueries.removeUserFromSpace).toHaveBeenCalledWith(mockUserId, mockSpaceId);
  });

  it('handles case where user was not a member (removeUserFromSpace returns count: 0)', async () => {
    vi.spyOn(authServer, 'getCurrentUser').mockResolvedValue({ id: mockUserId, email: mockUserEmail });
    vi.spyOn(spaceQueries, 'removeUserFromSpace').mockResolvedValue({ count: 0 }); // Simulate user not found or already removed

    const request = new Request(`http://localhost/api/spaces/${mockSpaceId}/leave`, { method: 'POST' });
    const response = await action({ request, params: { spaceId: mockSpaceId }, context: {} } as unknown as ActionFunctionArgs);
    const responseBody = await response.json();

    expect(response.status).toBe(200); // Still a success from API perspective
    expect(responseBody.success).toBe(true);
    expect(responseBody.message).toBe(`Successfully left space ${mockSpaceId}`);
    expect(spaceQueries.removeUserFromSpace).toHaveBeenCalledWith(mockUserId, mockSpaceId);
  });

  it('returns 401 if user is not authenticated', async () => {
    vi.spyOn(authServer, 'getCurrentUser').mockResolvedValue(null);

    const request = new Request(`http://localhost/api/spaces/${mockSpaceId}/leave`, { method: 'POST' });
    const response = await action({ request, params: { spaceId: mockSpaceId }, context: {} } as unknown as ActionFunctionArgs);
    const responseBody = await response.json();
    
    expect(response.status).toBe(401);
    expect(responseBody.error).toBe('Unauthorized');
    expect(spaceQueries.removeUserFromSpace).not.toHaveBeenCalled();
  });
  
  it('returns 400 if spaceId is invalid (e.g., empty string)', async () => {
    vi.spyOn(authServer, 'getCurrentUser').mockResolvedValue({ id: mockUserId, email: mockUserEmail });
    const invalidSpaceId = ''; 
    
    const request = new Request(`http://localhost/api/spaces/${invalidSpaceId}/leave`, { method: 'POST' });
    const response = await action({ request, params: { spaceId: invalidSpaceId }, context: {} } as unknown as ActionFunctionArgs);
    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(responseBody.error).toBe('Validation failed');
    expect(responseBody.issues.fieldErrors.spaceId).toEqual(["L'identifiant de l'espace ne peut pas être vide."]);
    expect(spaceQueries.removeUserFromSpace).not.toHaveBeenCalled();
  });

  it('returns 400 if spaceId is missing from params (e.g. undefined)', async () => {
    vi.spyOn(authServer, 'getCurrentUser').mockResolvedValue({ id: mockUserId, email: mockUserEmail });
    
    const request = new Request(`http://localhost/api/spaces//leave`, { method: 'POST' });
    // Simulate spaceId being undefined in params, which schema should catch as required
    const response = await action({ request, params: { spaceId: undefined as any }, context: {} } as unknown as ActionFunctionArgs);
    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(responseBody.error).toBe('Validation failed');
    expect(responseBody.issues.fieldErrors.spaceId).toEqual(["L'identifiant de l'espace est requis."]);
    expect(spaceQueries.removeUserFromSpace).not.toHaveBeenCalled();
  });

  it('returns 500 if removeUserFromSpace throws an error', async () => {
    vi.spyOn(authServer, 'getCurrentUser').mockResolvedValue({ id: mockUserId, email: mockUserEmail });
    vi.spyOn(spaceQueries, 'removeUserFromSpace').mockRejectedValue(new Error('Database error'));

    const request = new Request(`http://localhost/api/spaces/${mockSpaceId}/leave`, { method: 'POST' });
    const response = await action({ request, params: { spaceId: mockSpaceId }, context: {} } as unknown as ActionFunctionArgs);
    const responseBody = await response.json();

    expect(response.status).toBe(500);
    expect(responseBody.error).toBe('Failed to leave space');
    expect(spaceQueries.removeUserFromSpace).toHaveBeenCalledWith(mockUserId, mockSpaceId);
  });

  it('returns 405 if method is not POST', async () => {
    // No need to mock getCurrentUser or removeUserFromSpace as method check is first
    const request = new Request(`http://localhost/api/spaces/${mockSpaceId}/leave`, { method: 'GET' });
    const response = await action({ request, params: { spaceId: mockSpaceId }, context: {} } as unknown as ActionFunctionArgs);
    const responseBody = await response.json();

    expect(response.status).toBe(405);
    expect(responseBody.error).toBe('Method not allowed');
    expect(authServer.getCurrentUser).not.toHaveBeenCalled();
    expect(spaceQueries.removeUserFromSpace).not.toHaveBeenCalled();
  });
});
