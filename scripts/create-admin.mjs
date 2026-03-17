#!/usr/bin/env node
/**
 * Create an admin user.
 * Usage: node scripts/create-admin.mjs <email> <username> <password>
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const [email, username, password] = process.argv.slice(2);

if (!email || !username || !password) {
  console.error("Usage: node scripts/create-admin.mjs <email> <username> <password>");
  process.exit(1);
}

const db = new PrismaClient();

try {
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await db.user.create({
    data: {
      email,
      username,
      passwordHash,
      displayName: username,
      role: "ADMIN",
    },
  });

  console.log(`Admin user created: ${user.id} (${user.email}, @${user.username})`);
} catch (err) {
  console.error("Failed to create admin:", err.message);
  process.exit(1);
} finally {
  await db.$disconnect();
}
