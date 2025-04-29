import Express from "express";
import { PrismaClient } from "../prisma/generated/client";
import cookieParser from "cookie-parser";
import { sign, verify } from "jsonwebtoken";
import { hash, compare } from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import { Request, Response } from "express";
import authMiddleware, {
  AuthenticatedRequest,
} from "./middlewares/authMiddelware";

export const prisma = new PrismaClient();
dotenv.config();

const app = Express();
app.use(Express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.FRONTEND,
    credentials: true,
  }),
);

interface IOI {
  userId: string;
  fullName: string;
  email: string;
  DOB: string;
  candidateContact?: number;
  candidateAdhaar: number;
  schoolName: string;
  city: string;
  grade: number;
  codeforcesUsername?: string;
  codeforcesRating?: number;
  codechefUsername?: string;
  codechefRating?: number;
  olympiadParticipationHistory: "YES" | "NO";
  olympiadPerformance?: string;
  CPAchievements?: string;
  chennaiParticipation: "YES" | "NO";
  volunteerInterest: "YES" | "NO";
  campInterest: string;
  guardianName: string;
  guardianContact: number;
  guardianEmail: string;
  TShirtSize: string;
  allergies?: string;
}

app.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    console.log(name, email, password);
    res.clearCookie("token");
    if (!name || !email || !password) {
      res.status(400).json({ error: "All fields are required" });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(409).json({ error: "User already exists" });
      return;
    }

    const hashedPasssword = await hash(password, 10);

    const user = await prisma.user.create({
      data: {
        fullName: name,
        email,
        password: hashedPasssword,
      },
    });
    const jsonWebToken = sign({ id: user.id }, process.env.JWT_SECRET!, {
      expiresIn: "7d",
    });

    res.cookie("token", jsonWebToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 Days
    });

    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    res.clearCookie("token");
    if (!email || !password) {
      res.status(400).json({ error: "All fields are required" });
      return;
    }
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (!existingUser) {
      res.status(409).json({ error: "Invalid Credentials" });
      return;
    }
    const isPasswordCorrect = await compare(password, existingUser.password);
    if (!isPasswordCorrect) {
      res.status(409).json({ error: "Invalid credentials" });
      return;
    }
    const jsonWebToken = sign(
      { id: existingUser.id },
      process.env.JWT_SECRET!,
      {
        expiresIn: "7d",
      },
    );

    res.cookie("token", jsonWebToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 Days
    });
    res.status(200).json({ message: "Login successful" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/verify", async (req: Request, res: Response) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const decoded = verify(token, process.env.JWT_SECRET!) as { id: string };
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
      });
      if (!user) {
        res.clearCookie("token");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      res.status(200).json({ message: "Authorized" });
    } catch (error) {
      console.error(error);
      res.clearCookie("token");
      res.status(401).json({ error: "Unauthorized" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/logout", (_: Request, res: Response) => {
  res.clearCookie("token");
  res.status(200).json({ message: "Logout successful" });
});

app.post(
  "/registerIOI",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req as { userId: string };
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!userId || !user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { fullName, email } = user;
      if (!req.body) {
        res.status(400).json({ error: "All fields are required" });
        return;
      }
      const {
        DOB,
        candidateContact,
        candidateAdhaar,
        schoolName,
        city,
        grade,
        codeforcesUsername,
        codeforcesRating,
        codechefUsername,
        codechefRating,
        olympiadParticipationHistory,
        olympiadPerformance,
        CPAchievements,
        chennaiParticipation,
        volunteerInterest,
        campInterest,
        guardianName,
        guardianContact,
        guardianEmail,
        TShirtSize,
        allergies,
      }: IOI = req.body;

      if (
        !DOB ||
        !candidateContact ||
        !candidateAdhaar ||
        !schoolName ||
        !city ||
        !grade ||
        !guardianName ||
        !guardianContact ||
        !guardianEmail ||
        !TShirtSize ||
        !campInterest ||
        !olympiadParticipationHistory ||
        !chennaiParticipation ||
        !volunteerInterest
      ) {
        res.status(400).json({ error: "All fields are required" });
        return;
      }

      const existingIOI = await prisma.iOI.findUnique({
        where: { userId },
      });

      if (existingIOI) {
        res.status(409).json({ error: "Already registered" });
        return;
      }
      const ioi = await prisma.iOI.create({
        data: {
          DOB: new Date(DOB),
          userId,
          fullName,
          email,
          candidateContact,
          candidateAdhaar,
          schoolName,
          city,
          grade,
          codeforcesUsername,
          codeforcesRating,
          codechefUsername,
          codechefRating,
          olympiadParticipationHistory,
          olympiadPerformance,
          CPAchievements,
          chennaiParticipation,
          volunteerInterest,
          campInterest,
          guardianName,
          guardianContact,
          guardianEmail,
          TShirtSize,
          allergies,
        },
      });
      res
        .status(200)
        .json({ message: "Registered Successfully", ioiID: ioi.id });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

app.listen(5261, () => {
  console.log("Server is running on port 5261");
});
