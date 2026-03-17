import { Router } from "express";
import crypto from "crypto";
import { ZodError } from "zod";
import { db, redis, authenticate, requireRole, getStripe, ValidationError, ConflictError, NotFoundError, getConfig } from "@peerweights/shared";

export const creatorRouter = Router();

/** Generate a short-lived token for Stripe Connect return/refresh URLs */
async function createOnboardToken(creatorId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await redis.set(`stripe_onboard:${token}`, creatorId, "EX", 3600); // 1 hour TTL
  return token;
}

/** Verify and consume a Stripe Connect onboard token, returns creatorId or null */
async function verifyOnboardToken(token: string): Promise<string | null> {
  const creatorId = await redis.get(`stripe_onboard:${token}`);
  if (creatorId) {
    await redis.del(`stripe_onboard:${token}`);
  }
  return creatorId;
}

// Register as a creator
creatorRouter.post("/creator/register", authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.sub;

    const existing = await db.creator.findUnique({ where: { userId } });
    if (existing) {
      throw new ConflictError("Already registered as a creator");
    }

    const creator = await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { role: "CREATOR" },
      });

      return tx.creator.create({
        data: { userId },
      });
    });

    res.status(201).json({
      id: creator.id,
      stripeOnboarded: creator.stripeOnboarded,
    });
  } catch (err) {
    next(err);
  }
});

// Get Stripe Connect onboarding URL
creatorRouter.get(
  "/creator/stripe/onboard",
  authenticate,
  requireRole("CREATOR"),
  async (req, res, next) => {
    try {
      const creator = await db.creator.findUnique({
        where: { userId: req.user!.sub },
      });

      if (!creator) {
        throw new NotFoundError("Creator profile");
      }

      if (creator.stripeOnboarded) {
        res.json({ status: "already_onboarded" });
        return;
      }

      const stripe = getStripe();
      const config = getConfig();

      // Create a Connect Express account if creator doesn't have one yet
      let stripeAccountId = creator.stripeAccountId;
      if (!stripeAccountId) {
        const account = await stripe.accounts.create({
          type: "express",
          metadata: { creatorId: creator.id },
        });
        stripeAccountId = account.id;

        await db.creator.update({
          where: { id: creator.id },
          data: { stripeAccountId },
        });
      }

      // Create a signed token for the return/refresh URLs
      const onboardToken = await createOnboardToken(creator.id);

      const returnUrl = config.STRIPE_CONNECT_RETURN_URL
        || `${config.CORS_ORIGIN}/api/creator/stripe/onboard/return`;
      const refreshUrl = config.STRIPE_CONNECT_REFRESH_URL
        || `${config.CORS_ORIGIN}/api/creator/stripe/onboard/refresh`;

      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        return_url: `${returnUrl}?token=${onboardToken}`,
        refresh_url: `${refreshUrl}?token=${onboardToken}`,
        type: "account_onboarding",
      });

      res.json({ url: accountLink.url });
    } catch (err) {
      next(err);
    }
  },
);

// Stripe Connect onboarding return — check status and redirect
creatorRouter.get(
  "/creator/stripe/onboard/return",
  async (req, res, next) => {
    try {
      const token = String(req.query.token || "");
      const creatorId = token ? await verifyOnboardToken(token) : null;

      if (creatorId) {
        const creator = await db.creator.findUnique({
          where: { id: creatorId },
        });

        if (creator?.stripeAccountId) {
          const stripe = getStripe();
          const account = await stripe.accounts.retrieve(creator.stripeAccountId);

          await db.creator.update({
            where: { id: creator.id },
            data: {
              stripeOnboarded: account.charges_enabled ?? false,
              stripePayoutsEnabled: account.payouts_enabled ?? false,
            },
          });
        }
      }

      // Redirect to dashboard
      res.redirect(`${getConfig().CORS_ORIGIN}/dashboard`);
    } catch (err) {
      next(err);
    }
  },
);

// Stripe Connect onboarding refresh — generate new link (previous one expired)
creatorRouter.get(
  "/creator/stripe/onboard/refresh",
  async (req, res, next) => {
    try {
      const token = String(req.query.token || "");
      const creatorId = token ? await verifyOnboardToken(token) : null;

      if (!creatorId) {
        throw new ValidationError("Invalid or expired onboarding link");
      }

      const creator = await db.creator.findUnique({
        where: { id: creatorId },
      });

      if (!creator || !creator.stripeAccountId) {
        throw new NotFoundError("Creator profile");
      }

      const stripe = getStripe();
      const config = getConfig();

      const newToken = await createOnboardToken(creator.id);

      const returnUrl = config.STRIPE_CONNECT_RETURN_URL
        || `${config.CORS_ORIGIN}/api/creator/stripe/onboard/return`;
      const refreshUrl = config.STRIPE_CONNECT_REFRESH_URL
        || `${config.CORS_ORIGIN}/api/creator/stripe/onboard/refresh`;

      const accountLink = await stripe.accountLinks.create({
        account: creator.stripeAccountId,
        return_url: `${returnUrl}?token=${newToken}`,
        refresh_url: `${refreshUrl}?token=${newToken}`,
        type: "account_onboarding",
      });

      res.redirect(accountLink.url);
    } catch (err) {
      next(err);
    }
  },
);

// Get creator profile
creatorRouter.get(
  "/creator/profile",
  authenticate,
  requireRole("CREATOR"),
  async (req, res, next) => {
    try {
      const creator = await db.creator.findUnique({
        where: { userId: req.user!.sub },
        include: {
          user: { select: { username: true, displayName: true } },
          models: {
            select: {
              id: true,
              slug: true,
              name: true,
              status: true,
              priceCents: true,
              createdAt: true,
            },
          },
        },
      });

      if (!creator) {
        throw new NotFoundError("Creator profile");
      }

      res.json(creator);
    } catch (err) {
      next(err);
    }
  },
);
