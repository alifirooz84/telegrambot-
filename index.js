import express from 'express';
import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';
dotenv.config();

const app = express();
app.use(express.json());

const bot = new Telegraf(process.env.BOT_TOKEN);
const dataFile = './data.json';

// لود اطلاعات ذخیره‌شده
let expertData = {};
if (fs.existsSync(dataFile)) {
  expertData = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
}

// مرحله 1: شروع ربات و دریافت شماره مشتری
bot.start((ctx) => {
  ctx.reply('سلام! لطفاً شماره مشتری را وارد کنید:');
  ctx.session = { step: 'awaiting_customer_number' };
});

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text;

  if (!ctx.session) ctx.session = {};

  // اگر کارشناس قبلاً شناسایی نشده بود
  if (!expertData[chatId]) {
    ctx.session.step = 'awaiting_customer_number';
  }

  const step = ctx.session.step;

  if (step === 'awaiting_customer_number') {
    ctx.session.customerNumber = text;

    // اگر کارشناس قبلاً شناخته‌شده نباشد، گزینه‌ها را نمایش بده
    if (!expertData[chatId]) {
      ctx.session.step = 'awaiting_expert_choice';
      return ctx.reply('لطفاً کارشناس را انتخاب کنید:', Markup.keyboard([
        ['علی فیروز'], ['علی رضایی']
      ]).oneTime().resize());
    } else {
      // اگر کارشناس قبلاً شناسایی شده بود
      const { name, phone } = expertData[chatId];
      await submitToGravityForm(name, phone, text);
      return ctx.reply('اطلاعات با موفقیت ثبت شد ✅');
    }
  }

  if (step === 'awaiting_expert_choice') {
    let expert = {};
    if (text === 'علی فیروز') {
      expert = { name: 'علی فیروز', phone: '09135197039' };
    } else if (text === 'علی رضایی') {
      expert = { name: 'علی رضایی', phone: '09170324187' };
    } else {
      return ctx.reply('لطفاً یکی از گزینه‌ها را انتخاب کنید.');
    }

    expertData[chatId] = expert;
    fs.writeFileSync(dataFile, JSON.stringify(expertData, null, 2));

    await submitToGravityForm(expert.name, expert.phone, ctx.session.customerNumber);
    ctx.session = {}; // ریست کردن وضعیت

    return ctx.reply('✅ اطلاعات با موفقیت ارسال شد');
  }
});

// ارسال اطلاعات به گرویتی فرم
async function submitToGravityForm(name, phone, customerNumber) {
  try {
    const response = await axios.post(
      'https://pestehiran.shop/wp-json/gf/v2/forms/1/submissions',
      {
        6: name,
        7: customerNumber
      },
      {
        auth: {
          username: process.env.WP_USER,
          password: process.env.WP_PASS
        }
      }
    );
    console.log('Form submitted:', response.data);
  } catch (err) {
    console.error('❌ ارسال ناموفق:', err.response?.data || err.message);
  }
}

// اتصال به webhook
app.use(bot.webhookCallback('/telegraf'));

// اجرای سرور
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Bot server running on port ${PORT}`);
});
