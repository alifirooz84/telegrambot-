import express from 'express';
import { Telegraf, Markup } from 'telegraf';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;  // پورت داینامیک برای Render

// میانه‌افزار برای خواندن json
app.use(express.json());

// راه‌اندازی ربات تلگرام
const bot = new Telegraf(process.env.BOT_TOKEN);

// ذخیره موقت وضعیت کاربران در حافظه (برای هر chat_id)
const sessions = {};

// لیست کارشناسان
const experts = ['علی رضایی', 'علی فیروز'];

// مسیر webhook برای دریافت پیام‌ها از تلگرام
app.use(bot.webhookCallback('/webhook'));

// ست کردن webhook به صورت خودکار (می‌تونید بعداً دستی بزنید)
async function setWebhook() {
  const url = process.env.WEBHOOK_URL; // مثلا https://yourapp.onrender.com/webhook
  if (!url) {
    console.log('WEBHOOK_URL در .env تنظیم نشده');
    return;
  }
  try {
    await bot.telegram.setWebhook(url);
    console.log('Webhook ست شد:', url);
  } catch (e) {
    console.error('خطا در ست کردن webhook:', e);
  }
}

// شروع مکالمه
bot.start((ctx) => {
  ctx.reply('سلام! لطفاً شماره مشتری را وارد کنید:');
  sessions[ctx.chat.id] = { step: 'waiting_customer' };
});

// دریافت پیام‌های کاربر
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  if (!sessions[chatId]) {
    sessions[chatId] = { step: 'waiting_customer' };
    return ctx.reply('سلام! لطفاً شماره مشتری را وارد کنید:');
  }

  const session = sessions[chatId];

  if (session.step === 'waiting_customer') {
    if (!text) {
      return ctx.reply('شماره مشتری نمی‌تواند خالی باشد. لطفاً وارد کنید:');
    }
    session.customer = text;
    session.step = 'waiting_expert';

    return ctx.reply('لطفاً کارشناس را انتخاب کنید:', Markup.keyboard(
      experts.map(e => [e])
    ).oneTime().resize());
  }

  if (session.step === 'waiting_expert') {
    if (!experts.includes(text)) {
      return ctx.reply('لطفاً یکی از گزینه‌های زیر را انتخاب کنید:', Markup.keyboard(
        experts.map(e => [e])
      ).oneTime().resize());
    }
    session.expert = text;

    // ارسال داده‌ها به سایت
    try {
      const response = await fetch(process.env.SITE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          customer: session.customer,
          expert: session.expert
        })
      });

      if (!response.ok) throw new Error('خطا در ارسال اطلاعات به سایت');

      await ctx.reply('اطلاعات با موفقیت ارسال شد ✅');
    } catch (error) {
      console.error(error);
      await ctx.reply('❌ خطا در ارسال اطلاعات به سایت.');
    }

    delete sessions[chatId];
  }
});

// شروع سرور و بات
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  setWebhook();
});
