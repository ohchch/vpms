// server.js
const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise'); // 引入 mysql2 套件的 promise 版本
const app = express();
const port = 3000; // 應用程式將在這個端口監聽請求

// MySQL 錯誤代碼常量
const ER_BAD_DB_ERROR = 1049;   // Unknown database '...'
const ER_NO_SUCH_TABLE = 1146;  // Table 'database.table' doesn't exist

// 服務靜態文件：將當前目錄設定為靜態檔案的根目錄，
// 這樣瀏覽器就可以訪問 index.html 和 app.js
app.use(express.static(path.join(__dirname, '')));

// MySQL 資料庫連接配置
const dbConfig = {
    // 這是關鍵！將 'YOUR_OTHER_COMPUTER_IP' 替換為您另一台電腦的實際 IP 地址
    // 例如：'192.168.1.10'
    // 如果您的應用程式在 Docker 容器內運行，且連接的是主機上的 MySQL，則使用 'host.docker.internal' (Windows/macOS Docker Desktop)
    // 如果是 Linux Docker 且連接主機，請使用主機的實際 IP。
    // 如果是連接同一 WiFi 網路中的另一台實體電腦，則必須是那台電腦的實際 IP 地址。
    host: process.env.MYSQL_HOST || '172.11.88.82', // <<-- 務必修改為您另一台電腦的 IP 地址！
    user: process.env.MYSQL_USER || 'vpmsadmin',        // 應用程式連接 MySQL 的用戶名
    password: process.env.MYSQL_PASSWORD || 'Vpms@dmin',  // 應用程式連接 MySQL 的密碼
    database: process.env.MYSQL_DATABASE || 'VPMS', // 根據圖片，資料庫名稱為 'VPMS'
    port: process.env.MYSQL_PORT || 3306            // MySQL 端口
};

let connection; // 用於儲存資料庫連接實例

/**
 * 嘗試連接到 MySQL 資料庫。
 * 如果連接失敗，將在一段時間後重試。
 */
async function connectToDatabase() {
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('成功連接到 MySQL 資料庫！');

        // *** 注意：根據您的要求，已移除所有自動建立表格和插入範例資料的程式碼。***
        // *** 請確保資料庫 'VPMS' 和表格 'tbl_ndas1' 已在您的 MySQL 伺服器中手動創建並包含資料。***

    } catch (err) {
        console.error('連接 MySQL 資料庫失敗:', err.message);
        // 根據錯誤代碼提供更詳細的提示
        if (err.code === ER_BAD_DB_ERROR) {
            console.error(`錯誤：資料庫 '${dbConfig.database}' 不存在。請檢查資料庫名稱或手動創建。`);
        } else {
            console.error('請檢查以下項目：');
            console.error('1. 您另一台電腦上的 MySQL 資料庫是否正在運行。');
            console.error('2. `server.js` 和 `docker-compose.yml` 中的 `MYSQL_HOST` 是否已正確設定為**您另一台電腦的 IP 地址**。');
            console.error('3. MySQL 用戶名、密碼和資料庫名稱是否正確。');
            console.error('4. 另一台電腦的 MySQL 伺服器是否配置為允許從遠端連接（檢查其 `my.ini` 或 `mysqld.cnf` 中的 `bind-address` 設定，以及 MySQL 用戶權限）。');
            console.error('5. 另一台電腦的防火牆（例如 Windows Defender 防火牆）是否允許對 MySQL 端口 3306 的入站連線。');
        }
        console.error('正在嘗試在 5 秒後重試連接...');
        setTimeout(connectToDatabase, 5000); // 如果連接失敗，等待 5 秒後重試
    }
}

// 在伺服器啟動時嘗試連接資料庫
connectToDatabase();

/**
 * API 端點：獲取 MySQL 中的資料。
 * 資料將按 datetime_insert 降序排序。
 */
