import 'dotenv/config';
import express from 'express';
import { Telegraf } from 'telegraf';
import axios from 'axios';
import basicAuth from 'basic-auth';

const botToken = process.env.BOT_TOKEN;
const gfApiUrl = process.env.GF_API_URL;  // مثلا: https://pestehiran.shop/wp-json/gf/v2/forms/1/submissions
const gfUser = process.env.GF_USER;
const gfPass = process.env.GF_PASS;

const PORT = process.env.PORT || 3000;

if (!botToken || !gfApiUrl || !gfUser || !gfPass) {
  console.error("Missing environment variables!");
  process.exit(1);
}

const app = express();
app.use(express.json());

const bot = new Telegraf(botToken);

// حافظه ساده برای نگهداری شماره کارشناس با chat_id (برای نمونه ساده، در حافظه نگهداری می‌شود)
const salesExperts = {
  // chat_id: { name: "علی رضایی", phone: "0912xxxxxxx" }
};

// Middleware ساده برای Basic Auth (در صورت نیاز API گرویتی فرم)
function gfAuth(req, res, next) {
  const user = basicAuth(req);
  if (!user || user.name !== gfUser || user.pass !== gfPass) {
    res.set('WWW-Authenticate', 'Basic realm="Gravity Forms API"');
    return res.status(401).send('Authentication required.');
  }
  next();
}

// روت برای ست کردن وبهوک تلگرام (فقط یکبار اجرا کن)
app.get('/setWebhook', async (req, res) => {
  const webhookUrl = `https://${req.headers.host}/telegraf/${bot.secretPathComponent()}`;
  try {
    await bot.telegram.setWebhook(webhookUrl);
    res.send(`Webhook set to: ${webhookUrl}`);
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to set webhook.");
  }
});

// روت برای دریافت وبهوک از تلگرام
app.use(bot.webhookCallback(`/telegraf/${bot.secretPathComponent()}`));

// فرمان /start
bot.start((ctx) => ctx.reply("سلام! لطفا شماره مشتری را ارسال کنید."));

// ذخیره شماره مشتری و درخواست انتخاب کارشناس
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  // اگر کارشناس برای این chat_id ذخیره شده، فرض می‌کنیم شماره مشتری را گرفته ایم و ارسال می کنیم به گرویتی فرم
  if (salesExperts[chatId]) {
    // ارسال به گرویتی فرم
    const salesExpertName = salesExperts[chatId].name;
    const salesExpertPhone = salesExperts[chatId].phone;

    try {
      await axios.post(
        gfApiUrl,
        {
          input_values: {
            6: salesExpertName,   // نام کارشناس (ID=6)
            7: text              // شماره مشتری (ID=7)
          }
        },
        {
          auth: {
            username: gfUser,
            password: gfPass
          }
        }
      );
      await ctx.reply(`شماره مشتری ${text} با موفقیت به فرم ارسال شد.`);
    } catch (error) {
      console.error("Error sending to Gravity Forms:", error);
      await ctx.reply("خطا در ارسال اطلاعات به فرم. لطفا بعدا تلاش کنید.");
    }
  } else {
    // اگر کارشناس هنوز ثبت نشده، از کاربر بخواه نام و شماره خود را ارسال کند یا انتخاب کند
    // برای نمونه، در اینجا فرض می‌کنیم فقط دو کارشناس وجود دارد و گزینه می‌دهیم
    await ctx.reply(
      "لطفا کارشناس خود را انتخاب کنید:",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "علی رضایی", callback_data: "sales_alirez" }],
            [{ text: "علی فیروز", callback_data: "sales_alifir" }]
          ]
        }
      }
    );

    // ذخیره شماره مشتری موقت (اگر میخوای ذخیره کنی، می‌تونی اینجا بگذاری)
    salesExperts[chatId] = { waitingForSalesExpert: true, phone: null, name: null, customerPhone: text };
  }
});

// پاسخ به انتخاب کارشناس
bot.on('callback_query', async (ctx) => {
  const chatId = ctx.chat.id;
  const data = ctx.callbackQuery.data;

  if (!salesExperts[chatId] || !salesExperts[chatId].waitingForSalesExpert) {
    return ctx.answerCbQuery("ابتدا شماره مشتری را ارسال کنید.");
  }

  let salesExpertName = "";
  if (data === "sales_alirez") salesExpertName = "علی رضایی";
  else if (data === "sales_alifir") salesExpertName = "علی فیروز";
  else return ctx.answerCbQuery("گزینه نامعتبر است.");

  salesExperts[chatId].name = salesExpertName;
  salesExperts[chatId].phone = "شماره تماس کارشناس"; // در صورت تمایل می‌توان این شماره را هم پرسید یا ثابت قرار داد
  salesExperts[chatId].waitingForSalesExpert = false;

  // حالا شماره مشتری را داریم (از متن قبلی)
  const customerPhone = salesExperts[chatId].customerPhone;

  try {
    await axios.post(
      gfApiUrl,
      {
        input_values: {
          6: salesExpertName,
          7: customerPhone
        }
      },
      {
        auth: {
          username: gfUser,
          password: gfPass
        }
      }
    );
    await ctx.reply(`شماره مشتری ${customerPhone} با موفقیت ثبت شد.`);
  } catch (error) {
    console.error("Error sending to Gravity Forms:", error);
    await ctx.reply("خطا در ارسال اطلاعات به فرم. لطفا بعدا تلاش کنید.");
  }

  await ctx.answerCbQuery();
});

app.listen(PORT, () => {
  console.log(`Bot server is running on port ${PORT}`);
});
