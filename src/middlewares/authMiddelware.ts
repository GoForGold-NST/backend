import { verify } from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { prisma } from "../index";

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const token = req.cookies?.token;
  if (!token) {
    res.status(401).json({ error: "No token found" });
    return;
  }

  try {
    const decoded = verify(token, process.env.JWT_SECRET! || "123123") as {
      id: string;
    };
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    });
    if (!user) {
      res.clearCookie("token");
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    req.userId = decoded.id;
    next();
  } catch (error) {
    console.error("JWT Verification Error:", error);
    res.clearCookie("token");
    res.status(401).json({ error: "Invalid token" });
    return;
  }
};

export default authMiddleware;
