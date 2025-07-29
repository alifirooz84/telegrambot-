import { Telegraf } from 'telegraf';
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const botToken = process.env.BOT_TOKEN;
const port = process.env.PORT || 10000;
const gravityFormApiUrl = 'https://pestehiran.shop/wp-json/gf/v2/forms/1/submissions';

const FIELD_SALES_EXPERT = 6;
const FIELD_CUSTOMER_PHONE = 7;

const salesExperts = {
  'alirezafirooz': { name: 'علی فیروز', phone: '09135197039' },
  'alirezai': { name: 'علی رضایی', phone: '09170324187' }
};

const userSalesExpert = new Map();

const app = express();
app.use(express.json());

if (!botToken) {
  console.error('BOT_TOKEN در فایل env ست نشده است!');
  process.exit(1);
}

const bot = new Telegraf(botToken);

// ذخیره secretPathComponent یکبار و ثابت
const secretPath = bot.secretPathComponent();

bot.start((ctx) => {
  ctx.reply('سلام! لطفاً شماره مشتری را وارد کنید:');
  userSalesExpert.delete(ctx.chat.id);
});

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  if (!userSalesExpert.has(chatId)) {
    if (!/^\d+$/.test(text)) {
      return ctx.reply('لطفاً فقط شماره مشتری را به صورت عدد وارد کنید.');
    }

    userSalesExpert.set(chatId, { customerPhone: text, expertKey: null });

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
    const userData = userSalesExpert.get(chatId);
    if (!userData.expertKey) {
      return ctx.reply('لطفاً یکی از گزینه‌های کارشناس فروش را انتخاب کنید.');
    } else {
      return ctx.reply('اطلاعات شما قبلاً ثبت شده است.');
    }
  }
});

bot.on('callback_query', async (ctx) => {
  const chatId = ctx.chat.id;
  const expertKey = ctx.callbackQuery.data;

  if (!salesExperts[expertKey]) {
    return ctx.answerCbQuery('کارشناس نامعتبر است.');
  }

  const userData = userSalesExpert.get(chatId);
  if (!userData || !userData.customerPhone) {
    return ctx.answerCbQuery('ابتدا شماره مشتری را وارد کنید.');
  }

  userData.expertKey = expertKey;
  userSalesExpert.set(chatId, userData);

  const salesExpert = salesExperts[expertKey];

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

  await ctx.answerCbQuery();
});

// تنظیم وبهوک
async function setWebhook() {
  if (!process.env.BASE_URL) {
    console.error('متغیر محیطی BASE_URL ست نشده است.');
    process.exit(1);
  }

  const webhookUrl = `${process.env.BASE_URL}/telegraf/${secretPath}`;

  try {
    await bot.telegram.setWebhook(webhookUrl);
    console.log('Webhook set:', webhookUrl);
  } catch (error) {
    console.error('Error setting webhook:', error);
    process.exit(1);
  }
}

// ثبت وبهوک در مسیر مشخص
app.use(bot.webhookCallback(`/telegraf/${secretPath}`));

app.listen(port, async () => {
  console.log(`Bot server is running on port ${port}`);
  await setWebhook();
});
