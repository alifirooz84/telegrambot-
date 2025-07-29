require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const { Telegraf, Markup } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
app.use(bodyParser.json());

const tempState = {};

const experts = {
  "Ali Firooz": "علی فیروز",
  "Ali Rezaei": "علی رضایی"
};

bot.start((ctx) => {
  console.log(`User ${ctx.chat.id} started the bot.`);
  ctx.reply('سلام! لطفاً شماره مشتری را ارسال کنید:');
});

bot.on('text', (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  console.log(`Received text from ${chatId}: ${text}`);

  if (/^\d{8,15}$/.test(text)) {
    tempState[chatId] = { phone: text };
    ctx.reply('لطفاً کارشناس خود را انتخاب کنید:', Markup.inlineKeyboard([
      [Markup.button.callback('علی فیروز', 'expert_Ali Firooz')],
      [Markup.button.callback('علی رضایی', 'expert_Ali Rezaei')]
    ]));
  } else {
    ctx.reply('لطفاً فقط شماره مشتری (بدون متن اضافه) را وارد کنید.');
  }
});

bot.action(/expert_(.+)/, async (ctx) => {
  const chatId = ctx.chat.id;
  const expertKey = ctx.match[1];
  const phone = tempState[chatId]?.phone;

  console.log(`User ${chatId} selected expert: ${expertKey}, phone: ${phone}`);

  if (!phone) {
    ctx.reply('لطفاً ابتدا شماره مشتری را ارسال کنید.');
    return;
  }

  const expertName = experts[expertKey];
  ctx.answerCbQuery();

  ctx.reply('در حال ارسال اطلاعات...');

  try {
    const auth = Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString('base64');

    const response = await fetch('https://pestehiran.shop/wp-json/gf/v2/forms/2/submissions', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        "input_4": phone,
        "input_6": expertName
      })
    });

    if (response.ok) {
      ctx.reply('✅ اطلاعات با موفقیت ثبت شد!');
      console.log(`Data sent successfully for user ${chatId}`);
    } else {
      const errorText = await response.text();
      console.error(`Failed to send data for user ${chatId}: ${errorText}`);
      ctx.reply('❌ خطا در ثبت اطلاعات، لطفاً مجدداً تلاش کنید.');
    }
  } catch (error) {
    console.error(`Error sending data for user ${chatId}:`, error);
    ctx.reply('❌ خطایی رخ داد، لطفاً دوباره تلاش کنید.');
  }

  delete tempState[chatId];
});

app.post(`/webhook/${process.env.BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body, res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
