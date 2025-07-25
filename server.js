// server.js
const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise'); // 保持使用 mysql2/promise

const app = express();
const port = 3000;

// MySQL 錯誤代碼常量
const ER_BAD_DB_ERROR = 1049;
const ER_NO_SUCH_TABLE = 1146;

app.use(express.static(path.join(__dirname, '')));

// MySQL 資料庫連接配置
const dbConfig = {
    host: process.env.MYSQL_HOST || '172.11.88.82',
    user: process.env.MYSQL_USER || 'vpmsadmin',
    password: process.env.MYSQL_PASSWORD || 'Vpms@dmin',
    database: process.env.MYSQL_DATABASE || 'VPMS',
    port: process.env.MYSQL_PORT || 3306,
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

// 啟動 Express 伺服器
app.listen(port, () => {
    console.log(`Node.js 伺服器運行在 http://localhost:${port}`);
    console.log('請打開瀏覽器並訪問 http://localhost:3000/index.html 查看應用程式。');
});