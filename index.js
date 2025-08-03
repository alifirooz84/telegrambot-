import express from 'express';
import { Telegraf, Markup } from 'telegraf';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const bot = new Telegraf(process.env.BOT_TOKEN);

const sessions = {};

const experts = [
  'سرکار خانم جعفری',
  'سرکار خانم مرادی',
  'آقای علیشاهی',
  'سرکار خانم حبیبی',
  'آقای محمدی',
  'سرکار خانم شکری'
];

const expertsPhones = {
  'سرکار خانم جعفری': '09373424385',
  'سرکار خانم مرادی': '09016363835',
  'آقای علیشاهی': '09016363153',
  'سرکار خانم حبیبی': '09221810925',
  'آقای محمدی': '09109493183',
  'سرکار خانم شکری': '09354443081'
};

const cancelOption = 'انصراف از ارسال';

const expertsDataFile = './data/experts.json';

function loadExpertsData() {
  try {
    const data = fs.readFileSync(expertsDataFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveExpertsData(data) {
  fs.writeFileSync(expertsDataFile, JSON.stringify(data, null, 2));
}

app.use(bot.webhookCallback('/webhook'));

async function setWebhook() {
  const url = process.env.WEBHOOK_URL;
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

bot.start((ctx) => {
  const chatId = ctx.chat.id;
  let expertsData = loadExpertsData();

  if (expertsData[chatId]) {
    ctx.reply(`سلام دوباره! شما کارشناس ${expertsData[chatId].name} با شماره ${expertsData[chatId].phone} هستید.\nلطفاً شماره مشتری را وارد کنید:`);
    sessions[chatId] = { step: 'waiting_customer' };
  } else {
    ctx.reply('سلام! لطفاً شماره مشتری را وارد کنید:');
    sessions[chatId] = { step: 'waiting_customer' };
  }
});

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
      [...experts.map(e => [e]), [cancelOption]]
    ).oneTime().resize());
  }

  if (session.step === 'waiting_expert') {
    if (text === cancelOption) {
      sessions[chatId] = { step: 'waiting_customer' };
      return ctx.reply('ارسال اطلاعات لغو شد. لطفاً شماره مشتری را دوباره وارد کنید:');
    }

    if (!experts.includes(text)) {
      return ctx.reply('لطفاً یکی از گزینه‌های زیر را انتخاب کنید:', Markup.keyboard(
        [...experts.map(e => [e]), [cancelOption]]
      ).oneTime().resize());
    }

    session.expert = text;

    // ذخیره شماره کارشناس در فایل
    let expertsData = loadExpertsData();
    expertsData[chatId] = {
      name: text,
      phone: expertsPhones[text]
    };
    saveExpertsData(expertsData);

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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  setWebhook();
});
