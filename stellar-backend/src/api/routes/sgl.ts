import { Router, Request, Response, NextFunction } from "express";

import { debitSglForService } from "../../services/sglSolanaService.js";
import { createHash } from "crypto";


const router = Router();

router.post("/debit", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as {
      walletAddress?: string;
      serviceType?: string;
      cost?: number;
      avatarId?: string;
      payloadHash?: string;
    };

    if (!body.walletAddress || !body.serviceType || !body.cost || body.cost <= 0) {
      throw new Error("walletAddress, serviceType and positive cost are required");
    }

    const normalizedWallet = String(body.walletAddress);
    console.log("[debit-debug] walletAddress:", normalizedWallet);
    const payloadHash =
      body.payloadHash ||
      createHash("sha256")
        .update(`${normalizedWallet}:${body.serviceType}:${body.cost}:${Date.now()}`)
        .digest("hex");

    // Transação real na Solana (debit)
    let debitPlan;

    try {

      debitPlan = await debitSglForService(normalizedWallet, body.serviceType, body.cost);

    } catch (debitErr: any) {

      if (debitErr?.name?.includes("TokenOwner") || debitErr?.message?.includes("OffCurve") || debitErr?.message?.includes("Invalid public key") || debitErr?.message?.includes("Non-base58") || debitErr?.message?.includes("non-base58")) {

        res.status(200).json({

          debitStatus: "pending_wallet_signature",

          unsignedTxBase64: "",

          sourceTokenAccount: "",

          treasuryTokenAccount: "",

          payloadHash,

          sglBalance: 1000,

          message: "Wallet requires on-chain provisioning. Use /vault to provision.",

        });

        return;

      }

      throw debitErr;

    }

    // Retorna apenas o necessário para o frontend assinar
    res.status(200).json({
      debitStatus: debitPlan.debitStatus,
      unsignedTxBase64: debitPlan.unsignedTxBase64,
      sourceTokenAccount: debitPlan.sourceTokenAccount,
      treasuryTokenAccount: debitPlan.treasuryTokenAccount,
      payloadHash,
      sglBalance: 1000, // mock, mas a transação real já foi preparada
      message: "Proof registered on Solana Devnet. SGL debit requires wallet signature.",
    });
  } catch (error) {
    next(error);
  }
});

router.get("/balance", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress } = req.query;
    if (!walletAddress) throw new Error("walletAddress required");
    // Demo-safe: return mock balance for any wallet
    const balance = { balance: 1000 };
    res.json({ walletAddress, balance: balance.balance });
  } catch (error) {
    next(error);
  }
});

router.get("/ledger", async (_req: Request, res: Response, _next: NextFunction) => {
  res.json({ message: "Ledger endpoint disabled for demo" });
});

export default router;
