import jwt from "jsonwebtoken";
import express, { Request, Response, NextFunction } from "express";
import { prisma } from "../index";

interface AuthenticatedRequest extends Request {
  admin?: {
    id: string;
    email: string;
  };
  file?: Express.Multer.File;
}

export const authenticateAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET! || "123123") as {
      id: string;
      email: string;
    };
    const admin = await prisma.admin.findUnique({
      where: { id: decoded.id },
    });

    if (!admin) {
      res.status(401).json({ message: "Invalid admin credentials" });
      return;
    }

    req.admin = { id: admin.id, email: admin.email };
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({ message: "Invalid token" });
  }
};
