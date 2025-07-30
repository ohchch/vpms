// server.js
const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise'); // 保持使用 mysql2/promise
require('dotenv').config(); // --- 新增：在最頂部加載 .env 文件中的環境變量 ---
const fs = require('fs').promises; // --- 新增：引入文件系統模塊 ---

// --- 新增：引入我們自己的通知模塊 ---
const { sendEmailAlert } = require('./emailNotifier');
const { sendTelegramAlert } = require('./telegramNotifier'); // 确保已导入


const app = express();
const port = 3000;

// MySQL 錯誤代碼常量
const ER_BAD_DB_ERROR = 1049;
const ER_NO_SUCH_TABLE = 1146;

app.use(express.static(path.join(__dirname, '')));
app.use(express.json()); // --- 新增：用於解析 JSON 格式的請求體 ---

// MySQL 資料庫連接配置
const dbConfig = {
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: process.env.MYSQL_PORT,
    // --- 新增：連接池配置 ---
    waitForConnections: true,  // 池滿時等待，而不是立即報錯
    connectionLimit: 10,       // 最大連接數，對於中小型應用 10 個通常足夠
    queueLimit: 0,             // 等待隊列不限制
    enableKeepAlive: true,     // 啟用 TCP KeepAlive
    keepAliveInitialDelay: 10000 // 10秒後開始發送 KeepAlive 包，防止連接因閒置被斷開
};

// ======================= 核心修改點 1 =======================
// 不再使用單一全局連接，而是創建一個全局的連接池
// The pool will handle connection lifecycle, including reconnection.
let pool;
try {
    pool = mysql.createPool(dbConfig);
    console.log('成功創建 MySQL 連接池！');
    // 我們可以立即測試一下連接池是否能工作
    pool.getConnection()
        .then(conn => {
            console.log('連接池成功獲取了一個測試連接。');
            conn.release(); // 歸還連接
        })
        .catch(err => {
            console.error('創建連接池後測試連接失敗:', err.message);
            // 根據錯誤代碼提供更詳細的提示
            if (err.code === ER_BAD_DB_ERROR) {
                console.error(`錯誤：資料庫 '${dbConfig.database}' 不存在。請檢查資料庫名稱或手動創建。`);
            } else {
                console.error('請檢查 MySQL 服務器配置、網絡和防火牆設置。');
            }
        });
} catch (error) {
    console.error('創建 MySQL 連接池失敗:', error);
    process.exit(1); // 如果連池子都創建不了，直接退出應用
}
// ==========================================================

// --- 新增：報警系統核心邏輯 ---
const SETTINGS_FILE_PATH = path.join(__dirname, 'settings.json');
let alarmState = {}; // 用於存儲每個監控項的報警狀態 (e.g., { voltageVa: 'NORMAL' | 'TRIGGERED' })

// 檢查警報的函數
async function checkAlarms() {
    try {
        // a. 加載報警設置
        // 首先嘗試讀取設置，如果沒有設置，則無需查詢數據庫
        const settingsData = await fs.readFile(SETTINGS_FILE_PATH, 'utf8');
        const settings = JSON.parse(settingsData);
        
        // 檢查是否有任何閾值或收件人被設置，如果沒有則直接返回
        if (Object.keys(settings).length === 0) {
            return;
        }

        // b. 獲取最新數據
        const [rows] = await pool.query('SELECT * FROM tbl_ndas1 ORDER BY datetime_insert DESC LIMIT 1');
        if (rows.length === 0) return;
        const latestData = rows[0];

        // c. 逐一檢查閾值
        for (const key in settings) {
            // 只檢查以 'Threshold' 結尾的鍵，並確保它不是空的或 null
            if (key.endsWith('Threshold') && settings[key]) {
                const metricName = key.replace('Threshold', ''); // e.g., 'voltageVa'
                
                // 確保最新數據中存在對應的字段
                if (latestData[metricName] !== undefined) {
                    const threshold = parseFloat(settings[key]);
                    const currentValue = parseFloat(latestData[metricName]);

                    // 初始化狀態
                    if (!alarmState[metricName]) {
                        alarmState[metricName] = 'NORMAL';
                    }

                    // 檢查是否超限
                    if (currentValue > threshold) {
                        // 如果當前狀態是 NORMAL，則觸發警報並更新狀態
                        if (alarmState[metricName] === 'NORMAL') {
                            console.log(`警報觸發: ${metricName} 當前值 ${currentValue} 超過閾值 ${threshold}`);
                            alarmState[metricName] = 'TRIGGERED'; // 更新狀態防止重複發送

                            const subject = `[VPMS 警報] ${metricName} 超出閾值`;
                            const message = `
                                <h3>VPMS 警報通知</h3>
                                <p><b>監控項:</b> ${metricName}</p>
                                <p><b>當前值:</b> ${currentValue}</p>
                                <p><b>設定閾值:</b> ${threshold}</p>
                                <p><b>時間:</b> ${new Date(latestData.datetime_insert).toLocaleString()}</p>
                            `;
                            
                            // 發送通知 (使用 settings 中的收件人列表)
                            sendEmailAlert(subject, message, settings.emailRecipients);
                            
                            // --- 修改：使用 settings.json 中的 Telegram 收件人列表 ---
                            if (settings.telegramRecipients && settings.telegramRecipients.length > 0) {
                                sendTelegramAlert(message, settings.telegramRecipients);
                            }
                        }
                    } else {
                        // 如果值已恢復正常，重置狀態
                        if (alarmState[metricName] === 'TRIGGERED') {
                            console.log(`狀態恢復: ${metricName} 當前值 ${currentValue} 已恢復正常。`);
                            alarmState[metricName] = 'NORMAL';
                            // (可選) 在這裡可以發送一條恢復正常的通知
                        }
                    }
                }
            }
        }
    } catch (error) {
        // 如果 settings.json 不存在或為空導致解析失敗，這是正常情況，靜默處理
        if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
            console.error("檢查警報時出錯:", error);
        }
    }
}
// --- 新增結束 ---


