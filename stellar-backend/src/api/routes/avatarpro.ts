
import { Router, Request, Response } from "express";

import { PublicKey, Keypair } from "@solana/web3.js";

import { getSglBalance, getSglMint } from "../../services/sglSolanaService.js";

import { connection, loadDeployerKeypair } from "../../services/solanaConnection.js";

import { mintTo } from "@solana/spl-token";

import { randomBytes } from "crypto";

import axios from "axios";

import prisma from "../../lib/prisma.js";

import { requireAuth } from "../middlewares/auth.js";

import { executeAvatarInteraction } from "../../integrations/avatar-interaction/application/avatar-interaction.orchestrator.js";



const router = Router();

type RequestWithUser = Request & {
  user?: {
    userId: string;
    walletAddress: string;
  };
};



// ============================================================

// FUNÇÃO PARA CHAMAR A API DO GROK (xAI)

// ============================================================

const XAI_API_KEY = process.env.XAI_API_KEY || "";

const XAI_API_URL = "https://api.x.ai/v1/chat/completions";



async function callGrok(prompt: string, avatarId: string): Promise<string> {

  if (!XAI_API_KEY) {

    console.warn("XAI_API_KEY not set, using fallback response.");

    return getFallbackResponse(avatarId);

  }



  try {

    const systemPrompt = `You are an AI avatar inside the SingulAI AvatarPro Vault, a Solana-based platform for verifiable professional memory. Speak only in English. Your personality: Pedro is contractual/legal, Laura is creative/ideation, Leticia is objective/execution. Answer questions based on the user's domain and provide concise, expert-level responses. Never mention that you are an AI. Always maintain character.`;

    const response = await axios.post(

      XAI_API_URL,

      {

        model: "grok-3",

        messages: [

          { role: "system", content: systemPrompt },

          { role: "user", content: prompt }

        ],

        temperature: 0.7,

        max_tokens: 150,

      },

      {

        headers: {

          "Content-Type": "application/json",

          "Authorization": `Bearer ${XAI_API_KEY}`,

        },

        timeout: 10000,

      }

    );

    const reply = response.data.choices?.[0]?.message?.content?.trim();

    return reply || getFallbackResponse(avatarId);

  } catch (error) {

    console.error("Grok API error:", error);

    return getFallbackResponse(avatarId);

  }

}



function getFallbackResponse(avatarId: string): string {

  const fallbacks: Record<string, string> = {

    pedro: "Pedro: Estou com dificuldades técnicas. Tente novamente em instantes.",

    laura: "Laura: O sistema está instável agora. Tente mais tarde.",

    leticia: "Letícia: Houve um erro. Vamos tentar de novo?",

  };

  return fallbacks[avatarId] || fallbacks.pedro;

}



// ============================================================

// FUNÇÕES DE ABSORÇÃO E MÉTRICAS

// ============================================================

function normalizeDirection(value: unknown): "left" | "right" | null {

  if (value === "left" || value === "right") return value;

  return null;

}



function clamp(value: number, min: number, max: number): number {

  return Math.max(min, Math.min(max, value));

}



function computePasFromAbsorptionEvents(events: Array<{ details: unknown }>) {

  const directions = events

    .map((event) => normalizeDirection((event.details as any)?.direction))

    .filter((value): value is "left" | "right" => Boolean(value));



  const rightCount = directions.filter((d) => d === "right").length;

  const wrongCount = directions.filter((d) => d === "left").length;

  const totalAbsorption = directions.length;



  if (totalAbsorption === 0) {

    return { rightCount, wrongCount, totalAbsorption, pas: 0.79, absorption: 42 };

  }



  const avgIntensity =

    events.reduce((sum, event) => {

      const intensity = Number((event.details as any)?.intensity ?? 0);

      return sum + (isNaN(intensity) ? 0 : clamp(intensity, 0, 100));

    }, 0) / events.length;



  const rightRatio = rightCount / totalAbsorption;

  const wrongRatio = wrongCount / totalAbsorption;

  const intensityBoost = (avgIntensity / 100) * 0.04;

  const pas = clamp(0.58 + rightRatio * 0.36 - wrongRatio * 0.22 + intensityBoost, 0.35, 0.99);

  const absorption = clamp(Math.round((rightRatio - wrongRatio * 0.35) * 100), 0, 100);



  return { rightCount, wrongCount, totalAbsorption, pas, absorption };

}



// ============================================================

// ROTA WALLET (CRIAÇÃO + MINT REAL)

// ============================================================

