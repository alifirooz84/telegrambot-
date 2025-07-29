require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);

const gravityFormApiUrl = 'https://pestehiran.shop/wp-json/gf/v2/forms/1/submissions';

// کارشناس‌ها برای انتخاب توسط کاربر:
const experts = [
  { id: 1, name: 'علی رضایی' },
  { id: 2, name: 'علی فیروز' },
];

// ذخیره موقت اطلاعات کاربران در حافظه (برای نمونه ساده):
const userSessions = {};

bot.start((ctx) => {
  ctx.reply('سلام! لطفاً شماره مشتری را وارد کنید:');
  userSessions[ctx.chat.id] = {};
});

// گرفتن شماره مشتری
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  // اگر هنوز شماره مشتری ثبت نشده:
  if (!userSessions[chatId] || !userSessions[chatId].customerNumber) {
    userSessions[chatId] = { customerNumber: text };
    // نمایش گزینه‌های کارشناس
    return ctx.reply(
      'لطفاً کارشناس فروش را انتخاب کنید:',
      Markup.keyboard(experts.map((e) => e.name)).oneTime().resize()
    );
  }

  // اگر شماره مشتری ثبت شده ولی کارشناس هنوز انتخاب نشده
  if (!userSessions[chatId].expert) {
    const expert = experts.find((e) => e.name === text);
    if (!expert) {
      return ctx.reply(
        'کارشناس معتبر نیست، لطفاً از گزینه‌ها انتخاب کنید.'
      );
    }
    userSessions[chatId].expert = expert;

    // ارسال داده‌ها به گرویتی فرم
    try {
      const data = {
        input_values: {
          7: userSessions[chatId].customerNumber, // id=7 شماره تلفن
          6: userSessions[chatId].expert.name,    // id=6 نام کارشناس
        },
      };

      const response = await axios.post(gravityFormApiUrl, data, {
        auth: {
          username: process.env.WP_USER,
          password: process.env.WP_PASS,
        },
      });

      if (response.data && response.data.is_valid) {
        ctx.reply('✅ اطلاعات با موفقیت ثبت شد.');
      } else {
        ctx.reply('❌ خطا در ثبت اطلاعات.');
      }
    } catch (error) {
      console.error('خطا در ارسال به گرویتی فرم:', error.message || error);
      ctx.reply('❌ خطا در ارسال اطلاعات.');
    }

    // پاک کردن نشست کاربر بعد از ارسال
    delete userSessions[chatId];
    return;
  }

  // اگر پیام نامرتبط بود
  ctx.reply('برای ثبت اطلاعات جدید، لطفاً /start را ارسال کنید.');
});

bot.launch();
console.log('Bot server is running...');

// فعال کردن graceful stop در صورت نیاز
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
