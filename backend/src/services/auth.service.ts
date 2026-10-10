import bcrypt from 'bcryptjs';
import { logActivity } from '../lib/activity';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { publicUserSelect } from './users.service';

// Used to keep response timing similar whether or not the username exists.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', 10);

const INVALID = () => new AppError(401, 'Incorrect username or password.', 'INVALID_CREDENTIALS');

export async function login(identifier: string, password: string) {
  const id = identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: id }, { email: id }] },
  });

  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) throw INVALID();
  if (!user.isActive) throw new AppError(403, 'This account has been deactivated. Contact an administrator.', 'INACTIVE');

  await logActivity(prisma, {
    userId: user.id,
    action: 'LOGIN',
    entity: 'User',
    entityId: user.id,
    description: `${user.name} signed in`,
  });

  const { passwordHash: _ph, tokenVersion, ...rest } = user;
  void _ph;
  return { user: rest, tokenVersion };
}

export function getMe(id: number) {
  return prisma.user.findUnique({ where: { id }, select: publicUserSelect });
}
