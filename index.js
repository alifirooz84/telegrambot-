import { Telegraf, Markup } from "telegraf";
import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const WEBHOOK_PATH = `/telegraf/${process.env.BOT_TOKEN}`;
const WEBHOOK_URL = process.env.WEBHOOK_URL + WEBHOOK_PATH;

// یک آبجکت برای ذخیره اطلاعات کارشناسان (در حالت واقعی از دیتابیس استفاده کن)
const experts = {
  // chat_id کارشناس: { name: نام کارشناس, phone: شماره تماس }
  123456789: { name: "علی رضایی", phone: "09170324187" },
  987654321: { name: "علی فیروز", phone: "09135197039" },
};

// آبجکت برای ذخیره موقتی شماره مشتریان (برای هر کارشناس)
const customerNumbers = {};

// دستور استارت ربات
bot.start((ctx) => {
  ctx.reply(
    "سلام!\nشماره مشتری رو بفرستید تا ثبت کنم."
  );
});

// گرفتن پیام متنی (شماره مشتری یا انتخاب کارشناس)
bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  // اگر کارشناس نیست
  if (!experts[chatId]) {
    return ctx.reply("شما کارشناس فروش نیستید و اجازه استفاده ندارید.");
  }

  // اگر شماره مشتری قبلا ذخیره نشده، الان ذخیره کنیم و گزینه کارشناس رو بفرستیم
  if (!customerNumbers[chatId]) {
    if (!/^\d+$/.test(text)) {
      return ctx.reply("لطفا فقط عدد شماره مشتری را ارسال کنید.");
    }
    customerNumbers[chatId] = text;

    // ارسال دو گزینه برای انتخاب کارشناس
    return ctx.reply(
      "کارشناس مربوطه را انتخاب کنید:",
      Markup.inlineKeyboard([
        Markup.button.callback("علی رضایی", "select_expert_ali_rezaei"),
        Markup.button.callback("علی فیروز", "select_expert_ali_firooz"),
      ])
    );
  }

  // اگر شماره مشتری ذخیره شده بود ولی کارشناس انتخاب نشده
  return ctx.reply("لطفا از دکمه‌ها کارشناس را انتخاب کنید.");
});

// هندلر کلیک دکمه‌ها
bot.action(/select_expert_(.+)/, async (ctx) => {
  const chatId = ctx.chat.id;
  const expertKey = ctx.match[1]; // مثل ali_rezaei یا ali_firooz

  if (!customerNumbers[chatId]) {
    return ctx.reply("ابتدا شماره مشتری را ارسال کنید.");
  }

  // پیدا کردن نام کارشناس و شماره از experts بر اساس انتخاب
  let expertInfo = null;
  if (expertKey === "ali_rezaei") {
    expertInfo = { name: "علی رضایی", phone: "09170324187" };
  } else if (expertKey === "ali_firooz") {
    expertInfo = { name: "علی فیروز", phone: "09135197039" };
  }

  if (!expertInfo) {
    return ctx.reply("انتخاب نامعتبر است.");
  }

  const customerNumber = customerNumbers[chatId];

  // ارسال داده‌ها به فرم گرویتی فرم
  try {
    const response = await axios.post(
      "https://pestehiran.shop/wp-json/gf/v2/forms/1/submissions",
      {
        input_values: {
          7: customerNumber, // فیلد شماره مشتری
          6: expertInfo.name, // فیلد نام کارشناس
        },
      },
      {
        auth: {
          username: process.env.WP_USER,
          password: process.env.WP_PASS,
        },
      }
    );

    await ctx.reply(
      `اطلاعات ثبت شد:\nشماره مشتری: ${customerNumber}\nکارشناس: ${expertInfo.name}`
    );

    // پاک کردن شماره مشتری بعد از ارسال موفق
    delete customerNumbers[chatId];
  } catch (error) {
    console.error("خطا در ارسال به گرویتی فرم:", error);
    await ctx.reply("خطا در ثبت اطلاعات. لطفا بعدا دوباره تلاش کنید.");
  }

  // پاسخ به callback query را حتما باید ارسال کنیم تا دکمه‌ها لود نشوند
  await ctx.answerCbQuery();
});

// ست کردن وبهوک
(async () => {
  try {
    await bot.telegram.setWebhook(WEBHOOK_URL);
    console.log("Webhook set to", WEBHOOK_URL);
  } catch (error) {
    console.error("Error setting webhook:", error);
  }
})();

// middleware وبهوک
app.use(bot.webhookCallback(WEBHOOK_PATH));

// استارت سرور
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
