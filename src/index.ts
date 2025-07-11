import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import { GaslessService } from "./lib";
import dotenv from "dotenv";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { HexString } from "@gear-js/api";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

let gaslessService: GaslessService;
let programId: HexString;

async function init() {
  if (!gaslessService) {
    await cryptoWaitReady();
    gaslessService = new GaslessService();
    programId = process.env.PROGRAM_ID as HexString;
  }
}

app.get("/gasless/voucher/:voucherId/status", async (req, res) => {
  try {
    await init();
    const { voucherId } = req.params;
    const status = await gaslessService.getVoucherStatus(voucherId);
    res.send(status);
  } catch (err) {
    console.error("Error getting voucher status:", err);
    res.status(500).send({ error: "Internal server error" });
  }
});

app.get("/gasless/voucher/:program/status", async (req, res) => {
  try {
    await init();
    const { program } = req.params;
    const { account } = req.query;

    if (!account || typeof account !== "string") {
      return res.status(400).json({ error: "Missing or invalid account" });
    }

    const vouchers = await gaslessService.api.voucher.getAllForAccount(account);
    const voucher = Object.values(vouchers).find(
      (v) => Array.isArray(v.programs) && v.programs.includes(program)
    );

    if (!voucher) {
      return res.json({
        id: null,
        enabled: false,
        duration: 0,
        varaToIssue: 0
      });
    }

    const voucherId = voucher.id.toHex();
    const balanceInfo = await gaslessService.getVoucherStatus(voucherId);

    return res.json({
      id: voucherId,
      enabled: balanceInfo.enabled,
      duration: 3600,
      varaToIssue: balanceInfo.rawBalance?.toNumber() ?? 0
    });
  } catch (error) {
    console.error("❌ Error getting voucher status:", error);
    return res.status(500).json({ error: "Internal error" });
  }
});

app.post("/gasless/voucher/request", async (req, res) => {
  try {
    await init();
    const { account, amount = 10000000000000, durationInSec = 3600 } = req.body;

    const voucherId: HexString = await gaslessService.issue(
      account,
      programId,
      amount,
      Number(durationInSec)
    );

    res.status(200).json({ voucherId });
  } catch (error) {
    console.error("❌ Error creating voucher:", error);
    res.status(500).json({ error: "Failed to create voucher", details: error.message });
  }
});

app.post("/issue", async (req, res) => {
  try {
    await init();
    const data = req.body;
    const spender = typeof data.account === "string" ? data.account : String(data.account);

    if (!spender.startsWith("0x") || spender.length !== 66) {
      throw new Error(`Invalid account: ${spender}`);
    }

    const voucher = await gaslessService.issue(
      data.account,
      programId,
      data.amount,
      Number(data.durationInSec)
    );

    res.send(voucher);
  } catch (error) {
    console.error("Error in /issue:", error);
    res.status(500).send({ error: "Internal server error" });
  }
});

app.post("/prolong", async (req, res) => {
  try {
    await init();
    const data = req.body;
    await gaslessService.prolong(data.voucherId, data.account, data.balance, data.durationInSec);
    res.sendStatus(200);
  } catch (error) {
    console.error("Error in /prolong:", error);
    res.status(500).send({ error: "Internal server error" });
  }
});

app.post("/revoke", async (req, res) => {
  try {
    await init();
    const data = req.body;
    await gaslessService.revoke(data.voucherId, data.account);
    res.sendStatus(200);
  } catch (error) {
    console.error("Error in /revoke:", error);
    res.status(500).send({ error: "Internal server error" });
  }
});

export default app;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running locally on http://localhost:${port}`);
  });
}
