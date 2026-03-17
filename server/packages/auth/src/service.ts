import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { db, getConfig, ConflictError, UnauthorizedError, ValidationError } from "@peerweights/shared";
import type { JwtPayload } from "@peerweights/shared";
import type { RegisterInput, LoginInput } from "./schemas.js";
import { RESERVED_USERNAMES } from "./schemas.js";

const SALT_ROUNDS = 12;

function generateAccessToken(user: { id: string; email: string; username: string; role: string }): string {
  const config = getConfig();
  return jwt.sign(
    { sub: user.id, email: user.email, username: user.username, role: user.role },
    config.JWT_ACCESS_SECRET,
    { expiresIn: config.JWT_ACCESS_EXPIRES_IN as unknown as jwt.SignOptions["expiresIn"] },
  );
}

function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString("hex");
}

function getRefreshExpiresAt(): Date {
  const config = getConfig();
  const match = config.JWT_REFRESH_EXPIRES_IN.match(/^(\d+)([smhd])$/);
  if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [, num, unit] = match;
  const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return new Date(Date.now() + parseInt(num!) * multipliers[unit!]!);
}

export async function register(input: RegisterInput) {
  // Check reserved usernames
  if (RESERVED_USERNAMES.has(input.username)) {
    throw new ValidationError("This username is reserved");
  }

  // Check uniqueness
  const [existingEmail, existingUsername] = await Promise.all([
    db.user.findUnique({ where: { email: input.email } }),
    db.user.findUnique({ where: { username: input.username } }),
  ]);
  if (existingEmail) {
    throw new ConflictError("Email already registered");
  }
  if (existingUsername) {
    throw new ConflictError("Username already taken");
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await db.user.create({
    data: {
      email: input.email,
      username: input.username,
      passwordHash,
      displayName: input.displayName,
    },
  });

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();

  await db.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshToken,
      expiresAt: getRefreshExpiresAt(),
    },
  });

  return {
    user: { id: user.id, email: user.email, username: user.username, displayName: user.displayName, role: user.role },
    accessToken,
    refreshToken,
  };
}

export async function login(input: LoginInput) {
  const user = await db.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();

  await db.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshToken,
      expiresAt: getRefreshExpiresAt(),
    },
  });

  return {
    user: { id: user.id, email: user.email, username: user.username, displayName: user.displayName, role: user.role },
    accessToken,
    refreshToken,
  };
}

export async function refresh(token: string) {
  const stored = await db.refreshToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!stored || stored.expiresAt < new Date()) {
    if (stored) {
      await db.refreshToken.deleteMany({ where: { id: stored.id } });
    }
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  // Rotate: delete old, create new (deleteMany tolerates already-deleted tokens from race conditions)
  await db.refreshToken.deleteMany({ where: { id: stored.id } });

  const accessToken = generateAccessToken(stored.user);
  const newRefreshToken = generateRefreshToken();

  await db.refreshToken.create({
    data: {
      userId: stored.user.id,
      token: newRefreshToken,
      expiresAt: getRefreshExpiresAt(),
    },
  });

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(token: string) {
  await db.refreshToken.deleteMany({ where: { token } });
}

export async function getMe(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      role: true,
      bio: true,
      avatarUrl: true,
      createdAt: true,
      creator: { select: { id: true, stripeOnboarded: true } },
    },
  });
  return user;
}
