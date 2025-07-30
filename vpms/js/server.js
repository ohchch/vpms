// server.js
const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise'); // 保持使用 mysql2/promise
require('dotenv').config(); // --- 新增：在最頂部加載 .env 文件中的環境變量 ---
const fs = require('fs').promises; // --- 新增：引入文件系統模塊 ---

// --- 新增：引入会话管理和密码哈希模块 ---
const session = require('express-session');
const bcrypt = require('bcrypt');
const saltRounds = 10; // 用于 bcrypt 的 salt 轮数，数值越高越安全但越慢

// --- 新增：引入我們自己的通知模塊 ---
const { sendEmailAlert } = require('./emailNotifier');
const { sendTelegramAlert } = require('./telegramNotifier'); // 确保已导入

// --- 新增：引入我们自己的中间件 ---
const { isAuthenticated, requirePermission } = require('./middleware');


const app = express();
const port = 3000;

// MySQL 錯誤代碼常量
const ER_BAD_DB_ERROR = 1049;
const ER_NO_SUCH_TABLE = 1146;

app.use(express.static(path.join(__dirname, '')));
app.use(express.json()); // --- 新增：用於解析 JSON 格式的請求體 ---

// --- 新增：配置 express-session 中间件 ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'a-default-secret-key-for-development', // 强烈建议在 .env 中设置
    resave: false, // 强制会话在没有变动时也保存，设为 false
    saveUninitialized: false, // 强制未初始化的会话保存，设为 false
    cookie: {
        secure: false, // 在生产环境中应设为 true，并使用 HTTPS
        httpOnly: true, // 防止客户端脚本访问 cookie
        maxAge: 24 * 60 * 60 * 1000 // cookie 有效期 24 小时
    }
}));

// --- 新增：受保护的页面路由 ---
// 将受保护的页面路由放在 express.static 之前，以确保它们被优先处理

// 这些页面只需要登录即可访问 (Operator 和 Admin 都可以)
app.get('/dashboard.html', isAuthenticated, (req, res) => {
    // 修改：路径现在相对于 server.js 的新位置
    res.sendFile(path.join(__dirname, '../html/dashboard.html'));
});
app.get('/charts.html', isAuthenticated, (req, res) => {
    // 修改：路径现在相对于 server.js 的新位置
    res.sendFile(path.join(__dirname, '../html/charts.html'));
});
app.get('/index.html', isAuthenticated, (req, res) => {
    // 修改：路径现在相对于 server.js 的新位置
    res.sendFile(path.join(__dirname, '../html/index.html'));
});

// 这些页面需要特定的权限 (理论上只有 Admin 可以访问)
app.get('/settings.html', requirePermission('settings:read'), (req, res) => {
    // 修改：路径现在相对于 server.js 的新位置
    res.sendFile(path.join(__dirname, '../html/settings.html'));
});
app.get('/test.html', requirePermission('notification:test'), (req, res) => {
    // 修改：路径现在相对于 server.js 的新位置
    res.sendFile(path.join(__dirname, '../html/test.html'));
});


// 静态文件服务：
// 1. 将 html 目录作为根目录提供服务，这样 /index.html 就能直接访问
app.use(express.static(path.join(__dirname, '../html')));
// 2. 为其他资源（CSS, JS, 图片）创建虚拟路径，方便在 HTML 中使用绝对路径引用
app.use('/css', express.static(path.join(__dirname, '../css')));
app.use('/js', express.static(path.join(__dirname, '../js')));
app.use('/img', express.static(path.join(__dirname, '../img'))); // 确保 logo.png 可以被访问

app.use(express.json()); // 用于解析 JSON 格式的请求体

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

// --- 新增：认证和授权中间件 ---
// const isAuthenticated = (req, res, next) => {
//     if (req.session.user) {
//         return next();
//     }
//     // 如果是 API 请求，返回 401 JSON 错误
//     if (req.originalUrl.startsWith('/api/')) {
//         return res.status(401).json({ error: 'Unauthorized: You must be logged in.' });
//     }
//     // 如果是页面请求，重定向到登录页
//     res.redirect('/login.html');
// };


// --- 新增：報警系統核心邏輯 ---
// 修改：SETTINGS_FILE_PATH 现在指向新的 config 目录
const SETTINGS_FILE_PATH = path.join(__dirname, '../config/settings.json');
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

// --- 新增：用户认证 API 端点 ---

