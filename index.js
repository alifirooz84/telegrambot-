const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const bot = new TelegramBot(process.env.BOT_TOKEN);
const dbFile = "db.json";

// ایجاد فایل اگر وجود ندارد
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, "{}");

function readDB() {
  return JSON.parse(fs.readFileSync(dbFile, "utf8"));
}

function writeDB(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

// دریافت پیام از کاربر
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  const db = readDB();

  // اگر پیام /start بود، مرحله کاربر ریست شود
  if (text === "/start") {
    db[chatId] = { step: "get_customer" };
    writeDB(db);
    return bot.sendMessage(chatId, "سلام! لطفاً شماره مشتری را وارد کنید:");
  }

  // اگر کاربر جدید بود یا مرحله نداشت، مرحله را تنظیم کن
  if (!db[chatId]) {
    db[chatId] = { step: "get_customer" };
    writeDB(db);
    return bot.sendMessage(chatId, "لطفاً شماره مشتری را وارد کنید:");
  }

  const user = db[chatId];

  if (user.step === "get_customer") {
    if (!/^\d{4,15}$/.test(text)) {
      return bot.sendMessage(chatId, "شماره مشتری نامعتبر است. لطفاً دوباره وارد کنید:");
    }
    user.customer = text;
    user.step = "choose_expert";
    writeDB(db);

    return bot.sendMessage(chatId, "کارشناس مورد نظر را انتخاب کنید:", {
      reply_markup: {
        keyboard: [["علی رضایی"], ["علی فیروز"]],
        one_time_keyboard: true,
        resize_keyboard: true,
      },
    });
  }

  if (user.step === "choose_expert") {
    const expert = text;
    if (!["علی رضایی", "علی فیروز"].includes(expert)) {
      return bot.sendMessage(chatId, "لطفاً یکی از گزینه‌های بالا را انتخاب کنید.");
    }

    user.expert = expert;
    user.step = "done";
    writeDB(db);

    // ارسال به گرویتی فرم
    try {
      const response = await axios.post(
        "https://pestehiran.shop/wp-json/gf/v2/forms/1/submissions",
        {
          "5": user.customer, // فیلد شماره مشتری
          "6": user.expert,   // فیلد نام کارشناس
        },
        {
          auth: {
            username: process.env.WP_USER,
            password: process.env.WP_PASS,
          },
        }
      );

      await bot.sendMessage(chatId, "✅ اطلاعات با موفقیت ارسال شد.");
    } catch (err) {
      console.error("خطا در ارسال:", err.response?.data || err.message);
      await bot.sendMessage(chatId, "❌ خطا در ارسال اطلاعات.");
    }
  } else if (user.step === "done") {
    bot.sendMessage(chatId, "برای ثبت اطلاعات جدید، لطفاً /start را ارسال کنید.");
  }
});

// راه‌اندازی وبهوک
app.post("/webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Bot server is running on port ${PORT}`);
});
