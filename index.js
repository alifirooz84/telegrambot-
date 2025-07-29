const { Telegraf } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => ctx.reply('ربات آماده است! شماره مشتری را ارسال کنید.'));
bot.on('text', (ctx) => ctx.reply(`پیام شما: ${ctx.message.text}`));

bot.launch();
