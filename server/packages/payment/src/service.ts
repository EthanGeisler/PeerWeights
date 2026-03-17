import Stripe from "stripe";
import { db, AppError, NotFoundError, ConflictError, ValidationError, getStripe, getConfig } from "@peerweights/shared";

export async function checkout(userId: string, modelId: string) {
  // 1. Verify model exists and is published
  const model = await db.model.findUnique({
    where: { id: modelId },
    include: { creator: true },
  });
  if (!model) {
    throw new NotFoundError("Model");
  }
  if (model.status !== "PUBLISHED") {
    throw new ValidationError("Model is not available for purchase");
  }

  // 2. Check user doesn't already own it
  const existingLicense = await db.license.findUnique({
    where: { userId_modelId: { userId, modelId } },
  });
  if (existingLicense && existingLicense.status === "ACTIVE") {
    throw new ConflictError("You already own this model");
  }

  // 3. Calculate platform fee (5%)
  const config = getConfig();
  const platformFeePercent = config.STRIPE_PLATFORM_FEE_PERCENT;
  const platformFeeCents = Math.ceil(
    (model.priceCents * platformFeePercent) / 100,
  );

  // 4. Free models: grant license immediately (no Stripe)
  if (model.priceCents === 0) {
    const result = await db.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          userId,
          modelId,
          amountCents: 0,
          platformFeeCents: 0,
          status: "COMPLETED",
        },
      });

      const license = await tx.license.create({
        data: {
          userId,
          modelId,
          paymentId: payment.id,
          status: "ACTIVE",
        },
      });

      return { payment, license };
    });

    return {
      free: true,
      paymentId: result.payment.id,
      licenseId: result.license.id,
      modelId: model.id,
      modelName: model.name,
    };
  }

  // 5. Paid models: create Stripe Checkout Session
  if (!model.creator.stripeAccountId) {
    throw new ValidationError("This model's creator has not completed payment setup");
  }

  const stripe = getStripe();

  // Create a PENDING payment record first
  const payment = await db.payment.create({
    data: {
      userId,
      modelId,
      amountCents: model.priceCents,
      platformFeeCents,
      status: "PENDING",
    },
  });

  // PeerWeights uses BrowserRouter, so URLs are normal paths
  const origin = config.CORS_ORIGIN;
  const successUrl = `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/checkout/cancel`;

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: model.name,
            },
            unit_amount: model.priceCents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: platformFeeCents,
        transfer_data: {
          destination: model.creator.stripeAccountId,
        },
      },
      metadata: {
        paymentId: payment.id,
        modelId: model.id,
        userId,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  } catch (err) {
    // Clean up orphaned PENDING payment if Stripe call fails
    await db.payment.delete({ where: { id: payment.id } });
    throw err;
  }

  // Store the checkout session ID on the payment record
  await db.payment.update({
    where: { id: payment.id },
    data: { stripeCheckoutSessionId: session.id },
  });

  return {
    free: false,
    checkoutUrl: session.url,
    paymentId: payment.id,
    modelId: model.id,
    modelName: model.name,
  };
}

export async function handleWebhook(rawBody: Buffer | string, signature: string | undefined) {
  const config = getConfig();
  if (!config.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(500, "Stripe webhook secret is not configured");
  }

  const stripe = getStripe();
  let event: Stripe.Event;

  if (!signature) {
    throw new ValidationError("Missing stripe-signature header");
  }

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      config.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    throw new ValidationError(`Webhook signature verification failed: ${(err as Error).message}`);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    }
    case "checkout.session.expired": {
      await handleCheckoutExpired(event.data.object as Stripe.Checkout.Session);
      break;
    }
    case "account.updated": {
      await handleAccountUpdated(event.data.object as Stripe.Account);
      break;
    }
    default:
      console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
  }

  return { received: true };
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const paymentId = session.metadata?.paymentId;
  if (!paymentId) {
    console.error("[Stripe Webhook] checkout.session.completed missing paymentId in metadata");
    return;
  }

  const existing = await db.payment.findUnique({ where: { id: paymentId } });
  if (!existing || existing.status === "COMPLETED") {
    return;
  }

  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: "COMPLETED",
        stripePaymentIntentId: typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
      },
    });

    const existingLicense = await tx.license.findUnique({
      where: { userId_modelId: { userId: existing.userId, modelId: existing.modelId } },
    });
    if (!existingLicense) {
      await tx.license.create({
        data: {
          userId: existing.userId,
          modelId: existing.modelId,
          paymentId: existing.id,
          status: "ACTIVE",
        },
      });
    }
  });

  console.log(`[Stripe Webhook] Payment ${paymentId} completed, license granted`);
}

async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const paymentId = session.metadata?.paymentId;
  if (!paymentId) return;

  const existing = await db.payment.findUnique({ where: { id: paymentId } });
  if (!existing || existing.status === "COMPLETED") return;

  await db.payment.update({
    where: { id: paymentId },
    data: { status: "FAILED" },
  });

  console.log(`[Stripe Webhook] Payment ${paymentId} expired`);
}

async function handleAccountUpdated(account: Stripe.Account) {
  const creator = await db.creator.findFirst({
    where: { stripeAccountId: account.id },
  });
  if (!creator) return;

  await db.creator.update({
    where: { id: creator.id },
    data: {
      stripeOnboarded: account.charges_enabled ?? false,
      stripePayoutsEnabled: account.payouts_enabled ?? false,
    },
  });

  console.log(`[Stripe Webhook] Creator ${creator.id} account updated — charges: ${account.charges_enabled}, payouts: ${account.payouts_enabled}`);
}
