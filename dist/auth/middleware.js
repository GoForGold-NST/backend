"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = authenticateAdmin;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function authenticateAdmin(req, res, next) {
    const token = req.header("Authorization");
    if (!token) {
        return res
            .status(401)
            .json({ message: "Access denied. No token provided." });
    }
    try {
        const verified = jsonwebtoken_1.default.verify(token.split(" ")[1], process.env.JWT_SECRET);
        req.admin = verified;
        next();
    }
    catch (error) {
        console.error("JWT Verification Error:", error);
        res.status(400).json({ message: "Invalid token" });
    }
}