app.get('/api/data', async (req, res) => {
    // 檢查資料庫連接是否已建立
    if (!connection) {
        console.error('資料庫尚未連接，無法獲取資料。');
        return res.status(500).json({ error: '資料庫尚未連接，請稍候再試。' });
    }

    // 從查詢參數中獲取 limit, offset, searchDate, startTime, endTime
    const limit = req.query.limit ? parseInt(req.query.limit) : null;
    const offset = parseInt(req.query.offset) || 0;
    const searchDate = req.query.searchDate; // 例如：'YYYY-MM-DD'
    const startTime = req.query.startTime;   // 例如：'HH:MM'
    const endTime = req.query.endTime;     // 例如：'HH:MM'
    const orderBy = req.query.orderBy || 'ASC'; // 新增：預設為 ASC，允許 DESC

    let baseQuery = `FROM tbl_ndas1`;
    let conditions = [];
    let queryParams = [];

    if (searchDate) {
        let startDateTimeString;
        let endDateTimeString;

        // 構建時間範圍的開始點
        if (startTime) {
            // 創建一個代表本地時間的 Date 物件
            const localStart = new Date(`${searchDate}T${startTime}:00`);
            // 將此本地時間 Date 物件轉換為 UTC ISO 字串，並格式化為 MySQL DATETIME 格式
            // 假設資料庫儲存的是 UTC 時間
            startDateTimeString = localStart.toISOString().slice(0, 19).replace('T', ' ');
        } else {
            // 如果沒有提供開始時間，則設定為該日期的開始 (00:00:00)
            const localStart = new Date(`${searchDate}T00:00:00`);
            startDateTimeString = localStart.toISOString().slice(0, 19).replace('T', ' ');
        }

        // 構建時間範圍的結束點
        if (endTime) {
            // 創建一個代表本地時間的 Date 物件
            const localEnd = new Date(`${searchDate}T${endTime}:59`);
            localEnd.setMilliseconds(999); // 確保包含該分鐘的最後一毫秒
            // 將此本地時間 Date 物件轉換為 UTC ISO 字串
            endDateTimeString = localEnd.toISOString().slice(0, 19).replace('T', ' ');
        } else {
            // 如果沒有提供結束時間，則設定為該日期的結束 (23:59:59)
            const localEnd = new Date(`${searchDate}T23:59:59`);
            localEnd.setMilliseconds(999); // 確保包含該分鐘的最後一毫秒
            endDateTimeString = localEnd.toISOString().slice(0, 19).replace('T', ' ');
        }

        // 將日期時間範圍作為查詢條件
        conditions.push(`datetime_insert BETWEEN ? AND ?`);
        queryParams.push(startDateTimeString, endDateTimeString);

    } else if (startTime || endTime) {
        // 如果只提供時間範圍而沒有提供日期，發出警告，因為對於 DATETIME 欄位，這會跨越所有日期，可能不符合預期
        console.warn('僅提供時間範圍而未提供日期，搜尋結果將不包含時間篩選。請同時提供日期以進行精確的時間範圍搜尋。');
    }

    if (conditions.length > 0) {
        whereClause = ` WHERE ` + conditions.join(' AND ');
    } else {
        whereClause = '';
    }

    // 1. 獲取總資料筆數
    try {
        const [countRows] = await connection.execute(`SELECT COUNT(*) AS totalCount ${baseQuery}${whereClause}`, queryParams);
        const totalCount = countRows[0].totalCount;

        // 2. 獲取分頁資料
        // Modified: use orderBy parameter
        let dataQuery = `SELECT * ${baseQuery}${whereClause} ORDER BY datetime_insert ${orderBy}`;
        let dataQueryParams = [...queryParams]; // 複製參數以供分頁查詢使用

        if (limit !== null) {
            dataQuery += ` LIMIT ? OFFSET ?`; // 使用 offset 只有在 limit 存在時用於分頁
            dataQueryParams.push(limit, offset);
        }

        const [rows] = await connection.execute(dataQuery, dataQueryParams);

        // 將資料和總筆數一起返回
        res.json({
            data: rows,
            totalCount: totalCount
        });

    } catch (error) {
        console.error('從資料庫獲取資料失敗:', error.message);
        // 根據錯誤代碼判斷是否為「找不到表格或資料庫」的錯誤
        if (error.code === ER_NO_SUCH_TABLE || error.code === ER_BAD_DB_ERROR) {
            return res.status(404).json({ error: '找不到表格或資料庫。' }); // 回傳 404 狀態碼和特定錯誤訊息
        } else {
            return res.status(500).json({ error: '從資料庫獲取資料失敗。' }); // 回傳通用錯誤訊息
        }
    }
});

// 啟動 Express 伺服器並監聽指定端口
app.listen(port, () => {
    console.log(`Node.js 伺服器運行在 http://localhost:${port}`);
    console.log('請打開瀏覽器並訪問 http://localhost:3000/index.html 查看應用程式。');
});