router.get("/wallet", async (req: Request, res: Response) => {

  try {

    let walletAddress = req.query.walletAddress?.toString();

    let newKeypair: Keypair | null = null;



    if (!walletAddress) {

      newKeypair = Keypair.generate();

      walletAddress = newKeypair.publicKey.toBase58();

    }



    let walletPubkey: import("@solana/web3.js").PublicKey;

    try {

      walletPubkey = new PublicKey(walletAddress);

    } catch {

      const kp = Keypair.generate();

      walletAddress = kp.publicKey.toBase58();

      walletPubkey = kp.publicKey;

    }

    const mintPubkey = getSglMint();

    const deployerKeypair = loadDeployerKeypair();
    // Demo-safe: skip ATA creation to avoid Solana network timeout
    const tokenAccount = { address: walletPubkey };

    if (!tokenAccount) {
      res.status(200).json({
        walletAddress,
        sglBalance: 0,
        status: "provisioning",
        sessionToken: randomBytes(32).toString("hex"),
        network: "solana-devnet",
        message: "Use /wallets/provision to initialize wallet.",
      });
      return;
    }



    let mintTxSignature: string | null = null;

    if (newKeypair) {

      const amount = 1000 * 1_000_000_000; // 9 decimais

      mintTxSignature = await mintTo(

        connection,

        deployerKeypair,

        mintPubkey,

        tokenAccount.address,

        deployerKeypair,

        amount

      );

    }



    const balance = await getSglBalance(walletAddress);

    const sessionToken = randomBytes(32).toString("hex");



    const response: any = {

      walletAddress,

      sglBalance: balance.balance,

      status: "active",

      sessionToken,

      network: "solana-devnet",

    };



    if (mintTxSignature) {

      response.mintTxSignature = mintTxSignature;

      response.explorerUrl = `https://explorer.solana.com/tx/${mintTxSignature}?cluster=devnet`;

      response.message = "New wallet created and funded with 1,000 real SGL!";

    }

    if (newKeypair) {

      response.secretKey = Buffer.from(newKeypair.secretKey).toString("base64");

    }

    res.json(response);

  } catch (error: any) {

    console.error("Error in /wallet:", error);

    res.status(500).json({ error: "Failed to provision wallet", details: error.message });

  }

});



// ============================================================

// ROTA STATUS (SALDO REAL)

// ============================================================

router.get("/status", async (req: Request, res: Response) => {

  try {

    const walletAddress = req.query.walletAddress?.toString();

    if (!walletAddress) {

      return res.json({ walletAddress: null, sglBalance: 0, backendSource: "stellar-backend" });

    }

    const balance = await getSglBalance(walletAddress);

    return res.json({ walletAddress, sglBalance: balance.balance, backendSource: "stellar-backend" });

  } catch (error) {

    return res.status(500).json({ error: "Failed to get status" });

  }

});



// ============================================================

// ROTA MENSAGEM COM GROK

// ============================================================