// 用户注册
app.post('/api/register', async (req, res) => {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
        return res.status(400).json({ error: 'Username, email, and password are required.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();

        // 对密码进行哈希处理
        const passwordHash = await bcrypt.hash(password, saltRounds);

        let roleId;
        const [userCountResult] = await connection.query('SELECT COUNT(*) as count FROM users');
        const userCount = userCountResult[0].count;

        if (userCount === 0) {
            // 如果是第一个注册的用户，则自动赋予 'Admin' 角色
            const [adminRole] = await connection.query('SELECT id FROM roles WHERE name = ?', ['Admin']);
            if (adminRole.length === 0) {
                throw new Error('Admin role not found in database. Please run migrations and seeds.');
            }
            roleId = adminRole[0].id;
            console.log(`First user ${username} registered and assigned 'Admin' role.`);
        } else {
            // 默认新用户为 'Operator' 角色
            const [operatorRole] = await connection.query('SELECT id FROM roles WHERE name = ?', ['Operator']);
            if (operatorRole.length === 0) {
                throw new Error('Operator role not found in database. Please run migrations and seeds.');
            }
            roleId = operatorRole[0].id;
            console.log(`New user ${username} registered and assigned 'Operator' role.`);
        }

        // 将新用户插入数据库
        const [result] = await connection.query(
            'INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)',
            [username, passwordHash, email]
        );
        const newUserId = result.insertId;

        // 插入用户角色
        await connection.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [newUserId, roleId]);

        // 注册成功，返回 201 Created 和 JSON 响应
        res.status(201).json({ success: true, message: "Registration successful. Please log in." });

    } catch (error) {
        console.error('Registration failed:', error);

        // 检查是否为重复条目错误 (ER_DUP_ENTRY)
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Username or email already exists.' });
        }
        
        // 如果是自定义的错误信息（例如角色未找到），则直接返回
        if (error.message.includes('role not found')) {
            return res.status(500).json({ error: error.message });
        }
        
        // 其他错误返回通用 500 错误
        res.status(500).json({ error: 'Internal server error during registration.' });
    } finally {
        if (connection) connection.release();
    }
});


// 用户登录
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        const [users] = await connection.query('SELECT * FROM users WHERE username = ?', [username]);

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        const user = users[0];
        const passwordMatch = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        // --- 核心修复：登录成功后，查询并附加用户权限到会话中 ---
        const [permissionsResult] = await connection.query(`
            SELECT p.name
            FROM users u
            JOIN user_roles ur ON u.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            JOIN role_permissions rp ON r.id = rp.role_id
            JOIN permissions p ON rp.permission_id = p.id
            WHERE u.id = ?
        `, [user.id]);

        const userPermissions = permissionsResult.map(row => row.name);

        // 在 session 中存储用户信息和权限列表
        req.session.user = {
            id: user.id,
            username: user.username,
            permissions: userPermissions // 附加权限列表
        };
        
        console.log(`User '${user.username}' logged in with permissions:`, userPermissions); // 增加日志方便调试

        res.status(200).json({ message: 'Login successful.' });

    } catch (error) {
        console.error('Login failed:', error);
        res.status(500).json({ error: 'Internal server error during login.' });
    } finally {
        if (connection) connection.release();
    }
});

// 用户登出
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'Could not log out, please try again.' });
        }
        res.clearCookie('connect.sid'); // 清除 cookie
        res.status(200).json({ message: 'Logout successful.' });
    });
});

// 用户登出路由 (GET 请求，用于页面跳转)
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Session destruction error:', err);
            return res.status(500).send('Could not log out.');
        }
        res.clearCookie('connect.sid'); // 清除 cookie
        res.redirect('/login.html'); // 登出成功重定向到登录页
    });
});

// 获取当前用户会话信息的 API
// This endpoint is protected by the `isAuthenticated` middleware.
app.get('/api/session/me', isAuthenticated, (req, res) => {
    // If the request reaches this point, `req.session.user` is guaranteed to exist.
    // We return only the necessary information to the client.
    if (req.session.user) {
        res.json({
            username: req.session.user.username,
            permissions: req.session.user.permissions || []
        });
    } else {
        // This is a fallback, as the middleware should prevent unauthenticated access.
        res.status(401).json({ error: 'Not authenticated' });
    }
});

// 获取当前用户会话信息的 API
app.get('/api/session/me', isAuthenticated, (req, res) => {
    // isAuthenticated 确保了只有登录用户能访问
    // 我们的会话结构是 req.session.user = { id, username, permissions }
    if (req.session.user) {
        res.json({
            username: req.session.user.username,
            permissions: req.session.user.permissions || []
        });
    } else {
        // 理论上 isAuthenticated 会阻止这种情况，但作为安全备份
        res.status(401).json({ error: 'Not authenticated' });
    }
});

