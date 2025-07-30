const nodemailer = require('nodemailer');

// 从环境变量中读取邮件服务器配置
const emailConfig = {
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10),
    secure: parseInt(process.env.EMAIL_PORT, 10) === 465, // 如果端口是 465，则使用 SSL
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    // 允许自签名证书，如果您的邮件服务器证书不是由受信任的 CA 颁发的
    tls: {
        rejectUnauthorized: false
    }
};

// 只有在提供了完整的邮件配置时才创建 transporter
let transporter;
if (emailConfig.host && emailConfig.auth.user && emailConfig.auth.pass) {
    transporter = nodemailer.createTransport(emailConfig);
    console.log("Nodemailer 已成功初始化。");
} else {
    console.warn("未提供完整的邮件服务器配置，邮件发送功能已禁用。");
}

/**
 * 发送邮件警报
 * @param {string} subject - 邮件主题
 * @param {string} htmlBody - 邮件内容 (HTML格式)
 * @param {string[]} recipients - 收件人地址数组
 */
async function sendEmailAlert(subject, htmlBody, recipients) {
    if (!transporter) {
        console.log("Nodemailer 未初始化，跳过发送邮件。");
        return;
    }
    if (!recipients || recipients.length === 0) {
        console.log("邮件警报：没有收件人，跳过发送。");
        return;
    }

    const mailOptions = {
        from: `"VPMS Alert System" <${emailConfig.auth.user}>`,
        to: recipients.join(', '), // 将收件人数组转换为逗号分隔的字符串
        subject: subject,
        html: htmlBody,
    };

    try {
        let info = await transporter.sendMail(mailOptions);
        console.log('邮件已成功发送: %s', info.messageId);
        console.log('收件人: %s', recipients.join(', '));
    } catch (error) {
        console.error('发送邮件时出错:', error);
    }
}

// 导出函数以供其他模块使用
module.exports = { sendEmailAlert };