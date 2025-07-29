require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);
const PORT = process.env.PORT || 10000;

const dbFile = './db.json';
let db = fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile)) : {};

function saveDB() {
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
}

bot.start((ctx) => {
  const chatId = String(ctx.chat.id);
  db[chatId] = { step: "get_customer" };
  saveDB();
  ctx.reply("لطفاً شماره مشتری را وارد کنید:");
});

bot.on('text', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const text = ctx.message.text.trim();

  if (!db[chatId]) {
    db[chatId] = { step: "get_customer" };
    saveDB();
    return ctx.reply("لطفاً شماره مشتری را وارد کنید:");
  }

  const user = db[chatId];

  if (user.step === "get_customer") {
    if (!/^\d{4,15}$/.test(text)) {
      return ctx.reply("شماره مشتری نامعتبر است. لطفاً دوباره وارد کنید:");
    }
    user.customer = text;
    user.step = "choose_expert";
    saveDB();

    return ctx.reply(
      "کارشناس مورد نظر را انتخاب کنید:",
      Markup.keyboard([["علی رضایی"], ["علی فیروز"]])
        .oneTime()
        .resize()
    );
  }

  if (user.step === "choose_expert") {
    if (!["علی رضایی", "علی فیروز"].includes(text)) {
      return ctx.reply("لطفاً یکی از گزینه‌های بالا را انتخاب کنید.");
    }

    user.expert = text;
    user.step = "done";
    saveDB();

    // ارسال به گرویتی فرم
    try {
      const response = await axios.post(
        "https://pestehiran.shop/wp-json/gf/v2/forms/1/submissions",
        {
          6: user.expert,    // فیلد نام کارشناس
          8: user.customer   // فیلد شماره مشتری
        },
        {
          auth: {
            username: process.env.WP_USER,
            password: process.env.WP_PASS,
          },
        }
      );

      if (response.status === 200 || response.status === 201) {
        ctx.reply("✅ اطلاعات با موفقیت ارسال شد.");
      } else {
        ctx.reply("❌ خطا در ثبت اطلاعات. لطفاً دوباره تلاش کنید.");
      }
    } catch (err) {
      console.error("خطا در ارسال:", err.response?.data || err.message);
      ctx.reply("❌ خطا در ارسال اطلاعات. لطفاً بعداً دوباره امتحان کنید.");
    }

    // پاک کردن وضعیت کاربر بعد از ارسال
    delete db[chatId];
    saveDB();

    return;
  }

  if (user.step === "done") {
    return ctx.reply("برای ثبت اطلاعات جدید، لطفاً /start را ارسال کنید.");
  }
});

app.use(bot.webhookCallback("/webhook"));
bot.telegram.setWebhook(`https://telegrambot-p9dz.onrender.com/webhook`);

app.listen(PORT, () => {
  console.log(`Bot server is running on port ${PORT}`);
});
