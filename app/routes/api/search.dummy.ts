
import { describe, it, expect, vi, beforeEach } from 'vitest';

// This object will hold our mock functions.
// It's defined outside the vi.mock factory so it can be referenced in tests.
const prismaMockImplementation = {
  post: { findMany: vi.fn() },
  reportedEntity: { findMany: vi.fn() },
  reportedEntityHandle: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
};

// Mock the entire module '~/db/client.server'.
// The factory function (the second argument to vi.mock)
// must return an object that represents the mocked module's exports.
vi.mock('~/db/client.server', () => ({
  // The module '~/db/client.server' exports an object named 'prisma'.
  // So, our mock module must also export a 'prisma' object.
  prisma: prismaMockImplementation,
}));

// Now that the mock is set up (Vitest hoists vi.mock calls),
// we can import the loader function that uses the mocked prisma client.
import { loader } from './search';

// Make sure all imports are here, especially if types are needed from prisma/client or other places
// For example: import type { Post, User } from '@prisma/client';
// This specific import of prisma is only for type information if needed by tests, actual calls use prismaMock
// For safety, avoid direct import if possible, or ensure it's only for types.
// import type { PrismaClient } from '@prisma/client'; 


const mockPost = {
  id: 'post1',
  prisma: {
    post: { findMany: vi.fn() },
    reportedEntity: { findMany: vi.fn() },
    reportedEntityHandle: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

const mockPost = {
  id: 'post1',
  description: 'This is a test post about Remix.',
  reportedEntity: { id: 're1', name: 'Entity in Post' },
};
const mockReportedEntity = {
  id: 're1',
  name: 'Test Entity',
  handles: [{ id: 'handle1', handle: 'testentity_ig' }],
};
const mockReportedEntityHandle = {
  id: 'handle2',
  handle: 'user_handle_ig',
  reportedEntityId: 're2',
  reportedEntity: { id: 're2', name: 'User Handle Parent', handles: [{id: 'handle2', handle: 'user_handle_ig'}] },
};
const mockUser = {
  id: 'user1',
  firstName: 'John',
  lastName: 'Doe',
  instagram: 'johndoe_ig',
};

describe('API Search Loader', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Reset mocks using the implementation object
    prismaMockImplementation.post.findMany.mockResolvedValue([]);
    prismaMockImplementation.reportedEntity.findMany.mockResolvedValue([]);
    prismaMockImplementation.reportedEntityHandle.findMany.mockResolvedValue([]);
    prismaMockImplementation.user.findMany.mockResolvedValue([]);
  });

  it('should return an empty array if search term is empty', async () => {
    const request = new Request('http://localhost/api/search?q=');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();
    expect(data).toEqual([]);
  });
  
  it('should return an empty array if search term is missing', async () => {
    const request = new Request('http://localhost/api/search');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();
    expect(data).toEqual([]);
  });

  it('should return matching posts', async () => {
    prismaMock.post.findMany.mockResolvedValue([mockPost]);
    const request = new Request('http://localhost/api/search?q=Remix');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();
    expect(data).toEqual([{ type: 'post', data: mockPost }]);
    expect(prismaMockImplementation.post.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { description: { contains: 'Remix', mode: 'insensitive' } },
    }));
  });

  it('should return matching reported entities by name', async () => {
    prismaMockImplementation.reportedEntity.findMany.mockResolvedValue([mockReportedEntity]);
    const request = new Request('http://localhost/api/search?q=Test Entity');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();
    expect(data).toEqual([{ type: 'reportedEntity', data: mockReportedEntity }]);
    expect(prismaMockImplementation.reportedEntity.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { name: { contains: 'Test Entity', mode: 'insensitive' } },
    }));
  });

  it('should return parent reported entity for matching handles', async () => {
    prismaMockImplementation.reportedEntityHandle.findMany.mockResolvedValue([mockReportedEntityHandle]);
    const request = new Request('http://localhost/api/search?q=user_handle_ig');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();
     // The loader now de-duplicates and returns the parent entity
    expect(data).toEqual([{ type: 'reportedEntity', data: mockReportedEntityHandle.reportedEntity }]);
    expect(prismaMockImplementation.reportedEntityHandle.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { handle: { contains: 'user_handle_ig', mode: 'insensitive' } },
    }));
  });
  
  it('should return matching users by first name', async () => {
    prismaMockImplementation.user.findMany.mockResolvedValue([mockUser]);
    const request = new Request('http://localhost/api/search?q=John');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();
    expect(data).toEqual([{ type: 'user', data: mockUser }]);
    expect(prismaMockImplementation.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: expect.arrayContaining([
        expect.objectContaining({ firstName: { contains: 'John', mode: 'insensitive' } })
      ])}
    }));
  });

  it('should return matching users by last name', async () => {
    prismaMockImplementation.user.findMany.mockResolvedValue([mockUser]);
    const request = new Request('http://localhost/api/search?q=Doe');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();
    expect(data).toEqual([{ type: 'user', data: mockUser }]);
     expect(prismaMockImplementation.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: expect.arrayContaining([
        expect.objectContaining({ lastName: { contains: 'Doe', mode: 'insensitive' } })
      ])}
    }));
  });

  it('should return matching users by Instagram handle', async () => {
    prismaMockImplementation.user.findMany.mockResolvedValue([mockUser]);
    const request = new Request('http://localhost/api/search?q=johndoe_ig');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();
    expect(data).toEqual([{ type: 'user', data: mockUser }]);
    expect(prismaMockImplementation.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: expect.arrayContaining([
        expect.objectContaining({ instagram: { contains: 'johndoe_ig', mode: 'insensitive' } })
      ])}
    }));
  });

  it('should return multiple types of results and handle deduplication', async () => {
    const commonEntity = { id: 're3', name: 'Common Entity', handles: [{id: 'h3', handle: 'common_ig'}]};
    prismaMockImplementation.post.findMany.mockResolvedValue([{ ...mockPost, description: 'Search term common' }]);
    prismaMockImplementation.reportedEntity.findMany.mockResolvedValue([commonEntity]);
    // This handle search should result in commonEntity, which will be deduplicated
    prismaMockImplementation.reportedEntityHandle.findMany.mockResolvedValue([{ id: 'h4', handle: 'common_ig_handle_variant', reportedEntity: commonEntity }]);
    prismaMockImplementation.user.findMany.mockResolvedValue([{ ...mockUser, firstName: 'CommonUser' }]);
    
    const request = new Request('http://localhost/api/search?q=common');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data).toContainEqual({ type: 'post', data: { ...mockPost, description: 'Search term common' } });
    expect(data).toContainEqual({ type: 'reportedEntity', data: commonEntity });
    expect(data).toContainEqual({ type: 'user', data: { ...mockUser, firstName: 'CommonUser' } });
    
    // Check for deduplication: commonEntity should only appear once
    const entityResults = data.filter((item: any) => item.type === 'reportedEntity' && item.data.id === 're3');
    expect(entityResults.length).toBe(1);
    expect(data.length).toBe(3); // Post, Entity, User
  });

  it('should return an empty array if no matches are found', async () => {
    const request = new Request('http://localhost/api/search?q=nonexistentterm123');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();
    expect(data).toEqual([]);
  });
  
  it('should handle case-insensitivity for posts', async () => {
    prismaMock.post.findMany.mockResolvedValue([mockPost]);
    const request = new Request('http://localhost/api/search?q=remix'); // Lowercase search
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();
    expect(data).toEqual([{ type: 'post', data: mockPost }]);
    expect(prismaMockImplementation.post.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { description: { contains: 'remix', mode: 'insensitive' } },
    }));
  });

  it('should correctly structure the response', async () => {
    prismaMockImplementation.post.findMany.mockResolvedValue([mockPost]);
    const request = new Request('http://localhost/api/search?q=Remix');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();
    expect(response.headers.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(data[0]).toHaveProperty('type');
    expect(data[0]).toHaveProperty('data');
    expect(data[0].type).toBe('post');
    expect(data[0].data).toEqual(mockPost);
  });
});
