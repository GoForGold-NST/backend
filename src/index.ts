import Express, { NextFunction } from "express";
import {
  volunteerInterest,
  PrismaClient,
  YesNo,
  PaymentStatus,
} from "../prisma/generated/client";
import cookieParser from "cookie-parser";
import { sign, verify } from "jsonwebtoken";
import { hash, compare } from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import { Request, Response } from "express";
import authMiddleware, {
  AuthenticatedRequest,
} from "./middlewares/authMiddelware";
import IOIMiddleware, { IOIRequest } from "./middlewares/IOIMiddleware";
import multer from "multer";
import csv from "csv-parser";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import nodemailer from "nodemailer";

export const prisma = new PrismaClient();
dotenv.config();

const allowedOrigins = [process.env.FRONTEND, process.env.ADMIN_FRONTEND];

const app = Express();
app.use(Express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: function (origin, callback) {
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
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
  volunteerInterest: "YES" | "NO" | "WILLTRYMYBEST" | "MAYBE";
  campInterest: string;
  guardianName: string;
  guardianContact: number;
  guardianEmail: string;
  TShirtSize: string;
  allergies?: string;
}

interface AdminAuthenticatedRequest extends Request {
  admin?: {
    id: string;
    email: string;
  };
  //@ts-expect-error Type error, safe to ignore
  file?: Express.Multer.File;
}

interface CSVRow {
  [key: string]: string;
}

interface IOIWithUser {
  id: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    password: string;
  } | null;
  userId: string;
  fullName: string;
  email: string;
  candidateContact: bigint;
  candidateAdhaar: bigint;
  schoolName: string;
  city: string;
  grade: bigint;
  codeforcesUsername: string | null;
  codeforcesRating: bigint | null;
  codechefUsername: string | null;
  codechefRating: bigint | null;
  olympiadParticipationHistory: YesNo;
  CPAchievements: string | null;
  chennaiParticipation: YesNo;
  volunteerInterest: volunteerInterest;
  campInterest: string;
  guardianName: string;
  guardianContact: bigint;
  guardianEmail: string;
  TShirtSize: string;
  allergies: string | null;
  paymentMade: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const upload = multer({ dest: "uploads/" });

const createTransporter = () => {
  if (!process.env.SMTP_HOST) {
    console.warn(
      "SMTP configuration not set - email functionality will be disabled"
    );
    return null;
  }
  return nodemailer.createTransport({
    //@ts-expect-error Type error, safe to ignore
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
};

const generateQR = async (text: string): Promise<string> => {
  try {
    return await QRCode.toDataURL(text);
  } catch (err) {
    console.error("QR generation error:", err);
    throw err;
  }
};

// Health Check
app.get("/", (_: Request, res: Response) => {
  res.status(200).json({ message: "Healthy!" });
});

// User routes
app.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
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
    const jsonWebToken = sign(
      { id: user.id },
      process.env.JWT_SECRET! || "123123",
      {
        expiresIn: "7d",
      }
    );

    res.cookie("token", jsonWebToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
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
      process.env.JWT_SECRET! || "123123",
      {
        expiresIn: "7d",
      }
    );

    res.cookie("token", jsonWebToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
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
      const decoded = verify(token, process.env.JWT_SECRET! || "123123") as {
        id: string;
      };
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
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  });
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
  }
);

