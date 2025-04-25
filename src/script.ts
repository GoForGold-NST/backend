import express from "express";
import multer from "multer";
import csv from "csv-parser";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import authenticateAdmin from "./auth/middleware.ts";
import { PrismaClient } from "@prisma/client";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { configDotenv } from "dotenv";
const app = express();
configDotenv();
app.use(express.json());
app.use(cors());

const upload = multer({ dest: "uploads/" });

const prisma = new PrismaClient();

const generateQR = async (text) => {
  try {
    return await QRCode.toDataURL(text);
  } catch (err) {
    console.error("QR generation error:", err);
    throw err;
  }
};

const createTransporter = () => {
  if (!process.env.SMTP_HOST) {
    console.warn(
      "SMTP configuration not set - email functionality will be disabled"
    );
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
};

app.post(
  "/admin/import-csv",
  authenticateAdmin,
  upload.single("csvFile"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No CSV file uploaded" });
      }

      const filePath = path.join(process.cwd(), req.file.path);
      const results = [];

      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (data) => results.push(data))
        .on("end", async () => {
          try {
            const processedUsers = [];

            for (const row of results) {
              const curCSV = {
                name: row.Name || row.name || "",
                email: row.Email || row.email || "",
                phone: row.Phone || row.phone || "",
                type: row.Type || row.type || null,
                event: row.Event || row.event || null,
                paid:
                  (row.Paid || row.paid || "").toString().toLowerCase() ===
                  "yes",
                college: row.College || row.college || null,
                accomodation:
                  (row.Accomodation || row.accomodation || "")
                    .toString()
                    .toLowerCase() === "yes",
                stream: row.Stream || row.stream || null,
                year: row.Year || row.year || null,
              };

              try {
                const user = await prisma.user.upsert({
                  where: { email: curCSV.email },
                  update: curCSV,
                  create: curCSV,
                });

                const registration = await prisma.registration.create({
                  data: {
                    userId: user.id,
                  },
                });

                const qrHash = jwt.sign(
                  {
                    userId: user.id,
                    registrationId: registration.id,
                  },
                  process.env.JWT_SECRET,
                  { expiresIn: "30d" }
                );

                const qrCode = await generateQR(qrHash);

                await prisma.registration.update({
                  where: { id: registration.id },
                  data: {
                    qrCodeDay1: qrCode,
                    qrHashDay1: qrHash,
                  },
                });

                await sendUserEmail(user, {
                  registrationId: registration.id,
                  qrCode: qrCode,
                  event: user.event,
                });

                processedUsers.push(user);
              } catch (error) {
                console.error(
                  `Error processing ${row.Email || row.email}:`,
                  error
                );
              }
            }

            fs.unlinkSync(filePath);
            res.status(200).json({
              success: true,
              processed: processedUsers.length,
              failed: results.length - processedUsers.length,
              users: processedUsers,
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

const sendUserEmail = async (user, data) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.warn("SMTP not configured - email not sent");
      return;
    }

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>Neutron Fest</title>
        </head>
        <body style="margin:0; padding:0; background-color:#2b2b2b; font-family:Arial, sans-serif; color:#ffffff;">

          <table width="100%" height="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table width="600" style="background-color: #000; border-radius: 16px; text-align: center; box-shadow: 0 0 10px rgba(0,0,0,0.3); overflow: hidden;">

                  <tr>
                    <td style="padding: 40px;">
                      <table width="100%" style="background-color: rgba(0, 0, 0, 0.5); border-radius: 12px; padding: 20px;">

                        <tr>
                          <td style="padding-bottom: 20px;">
                            <img src="https://neutronfest.com/Hero-img/neutron-logo.png" alt="Neutron Fest Logo" width="180">
                          </td>
                        </tr>

                        <tr>
                          <td style="padding-top: 20px;">
                            <h2 style="color: #fbfbfb; font-size: 22px; margin-bottom: 10px;">🎉 Congratulations ${user.name}!</h2>
                            <p style="color: #cccccc; font-size: 16px; margin: 0;">
                              Your registration for <strong>${data.event || "the event"}</strong> has been confirmed.
                            </p>
                          </td>
                        </tr>

                        <tr>
                          <td style="padding: 20px 0;">
                            <hr style="border: 0; height: 1px; background-color: #333;">
                          </td>
                        </tr>

                        <tr>
                          <td style="text-align: left; padding: 0 15px;">
                            <h3 style="color: #fbfbfb; margin-bottom: 15px;">Registration Details</h3>
                            <table width="100%" style="color: #bbbbbb; font-size: 15px; line-height: 1.6;">
                              <tr>
                                <td width="40%" style="padding: 5px 0;"><strong>Name:</strong></td>
                                <td width="60%" style="padding: 5px 0;">${user.name}</td>
                              </tr>
                              <tr>
                                <td width="40%" style="padding: 5px 0;"><strong>Email:</strong></td>
                                <td width="60%" style="padding: 5px 0;">${user.email}</td>
                              </tr>
                              <tr>
                                <td width="40%" style="padding: 5px 0;"><strong>Event:</strong></td>
                                <td width="60%" style="padding: 5px 0;">${data.event || "Neutron Fest 2025"}</td>
                              </tr>
                              <tr>
                                <td width="40%" style="padding: 5px 0;"><strong>Registration ID:</strong></td>
                                <td width="60%" style="padding: 5px 0;">${data.registrationId}</td>
                              </tr>
                              ${
                                user.college
                                  ? `
                              <tr>
                                <td width="40%" style="padding: 5px 0;"><strong>College:</strong></td>
                                <td width="60%" style="padding: 5px 0;">${user.college}</td>
                              </tr>`
                                  : ""
                              }
                            </table>
                          </td>
                        </tr>

                        <tr>
                          <td style="padding: 25px 0;">
                            <h3 style="color: #fbfbfb; margin-bottom: 15px;">Your Event QR Code</h3>
                            <img src="cid:qrcode" alt="Event QR Code" style="width: 200px; height: 200px;"/>
                            <p style="color: #bbbbbb; font-size: 14px; margin-top: 15px;">
                              Please present this QR code at the event venue for check-in on both days.<br>
                              <strong>Note:</strong> This QR code will be valid for Day 1 and Day 2 check-ins.
                            </p>
                          </td>
                        </tr>

                        <tr>
                          <td style="color: #555; font-size: 12px; padding-top: 15px; border-top: 1px solid #333;">
                            This message was sent to: ${user.email}<br>
                            ©️ 2025 Neutron Fest. All rights reserved.
                          </td>
                        </tr>

                      </table>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>

        </body>
        </html>
    `;

    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: user.email,
      subject: `Your ${data.event || "Event"} Registration`,
      html: htmlContent,
      attachments: [
        {
          filename: "qrcode.png",
          content: data.qrCode.split("base64,")[1],
          encoding: "base64",
          cid: "qrcode",
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${user.email}`);
  } catch (error) {
    console.error(`Error sending email to ${user.email}:`, error);
  }
};
// console.log(await bcrypt.hash("admin6", 10));
app.post("/admin/register", async (req, res) => {
  const { email, password, firstName, lastName, phone } = req.body;

  try {
    const adminExists = await prisma.admin.findUnique({
      where: { email },
    });

    if (adminExists) {
      return res.status(400).json({ message: "Admin already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = await prisma.admin.create({
      data: { firstName, lastName, email, password: hashedPassword, phone },
    });

    res
      .status(201)
      .json({ message: "Admin registered successfully", admin: newAdmin });
  } catch (error) {
    console.error("Error registering admin:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const admin = await prisma.admin.findUnique({
      where: { email },
    });

    if (!admin) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const validPassword = await bcrypt.compare(password, admin.password);
    if (!validPassword) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email },
      process.env.JWT_SECRET
    );
    res.status(200).json({ message: "Admin logged in successfully", token });
  } catch (error) {
    console.error("Error signing in admin:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/admin/attendees", authenticateAdmin, async (req, res) => {
  try {
    const attendances = await prisma.attendance.findMany({
      include: {
        user: true,
      },
      orderBy: {
        checkInTime: "desc",
      },
    });

    const formattedAttendees = attendances.map((att) => ({
      id: att.user.id,
      name: att.user.name,
      email: att.user.email,
      phone: att.user.phone,
      type: att.user.type,
      event: att.user.event,
      paid: att.user.paid,
      college: att.user.college,
      accomodation: att.user.accomodation,
      stream: att.user.stream,
      year: att.user.year,
      day: att.day,
      checkInTime: att.checkInTime,
    }));

    res.json({
      count: formattedAttendees.length,
      attendees: formattedAttendees,
    });
  } catch (error) {
    console.error("Error fetching attendees:", error);
    res.status(500).json({ error: "Failed to fetch attendees" });
  }
});

app.post("/admin/verify-attendee", authenticateAdmin, async (req, res) => {
  try {
    const { qrHash, day } = req.body;

    if (!qrHash) {
      return res.status(400).json({ error: "QR token is required" });
    }

    if (!day || (day !== 1 && day !== 2)) {
      return res.status(400).json({ error: "Valid day (1 or 2) is required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(qrHash, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired QR code" });
    }

    const { userId, registrationId } = decoded;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
    });

    if (!registration) {
      return res.status(404).json({ error: "Registration not found" });
    }

    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        userId: userId,
        day: day,
      },
    });

    if (existingAttendance) {
      return res.status(409).json({
        error: `Already checked in for day ${day}`,
        attendee: {
          ...user,
          day: day,
          checkInTime: existingAttendance.checkInTime,
        },
      });
    }

    const admin = await prisma.admin.findUnique({
      where: { id: req.admin.id },
    });

    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    const attendance = await prisma.attendance.create({
      data: {
        registrationId: registrationId,
        userId: userId,
        day: day,
        verifiedBy: admin.email,
      },
      include: {
        user: true,
        admin: true,
      },
    });

    res.status(200).json({
      success: true,
      attendee: {
        ...attendance.user,
        day: attendance.day,
        checkInTime: attendance.checkInTime,
        verifiedBy: attendance.admin.email,
      },
    });
  } catch (error) {
    console.error("Error verifying attendee:", error);
    res.status(500).json({ error: "Failed to verify attendee" });
  }
});

