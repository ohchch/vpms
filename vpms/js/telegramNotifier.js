const TelegramBot = require('node-telegram-bot-api');

// 从环境变量中获取 Token
const token = process.env.BOT_TOKEN; // 修正：变量名与 .env 文件保持一致
let bot;

// 只有在提供了 Token 的情况下才初始化 Bot
if (token) {
    bot = new TelegramBot(token);
    console.log("Telegram Bot 已成功初始化。");
} else {
    console.warn("未提供 TELEGRAM_BOT_TOKEN，Telegram 通知功能已禁用。");
}

/**
 * 发送 Telegram 警报
 * @param {string} message - 要发送的消息
 * @param {string[]} chatIds - 接收消息的 Chat ID 数组
 */
async function sendTelegramAlert(message, chatIds) {
    if (!bot) {
        console.log("Telegram Bot 未初始化，跳过发送。");
        return;
    }
    if (!chatIds || chatIds.length === 0) {
        console.log("Telegram 警报：没有 Chat ID，跳过发送。");
        return;
    }

    // --- 修改开始：使用 Promise.allSettled 并行发送消息 ---
    const promises = chatIds.map(chatId => 
        bot.sendMessage(chatId, message, { parse_mode: 'HTML' })
           .then(() => ({ status: 'fulfilled', chatId }))
           .catch(error => ({ status: 'rejected', chatId, reason: error.response ? error.response.body : error.message }))
    );

    const results = await Promise.allSettled(promises);

    // 遍历结果并记录日志
    results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.status === 'fulfilled') {
            console.log(`Telegram 消息已成功发送至 Chat ID: ${result.value.chatId}`);
        } else if (result.status === 'fulfilled' && result.value.status === 'rejected') {
            console.error(`发送 Telegram 消息至 ${result.value.chatId} 时出错:`, result.value.reason);
        } else {
            // Promise.allSettled 本身失败的罕见情况
            console.error(`处理某个 Telegram 发送任务时出现意外失败:`, result.reason);
        }
    });
    // --- 修改结束 ---
}

// 导出函数
module.exports = { sendTelegramAlert };