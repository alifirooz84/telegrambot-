import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import fs from 'fs';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const SITE_URL = process.env.SITE_URL;
const PORT = process.env.PORT || 3000;

const bot = new TelegramBot(TOKEN);
const usersFile = './users.json';
let users = fs.existsSync(usersFile) ? JSON.parse(fs.readFileSync(usersFile)) : {};

bot.setWebHook(`${WEBHOOK_URL}/bot${TOKEN}`);

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ربات: شروع گفتگو
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  users[chatId] = { step: 'get_phone' };
  saveUsers();
  bot.sendMessage(chatId, 'سلام، لطفاً شماره مشتری را وارد کنید:');
});

// ربات: پیام‌های متنی
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text.startsWith('/')) return;

  const user = users[chatId];
  if (!user || user.step !== 'get_phone') return;

  user.phone = text;
  user.step = 'choose_expert';

  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'علی فیروز', callback_data: 'Ali Firooz' }],
        [{ text: 'علی رضایی', callback_data: 'Ali Rezaei' }]
      ]
    }
  };

  saveUsers();
  bot.sendMessage(chatId, 'لطفاً کارشناس فروش را انتخاب کنید:', options);
});

// ربات: انتخاب کارشناس
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const user = users[chatId];
  const expert = query.data;

  if (!user || !user.phone) return;

  user.expert = expert;
  user.step = 'done';
  saveUsers();

  try {
    const res = await fetch(SITE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: user.phone,
        expert: user.expert
      })
    });

    const result = await res.text();
    bot.sendMessage(chatId, `✅ اطلاعات با موفقیت ثبت شد.\nنتیجه: ${result}`);
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, '❌ خطا در ارسال اطلاعات. لطفاً دوباره تلاش کنید.');
  }
});

// ذخیره اطلاعات لوکال
function saveUsers() {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

// راه‌اندازی سرور
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
