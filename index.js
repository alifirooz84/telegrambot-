import { Telegraf } from 'telegraf';
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const botToken = process.env.BOT_TOKEN;
const port = process.env.PORT || 10000;
const gravityFormApiUrl = 'https://pestehiran.shop/wp-json/gf/v2/forms/1/submissions';

// شناسه‌های فیلدهای فرم گرویتی فرم
const FIELD_SALES_EXPERT = 6;
const FIELD_CUSTOMER_PHONE = 7;

// کارشناسان فروش و شماره‌شان (اینجا به صورت ثابت، می‌توانی از دیتابیس یا فایل ذخیره کنی)
const salesExperts = {
  'alirezafirooz': { name: 'علی فیروز', phone: '09135197039' },
  'alirezai': { name: 'علی رضایی', phone: '09170324187' }
};

// ذخیره موقت کاربرها در حافظه برای تشخیص کارشناس
const userSalesExpert = new Map();

const app = express();
app.use(express.json());

// راه‌اندازی ربات تلگرام
const bot = new Telegraf(botToken);

// هندلر پیام شروع
bot.start((ctx) => {
  ctx.reply('سلام! لطفاً شماره مشتری را وارد کنید:');
  userSalesExpert.delete(ctx.chat.id); // اطمینان از اینکه کارشناس تازه انتخاب می‌شود
});

// گرفتن شماره مشتری و سپس انتخاب کارشناس یا استفاده از ذخیره قبلی
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  // اگر شماره مشتری ذخیره نشده باشد، این متن را شماره مشتری می‌گیریم
  if (!userSalesExpert.has(chatId)) {
    // ساده فرض می‌کنیم شماره مشتری باید عدد باشد
    if (!/^\d+$/.test(text)) {
      return ctx.reply('لطفاً فقط شماره مشتری را به صورت عدد وارد کنید.');
    }

    // ذخیره شماره مشتری موقت در حافظه
    userSalesExpert.set(chatId, { customerPhone: text, expertKey: null });

    // حالا گزینه انتخاب کارشناس را می‌فرستیم
    return ctx.reply(
      'کارشناس فروش را انتخاب کنید:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'علی فیروز', callback_data: 'alirezafirooz' }],
            [{ text: 'علی رضایی', callback_data: 'alirezai' }]
          ]
        }
      }
    );
  } else {
    // اگر قبلا شماره مشتری ذخیره شده بود و هنوز کارشناس انتخاب نشده
    const userData = userSalesExpert.get(chatId);
    if (!userData.expertKey) {
      return ctx.reply('لطفاً یکی از گزینه‌های کارشناس فروش را انتخاب کنید.');
    } else {
      return ctx.reply('در حال حاضر اطلاعات شما ثبت شده است.');
    }
  }
});

// هندلر انتخاب کارشناس توسط دکمه‌های inline
bot.on('callback_query', async (ctx) => {
  const chatId = ctx.chat.id;
  const expertKey = ctx.callbackQuery.data;

  if (!salesExperts[expertKey]) {
    return ctx.answerCbQuery('کارشناس نامعتبر است.');
  }

  // گرفتن داده ذخیره شده قبلی شماره مشتری
  const userData = userSalesExpert.get(chatId);
  if (!userData || !userData.customerPhone) {
    return ctx.answerCbQuery('ابتدا شماره مشتری را وارد کنید.');
  }

  // ذخیره کارشناس انتخابی
  userData.expertKey = expertKey;
  userSalesExpert.set(chatId, userData);

  const salesExpert = salesExperts[expertKey];

  // ارسال داده به گرویتی فرم با Basic Auth
  try {
    await axios.post(
      gravityFormApiUrl,
      {
        input_values: {
          [FIELD_CUSTOMER_PHONE]: userData.customerPhone,
          [FIELD_SALES_EXPERT]: salesExpert.name
        }
      },
      {
        auth: {
          username: process.env.WP_USER,
          password: process.env.WP_PASS
        }
      }
    );

    await ctx.reply(`اطلاعات ثبت شد.\nشماره مشتری: ${userData.customerPhone}\nکارشناس فروش: ${salesExpert.name}`);
  } catch (error) {
    console.error('خطا در ارسال به گرویتی فرم:', error.response?.data || error.message);
    await ctx.reply('خطا در ثبت اطلاعات، لطفاً مجدداً تلاش کنید.');
  }

  // تایید callback query
  await ctx.answerCbQuery();
});

// ست کردن وبهوک به صورت اتوماتیک (مناسب Render یا هر سرویس میزبانی مشابه)
async function setWebhook() {
  try {
    const webhookUrl = `${process.env.BASE_URL}/telegraf/${bot.secretPathComponent()}`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log('Webhook set:', webhookUrl);
  } catch (error) {
    console.error('Error setting webhook:', error);
  }
}

// مسیر وبهوک
app.use(bot.webhookCallback(`/telegraf/${bot.secretPathComponent()}`));

app.listen(port, async () => {
  console.log(`Bot server is running on port ${port}`);
  await setWebhook();
});

// اگر خواستی می‌توانی خط زیر را برای اجرای بدون وبهوک و با polling فعال کنی (ولی روی Render وبهوک بهتر است)
// bot.launch();

