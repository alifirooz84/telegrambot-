import { Telegraf } from "telegraf";
import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// دیتاست ساده برای ذخیره کارشناسان (در عمل باید دیتابیس بزنی)
const experts = {
  "123456789": { name: "علی فیروز", phone: "09135197039" },
  "987654321": { name: "علی رضایی", phone: "09170324187" }
};

// ذخیره شماره مشتری برای هر کارشناس
const clientNumbers = {};

// مسیر وبهوک تلگرام
const webhookPath = `/telegraf/${bot.token.split(':')[1]}`;

// گرفتن شماره مشتری و کارشناس
bot.start((ctx) => {
  ctx.reply("سلام! شماره مشتری رو وارد کن:");
});

bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id.toString();

  // اگر شماره مشتری قبلا ثبت نشده، ثبت کن
  if (!clientNumbers[chatId]) {
    clientNumbers[chatId] = ctx.message.text;
    // ارسال دو گزینه کارشناس به کاربر
    await ctx.reply("کارشناس رو انتخاب کن:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "علی فیروز", callback_data: "expert_ali_firooz" }],
          [{ text: "علی رضایی", callback_data: "expert_ali_rezaei" }]
        ]
      }
    });
  } else {
    await ctx.reply("شماره مشتری قبلا ثبت شده است.");
  }
});

// پاسخ به انتخاب کارشناس
bot.on("callback_query", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const data = ctx.callbackQuery.data;

  let expertKey = null;
  if (data === "expert_ali_firooz") expertKey = "123456789";
  else if (data === "expert_ali_rezaei") expertKey = "987654321";

  if (expertKey) {
    const clientNumber = clientNumbers[chatId];
    const expert = experts[expertKey];

    // ارسال داده به گرویتی فرم
    try {
      const formId = 1;
      const url = `https://pestehiran.shop/wp-json/gf/v2/forms/${formId}/submissions`;
      const basicAuth = Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString("base64");

      const payload = {
        input_values: {
          7: clientNumber, // شماره مشتری
          6: expert.name   // نام کارشناس
        }
      };

      await axios.post(url, payload, {
        headers: {
          "Authorization": `Basic ${basicAuth}`,
          "Content-Type": "application/json"
        }
      });

      await ctx.reply(`اطلاعات با موفقیت ارسال شد.\nکارشناس: ${expert.name}\nشماره مشتری: ${clientNumber}`);
      // پاک کردن شماره مشتری از حافظه
      delete clientNumbers[chatId];
    } catch (error) {
      console.error("Error sending data to Gravity Forms:", error.response?.data || error.message);
      await ctx.reply("خطا در ارسال اطلاعات به سرور.");
    }
  } else {
    await ctx.reply("کارشناس نامعتبر است.");
  }
  await ctx.answerCbQuery();
});

// ست کردن وبهوک در Express
app.use(bot.webhookCallback(webhookPath));

app.get("/", (req, res) => {
  res.send("بات تلگرام فعال است.");
});

// تنظیم وبهوک به تلگرام هنگام استارت سرور
async function setupWebhook() {
  try {
    const url = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}${webhookPath}`;
    await bot.telegram.setWebhook(url);
    console.log("Webhook set at", url);
  } catch (error) {
    console.error("Error setting webhook:", error.response?.data || error.message);
  }
}

app.listen(PORT, async () => {
  console.log(`Bot server is running on port ${PORT}`);
  await setupWebhook();
});