// API 端點：獲取 MySQL 中的資料
app.get('/api/data', async (req, res) => {
    let connection; 

    try {
        // 從連接池獲取一個連接
        connection = await pool.getConnection();

        // --- 新增：打印原始请求参数 ---
        console.log('Backend Received Query Parameters:', req.query);
        // --- 新增结束 ---

        // 從查詢參數中獲取 limit, offset, startDate, endDate, startTime, endTime
        const limit = req.query.limit ? parseInt(req.query.limit) : null;
        const offset = parseInt(req.query.offset) || 0;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const startTime = req.query.startTime;
        const endTime = req.query.endTime;
        const orderBy = req.query.orderBy === 'DESC' ? 'DESC' : 'ASC'; // 驗證輸入，更安全

        let baseQuery = `FROM tbl_ndas1`;
        let whereClause = '';
        let conditions = [];
        let queryParams = [];

        let minDateTimeString = null;
        let maxDateTimeString = null;

        // 構建最小日期時間字符串
        if (startDate) {
            // 如果 startTime 为空，则默认为 '00:00'
            const tempMinDate = new Date(`${startDate}T${startTime || '00:00'}:00`);
            if (!isNaN(tempMinDate.getTime())) { // 检查日期是否有效
                minDateTimeString = tempMinDate.toISOString().slice(0, 19).replace('T', ' ');
            } else {
                console.error(`Error: Invalid startDate or startTime provided. startDate='${startDate}', startTime='${startTime}'`);
                // 如果日期无效，可以考虑直接返回错误或忽略日期条件
                // 这里选择忽略无效的日期条件，让 minDateTimeString 保持 null
            }
        }

        // 構建最大日期時間字符串
        if (endDate) {
            // 如果 endTime 为空，则默认为 '23:59'
            const tempMaxDate = new Date(`${endDate}T${endTime || '23:59'}:59`);
            if (!isNaN(tempMaxDate.getTime())) { // 检查日期是否有效
                maxDateTimeString = tempMaxDate.toISOString().slice(0, 19).replace('T', ' ');
            } else {
                console.error(`Error: Invalid endDate or endTime provided. endDate='${endDate}', endTime='${endTime}'`);
            }
        } else if (startDate && !endDate) {
            // 如果只提供了开始日期而没有结束日期，则表示搜索当天
            // 此时 endTime 应该基于 startDate
            const tempMaxDate = new Date(`${startDate}T${endTime || '23:59'}:59`);
            if (!isNaN(tempMaxDate.getTime())) { // 检查日期是否有效
                maxDateTimeString = tempMaxDate.toISOString().slice(0, 19).replace('T', ' ');
            } else {
                console.error(`Error: Invalid startDate or endTime provided for single-day search. startDate='${startDate}', endTime='${endTime}'`);
            }
        }

        // --- 新增：打印构建的日期时间字符串 ---
        console.log('Backend Constructed DateTimes:', {
            minDateTimeString: minDateTimeString,
            maxDateTimeString: maxDateTimeString
        });
        // --- 新增结束 ---

        // 添加日期/時間條件到查詢中
        if (minDateTimeString && maxDateTimeString) {
            conditions.push(`datetime_insert BETWEEN ? AND ?`);
            queryParams.push(minDateTimeString, maxDateTimeString);
        } else if (minDateTimeString) {
            conditions.push(`datetime_insert >= ?`);
            queryParams.push(minDateTimeString);
        } else if (maxDateTimeString) {
            conditions.push(`datetime_insert <= ?`);
            queryParams.push(maxDateTimeString);
        }

        if (conditions.length > 0) {
            whereClause = ` WHERE ` + conditions.join(' AND ');
        }

        // --- 新增：打印最终的 SQL 条件和参数 ---
        console.log('Backend SQL Conditions:', conditions);
        console.log('Backend SQL Query Parameters:', queryParams);
        // --- 新增结束 ---

        // 1. 獲取總資料筆數
        const countQuery = `SELECT COUNT(*) AS totalCount ${baseQuery}${whereClause}`;
        const [countRows] = await connection.execute(countQuery, queryParams);
        const totalCount = countRows[0].totalCount;

        // 2. 獲取分頁資料
        let dataQuery = `SELECT id, datetime_insert, pump_id, va, vb, vc, ia, ib, ic, pres1, pres2, pres3, vibx, viby, vibz, energy_consumption, temperature, power ${baseQuery}${whereClause} ORDER BY datetime_insert ${orderBy}`;
        let dataQueryParams = [...queryParams];

        if (limit !== null) {
            dataQuery += ` LIMIT ? OFFSET ?`;
            dataQueryParams.push(limit, offset);
        }

        const [rows] = await connection.execute(dataQuery, dataQueryParams);

        res.json({
            data: rows,
            totalCount: totalCount
        });

    } catch (error) {
        // 始终在服务器端打印完整的错误对象，以便详细调试
        console.error('從資料庫獲取資料失敗:', error.message);
        console.error('Full Error Object:', error); 

        // 根据错误类型返回不同的 HTTP 状态码和错误信息给客户端
        if (error.code === ER_NO_SUCH_TABLE || error.code === ER_BAD_DB_ERROR) {
            // 404 Not Found: 表格或資料庫不存在
            res.status(404).json({ 
                error: '找不到表格或資料庫。請檢查資料庫配置或表格名稱。',
                details: error.message,
                errorCode: error.code 
            });
        } else if (error.code) {
            // 500 Internal Server Error: 其他已知的 MySQL 错误 (例如连接问题, 权限问题, SQL 语法错误等)
            res.status(500).json({
                error: `資料庫操作失敗: ${error.message}`,
                details: `MySQL 錯誤代碼: ${error.code}`,
                errorCode: error.code,
                // 如果需要，可以添加更多错误信息，但要小心不要暴露敏感数据
                // sqlMessage: error.sqlMessage // 谨慎暴露，可能包含敏感信息
            });
        } else {
            // 500 Internal Server Error: 任何其他未预期的服务器内部错误 (例如代码逻辑错误, 网络问题等)
            res.status(500).json({
                error: `伺服器內部錯誤: ${error.message}`,
                details: '請檢查伺服器日誌以獲取更多信息。'
            });
        }
    } finally {
        // 最重要的一步：無論 try 塊是成功還是失敗，
        // 只要 connection 成功獲取了，就必須將其歸還給池子。
        if (connection) {
            connection.release();
        }
    }
});

