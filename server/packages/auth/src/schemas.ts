import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  username: z
    .string()
    .min(2, "Username must be at least 2 characters")
    .max(39, "Username must be at most 39 characters")
    .regex(
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
      "Username must be lowercase alphanumeric with optional hyphens, cannot start or end with a hyphen",
    ),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(2, "Display name must be at least 2 characters").max(50),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

// Reserved usernames to prevent namespace collisions with routes
export const RESERVED_USERNAMES = new Set([
  "admin", "api", "creator", "settings", "search", "explore",
  "login", "register", "logout", "health", "models", "torrents",
  "payments", "licenses", "tags", "users", "about", "help",
  "terms", "privacy", "contact", "support", "pricing", "docs",
  "blog", "status", "dashboard", "library", "upload", "new",
  "edit", "delete", "peerweights", "null", "undefined",
]);
