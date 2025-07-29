import { Telegraf, Markup } from "telegraf";
import fetch from "node-fetch";
import dotenv from "dotenv";
import basicAuth from "basic-auth";
import fs from "fs";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const PORT = process.env.PORT || 10000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

const GRAVITY_FORM_ID = 1;
const FIELD_ID_SALES_EXPERT = 6;
const FIELD_ID_PHONE_NUMBER = 7;

const gravityApiUrl = `https://pestehiran.shop/wp-json/gf/v2/forms/${GRAVITY_FORM_ID}/submissions`;

// ذخیره و خواندن کارشناس‌ها از فایل ساده JSON
const dataFile = './salesExperts.json';
let salesExperts = {};
if (fs.existsSync(dataFile)) {
  salesExperts = JSON.parse(fs.readFileSync(dataFile));
}

// ذخیره تغییرات به فایل
function saveSalesExperts() {
  fs.writeFileSync(dataFile, JSON.stringify(salesExperts, null, 2));
}

// لیست کارشناسان برای انتخاب
const salesExpertsList = [
  { name: "علی رضایی" },
  { name: "علی فیروز" },
];

// ارسال داده به گرویتی فرم با Basic Auth
async function sendToGravityForm(salesExpert, phoneNumber) {
  const body = {
    input_values: {
      [FIELD_ID_SALES_EXPERT]: salesExpert,
      [FIELD_ID_PHONE_NUMBER]: phoneNumber,
    }
  };

  const auth = Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString('base64');

  const response = await fetch(gravityApiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gravity Form error: ${response.status} - ${text}`);
  }
  return await response.json();
}

bot.start((ctx) => {
  ctx.reply("سلام! لطفا شماره مشتری رو وارد کن:");
  salesExperts[ctx.chat.id] = salesExperts[ctx.chat.id] || {};
  salesExperts[ctx.chat.id].step = 'awaitingPhone';
  saveSalesExperts();
});

// مدیریت ورودی پیام‌ها
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  salesExperts[chatId] = salesExperts[chatId] || {};

  try {
    if (!salesExperts[chatId].phoneNumber && salesExperts[chatId].step === 'awaitingPhone') {
      // دریافت شماره مشتری
      salesExperts[chatId].phoneNumber = text;

      // اگر قبلا کارشناس ذخیره شده، مستقیم به ارسال میره
      if (salesExperts[chatId].salesExpert) {
        await sendToGravityForm(salesExperts[chatId].salesExpert, text);
        await ctx.reply(`اطلاعات با موفقیت ارسال شد.\nکارشناس: ${salesExperts[chatId].salesExpert}\nشماره مشتری: ${text}`);
        salesExperts[chatId].step = null;
        saveSalesExperts();
      } else {
        // نمایش گزینه‌های انتخاب کارشناس
        await ctx.reply(
          "لطفا کارشناس فروش را انتخاب کن:",
          Markup.inlineKeyboard(
            salesExpertsList.map(e =>
              Markup.button.callback(e.name, `selectExpert_${e.name}`)
            )
          )
        );
        salesExperts[chatId].step = 'awaitingExpert';
        saveSalesExperts();
      }
      return;
    }

    if (salesExperts[chatId].step === 'awaitingExpert') {
      await ctx.reply("لطفا از دکمه‌های زیر کارشناس را انتخاب کن.");
      return;
    }

    // اگر مرحله تعیین نشده یا داده موجود است
    await ctx.reply("برای شروع دستور /start را بزنید.");
  } catch (e) {
    await ctx.reply("خطایی رخ داد: " + e.message);
  }
});

// مدیریت انتخاب کارشناس از طریق دکمه‌ها
bot.action(/selectExpert_(.+)/, async (ctx) => {
  const chatId = ctx.chat.id;
  const selectedExpert = ctx.match[1];

  if (!salesExperts[chatId]) {
    salesExperts[chatId] = {};
  }

  salesExperts[chatId].salesExpert = selectedExpert;

  // ارسال داده به گرویتی فرم
  try {
    await sendToGravityForm(selectedExpert, salesExperts[chatId].phoneNumber);
    await ctx.reply(`اطلاعات با موفقیت ارسال شد.\nکارشناس: ${selectedExpert}\nشماره مشتری: ${salesExperts[chatId].phoneNumber}`);
    salesExperts[chatId].step = null;
    saveSalesExperts();
  } catch (e) {
    await ctx.reply("ارسال اطلاعات به گرویتی فرم با خطا مواجه شد: " + e.message);
  }
  // حذف پیام دکمه‌ها
  try {
    await ctx.deleteMessage();
  } catch {}
});

// ست کردن وبهوک و استارت ربات
(async () => {
  try {
    await bot.telegram.setWebhook(`${WEBHOOK_URL}/bot${process.env.BOT_TOKEN}`);
    await bot.launch({ webhook: { domain: WEBHOOK_URL, port: PORT } });
    console.log('Bot server is running...');
  } catch (e) {
    console.error('Error launching bot:', e);
    process.exit(1);
  }
})();

// برای ریست شدن وبهوک در هنگام خاموشی
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