// --- 新增：用於管理報警設置的 API 端點 ---

// 獲取報警設置 API
app.get('/api/settings', async (req, res) => {
    try {
        const data = await fs.readFile(SETTINGS_FILE_PATH, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        // 如果文件不存在，返回空對象，前端頁面不會報錯
        if (error.code === 'ENOENT') {
            res.json({});
        } else {
            console.error('讀取設置文件失敗:', error);
            res.status(500).json({ error: '無法讀取設置' });
        }
    }
});

// 保存報警設置 API
app.post('/api/settings', async (req, res) => {
    try {
        const receivedSettings = req.body;
        const sanitizedSettings = {};

        // 1. 验证和清理阈值
        const thresholdKeys = [
            'voltageVaThreshold', 'voltageVbThreshold', 'voltageVcThreshold',
            'currentIaThreshold', 'currentIbThreshold', 'currentIcThreshold',
            'temperatureThreshold', 'vacuumThreshold', 'vibrationXThreshold',
            'vibrationYThreshold', 'vibrationZThreshold'
        ];

        for (const key of thresholdKeys) {
            if (receivedSettings[key] !== null && receivedSettings[key] !== undefined && receivedSettings[key] !== '') {
                const numValue = parseFloat(receivedSettings[key]);
                if (!isNaN(numValue)) {
                    sanitizedSettings[key] = numValue;
                } else {
                    console.warn(`Invalid non-numeric value for ${key}: ${receivedSettings[key]}`);
                }
            } else {
                sanitizedSettings[key] = null; // 明确设置为空
            }
        }

        // 2. 清理邮件收件人
        if (receivedSettings.emailRecipients && typeof receivedSettings.emailRecipients === 'string') {
            sanitizedSettings.emailRecipients = receivedSettings.emailRecipients.split(',').map(e => e.trim()).filter(e => e);
        } else {
            sanitizedSettings.emailRecipients = [];
        }

        // 3. 清理 Telegram 收件人 (与 email 保持一致)
        if (receivedSettings.telegramRecipients && typeof receivedSettings.telegramRecipients === 'string') {
            sanitizedSettings.telegramRecipients = receivedSettings.telegramRecipients.split(',').map(e => e.trim()).filter(e => e);
        } else {
            sanitizedSettings.telegramRecipients = [];
        }

        await fs.writeFile(SETTINGS_FILE_PATH, JSON.stringify(sanitizedSettings, null, 2), 'utf8');
        res.status(200).json({ message: '設置已成功保存' });
    } catch (error) {
        console.error('寫入設置文件失敗:', error);
        res.status(500).json({ error: '無法保存設置' });
    }
});
// --- 新增結束 ---

// --- 新增：用於測試郵件發送功能的 API 端點 ---
app.post('/api/test-email', async (req, res) => {
    const { recipient, subject, message } = req.body;

    if (!recipient) {
        return res.status(400).json({ error: 'Recipient email is required.' });
    }

    console.log(`收到測試郵件請求，發送至: ${recipient}`);

    try {
        // sendEmailAlert 期望一個數組，所以我們將單個收件人放入數組中
        await sendEmailAlert(subject || 'Test Email', message || 'This is a test.', [recipient]);
        res.status(200).json({ message: `Test email successfully sent to ${recipient}.` });
    } catch (error) {
        console.error('發送測試郵件失敗:', error);
        res.status(500).json({ error: 'Failed to send test email. Check server logs for details.' });
    }
});
// --- 新增結束 ---

// --- 新增：用於測試 Telegram 發送功能的 API 端點 ---
app.post('/api/test-telegram', async (req, res) => {
    const { chatIds, message } = req.body;

    if (!chatIds || !message) {
        return res.status(400).json({ error: '请求正文中缺少 chatIds 或 message。' });
    }

    try {
        // 前端传来的 chatIds 是一个字符串，需要分割成数组
        const chatIdsArray = chatIds.split(',').map(id => id.trim()).filter(id => id);
        if (chatIdsArray.length === 0) {
             return res.status(400).json({ error: '请提供至少一个有效的 Chat ID。' });
        }

        // 使用 telegramNotifier.js 中的函数发送消息
        // sendTelegramAlert 函数已处理并行发送和日志记录
        await sendTelegramAlert(message, chatIdsArray);
        
        res.status(200).json({ message: '测试 Telegram 消息已成功发送到队列。请检查服务器日志以获取交付状态。' });
    } catch (error) {
        console.error('发送测试 Telegram 消息失败:', error);
        res.status(500).json({ error: '发送测试 Telegram 消息失败。' });
    }
});

// --- 新增：API 404 Not Found 中間件 ---
// 這個中間件應該放在所有 API 路由定義之後。
// 它會捕獲所有未匹配到的 /api/... 請求，並返回一個標準的 JSON 錯誤。
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: `API 端點未找到: ${req.method} ${req.originalUrl}` });
});


// 啟動 Express 伺服器
app.listen(port, () => {
    const serverUrl = `http://localhost:${port}`;
    console.log(`Node.js 伺服器運行在 ${serverUrl}`);
    console.log(`您可以嘗試在終端中運行: "$BROWSER" ${serverUrl}/index.html`);

    // --- 修改：使用更健壯的 setTimeout 循環來代替 setInterval ---
    const runAlarmChecks = () => {
        checkAlarms()
            .catch(err => console.error("Alarm check cycle failed:", err))
            .finally(() => {
                setTimeout(runAlarmChecks, 5000); // 无论成功或失败，5秒后再次执行
            });
    };
    
    // 启动第一次检查
    runAlarmChecks();
});