router.post("/message", requireAuth, async (req: Request, res: Response) => {

  try {

    let { avatar, message } = req.body;

    if (!message || message.trim() === "") {

      return res.status(400).json({ error: "Message is required" });

    }



    // Mapeamento dos modos de avatar

    let mappedAvatar = avatar;

    if (mappedAvatar === "safe") mappedAvatar = "pedro";

    if (mappedAvatar === "diffusion") mappedAvatar = "laura";

    if (mappedAvatar === "atomic") mappedAvatar = "leticia";

    const finalAvatar = mappedAvatar || "pedro";



    const user = (req as RequestWithUser).user;

    if (!user?.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const systemPrompt =
      `You are an AI avatar inside the SingulAI AvatarPro Vault, ` +
      `a Solana-based platform for verifiable professional memory. ` +
      `Speak only in English. ` +
      `Pedro is contractual/legal, Laura is creative/ideation, ` +
      `Leticia is objective/execution. ` +
      `The active avatar is ${finalAvatar}. ` +
      `Answer questions based on the user's domain and provide concise, ` +
      `expert-level responses. Never mention that you are an AI. ` +
      `Always maintain character.`;

    let reply: string;

    try {
      const result = await executeAvatarInteraction({
        tenantId: "singulai",
        userId: user.userId,
        modelId: process.env.OLLAMA_MODEL || "mistral:latest",
        message,
        sentiment: "professional",
        metadata: {
          systemPrompt,
          avatarId: finalAvatar,
        },
      });

      reply = result.text?.trim();

      if (!reply) {
        reply = await callGrok(message, finalAvatar);
      }
    } catch (providerError) {
      console.error(
        "Primary LLM provider error, falling back to xAI:",
        providerError,
      );

      reply = await callGrok(message, finalAvatar);
    }

    return res.json({
      response_to_user: reply,
      avatar_id: finalAvatar,
    });

  } catch (error) {

    console.error("Unexpected error in /message:", error);

    return res.status(500).json({ error: "Internal server error" });

  }

});



// ============================================================
// MÉTRICAS E ABSORÇÃO — AUTHORIZED COGNITIVE STATE
// ============================================================

router.get("/metrics", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as RequestWithUser).user;

    if (!user?.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [transactions, absorptionEvents] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: user.userId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),

      prisma.auditLog.findMany({
        where: {
          userId: user.userId,
          resource: "absorption-feedback",
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    const metrics = computePasFromAbsorptionEvents(absorptionEvents);

    const spent = transactions.reduce(
      (sum, tx) => sum + Number(tx.amount),
      0
    );

    return res.status(200).json({
      omega: Number((metrics.pas * 100).toFixed(1)),
      omegaScore: Number(metrics.pas.toFixed(4)),
      pas: Number(metrics.pas.toFixed(4)),
      pasScore: Number(metrics.pas.toFixed(4)),
      absorption: metrics.absorption,
      rightCount: metrics.rightCount,
      wrongCount: metrics.wrongCount,
      totalAbsorption: metrics.totalAbsorption,
      totalTransactions: transactions.length,
      sglSpent: Number(spent.toFixed(2)),
    });
  } catch (error) {
    console.error("Error in /metrics:", error);
    return res.status(500).json({ error: "Failed to compute metrics" });
  }
});

router.post(
  "/absorption-feedback",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = (req as RequestWithUser).user;

      if (!user?.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const body = req.body as {
        direction?: "left" | "right";
        profile?: string;
        intensity?: number;
        source?: string;
        targetMessageId?: number;
        targetResponseHash?: string;
      };

      if (!body.direction || !["left", "right"].includes(body.direction)) {
        return res.status(400).json({
          error: "direction is required",
          code: "INVALID_PAYLOAD",
        });
      }

      const event = await prisma.auditLog.create({
        data: {
          userId: user.userId,

          // Temporary enum compatibility.
          // A dedicated ABSORPTION_FEEDBACK_CREATE AuditAction
          // will be introduced in a later Prisma migration.
          action: "CONSENT_UPSERT",

          resource: "absorption-feedback",

          details: {
            direction: body.direction,
            profile: body.profile || "unknown",
            intensity: body.intensity || 0,
            source: body.source || "dashboard",
            targetMessageId: body.targetMessageId ?? null,
            targetResponseHash: body.targetResponseHash || null,
            appliesTo: "last-ai-response",
            walletAuthority: user.walletAddress,
            ts: new Date().toISOString(),
          },
        },
      });

      const latestEvents = await prisma.auditLog.findMany({
        where: {
          userId: user.userId,
          resource: "absorption-feedback",
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { details: true },
      });

      const metrics = computePasFromAbsorptionEvents(latestEvents);

      return res.status(201).json({
        success: true,
        eventId: event.id,
        direction: body.direction,
        newScore: metrics.absorption,
        pas: Number(metrics.pas.toFixed(4)),
        rightCount: metrics.rightCount,
        wrongCount: metrics.wrongCount,
        totalAbsorption: metrics.totalAbsorption,
        source: "backend",
      });
    } catch (error) {
      console.error("Error in /absorption-feedback:", error);
      return res.status(500).json({
        error: "Failed to record absorption feedback",
      });
    }
  }
);

router.get(
  "/absorption-events",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = (req as RequestWithUser).user;

      if (!user?.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const events = await prisma.auditLog.findMany({
        where: {
          userId: user.userId,
          resource: "absorption-feedback",
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      const metrics = computePasFromAbsorptionEvents(events);

      return res.status(200).json({
        avatarId: "avatarpro",
        state: "learning",
        absorption: metrics.absorption,
        pas: Number(metrics.pas.toFixed(4)),
        particleWhitening: Number(metrics.pas.toFixed(4)),
        rightCount: metrics.rightCount,
        wrongCount: metrics.wrongCount,
        totalAbsorption: metrics.totalAbsorption,
        events,
      });
    } catch (error) {
      console.error("Error in /absorption-events:", error);
      return res.status(500).json({
        error: "Failed to load absorption events",
      });
    }
  }
);


router.get("/health", (_req: Request, res: Response) => res.json({ status: "ok" }));



export default router;

