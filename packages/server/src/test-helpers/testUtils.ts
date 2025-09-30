import request from 'supertest';
import type { Express } from 'express';
import { getPrismaClient } from '../db.js';

const prisma = getPrismaClient();

export interface TestUserContext {
  email: string;
  password: string;
  userId: string;
  token: string;
  cleanup: () => Promise<void>;
}

export async function createTestUserAndLogin(app: Express, opts?: { password?: string }): Promise<TestUserContext> {
  const password = opts?.password ?? 'Passw0rd!';
  const email = `test_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;

  const register = await request(app).post('/api/auth/register').send({ email, password });
  if (register.status !== 201) {
    throw new Error(`Failed to register test user: ${register.status} ${register.text}`);
  }

  const login = await request(app).post('/api/auth/login').send({ email, password });
  if (login.status !== 200 || !login.body.accessToken) {
    throw new Error(`Failed to login test user: ${login.status} ${login.text}`);
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });

  const cleanup = async () => {
    await prisma.trade.deleteMany({ where: { OR: [{ takerOrder: { userId: user.id } }, { makerOrder: { userId: user.id } }] } }).catch(() => {});
    await prisma.order.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await (prisma as any).idempotencyKey.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  };

  return { email, password, userId: user.id, token: login.body.accessToken as string, cleanup };
}

export async function submitOrder(app: Express, token: string, body: any, headers?: Record<string, string>) {
  let req = request(app).post('/api/orders').set('Authorization', `Bearer ${token}`);
  if (headers) Object.entries(headers).forEach(([k, v]) => (req = req.set(k, v)));
  return req.send(body);
}
