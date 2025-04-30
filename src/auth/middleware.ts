import jwt from "jsonwebtoken";

export default function authenticateAdmin(
  req: { header: (arg0: string) => any; admin: any },
  res: {
    status: (arg0: number) => {
      (): any;
      new (): any;
      json: { (arg0: { message: string }): void; new (): any };
    };
  },
  next: () => void
) {
  const token = req.header("Authorization");

  if (!token) {
    return res
      .status(401)
      .json({ message: "Access denied. No token provided." });
  }

  try {
    const verified = jwt.verify(token.split(" ")[1], process.env.JWT_SECRET!);

    req.admin = verified;
    next();
  } catch (error) {
    console.error("JWT Verification Error:", error);
    res.status(400).json({ message: "Invalid token" });
  }
}
