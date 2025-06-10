import { prisma } from '~/db/client.server';
import { removeUserFromSpace } from './queries.server'; // Assuming test file is in the same directory
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('~/db/client.server', () => ({
  prisma: {
    userSpaceMembership: {
      deleteMany: vi.fn(),
    },
  },
}));

describe('Space Queries - removeUserFromSpace', () => {
  const mockUserId = 'user_test_123';
  const mockSpaceId = 'space_test_abc';
  let consoleWarnSpy: ReturnType<typeof vi.spyOn> | undefined;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    vi.resetAllMocks(); // Reset mocks before each test
    // Clear spies if they were created in a previous test
    consoleWarnSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  afterEach(() => {
    // Ensure spies are restored after each test if they were created
    consoleWarnSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  it('should call prisma.userSpaceMembership.deleteMany with correct parameters and remove user', async () => {
    const mockDeleteManyResult = { count: 1 };
    (prisma.userSpaceMembership.deleteMany as vi.Mock).mockResolvedValue(mockDeleteManyResult);

    const result = await removeUserFromSpace(mockUserId, mockSpaceId);

    expect(prisma.userSpaceMembership.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: mockUserId,
        spaceId: mockSpaceId,
      },
    });
    expect(result).toEqual(mockDeleteManyResult);
  });

  it('should return count 0 and log a warning if user was not a member', async () => {
    const mockDeleteManyResult = { count: 0 };
    (prisma.userSpaceMembership.deleteMany as vi.Mock).mockResolvedValue(mockDeleteManyResult);
    
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); // Spy and mock implementation

    const result = await removeUserFromSpace(mockUserId, mockSpaceId);

    expect(prisma.userSpaceMembership.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: mockUserId,
        spaceId: mockSpaceId,
      },
    });
    expect(result).toEqual(mockDeleteManyResult);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      `No membership found for user ${mockUserId} in space ${mockSpaceId} to remove.`
    );
  });

  it('should throw an error and log it if Prisma operation fails', async () => {
    const prismaError = new Error('Prisma connection failed');
    (prisma.userSpaceMembership.deleteMany as vi.Mock).mockRejectedValue(prismaError);
    
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); // Spy and mock implementation

    await expect(removeUserFromSpace(mockUserId, mockSpaceId))
      .rejects
      .toThrow('Failed to remove user from space.');
      
    expect(prisma.userSpaceMembership.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: mockUserId,
        spaceId: mockSpaceId,
      },
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `Error removing user ${mockUserId} from space ${mockSpaceId}:`,
      prismaError
    );
  });
});
