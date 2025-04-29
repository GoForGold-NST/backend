import { Response, NextFunction } from "express";
import { prisma } from "../index";
import { AuthenticatedRequest } from "./authMiddelware";
import { PaymentStatus } from "../../prisma/generated/client";

export interface IOIRequest extends AuthenticatedRequest {
  ioi?: {
    paymentMade: PaymentStatus;
  };
}

const IOIMiddleware = async (
  req: IOIRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId } = req as { userId: string };
    const ioi = await prisma.iOI.findUnique({
      where: { userId },
      select: { paymentMade: true },
    });

    if (!ioi) {
      res.status(401).json({ error: "User not registered" });
      return;
    }

    req.ioi = ioi;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export default IOIMiddleware;
