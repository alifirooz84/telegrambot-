import express from "express";
import { Telegraf, Markup } from "telegraf";
import fetch from "node-fetch";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GRAVITY_FORM_ID = 1;
const FIELD_SALES_EXPERT = 6; // id نام کارشناس
const FIELD_PHONE_NUMBER = 7; // id شماره تلفن مشتری

const gravityFormUrl = `https://pestehiran.shop/wp-json/gf/v2/forms/${GRAVITY_FORM_ID}/submissions`;

const expertsFile = "./experts.json";
let experts = {};
try {
  const data = fs.readFileSync(expertsFile, "utf8");
  experts = JSON.parse(data);
} catch {
  experts = {};
}
function saveExperts() {
  fs.writeFileSync(expertsFile, JSON.stringify(experts, null, 2));
}

async function sendToGravityForm(salesExpertName, phoneNumber) {
  const bodyData = {
    input_values: {
      [FIELD_SALES_EXPERT]: salesExpertName,
      [FIELD_PHONE_NUMBER]: phoneNumber,
    },
  };

  const res = await fetch(gravityFormUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Basic " +
        Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString(
          "base64"
        ),
    },
    body: JSON.stringify(bodyData),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gravity Form API error: ${text}`);
  }
  return res.json();
}

const userStates = {};

bot.start((ctx) => {
  ctx.reply("سلام! لطفا کارشناس فروش خود را انتخاب کنید:", Markup.inlineKeyboard([
    Markup.button.callback("علی رضایی", "select_expert_ali_rezaei"),
    Markup.button.callback("علی فیروز", "select_expert_ali_firooz"),
  ]));
});

bot.action("select_expert_ali_rezaei", (ctx) => {
  const chatId = ctx.chat.id;
  experts[chatId] = { name: "علی رضایی" };
  saveExperts();
  ctx.answerCbQuery();
  ctx.reply("کارشناس علی رضایی انتخاب شد. حالا شماره مشتری را ارسال کنید.");
  userStates[chatId] = "waiting_for_phone";
});

bot.action("select_expert_ali_firooz", (ctx) => {
  const chatId = ctx.chat.id;
  experts[chatId] = { name: "علی فیروز" };
  saveExperts();
  ctx.answerCbQuery();
  ctx.reply("کارشناس علی فیروز انتخاب شد. حالا شماره مشتری را ارسال کنید.");
  userStates[chatId] = "waiting_for_phone";
});

bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  if (!experts[chatId]) {
    return ctx.reply(
      "لطفا ابتدا کارشناس فروش خود را انتخاب کنید:",
      Markup.inlineKeyboard([
        Markup.button.callback("علی رضایی", "select_expert_ali_rezaei"),
        Markup.button.callback("علی فیروز", "select_expert_ali_firooz"),
      ])
    );
  }

  if (userStates[chatId] === "waiting_for_phone") {
    try {
      const salesExpertName = experts[chatId].name;
      await sendToGravityForm(salesExpertName, text);
      ctx.reply("اطلاعات با موفقیت ارسال شد. ممنون از شما!");
    } catch (e) {
      ctx.reply("خطا در ارسال اطلاعات به سرور. لطفا دوباره تلاش کنید.");
      console.error(e);
    }
    userStates[chatId] = null;
    return;
  }

  userStates[chatId] = "waiting_for_phone";
  ctx.reply("لطفا شماره مشتری را وارد کنید:");
});

// فقط webhook، بدون bot.launch()
app.use(bot.webhookCallback("/telegraf/" + bot.token));

app.listen(PORT, () => {
  console.log(`Bot server is running on port ${PORT}`);

  bot.telegram
    .setWebhook(`${process.env.WEBHOOK_URL}/telegraf/${bot.token}`)
    .then(() => console.log("Webhook set"))
    .catch(console.error);
});
