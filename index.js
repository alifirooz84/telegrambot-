require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");
const express = require("express");

const bot = new TelegramBot(process.env.BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 10000;

const experts = require("./experts");

const DATA_FILE = "./data.json";
let userStates = {};
let expertCache = {};

// بارگذاری اطلاعات کارشناسان از فایل
if (fs.existsSync(DATA_FILE)) {
  expertCache = JSON.parse(fs.readFileSync(DATA_FILE));
}

// ذخیره‌سازی دائمی
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(expertCache, null, 2));
}

// دریافت شماره مشتری
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // اگر در مرحله انتخاب کارشناس هست
  if (userStates[chatId] && userStates[chatId].stage === "awaiting_expert") return;

  // اگر کاربر قبلاً ثبت شده است
  if (expertCache[chatId]) {
    const expert = expertCache[chatId];
    sendToGravityForm(text, expert.label, expert.phone, chatId);
    return bot.sendMessage(chatId, "✅ اطلاعات شما ثبت شد.");
  }

  // ذخیره شماره مشتری و نمایش گزینه‌های کارشناس
  userStates[chatId] = {
    stage: "awaiting_expert",
    customerNumber: text
  };

  const expertOptions = Object.keys(experts).map((key) => {
    return [{ text: experts[key].label, callback_data: key }];
  });

  expertOptions.push([{ text: "❌ انصراف از ارسال", callback_data: "cancel_submission" }]);

  bot.sendMessage(chatId, "لطفاً یکی از کارشناسان را انتخاب کنید:", {
    reply_markup: {
      inline_keyboard: expertOptions
    }
  });
});

// انتخاب کارشناس
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === "cancel_submission") {
    userStates[chatId] = null;
    return bot.sendMessage(chatId, "❌ ارسال اطلاعات لغو شد. برای شروع دوباره، شماره مشتری را وارد کنید.");
  }

  const expertInfo = experts[data];
  if (!expertInfo) return bot.sendMessage(chatId, "❌ کارشناس نامعتبر است.");

  expertCache[chatId] = {
    label: expertInfo.label,
    phone: expertInfo.phone
  };
  saveData();

  const customerNumber = userStates[chatId]?.customerNumber || "نامشخص";
  userStates[chatId] = null;

  sendToGravityForm(customerNumber, expertInfo.label, expertInfo.phone, chatId);
  bot.sendMessage(chatId, "✅ اطلاعات شما ثبت شد.");
});

// ارسال به Gravity Form
function sendToGravityForm(customerNumber, expertName, expertPhone, chatId) {
  const auth = Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString("base64");

  const data = {
    "input_5": customerNumber,
    "input_6": `${expertName} (${expertPhone})`
  };

  axios
    .post(`${process.env.API_BASE}/forms/1/submissions`, data, {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json"
      }
    })
    .then(() => {
      console.log(`✅ اطلاعات مشتری ${customerNumber} از ${expertName} ارسال شد.`);
    })
    .catch((error) => {
      console.error("❌ خطا در ارسال اطلاعات:", error.response?.data || error.message);
      bot.sendMessage(chatId, "❌ خطا در ثبت اطلاعات، لطفاً دوباره تلاش کنید.");
    });
}

// راه‌اندازی سرور برای webhook
app.use(express.json());
app.post(`/webhook/${process.env.BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});
app.listen(PORT, () => {
  console.log(`🤖 Bot is running on port ${PORT}`);
});
