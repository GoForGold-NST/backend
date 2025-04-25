import Express from "express";
import { PrismaClient } from "../prisma/generated/client";

export const prisma = new PrismaClient();

const app = Express();
app.use(Express.json());

app.post("/register", (_, res) => {
  res.send("Hello World!");
});

app.listen(5261, () => {
  console.log("Server is running on port 5261");
});
