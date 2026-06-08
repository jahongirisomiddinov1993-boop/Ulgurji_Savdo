/**
 * Telegram Bot — Parol tiklash va akaunt bog'lash
 *
 * Foydalanish:
 *  1. https://t.me/BotFather → /newbot → bot token oling
 *  2. .env ga qo'shing: TELEGRAM_BOT_TOKEN=...
 *  3. Server qayta ishga tushiriladi
 *
 * Bot komandalari:
 *  /start <link_token>  — akauntni bog'lash
 *  /start               — yordam
 */

let bot = null;
let pool = null;
let botUsername = null;

function init(poolInstance) {
  pool = poolInstance;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('⚠️  TELEGRAM_BOT_TOKEN topilmadi — bot ishlamaydi. Parol tiklash uchun .env ga qo\'shing.');
    return;
  }

  try {
    const TelegramBot = require('node-telegram-bot-api');
    const usePolling = String(process.env.TELEGRAM_POLLING).trim() !== 'false';
    bot = new TelegramBot(token, { polling: usePolling });

    // Polling xatolari process'ni o'chitirmasligi uchun
    bot.on('polling_error', (err) => {
      if (err.code === 'ETELEGRAM' && err.message && err.message.includes('409')) {
        // 409: boshqa instance ishlayapti — bu kritik emas, skip
      } else {
        console.warn('⚠️  Telegram polling:', err.message);
      }
    });
    bot.on('error', (err) => {
      console.warn('⚠️  Telegram bot xatosi:', err.message);
    });

    if (!usePolling) {
      console.log('ℹ️  Telegram bot polling o\'chirilgan (TELEGRAM_POLLING=false). Faqat xabar yuborish ishlaydi.');
    }

    bot.getMe().then(me => {
      botUsername = me.username;
      console.log(`✅ Telegram bot ishga tushdi: @${botUsername}`);
    }).catch(err => {
      console.error('❌ Telegram bot token noto\'g\'ri:', err.message);
      bot = null;
    });

    // /start <link_token> — akauntni bog'lash
    bot.onText(/^\/start(?:\s+(\S+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const linkToken = match[1];

      if (!linkToken) {
        bot.sendMessage(chatId,
          `👋 Salom, ${msg.from.first_name || ''}!\n\n` +
          `Bu Ulgurji Savdo tizimining yordamchi boti.\n\n` +
          `🔗 Akauntingizni bog'lash uchun:\n` +
          `1. Sayt orqali tizimga kiring\n` +
          `2. "🔗 Telegram bog'lash" tugmasini bosing\n` +
          `3. Berilgan havolani oching\n\n` +
          `Shundan keyin parolni unutsangiz, bot orqali tiklash mumkin.`
        );
        return;
      }

      try {
        const userRes = await pool.query(
          `SELECT id, username, full_name FROM users
           WHERE tg_link_token = $1 AND tg_link_expires > NOW()`,
          [linkToken]
        );
        if (userRes.rows.length === 0) {
          bot.sendMessage(chatId, "❌ Havola yaroqsiz yoki muddati o'tgan. Saytdan qayta urinib ko'ring.");
          return;
        }

        const user = userRes.rows[0];
        await pool.query(
          `UPDATE users
           SET telegram_chat_id = $1, tg_link_token = NULL, tg_link_expires = NULL
           WHERE id = $2`,
          [chatId, user.id]
        );

        bot.sendMessage(chatId,
          `✅ Muvaffaqiyatli bog'landi!\n\n` +
          `👤 Foydalanuvchi: ${user.full_name || user.username}\n\n` +
          `Endi parolni unutsangiz, saytdagi "Parolni unutdingizmi?" tugmasi orqali tiklash mumkin — kod shu chatga keladi.`
        );
      } catch (err) {
        console.error('Telegram link xatosi:', err);
        bot.sendMessage(chatId, "⚠️ Xatolik yuz berdi. Keyinroq urinib ko'ring.");
      }
    });
  } catch (err) {
    console.error('❌ node-telegram-bot-api yuklanmadi:', err.message);
    console.error('   Yechim: npm install node-telegram-bot-api');
  }
}

function isAvailable() {
  return bot !== null && botUsername !== null;
}

function getBotUsername() {
  return botUsername;
}

async function sendMessage(chatId, text) {
  if (!bot) throw new Error('Telegram bot ishga tushirilmagan');
  return bot.sendMessage(chatId, text);
}

module.exports = { init, isAvailable, getBotUsername, sendMessage };
