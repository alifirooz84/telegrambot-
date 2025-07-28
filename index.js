const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// مقداردهی به بات تلگرام در حالت بدون polling چون وبهوک استفاده می‌کنیم
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });

const dbFile = "db.json";

// ساخت فایل db.json اگر وجود نداشت
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, "{}");

function readDB() {
    return JSON.parse(fs.readFileSync(dbFile, "utf8"));
}

function writeDB(data) {
    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

// مدیریت پیام‌های دریافتی
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = (msg.text || "").trim();
    const db = readDB();

    if (!db[chatId]) {
        db[chatId] = { step: "awaiting_customer" };
        writeDB(db);
        return bot.sendMessage(chatId, "لطفاً شماره مشتری را وارد کنید:");
    }

    const user = db[chatId];

    if (user.step === "awaiting_customer") {
        if (!/^\d{4,15}$/.test(text)) {
            return bot.sendMessage(chatId, "شماره مشتری معتبر نیست. لطفاً دوباره وارد کنید:");
        }
        user.customer = text;
        user.step = "waiting_for_expert";
        writeDB(db);

        return bot.sendMessage(chatId, "لطفاً کارشناس را انتخاب کنید:", {
            reply_markup: {
                keyboard: [["علی رضایی"], ["علی فیروز"]],
                one_time_keyboard: true,
                resize_keyboard: true,
            },
        });
    }

    if (user.step === "waiting_for_expert") {
        if (!["علی رضایی", "علی فیروز"].includes(text)) {
            return bot.sendMessage(chatId, "لطفاً یکی از گزینه‌های کارشناس را از دکمه‌ها انتخاب کنید.");
        }
        user.expert = text;
        user.step = "done";
        writeDB(db);

        try {
            const response = await axios.post(
                "https://pestehiran.shop/wp-json/gf/v2/forms/1/submissions",
                {
                    "5": user.customer,  // فیلد شماره مشتری در گرویتی فرم
                    "6": user.expert,    // فیلد نام کارشناس در گرویتی فرم
                },
                {
                    auth: {
                        username: process.env.WP_USER,
                        password: process.env.WP_PASS,
                    },
                }
            );
            await bot.sendMessage(chatId, "✅ اطلاعات با موفقیت ارسال شد.");
        } catch (error) {
            console.error("خطا در ارسال:", error.response?.data || error.message);
            await bot.sendMessage(chatId, "❌ خطا در ارسال اطلاعات.");
        }
    } else if (user.step === "done") {
        bot.sendMessage(chatId, "برای ثبت اطلاعات جدید، لطفاً /start را ارسال کنید.");
    }
});

// راه‌اندازی وبهوک برای گرفتن آپدیت‌ها از تلگرام
app.post("/webhook", (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// شروع سرور
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Bot server is running on port ${PORT}`);
});