app.get(
  "/verifyIOINotRegistered",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { userId } = req as { userId: string };
      const ioi = await prisma.iOI.findUnique({
        where: { userId },
      });

      if (ioi) {
        if (ioi.paymentMade == "pending") {
          res.status(409).json({ error: "Already registered" });
        } else {
          res.status(409).json({ error: "Already paid" });
        }
        return;
      }
      res.status(200).json({ message: "Not registered" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

app.get(
  "/verifyIOI",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { userId } = req as { userId: string };
      const ioi = await prisma.iOI.findUnique({
        where: { userId },
      });

      if (!ioi) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      res.status(200).json({ message: "Authorized" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

app.get(
  "/verifyIOIPaymentNotMade",
  authMiddleware,
  IOIMiddleware,
  async (req: IOIRequest, res) => {
    try {
      const { ioi } = req;
      if (ioi?.paymentMade == "success") {
        res.status(401).json({ error: "Already paid" });
        return;
      }
      res.status(200).json({ message: "Not yet paid" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

app.get(
  "/verifyIOIPaymentMade",
  authMiddleware,
  IOIMiddleware,
  async (req: IOIRequest, res) => {
    try {
      const { ioi } = req;
      if (ioi?.paymentMade == "success") {
        res.status(200).json({ message: "Payment Made" });
        return;
      }
      res.status(401).json({ error: "Payment not made" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Admin routes
const authenticateAdmin = async (
  req: AdminAuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const decoded = verify(token, process.env.JWT_SECRET! || "123123") as {
      id: string;
      email: string;
    };
    const admin = await prisma.admin.findUnique({
      where: { id: decoded.id },
    });

    if (!admin) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error(error);
    res.status(401).json({ error: "Unauthorized" });
  }
};

app.post(
  "/admin/confirm-payments",
  authenticateAdmin,
  upload.single("csvFile"),
  async (req: AdminAuthenticatedRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No CSV file uploaded" });
        return;
      }

      const filePath = path.join(process.cwd(), req.file.path);
      const results: CSVRow[] = [];

      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (data: CSVRow) => results.push(data))
        .on("end", async () => {
          try {
            const processedPayments: {
              email: string;
              name: string;
              status: string;
            }[] = [];

            for (const row of results) {
              const email = row.Email || row.email;
              if (!email) {
                console.warn("Skipping row with missing email");
                continue;
              }

              try {
                const updatedUser = await prisma.iOI.updateMany({
                  where: { email },
                  data: { paymentMade: "success" },
                });

                if (updatedUser.count === 0) {
                  console.warn(`No user found with email: ${email}`);
                  continue;
                }

                const user = await prisma.iOI.findFirst({
                  where: { email },
                  include: { user: true },
                });

                if (!user) {
                  console.warn(`User details not found for email: ${email}`);
                  continue;
                }

                const qrHash = sign(
                  {
                    userId: user.userId,
                    ioiId: user.id,
                    email: user.email,
                  },
                  process.env.JWT_SECRET! || "123123",
                  { expiresIn: "365d" }
                );

                const qrCode = await generateQR(qrHash);

                await sendPaymentConfirmationEmail(
                  user as unknown as IOIWithUser,
                  qrCode
                );

                processedPayments.push({
                  email,
                  name: user.fullName,
                  status: "confirmed",
                });
              } catch (error) {
                console.error(`Error processing ${email}:`, error);
                processedPayments.push({
                  email,
                  name: "Unknown",
                  status: "failed",
                });
              }
            }

            fs.unlinkSync(filePath);
            res.status(200).json({
              success: true,
              processed: processedPayments.filter(
                (p) => p.status === "confirmed"
              ).length,
              failed: processedPayments.filter((p) => p.status === "failed")
                .length,
              skipped: results.length - processedPayments.length,
              payments: processedPayments,
            });
          } catch (error) {
            console.error("Error processing CSV:", error);
            res.status(500).json({ error: "Error processing CSV" });
          }
        });
    } catch (error) {
      console.error("Error handling CSV upload:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

app.post(
  "/admin/send-reminders",
  authenticateAdmin,
  upload.single("csvFile"),
  async (req: AdminAuthenticatedRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No CSV file uploaded" });
        return;
      }

      const filePath = path.join(process.cwd(), req.file.path);
      const results: CSVRow[] = [];

      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (data: CSVRow) => results.push(data))
        .on("end", async () => {
          try {
            const processedReminders: {
              email: string;
              name: string;
              status: string;
            }[] = [];

            for (const row of results) {
              const email = row.Email || row.email;
              if (!email) {
                console.warn("Skipping row with missing email");
                continue;
              }

              try {
                const user = await prisma.iOI.findFirst({
                  where: { email },
                  include: { user: true },
                });

                if (!user) {
                  console.warn(`No user found with email: ${email}`);
                  continue;
                }

                if (user.paymentMade === "success") {
                  console.log(`Payment already confirmed for ${email}`);
                  continue;
                }

                await sendPaymentReminderEmail(user as unknown as IOIWithUser);

                processedReminders.push({
                  email,
                  name: user.fullName,
                  status: "reminder_sent",
                });
              } catch (error) {
                console.error(`Error processing ${email}:`, error);
              }
            }

            fs.unlinkSync(filePath);
            res.status(200).json({
              success: true,
              processed: processedReminders.length,
              failed: results.length - processedReminders.length,
              reminders: processedReminders,
            });
          } catch (error) {
            console.error("Error processing CSV:", error);
            res.status(500).json({ error: "Error processing CSV" });
          }
        });
    } catch (error) {
      console.error("Error handling CSV upload:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

const sendPaymentConfirmationEmail = async (
  user: IOIWithUser,
  qrCode: string
) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.warn("SMTP not configured - email not sent");
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
          .header { background-color: #f8f8f8; padding: 10px; text-align: center; border-bottom: 1px solid #ddd; }
          .content { padding: 20px; }
          .footer { text-align: center; font-size: 12px; color: #777; margin-top: 20px; }
          .qr-code { text-align: center; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>IOI Registration Confirmation</h2>
          </div>
          <div class="content">
            <p>Dear ${user.fullName},</p>
            <p>We are pleased to inform you that your payment for IOI registration has been successfully processed.</p>
            
            <h3>Registration Details:</h3>
            <p><strong>Name:</strong> ${user.fullName}</p>
            <p><strong>School:</strong> ${user.schoolName}</p>
            <p><strong>City:</strong> ${user.city}</p>
            <p><strong>Grade:</strong> ${user.grade.toString()}</p>
            
            <div class="qr-code">
              <h3>Your Event QR Code</h3>
              <img src="cid:qrcode" alt="Event QR Code" style="width: 200px; height: 200px;"/>
              <p>Please present this QR code at the event venue for check-in.</p>
            </div>
            
            <p>Thank you for registering. We look forward to seeing you at the event!</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply directly to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: user.email,
      subject: "IOI Registration Payment Confirmation",
      html: htmlContent,
      attachments: [
        {
          filename: "qrcode.png",
          content: qrCode.split("base64,")[1],
          encoding: "base64",
          cid: "qrcode",
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    console.log(`Confirmation email sent to ${user.email}`);
  } catch (error) {
    console.error(`Error sending confirmation email to ${user.email}:`, error);
  }
};

const sendPaymentReminderEmail = async (user: IOIWithUser) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.warn("SMTP not configured - email not sent");
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
          .header { background-color: #f8f8f8; padding: 10px; text-align: center; border-bottom: 1px solid #ddd; }
          .content { padding: 20px; }
          .footer { text-align: center; font-size: 12px; color: #777; margin-top: 20px; }
          .button {
            display: inline-block; padding: 10px 20px; background-color: #4CAF50; 
            color: white; text-decoration: none; border-radius: 5px; margin: 15px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>IOI Payment Reminder</h2>
          </div>
          <div class="content">
            <p>Dear ${user.fullName},</p>
            <p>We noticed that your payment for the IOI registration is still pending.</p>
            
            <h3>Your Registration Details:</h3>
            <p><strong>Name:</strong> ${user.fullName}</p>
            <p><strong>School:</strong> ${user.schoolName}</p>
            <p><strong>City:</strong> ${user.city}</p>
            <p><strong>Grade:</strong> ${user.grade.toString()}</p>
            
            <p>To complete your registration, please make the payment at your earliest convenience.</p>
            <a href="${
              process.env.PAYMENT_LINK || "https://yourpaymentlink.com"
            }" class="button">Complete Payment Now</a>
            
            <p>If you've already made the payment, please ignore this reminder.</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply directly to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: user.email,
      subject: "Reminder: Complete Your IOI Registration Payment",
      html: htmlContent,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Reminder email sent to ${user.email}`);
  } catch (error) {
    console.error(`Error sending reminder email to ${user.email}:`, error);
  }
};

app.get(
  "/admin/analytics/ioi",
  authenticateAdmin,
  async (_: AdminAuthenticatedRequest, res: Response) => {
    try {
      const paymentStatusDistribution = await prisma.iOI.groupBy({
        by: ["paymentMade"],
        _count: {
          paymentMade: true,
          _all: true,
        },
      });

      const schoolDistribution = await prisma.iOI.groupBy({
        by: ["schoolName"],
        _count: { schoolName: true },
        orderBy: { _count: { schoolName: "desc" } },
      });

      const cityDistribution = await prisma.iOI.groupBy({
        by: ["city"],
        _count: { city: true },
        orderBy: { _count: { city: "desc" } },
      });

      const gradeDistribution = await prisma.iOI.groupBy({
        by: ["grade"],
        _count: { grade: true },
        orderBy: { grade: "asc" },
      });

      const totalRegistrations = await prisma.iOI.count();
      const paidRegistrations = await prisma.iOI.count({
        where: { paymentMade: PaymentStatus.success },
      });

      const recentRegistrations = await prisma.iOI.findMany({
        orderBy: { createdAt: "desc" },
        include: { user: true },
      });

      const response = {
        success: true,
        data: {
          totals: {
            registrations: totalRegistrations,
            paid: paidRegistrations,
            unpaid: totalRegistrations - paidRegistrations,
            paymentPercentage:
              totalRegistrations > 0
                ? Math.round((paidRegistrations / totalRegistrations) * 100)
                : 0,
          },
          distributions: {
            paymentStatus: paymentStatusDistribution.map((p) => ({
              status: p.paymentMade,
              count: p._count._all,
            })),
            schools: schoolDistribution.map((s) => ({
              school: s.schoolName || "Unknown",
              count: s._count.schoolName,
            })),
            cities: cityDistribution.map((c) => ({
              city: c.city || "Unknown",
              count: c._count.city,
            })),
            grades: gradeDistribution.map((g) => ({
              grade: g.grade ? g.grade.toString() : "Unknown",
              count: g._count.grade,
            })),
          },
          recentRegistrations: recentRegistrations.map((r) => ({
            id: r.id,
            name: r.fullName,
            email: r.email,
            candidateContact: r.candidateContact.toString(),
            candidateAdhaar: r.candidateAdhaar.toString(),
            schoolName: r.schoolName,
            city: r.city,
            grade: r.grade.toString(),
            codeforcesUsername: r.codeforcesUsername,
            codeforcesRating: r.codeforcesRating
              ? r.codeforcesRating.toString()
              : null,
            codechefUsername: r.codechefUsername,
            codechefRating: r.codechefRating
              ? r.codechefRating.toString()
              : null,
            olympiadParticipationHistory: r.olympiadParticipationHistory,
            CPAchievements: r.CPAchievements,
            chennaiParticipation: r.chennaiParticipation,
            volunteerInterest: r.volunteerInterest,
            campInterest: r.campInterest,
            guardianName: r.guardianName,
            guardianContact: r.guardianContact.toString(),
            guardianEmail: r.guardianEmail,
            TShirtSize: r.TShirtSize,
            allergies: r.allergies,
            paymentStatus: r.paymentMade,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          })),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      console.error("Error fetching IOI analytics:", error);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

app.post(
  "/admin/verify-qr",
  authenticateAdmin,
  async (req: AdminAuthenticatedRequest, res: Response) => {
    try {
      const { qrHash } = req.body;

      if (!qrHash) {
        res.status(400).json({ error: "QR token is required" });
        return;
      }

      let decoded:
        | undefined
        | {
            userId: string;
            ioiId: string;
            email: string;
          };
      try {
        decoded = verify(qrHash, process.env.JWT_SECRET! || "123123") as {
          userId: string;
          ioiId: string;
          email: string;
        };
      } catch {
        res.status(401).json({ error: "Invalid or expired QR code" });
        return;
      }

      const user = await prisma.iOI.findUnique({
        where: { id: decoded.ioiId },
        include: { user: true },
      });

      if (!user) {
        res.status(404).json({ error: "Registration not found" });
        return;
      }

      const existingCheckIn = await prisma.eventCheckIn.findFirst({
        where: { ioiId: decoded.ioiId },
      });

      if (existingCheckIn) {
        res.status(409).json({
          error: "Already checked in",
          attendee: {
            id: user.id,
            name: user.fullName,
            email: user.email,
            school: user.schoolName,
            city: user.city,
            grade: user.grade.toString(),
            paymentStatus: user.paymentMade,
            checkedInAt: existingCheckIn.createdAt,
          },
        });
        return;
      }

      const checkIn = await prisma.eventCheckIn.create({
        data: {
          ioiId: decoded.ioiId,
          checkedInBy: req.admin?.email || "system",
        },
        include: {
          ioi: true,
        },
      });

      res.status(200).json({
        success: true,
        attendee: {
          id: checkIn.ioi.id,
          name: checkIn.ioi.fullName,
          email: checkIn.ioi.email,
          school: checkIn.ioi.schoolName,
          city: checkIn.ioi.city,
          grade: checkIn.ioi.grade.toString(),
          paymentStatus: checkIn.ioi.paymentMade,
          checkedInAt: checkIn.createdAt,
        },
      });
    } catch (error) {
      console.error("Error verifying QR code:", error);
      res.status(500).json({ error: "Failed to verify QR code" });
    }
  }
);

app.post("/admin/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const admin = await prisma.admin.findFirst({
      where: { email },
    });

    if (!admin) {
      res.status(400).json({ message: "Invalid email or password" });
      return;
    }

    const validPassword = await compare(password, admin.password);
    if (!validPassword) {
      res.status(400).json({ message: "Invalid email or password" });
      return;
    }

    const token = sign(
      { id: admin.id, email: admin.email },
      process.env.JWT_SECRET! || "123123",
      { expiresIn: "365d" }
    );
    res.status(200).json({ message: "Admin logged in successfully", token });
  } catch (error) {
    console.error("Error signing in admin:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/admin/registrations/export", async (req: Request, res: Response) => {
  try {
    const registrations = await prisma.iOI.findMany({
      include: {
        user: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const csvData = registrations.map((reg) => ({
      id: reg.id,
      fullName: reg.fullName,
      email: reg.email,
      DOB: reg.DOB.toISOString().split("T")[0],
      candidateContact: reg.candidateContact.toString(),
      candidateAdhaar: reg.candidateAdhaar?.toString() || "",
      schoolName: reg.schoolName,
      city: reg.city,
      grade: reg.grade.toString(),
      codeforcesUsername: reg.codeforcesUsername || "",
      codeforcesRating: reg.codeforcesRating?.toString() || "",
      codechefUsername: reg.codechefUsername || "",
      codechefRating: reg.codechefRating?.toString() || "",
      olympiadParticipationHistory: reg.olympiadParticipationHistory,
      olympiadPerformance: reg.olympiadPerformance || "",
      CPAchievements: reg.CPAchievements || "",
      chennaiParticipation: reg.chennaiParticipation,
      volunteerInterest: reg.volunteerInterest,
      campInterest: reg.campInterest,
      guardianName: reg.guardianName,
      guardianContact: reg.guardianContact.toString(),
      guardianEmail: reg.guardianEmail,
      TShirtSize: reg.TShirtSize,
      allergies: reg.allergies || "",
      paymentStatus: reg.paymentMade,
      createdAt: reg.createdAt.toISOString(),
      updatedAt: reg.updatedAt.toISOString(),
    }));

    const headers = Object.keys(csvData[0]).join(",");
    const rows = csvData.map((row) => {
      return Object.values(row)
        .map((value) => {
          if (value === null || value === undefined) {
            return "";
          }
          if (typeof value === "string") {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(",");
    });

    const csvContent = [headers, ...rows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=registrations_export.csv"
    );
    res.status(200).send(csvContent);
  } catch (error) {
    console.error("Export failed:", error);
    res.status(500).json({ error: "Failed to export registrations" });
  }
});

app.listen(process.env.PORT || 5261, () => {
  console.log(`Server is running on port ${process.env.PORT || 5261}`);
});