// API 端點：獲取 MySQL 中的資料
// --- 修改：使用 requirePermission 中间件进行权限检查 ---
app.get('/api/data', requirePermission('data:read'), async (req, res) => {
    let connection; 

    try {
        connection = await pool.getConnection();

        // 1. 解析并验证分页和排序参数
        const limit = parseInt(req.query.limit, 10) || 20; // 每页数量，默认为 20
        const offset = parseInt(req.query.offset, 10) || 0; // 偏移量，默认为 0
        const orderBy = req.query.orderBy === 'ASC' ? 'ASC' : 'DESC'; // 安全地处理排序方向

        // 2. 构建动态的 WHERE 子句和参数，防止 SQL 注入
        const whereClauses = [];
        const params = [];

        if (req.query.startDate) {
            const startDateTime = `${req.query.startDate} ${req.query.startTime || '00:00:00'}`;
            whereClauses.push('datetime_insert >= ?');
            params.push(startDateTime);
        }
        if (req.query.endDate) {
            const endDateTime = `${req.query.endDate} ${req.query.endTime || '23:59:59'}`;
            whereClauses.push('datetime_insert <= ?');
            params.push(endDateTime);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // 3. 执行两个查询：一个获取总数，一个获取当页数据
        //    使用 Promise.all 并行执行，提升效率
        const [totalCountResult, dataResult] = await Promise.all([
            // 查询总记录数
            connection.query(`SELECT COUNT(*) as totalCount FROM tbl_ndas1 ${whereSql}`, params),
            // 查询当前页的数据
            connection.query(`SELECT * FROM tbl_ndas1 ${whereSql} ORDER BY datetime_insert ${orderBy} LIMIT ? OFFSET ?`, [...params, limit, offset])
        ]);

        const totalCount = totalCountResult[0][0].totalCount;
        const data = dataResult[0];

        // 4. 返回结构化的 JSON 响应
        res.json({
            data: data,
            totalCount: totalCount
        });

    } catch (error) {
        console.error('Error fetching data from MySQL:', error);
        // 根据错误类型返回不同的状态码
        if (error.code === ER_NO_SUCH_TABLE || error.code === ER_BAD_DB_ERROR) {
            res.status(503).json({ error: 'Database service unavailable or table not found.' });
        } else {
            res.status(500).json({ error: 'Internal server error while fetching data.' });
        }
    } finally {
        if (connection) {
            connection.release(); // 将连接归还给连接池
        }
    }
});

// --- 新增：用於管理報警設置的 API 端點 ---

// 獲取報警設置 API
// --- 修改：使用 requirePermission 中间件进行权限检查 ---
app.get('/api/settings', requirePermission('settings:read'), async (req, res) => {
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
// --- 修改：使用 requirePermission 中间件进行权限检查 ---
app.post('/api/settings', requirePermission('settings:update'), async (req, res) => {
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
// --- 修改：使用 requirePermission 中间件进行权限检查 ---
app.post('/api/test-email', requirePermission('notification:test'), async (req, res) => {
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
// --- 修改：使用 requirePermission 中间件进行权限检查 ---
app.post('/api/test-telegram', requirePermission('notification:test'), async (req, res) => {
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
        res.status(500).json({ error: '发送测试 Telegram 消消息失败。' });
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

// 用户登录路由
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).send('Username and password are required.');
    }

    try {
        // 1. 根据用户名查找用户
        const [users] = await db.execute('SELECT id, username, password_hash FROM users WHERE username = ?', [username]);

        if (users.length === 0) {
            // 模糊错误信息，防止用户名枚举
            return res.status(401).send('Invalid username or password.');
        }

        const user = users[0];

        // 2. 比较密码
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).send('Invalid username or password.');
        }

        // 3. 登录成功：查询用户所有权限并存入会话
        const [permissionsResult] = await db.execute(`
            SELECT p.name
            FROM users u
            JOIN user_roles ur ON u.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            JOIN role_permissions rp ON r.id = rp.role_id
            JOIN permissions p ON rp.permission_id = p.id
            WHERE u.id = ?
        `, [user.id]);

        const userPermissions = permissionsResult.map(row => row.name);

        // 4. 将用户信息和权限存入会话
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.permissions = userPermissions; // 存储权限列表

        // console.log(`User ${user.username} logged in with permissions:`, userPermissions); // 调试用

        res.redirect('/dashboard.html'); // 登录成功重定向到仪表盘
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).send('Server error during login.');
    }
});