import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';

// متغیرهای محیطی (در Render تنظیم می‌کنیم)
const BOT_TOKEN = process.env.BOT_TOKEN;
const WP_USER = process.env.WP_USER;  // نام کاربری Basic Auth وردپرس
const WP_PASS = process.env.WP_PASS;  // رمز عبور Basic Auth وردپرس

// شناسه فرم و فیلدهای گرویتی فرم
const FORM_ID = 1;
const FIELD_SALES_EXPERT_ID = 6; // نام کارشناس
const FIELD_PHONE_ID = 7;        // شماره تلفن مشتری

if (!BOT_TOKEN || !WP_USER || !WP_PASS) {
  console.error('لطفا متغیرهای محیطی BOT_TOKEN و WP_USER و WP_PASS را تنظیم کنید');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ذخیره اطلاعات کارشناسان بر اساس chat_id
// ساختار: { chat_id: { name: 'علی رضایی', phone: '...' } }
const experts = new Map();

// کارشناسان قابل انتخاب
const salesExperts = [
  { name: 'علی رضایی' },
  { name: 'علی فیروز' }
];

// مراحل گرفتن شماره مشتری و انتخاب کارشناس
bot.start(async (ctx) => {
  const chatId = ctx.chat.id;
  if (!experts.has(chatId)) {
    experts.set(chatId, { step: 'waiting_phone' });
    await ctx.reply('لطفا شماره مشتری را وارد کنید:');
  } else {
    await ctx.reply('شما قبلاً اطلاعات را ثبت کرده‌اید.');
  }
});

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  let data = experts.get(chatId);

  // اگر اطلاعات نداشتیم، شروع جدید
  if (!data) {
    experts.set(chatId, { step: 'waiting_phone' });
    await ctx.reply('لطفا شماره مشتری را وارد کنید:');
    return;
  }

  if (data.step === 'waiting_phone') {
    data.phone = ctx.message.text.trim();
    data.step = 'waiting_expert';
    experts.set(chatId, data);

    // گزینه انتخاب کارشناس را ارسال کن
    await ctx.reply(
      'لطفا کارشناس را انتخاب کنید:',
      Markup.inlineKeyboard(
        salesExperts.map(expert =>
          Markup.button.callback(expert.name, `select_expert_${expert.name}`)
        )
      )
    );
  }
});

bot.action(/select_expert_(.+)/, async (ctx) => {
  const chatId = ctx.chat.id;
  let data = experts.get(chatId);
  if (!data || data.step !== 'waiting_expert') {
    await ctx.answerCbQuery('ابتدا شماره مشتری را وارد کنید.');
    return;
  }

  const selectedExpertName = ctx.match[1];
  data.expert = selectedExpertName;
  data.step = 'done';
  experts.set(chatId, data);

  await ctx.answerCbQuery(`کارشناس ${selectedExpertName} انتخاب شد.`);
  await ctx.reply('در حال ارسال اطلاعات به سرور...');

  // ارسال داده‌ها به گرویتی فرم با POST
  try {
    const url = `https://pestehiran.shop/wp-json/gf/v2/forms/${FORM_ID}/submissions`;

    // داده‌ها به فرمت گرویتی فرم
    const payload = {
      input_values: {
        [FIELD_PHONE_ID]: data.phone,
        [FIELD_SALES_EXPERT_ID]: data.expert
      }
    };

    // ارسال درخواست POST با Basic Auth
    const response = await axios.post(url, payload, {
      auth: {
        username: WP_USER,
        password: WP_PASS
      }
    });

    if (response.data && response.data.is_valid) {
      await ctx.reply('اطلاعات با موفقیت ثبت شد. ممنون از شما!');
    } else {
      await ctx.reply('خطا در ثبت اطلاعات. لطفا بعدا دوباره تلاش کنید.');
      console.error('Gravity Forms response error:', response.data);
    }
  } catch (error) {
    console.error('Error posting to Gravity Forms:', error.response?.data || error.message);
    await ctx.reply('خطا در ارسال اطلاعات به سرور.');
  }
});

// اجرای ربات با polling
bot.launch().then(() => {
  console.log('Bot server is running...');
});

// قطع اتصال با سیگنال‌ها (برای ریست‌های تمیز)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
