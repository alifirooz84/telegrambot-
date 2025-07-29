require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 10000;
const DOMAIN = process.env.DOMAIN || 'https://yourdomain.com'; // آدرس دامنه رندر یا دامنه شما

if (!BOT_TOKEN) {
  console.error('Error: BOT_TOKEN is not set in .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const gravityFormAPI = 'https://pestehiran.shop/wp-json/gf/v2/forms/1/submissions';
const gravityUser = process.env.WP_USER;
const gravityPass = process.env.WP_PASS;

if (!gravityUser || !gravityPass) {
  console.error('Error: WP_USER or WP_PASS not set in .env');
  process.exit(1);
}

// مسیر ذخیره اطلاعات کارشناس
const expertsFile = path.join(__dirname, 'experts.json');

let experts = {};
// بارگذاری اطلاعات قبلی کارشناسان (اگر فایل موجود بود)
try {
  if (fs.existsSync(expertsFile)) {
    const data = fs.readFileSync(expertsFile, 'utf-8');
    experts = JSON.parse(data);
  }
} catch (e) {
  console.warn('Could not read experts file, starting fresh');
}

// دیکشنری کارشناسان با شماره تماس
const salesExperts = {
  'علی رضایی': '09170324187',
  'علی فیروز': '09135197039',
};

function saveExperts() {
  fs.writeFileSync(expertsFile, JSON.stringify(experts, null, 2));
}

// مراحل چت:

bot.start((ctx) => {
  ctx.reply('سلام! لطفاً شماره مشتری را وارد کنید:');
  // پاک کردن مرحله قبلی اگر بود
  ctx.session = {};
  ctx.session.step = 'waiting_for_customer_number';
});

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  // وضعیت کارشناس ذخیره شده؟
  if (!experts[chatId]) {
    experts[chatId] = { step: null, name: null, phone: null };
  }
  let user = experts[chatId];

  // مرحله شماره مشتری
  if (user.step === null || user.step === 'waiting_for_customer_number') {
    user.customerNumber = text;
    user.step = 'waiting_for_sales_expert';
    saveExperts();

    // نمایش کیبورد گزینه کارشناس
    return ctx.reply(
      'لطفاً نام کارشناس فروش را انتخاب کنید:',
      Markup.keyboard([['علی رضایی', 'علی فیروز']])
        .oneTime()
        .resize()
    );
  }

  // مرحله انتخاب کارشناس
  if (user.step === 'waiting_for_sales_expert') {
    if (!salesExperts[text]) {
      return ctx.reply(
        'لطفاً فقط یکی از گزینه‌های زیر را انتخاب کنید:',
        Markup.keyboard([['علی رضایی', 'علی فیروز']])
          .oneTime()
          .resize()
      );
    }

    user.salesExpert = text;
    user.salesPhone = salesExperts[text];
    user.step = 'done';
    saveExperts();

    // ارسال داده به گرویتی فرم
    try {
      const payload = {
        input_values: {
          6: user.salesExpert,    // id فیلد نام کارشناس
          7: user.customerNumber, // id فیلد شماره مشتری (یا شماره تلفن؟)
          8: user.salesPhone       // اگر فیلد شماره تلفن 8 باشد، این را اضافه کنید
        }
      };

      // چون در فرم فقط دو فیلد داریم (6 و 7)، اگر فیلد تلفن 8 دارید جدا ارسال کنید یا حذف کنید
      // فرض می‌کنیم فقط 6 و 7 هستند:
      const payloadCorrected = {
        input_values: {
          6: user.salesExpert,
          7: user.customerNumber,
        }
      };

      await axios.post(gravityFormAPI, payloadCorrected, {
        auth: { username: gravityUser, password: gravityPass },
      });

      ctx.reply(
        `اطلاعات ثبت شد:\nشماره مشتری: ${user.customerNumber}\nکارشناس: ${user.salesExpert}`
      );
    } catch (err) {
      console.error(err.response?.data || err.message);
      ctx.reply('❌ خطا در ارسال اطلاعات به گرویتی فرم.');
    }
    return;
  }

  // اگر همه مراحل تمام شد، پیام پیش‌فرض
  if (user.step === 'done') {
    ctx.reply('اگر اطلاعات جدیدی دارید، لطفاً /start را ارسال کنید.');
  }
});

// وبهوک ست و راه‌اندازی سرور express

bot.telegram.setWebhook(`${DOMAIN}/bot${BOT_TOKEN}`);

const express = require('express');
const app = express();

app.use(bot.webhookCallback(`/bot${BOT_TOKEN}`));

app.listen(PORT, () => {
  console.log(`Bot server is running on port ${PORT}`);
});
