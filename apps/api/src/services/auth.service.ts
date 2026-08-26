import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";
import { signToken } from "../utils/jwt";
import { serializeUser } from "../utils/serialize";

export async function register(input: { email: string; password: string; name?: string }) {
  const email = input.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw ApiError.conflict("EMAIL_TAKEN", "An account with this email already exists");
  }
  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, name: input.name?.trim() || null },
  });
  const token = signToken({ sub: user.id, email: user.email });
  return { token, user: serializeUser(user) };
}

export async function login(input: { email: string; password: string }) {
  const email = input.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw ApiError.unauthorized("INVALID_CREDENTIALS", "Invalid email or password");
  }
  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw ApiError.unauthorized("INVALID_CREDENTIALS", "Invalid email or password");
  }
  const token = signToken({ sub: user.id, email: user.email });
  return { token, user: serializeUser(user) };
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("USER_NOT_FOUND", "User not found");
  return serializeUser(user);
}

export async function updateProfile(userId: string, input: { name?: string }) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { name: input.name?.trim() || null },
  });
  return serializeUser(user);
}

export async function changePassword(userId: string, input: { currentPassword: string; newPassword: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("USER_NOT_FOUND", "User not found");
  const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!valid) {
    throw ApiError.unauthorized("INVALID_PASSWORD", "Current password is incorrect");
  }
  const passwordHash = await bcrypt.hash(input.newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return { success: true };
}
