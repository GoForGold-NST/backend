"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const express_1 = __importDefault(require("express"));
const client_1 = require("../prisma/generated/client");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const jsonwebtoken_1 = require("jsonwebtoken");
const bcryptjs_1 = require("bcryptjs");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const authMiddelware_1 = __importDefault(require("./middlewares/authMiddelware"));
const IOIMiddleware_1 = __importDefault(require("./middlewares/IOIMiddleware"));
const multer_1 = __importDefault(require("multer"));
const csv_parser_1 = __importDefault(require("csv-parser"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const qrcode_1 = __importDefault(require("qrcode"));
const nodemailer_1 = __importDefault(require("nodemailer"));
exports.prisma = new client_1.PrismaClient();
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND,
    credentials: true,
}));
var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus["pending"] = "pending";
    PaymentStatus["success"] = "success";
})(PaymentStatus || (PaymentStatus = {}));
var YesNo;
(function (YesNo) {
    YesNo["YES"] = "YES";
    YesNo["NO"] = "NO";
})(YesNo || (YesNo = {}));
const upload = (0, multer_1.default)({ dest: "uploads/" });
const createTransporter = () => {
    if (!process.env.SMTP_HOST) {
        console.warn("SMTP configuration not set - email functionality will be disabled");
        return null;
    }
    return nodemailer_1.default.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
        },
    });
};
const generateQR = (text) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        return yield qrcode_1.default.toDataURL(text);
    }
    catch (err) {
        console.error("QR generation error:", err);
        throw err;
    }
});
// User routes
app.post("/register", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, email, password } = req.body;
        console.log(name, email, password);
        res.clearCookie("token");
        if (!name || !email || !password) {
            res.status(400).json({ error: "All fields are required" });
            return;
        }
        const existingUser = yield exports.prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            res.status(409).json({ error: "User already exists" });
            return;
        }
        const hashedPasssword = yield (0, bcryptjs_1.hash)(password, 10);
        const user = yield exports.prisma.user.create({
            data: {
                fullName: name,
                email,
                password: hashedPasssword,
            },
        });
        const jsonWebToken = (0, jsonwebtoken_1.sign)({ id: user.id }, process.env.JWT_SECRET || "123123", {
            expiresIn: "7d",
        });
        res.cookie("token", jsonWebToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 60 * 60 * 24 * 7, // 7 Days
        });
        res.status(201).json({ message: "User created successfully" });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
}));
app.post("/login", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password } = req.body;
        res.clearCookie("token");
        if (!email || !password) {
            res.status(400).json({ error: "All fields are required" });
            return;
        }
        const existingUser = yield exports.prisma.user.findUnique({ where: { email } });
        if (!existingUser) {
            res.status(409).json({ error: "Invalid Credentials" });
            return;
        }
        const isPasswordCorrect = yield (0, bcryptjs_1.compare)(password, existingUser.password);
        if (!isPasswordCorrect) {
            res.status(409).json({ error: "Invalid credentials" });
            return;
        }
        const jsonWebToken = (0, jsonwebtoken_1.sign)({ id: existingUser.id }, process.env.JWT_SECRET || "123123", {
            expiresIn: "7d",
        });
        res.cookie("token", jsonWebToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 60 * 60 * 24 * 7, // 7 Days
        });
        res.status(200).json({ message: "Login successful" });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
}));
app.get("/verify", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = req.cookies.token;
        if (!token) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        try {
            const decoded = (0, jsonwebtoken_1.verify)(token, process.env.JWT_SECRET || "123123");
            const user = yield exports.prisma.user.findUnique({
                where: { id: decoded.id },
            });
            if (!user) {
                res.clearCookie("token");
                res.status(401).json({ error: "Unauthorized" });
                return;
            }
            res.status(200).json({ message: "Authorized" });
        }
        catch (error) {
            console.error(error);
            res.clearCookie("token");
            res.status(401).json({ error: "Unauthorized" });
        }
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
}));
app.get("/logout", (_, res) => {
    res.clearCookie("token");
    res.status(200).json({ message: "Logout successful" });
});
app.post("/registerIOI", authMiddelware_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req;
        const user = yield exports.prisma.user.findUnique({
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
        const { DOB, candidateContact, candidateAdhaar, schoolName, city, grade, codeforcesUsername, codeforcesRating, codechefUsername, codechefRating, olympiadParticipationHistory, olympiadPerformance, CPAchievements, chennaiParticipation, volunteerInterest, campInterest, guardianName, guardianContact, guardianEmail, TShirtSize, allergies, } = req.body;
        if (!DOB ||
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
            !volunteerInterest) {
            res.status(400).json({ error: "All fields are required" });
            return;
        }
        const existingIOI = yield exports.prisma.iOI.findUnique({
            where: { userId },
        });
        if (existingIOI) {
            res.status(409).json({ error: "Already registered" });
            return;
        }
        const ioi = yield exports.prisma.iOI.create({
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
}));
app.get("/verifyIOI", authMiddelware_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req;
        const ioi = yield exports.prisma.iOI.findUnique({
            where: { userId },
        });
        if (!ioi) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        res.status(200).json({ message: "Authorized" });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
}));
app.get("/verifyIOIPaymentNotMade", authMiddelware_1.default, IOIMiddleware_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { ioi } = req;
        if ((ioi === null || ioi === void 0 ? void 0 : ioi.paymentMade) == "success") {
            res.status(401).json({ error: "Already paid" });
            return;
        }
        res.status(200).json({ message: "Not yet paid" });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
}));
app.get("/verifyIOIPaymentMade", authMiddelware_1.default, IOIMiddleware_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { ioi } = req;
        if ((ioi === null || ioi === void 0 ? void 0 : ioi.paymentMade) == "success") {
            res.status(200).json({ message: "Payment Made" });
            return;
        }
        res.status(401).json({ error: "Payment not made" });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
}));
// Admin routes
const authenticateAdmin = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const token = (_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.split(" ")[1];
        if (!token) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const decoded = (0, jsonwebtoken_1.verify)(token, process.env.JWT_SECRET || "123123");
        const admin = yield exports.prisma.admin.findUnique({
            where: { id: decoded.id },
        });
        if (!admin) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        req.admin = admin;
        next();
    }
    catch (error) {
        console.error(error);
        res.status(401).json({ error: "Unauthorized" });
    }
});
app.post("/admin/confirm-payments", authenticateAdmin, upload.single("csvFile"), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.file) {
            res.status(400).json({ error: "No CSV file uploaded" });
            return;
        }
        const filePath = path_1.default.join(process.cwd(), req.file.path);
        const results = [];
        fs_1.default.createReadStream(filePath)
            .pipe((0, csv_parser_1.default)())
            .on("data", (data) => results.push(data))
            .on("end", () => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const processedPayments = [];
                for (const row of results) {
                    const email = row.Email || row.email;
                    if (!email) {
                        console.warn("Skipping row with missing email");
                        continue;
                    }
                    try {
                        const updatedUser = yield exports.prisma.iOI.updateMany({
                            where: { email },
                            data: { paymentMade: "success" },
                        });
                        if (updatedUser.count === 0) {
                            console.warn(`No user found with email: ${email}`);
                            continue;
                        }
                        const user = yield exports.prisma.iOI.findFirst({
                            where: { email },
                            include: { user: true },
                        });
                        if (!user) {
                            console.warn(`User details not found for email: ${email}`);
                            continue;
                        }
                        const qrHash = (0, jsonwebtoken_1.sign)({
                            userId: user.userId,
                            ioiId: user.id,
                            email: user.email,
                        }, process.env.JWT_SECRET || "123123", { expiresIn: "30d" });
                        const qrCode = yield generateQR(qrHash);
                        yield sendPaymentConfirmationEmail(user, qrCode);
                        processedPayments.push({
                            email,
                            name: user.fullName,
                            status: "confirmed",
                        });
                    }
                    catch (error) {
                        console.error(`Error processing ${email}:`, error);
                        processedPayments.push({
                            email,
                            name: "Unknown",
                            status: "failed",
                        });
                    }
                }
                fs_1.default.unlinkSync(filePath);
                res.status(200).json({
                    success: true,
                    processed: processedPayments.filter((p) => p.status === "confirmed").length,
                    failed: processedPayments.filter((p) => p.status === "failed")
                        .length,
                    skipped: results.length - processedPayments.length,
                    payments: processedPayments,
                });
            }
            catch (error) {
                console.error("Error processing CSV:", error);
                res.status(500).json({ error: "Error processing CSV" });
            }
        }));
    }
    catch (error) {
        console.error("Error handling CSV upload:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}));
app.post("/admin/send-reminders", authenticateAdmin, upload.single("csvFile"), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.file) {
            res.status(400).json({ error: "No CSV file uploaded" });
            return;
        }
        const filePath = path_1.default.join(process.cwd(), req.file.path);
        const results = [];
        fs_1.default.createReadStream(filePath)
            .pipe((0, csv_parser_1.default)())
            .on("data", (data) => results.push(data))
            .on("end", () => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const processedReminders = [];
                for (const row of results) {
                    const email = row.Email || row.email;
                    if (!email) {
                        console.warn("Skipping row with missing email");
                        continue;
                    }
                    try {
                        const user = yield exports.prisma.iOI.findFirst({
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
                        yield sendPaymentReminderEmail(user);
                        processedReminders.push({
                            email,
                            name: user.fullName,
                            status: "reminder_sent",
                        });
                    }
                    catch (error) {
                        console.error(`Error processing ${email}:`, error);
                    }
                }
                fs_1.default.unlinkSync(filePath);
                res.status(200).json({
                    success: true,
                    processed: processedReminders.length,
                    failed: results.length - processedReminders.length,
                    reminders: processedReminders,
                });
            }
            catch (error) {
                console.error("Error processing CSV:", error);
                res.status(500).json({ error: "Error processing CSV" });
            }
        }));
    }
    catch (error) {
        console.error("Error handling CSV upload:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}));
const sendPaymentConfirmationEmail = (user, qrCode) => __awaiter(void 0, void 0, void 0, function* () {
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
        yield transporter.sendMail(mailOptions);
        console.log(`Confirmation email sent to ${user.email}`);
    }
    catch (error) {
        console.error(`Error sending confirmation email to ${user.email}:`, error);
    }
});
const sendPaymentReminderEmail = (user) => __awaiter(void 0, void 0, void 0, function* () {
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
            <a href="${process.env.PAYMENT_LINK || "https://yourpaymentlink.com"}" class="button">Complete Payment Now</a>
            
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
        yield transporter.sendMail(mailOptions);
        console.log(`Reminder email sent to ${user.email}`);
    }
    catch (error) {
        console.error(`Error sending reminder email to ${user.email}:`, error);
    }
});
app.get("/admin/analytics/ioi", authenticateAdmin, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const paymentStatusDistribution = yield exports.prisma.iOI.groupBy({
            by: ["paymentMade"],
            _count: {
                paymentMade: true,
                _all: true,
            },
        });
        const schoolDistribution = yield exports.prisma.iOI.groupBy({
            by: ["schoolName"],
            _count: { schoolName: true },
            orderBy: { _count: { schoolName: "desc" } },
            take: 10,
        });
        const cityDistribution = yield exports.prisma.iOI.groupBy({
            by: ["city"],
            _count: { city: true },
            orderBy: { _count: { city: "desc" } },
            take: 10,
        });
        const gradeDistribution = yield exports.prisma.iOI.groupBy({
            by: ["grade"],
            _count: { grade: true },
            orderBy: { grade: "asc" },
        });
        const totalRegistrations = yield exports.prisma.iOI.count();
        const paidRegistrations = yield exports.prisma.iOI.count({
            where: { paymentMade: PaymentStatus.success },
        });
        const recentRegistrations = yield exports.prisma.iOI.findMany({
            take: 10,
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
                    paymentPercentage: totalRegistrations > 0
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
    }
    catch (error) {
        console.error("Error fetching IOI analytics:", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
}));
app.post("/admin/verify-qr", authenticateAdmin, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { qrHash } = req.body;
        if (!qrHash) {
            res.status(400).json({ error: "QR token is required" });
            return;
        }
        let decoded;
        try {
            decoded = (0, jsonwebtoken_1.verify)(qrHash, process.env.JWT_SECRET || "123123");
        }
        catch (err) {
            res.status(401).json({ error: "Invalid or expired QR code" });
            return;
        }
        const user = yield exports.prisma.iOI.findUnique({
            where: { id: decoded.ioiId },
            include: { user: true },
        });
        if (!user) {
            res.status(404).json({ error: "Registration not found" });
            return;
        }
        const existingCheckIn = yield exports.prisma.eventCheckIn.findFirst({
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
        const checkIn = yield exports.prisma.eventCheckIn.create({
            data: {
                ioiId: decoded.ioiId,
                checkedInBy: ((_a = req.admin) === null || _a === void 0 ? void 0 : _a.email) || "system",
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
    }
    catch (error) {
        console.error("Error verifying QR code:", error);
        res.status(500).json({ error: "Failed to verify QR code" });
    }
}));
app.post("/admin/register", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password } = req.body;
    try {
        const adminExists = yield exports.prisma.admin.findFirst({
            where: { email },
        });
        if (adminExists) {
            res.status(400).json({ message: "Admin already exists" });
            return;
        }
        const hashedPassword = yield (0, bcryptjs_1.hash)(password, 10);
        const newAdmin = yield exports.prisma.admin.create({
            data: { email, password: hashedPassword },
        });
        res
            .status(201)
            .json({ message: "Admin registered successfully", admin: newAdmin });
    }
    catch (error) {
        console.error("Error registering admin:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}));
app.post("/admin/login", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password } = req.body;
    try {
        const admin = yield exports.prisma.admin.findFirst({
            where: { email },
        });
        if (!admin) {
            res.status(400).json({ message: "Invalid email or password" });
            return;
        }
        const validPassword = yield (0, bcryptjs_1.compare)(password, admin.password);
        if (!validPassword) {
            res.status(400).json({ message: "Invalid email or password" });
            return;
        }
        const token = (0, jsonwebtoken_1.sign)({ id: admin.id, email: admin.email }, process.env.JWT_SECRET || "123123", { expiresIn: "1d" });
        res.status(200).json({ message: "Admin logged in successfully", token });
    }
    catch (error) {
        console.error("Error signing in admin:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}));
app.listen(3000, () => {
    console.log("Server is running on port 3000");
});
