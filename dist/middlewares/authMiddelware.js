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
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = require("jsonwebtoken");
const index_1 = require("../index");
const authMiddleware = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const token = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a.token;
    if (!token) {
        res.status(401).json({ error: "No token found" });
        return;
    }
    try {
        const decoded = (0, jsonwebtoken_1.verify)(token, process.env.JWT_SECRET || "123123");
        const user = yield index_1.prisma.user.findUnique({
            where: { id: decoded.id },
        });
        if (!user) {
            res.clearCookie("token");
            res.status(401).json({ error: "Invalid token" });
            return;
        }
        req.userId = decoded.id;
        next();
    }
    catch (error) {
        console.error("JWT Verification Error:", error);
        res.clearCookie("token");
        res.status(401).json({ error: "Invalid token" });
        return;
    }
});
exports.default = authMiddleware;
