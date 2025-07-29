import { Telegraf } from 'telegraf';
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 10000;

const DATA_FILE = './experts.json';

let experts = {};
if (fs.existsSync(DATA_FILE)) {
  experts = JSON.parse(fs.readFileSync(DATA_FILE));
}

// ذخیره دائمی اطلاعات کارشناسان
function saveExperts() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(experts, null, 2));
}

bot.start((ctx) => {
  ctx.reply('سلام! لطفاً شماره مشتری را وارد کنید:');
  ctx.session = {};
});

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  // اگر هنوز کارشناس ذخیره نشده
  if (!experts[chatId]) {
    // اگر کارشناس وارد انتخاب نشده
    if (!ctx.session || !ctx.session.phone) {
      if (/^\d{7,15}$/.test(text)) {
        ctx.session = { phone: text };
        ctx.reply('لطفاً یکی از کارشناسان را انتخاب کنید:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'علی فیروز', callback_data: 'Ali Firooz' }],
              [{ text: 'علی رضایی', callback_data: 'Ali Rezaei' }],
            ]
          }
        });
      } else {
        ctx.reply('لطفاً فقط شماره مشتری را وارد کنید (اعداد بدون فاصله)');
      }
    }
  } else {
    // اگر کارشناس قبلاً شناخته شده است
    const expertName = experts[chatId].name;
    const phone = text;

    try {
      await submitToGravityForm(expertName, phone);
      ctx.reply(`اطلاعات با موفقیت ارسال شد ✅\nکارشناس: ${expertName}\nشماره مشتری: ${phone}`);
    } catch (err) {
      ctx.reply('❌ خطا در ارسال اطلاعات به سایت. لطفاً دوباره تلاش کنید.');
    }
  }
});

// وقتی کارشناس انتخاب شد
bot.on('callback_query', async (ctx) => {
  const chatId = ctx.chat.id;
  const expertName = ctx.update.callback_query.data;
  const phone = ctx.session?.phone;

  if (!phone) {
    ctx.reply('لطفاً ابتدا شماره مشتری را وارد کنید.');
    return;
  }

  experts[chatId] = { name: expertName };
  saveExperts();

  try {
    await submitToGravityForm(expertName, phone);
    await ctx.answerCbQuery();
    ctx.reply(`اطلاعات ثبت شد ✅\nکارشناس: ${expertName}\nشماره مشتری: ${phone}`);
  } catch (err) {
    ctx.reply('❌ خطا در ارسال اطلاعات به سایت. لطفاً دوباره تلاش کنید.');
  }
});

// ارسال اطلاعات به گرویتی فرم
async function submitToGravityForm(expertName, phone) {
  const url = 'https://pestehiran.shop/wp-json/gf/v2/forms/1/submissions';
  const auth = Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString('base64');

  const body = {
    input_values: {
      '6': expertName,
      '7': phone
    }
  };

  return axios.post(url, body, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    }
  });
}

// پشتیبانی از وبهوک
app.use(bot.webhookCallback('/'));

bot.telegram.setWebhoo
