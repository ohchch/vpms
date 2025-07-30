/**
 * 基础认证中间件
 * 检查用户是否已登录。
 * - 对于 API 请求，如果未登录，返回 401 JSON 错误。
 * - 对于页面请求，如果未登录，重定向到登录页。
 */
function isAuthenticated(req, res, next) {
    if (req.session && req.session.user && req.session.user.id) {
        return next(); // 用户已登录，继续
    }

    // 检查请求是否为 API 请求
    if (req.originalUrl.startsWith('/api/')) {
        // 用户未登录，且是 API 请求，返回 401 JSON 错误
        return res.status(401).json({ error: "Authentication required. Please log in." });
    }
    
    // 用户未登录，且是页面请求，重定向到登录页
    res.redirect('/login.html');
}

/**
 * 权限检查中间件生成器
 * @param {string} permissionName - 所需的权限名称 (e.g., 'settings:update')
 * @returns {Function} 一个 Express 中间件
 */
function requirePermission(permissionName) {
    return (req, res, next) => {
        // --- 调试日志 ---
        console.log(`[RBAC DEBUG] Checking permission: '${permissionName}'. User in session:`, req.session.user);

        // 1. 检查用户是否已登录 (逻辑与 isAuthenticated 一致)
        if (!req.session || !req.session.user || !req.session.user.id) {
            if (req.originalUrl.startsWith('/api/')) {
                return res.status(401).json({ error: "Authentication required. Please log in." });
            }
            return res.redirect('/login.html');
        }

        // 2. 检查用户的权限列表是否包含所需权限
        const userPermissions = req.session.user.permissions || [];
        if (userPermissions.includes(permissionName)) {
            return next(); // 权限满足，继续
        }

        // 3. 权限不足，返回 403 Forbidden
        if (req.originalUrl.startsWith('/api/')) {
            return res.status(403).json({ error: `Forbidden: You do not have the required '${permissionName}' permission.` });
        }
        
        res.status(403).send('<h1>403 Forbidden</h1><p>You do not have permission to access this page.</p>');
    };
}

module.exports = {
    isAuthenticated,
    requirePermission,
};