app.get("/admin/analytics", authenticateAdmin, async (req, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const totalRegistrations = await prisma.registration.count();

    const totalAttendancesDay1 = await prisma.attendance.count({
      where: { day: 1 },
    });

    const totalAttendancesDay2 = await prisma.attendance.count({
      where: { day: 2 },
    });

    const today = new Date(new Date().setHours(0, 0, 0, 0));
    const registrationsToday = await prisma.registration.count({
      where: { createdAt: { gte: today } },
    });

    const attendeesTodayDay1 = await prisma.attendance.count({
      where: {
        checkInTime: { gte: today },
        day: 1,
      },
    });

    const attendeesTodayDay2 = await prisma.attendance.count({
      where: {
        checkInTime: { gte: today },
        day: 2,
      },
    });

    const eventDistribution = await prisma.user.groupBy({
      by: ["event"],
      _count: { event: true },
      orderBy: { _count: { event: "desc" } },
    });

    const paymentStatus = await prisma.user.groupBy({
      by: ["paid"],
      _count: { paid: true },
    });

    const accommodationStatus = await prisma.user.groupBy({
      by: ["accomodation"],
      _count: { accomodation: true },
    });

    const universityDistribution = await prisma.user.groupBy({
      by: ["college"],
      _count: { college: true },
      orderBy: { _count: { college: "desc" } },
      take: 10,
    });

    const yearDistribution = await prisma.user.groupBy({
      by: ["year"],
      _count: { year: true },
      orderBy: { year: "asc" },
    });

    const streamDistribution = await prisma.user.groupBy({
      by: ["stream"],
      _count: { stream: true },
      orderBy: { _count: { stream: "desc" } },
    });

    const typeDistribution = await prisma.user.groupBy({
      by: ["type"],
      _count: { type: true },
      orderBy: { _count: { type: "desc" } },
    });

    const attendanceTimelineDay1 = await prisma.$queryRaw`
      SELECT 
        DATE("checkInTime") as date,
        COUNT(*) as count
      FROM "Attendance"
      WHERE "checkInTime" >= NOW() - INTERVAL '7 days' AND day = 1
      GROUP BY DATE("checkInTime")
      ORDER BY date ASC
    `;

    const attendanceTimelineDay2 = await prisma.$queryRaw`
      SELECT 
        DATE("checkInTime") as date,
        COUNT(*) as count
      FROM "Attendance"
      WHERE "checkInTime" >= NOW() - INTERVAL '7 days' AND day = 2
      GROUP BY DATE("checkInTime")
      ORDER BY date ASC
    `;

    const adminActivity = await prisma.attendance.groupBy({
      by: ["verifiedBy", "day"],
      _count: { verifiedBy: true },
      orderBy: { _count: { verifiedBy: "desc" } },
    });

    const usersAttendedBothDays = await prisma.user.count({
      where: {
        attendances: {
          some: { day: 1 },
        },
        AND: [
          {
            attendances: {
              some: { day: 2 },
            },
          },
        ],
      },
    });

    res.json({
      totals: {
        users: totalUsers,
        registrations: totalRegistrations,
        attendancesDay1: totalAttendancesDay1,
        attendancesDay2: totalAttendancesDay2,
        attendanceRateDay1:
          totalRegistrations > 0
            ? (totalAttendancesDay1 / totalRegistrations) * 100
            : 0,
        attendanceRateDay2:
          totalRegistrations > 0
            ? (totalAttendancesDay2 / totalRegistrations) * 100
            : 0,
        usersAttendedBothDays: usersAttendedBothDays,
        returnRate:
          totalAttendancesDay1 > 0
            ? (usersAttendedBothDays / totalAttendancesDay1) * 100
            : 0,
      },
      today: {
        registrations: registrationsToday,
        attendancesDay1: attendeesTodayDay1,
        attendancesDay2: attendeesTodayDay2,
      },
      distributions: {
        events: eventDistribution.map((e) => ({
          event: e.event || "Unknown",
          count: e._count.event,
        })),
        payment: paymentStatus.map((p) => ({
          status: p.paid ? "Paid" : "Unpaid",
          count: p._count.paid,
        })),
        accommodation: accommodationStatus.map((a) => ({
          status: a.accomodation ? "Yes" : "No",
          count: a._count.accomodation,
        })),
        universities: universityDistribution.map((u) => ({
          university: u.college || "Unknown",
          count: u._count.college,
        })),
        years: yearDistribution.map((y) => ({
          year: y.year || "Unknown",
          count: y._count.year,
        })),
        streams: streamDistribution.map((s) => ({
          stream: s.stream || "Unknown",
          count: s._count.stream,
        })),
        types: typeDistribution.map((t) => ({
          type: t.type || "Unknown",
          count: t._count.type,
        })),
      },
      timeline: {
        attendanceDay1: attendanceTimelineDay1.map((a) => ({
          date: a.date,
          count: Number(a.count),
        })),
        attendanceDay2: attendanceTimelineDay2.map((a) => ({
          date: a.date,
          count: Number(a.count),
        })),
      },
      adminActivity: adminActivity.map((a) => ({
        admin: a.verifiedBy,
        day: a.day,
        verifications: a._count.verifiedBy,
      })),
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

app.listen(3000, () => {
  console.log("Server listening on port 3000");
});
