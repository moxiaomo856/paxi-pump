// ============================================================
// i18n.js —— 中英文切换字典（数据驱动 + 事件通知）
// ============================================================
(function (global) {
    'use strict';

    // 支持的语言
    const SUPPORTED = ['zh', 'en'];

    // 默认语言
    const DEFAULT_LANG = 'zh';

    // 从 localStorage 读取上次选择的语言，缺失则用默认值
    function detectLang() {
        try {
            const saved = localStorage.getItem('paxi_lang');
            if (saved && SUPPORTED.includes(saved)) return saved;
        } catch (_) { /* localStorage 可能被禁用 */ }
        // 跟随浏览器语言（仅做兜底）
        const nav = (global.navigator && (global.navigator.language || global.navigator.userLanguage)) || '';
        if (nav.toLowerCase().startsWith('en')) return 'en';
        return DEFAULT_LANG;
    }

    // ============================================================
    // 文案字典
    // ============================================================
    const STRINGS = {
        zh: {
            pageTitle: '🚀 Paxi Pump',
            pageHeading: '🚀 Paxi Pump',
            langToggleLabel: 'EN',
            langToggleTitle: '切换到英文',
            walletDisconnected: '未连接',
            walletConnectedPrefix: '✅',
            connectBtn: '连接钱包',
            connectedBtn: '已连接',
            templateLabel: '选择模板',
            feeLabel: '预估手续费',
            feeUnit: ' PAXI',
            deployBtn: '🚀 创建代币',
            deployingBtn: '部署中...',
            revokingBtn: '撤销权限中...',
            templateLoadFail: '模板加载失败',
            alertInstallWallet: '请先安装 PaxiHub 或 Keplr 钱包！',
            alertConnectFirst: '请先连接钱包',
            alertSelectTemplate: '请先选择模板',
            alertUploadFail: '图片上传失败：',
            alertDeployFail: '部署失败: ',
            alertImageType: '请选择图片文件（JPG / PNG / GIF 等）',
            alertImageSize: '图片大小不能超过 32MB',
            alertReadFileFail: '读取图片文件失败',
            alertUploadGeneral: '图片上传失败',
            // 表单字段（与 templates.json 的 param.key 对应）
            fields: {
                name: '代币名称',
                symbol: '代币符号',
                decimals: '小数位数',
                total_supply: '总发行量（单位：枚）',
                project: '项目名称（填写网址）',
                description: '代币描述',
                logo_url: 'Logo URL（必填）',
                minter: '铸造者地址'
            },
            // 仿官方风格：placeholder 当标题
            placeholders: {
                name: '代币名称',
                symbol: '代币符号（例如 PAXI）',
                project: '项目网址 https://…',
                description: '代币描述'
            },
            // 模板下拉框选项名称（key 与 templates.json 的 id 对应）
            templates: {
                prc20: 'PRC-20 同质化代币',
                prc721: 'PRC-721 NFT 藏品'
            },
            // logo_url 输入框 placeholder
            logoUrlPlaceholder: '或粘贴图片链接（https://…）',
            // 上传按钮
            uploadingBtn: '上传中...',
            // 部署结果
            resultSuccessTitle: '✅ 代币发行成功！',
            resultContractAddr: '合约地址：',
            resultTxHash: '交易哈希：',
            resultTotalSupply: '总发行量：',
            resultTotalSupplySuffix: ' 枚（全部已发送到你的钱包）',
            resultFee: '手续费：',
            resultFeeSuffix: ' PAXI（已自动扣除）',
            resultLogoUrl: 'Logo URL：',
            resultNoLogo: '无',
            resultMinter: '铸造者（minter）：',
            resultMinterSuffix: '（你可用此地址后续增发）',
            resultMinterRevokedSuffix: '（铸币/冻结权限已于发行后自动撤销）',
            resultRevokeLabel: '铸币/冻结权限：',
            resultRevokeOk: '已自动撤销（不可再增发，账户不可被冻结）',
            resultRevokeFail: '自动撤销失败，请尽快向合约手动发送 update_minter 置空交易！',
            resultNotReadyTitle: '⚠️ 交易已发送，但还没拿到合约地址。',
            resultNotReadyTip: '请稍后自己查询。',
            // 校验错误
            errNameRequired: '代币名称不能为空',
            errSymbolRequired: '代币符号不能为空',
            errNftNameRequired: 'NFT 名称不能为空',
            errNftSymbolRequired: 'NFT 符号不能为空',
            errDecimalsRange: '小数位数必须在 0~36 之间',
            errTotalSupplyPositive: '总发行量必须是大于 0 的整数',
            errLogoRequired: 'Logo URL 是必填项！请上传图片并获取公开链接后填入。',
            errLogoScheme: 'Logo URL 必须以 http://、https:// 或 ipfs:// 开头',
            errProjectUrl: '项目网址必须以 http:// 或 https:// 开头',
            errMinterInvalid: '铸造者地址格式不正确（应为 paxi1 开头的合法地址）',
            errReceiverConfig: '收款地址配置异常',
            errPubkeyMissing: '公钥缺失，请重新连接钱包',
            errUnknownTemplate: '未知模板',
            errChainId: '获取 chainId 失败',
            errAccount: '获取账户信息失败',
            errSignPaxihub: 'PaxiHub 签名失败',
            errBroadcast: '广播失败: ',
            errTxFail: (code, log) => `交易失败 (code=${code}): ${log || ''}`,
            errTxOnchain: '交易上链失败: ',
            errUnknownWallet: '未知钱包类型',
            errTotalSupplyInteger: '总发行量必须是非负整数',
            // 广播日志标签
            statusAria: '切换语言',
            templateLabelText: '选择模板'
        },
        en: {
            pageTitle: '🚀 Paxi Pump',
            pageHeading: '🚀 Paxi Pump',
            langToggleLabel: '中文',
            langToggleTitle: 'Switch to Chinese',
            walletDisconnected: 'Not connected',
            walletConnectedPrefix: '✅',
            connectBtn: 'Connect Wallet',
            connectedBtn: 'Connected',
            templateLabel: 'Select Template',
            feeLabel: 'Estimated Fee',
            feeUnit: ' PAXI',
            deployBtn: '🚀 Create Token',
            deployingBtn: 'Deploying...',
            revokingBtn: 'Revoking permissions...',
            templateLoadFail: 'Failed to load templates',
            alertInstallWallet: 'Please install PaxiHub or Keplr wallet first!',
            alertConnectFirst: 'Please connect a wallet first',
            alertSelectTemplate: 'Please select a template first',
            alertUploadFail: 'Image upload failed: ',
            alertDeployFail: 'Deploy failed: ',
            alertImageType: 'Please select an image file (JPG / PNG / GIF, etc.)',
            alertImageSize: 'Image size must not exceed 32MB',
            alertReadFileFail: 'Failed to read the image file',
            alertUploadGeneral: 'Image upload failed',
            fields: {
                name: 'Token Name',
                symbol: 'Token Symbol',
                decimals: 'Decimals',
                total_supply: 'Total Supply (units)',
                project: 'Project Name (URL)',
                description: 'Token Description',
                logo_url: 'Logo URL (required)',
                minter: 'Minter Address'
            },
            // Official-style: placeholder as title
            placeholders: {
                name: 'Token Name',
                symbol: 'Token Symbol (e.g. PAXI)',
                project: 'Project URL https://…',
                description: 'Token Description'
            },
            // Template dropdown option names (key matches templates.json id)
            templates: {
                prc20: 'PRC-20 Fungible Token',
                prc721: 'PRC-721 NFT Collection'
            },
            logoUrlPlaceholder: 'Or paste an image URL (https://…)',
            uploadingBtn: 'Uploading...',
            resultSuccessTitle: '✅ Token issued successfully!',
            resultContractAddr: 'Contract Address: ',
            resultTxHash: 'Tx Hash: ',
            resultTotalSupply: 'Total Supply: ',
            resultTotalSupplySuffix: ' (all minted to your wallet)',
            resultFee: 'Fee: ',
            resultFeeSuffix: ' PAXI (auto-deducted)',
            resultLogoUrl: 'Logo URL: ',
            resultNoLogo: 'N/A',
            resultMinter: 'Minter: ',
            resultMinterSuffix: ' (you can use this address for future minting)',
            resultMinterRevokedSuffix: ' (mint & freeze authority auto-revoked after issuance)',
            resultRevokeLabel: 'Mint/Freeze Authority: ',
            resultRevokeOk: 'Auto-revoked (no further minting, accounts cannot be frozen)',
            resultRevokeFail: 'Auto-revocation failed! Please manually send an update_minter (null) tx to the contract.',
            resultNotReadyTitle: '⚠️ Tx submitted, but contract address not yet available.',
            resultNotReadyTip: 'Please check back later.',
            errNameRequired: 'Token name is required',
            errSymbolRequired: 'Token symbol is required',
            errNftNameRequired: 'NFT name is required',
            errNftSymbolRequired: 'NFT symbol is required',
            errDecimalsRange: 'Decimals must be between 0 and 36',
            errTotalSupplyPositive: 'Total supply must be a positive integer',
            errLogoRequired: 'Logo URL is required! Please upload an image and paste the public link.',
            errLogoScheme: 'Logo URL must start with http://, https:// or ipfs://',
            errProjectUrl: 'Project URL must start with http:// or https://',
            errMinterInvalid: 'Invalid minter address (should start with paxi1)',
            errReceiverConfig: 'Receiver address configuration error',
            errPubkeyMissing: 'Public key missing, please reconnect wallet',
            errUnknownTemplate: 'Unknown template',
            errChainId: 'Failed to fetch chainId',
            errAccount: 'Failed to fetch account info',
            errSignPaxihub: 'PaxiHub signing failed',
            errBroadcast: 'Broadcast failed: ',
            errTxFail: (code, log) => `Transaction failed (code=${code}): ${log || ''}`,
            errTxOnchain: 'Transaction failed on-chain: ',
            errUnknownWallet: 'Unknown wallet type',
            errTotalSupplyInteger: 'Total supply must be a non-negative integer',
            statusAria: 'Switch language',
            templateLabelText: 'Select Template'
        }
    };

    let currentLang = detectLang();

    function setLanguage(lang) {
        if (!SUPPORTED.includes(lang)) return;
        currentLang = lang;
        try { localStorage.setItem('paxi_lang', lang); } catch (_) {}
        // 同步 html lang 与 title（仅在 document 存在时）
        if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.lang = (lang === 'zh') ? 'zh-CN' : 'en';
        }
        // 通知订阅者（兼容无 CustomEvent 的环境）
        try {
            if (typeof CustomEvent !== 'undefined') {
                global.dispatchEvent(new CustomEvent('languagechange', { detail: { lang } }));
            } else if (typeof Event !== 'undefined') {
                const evt = new Event('languagechange');
                evt.detail = { lang };
                global.dispatchEvent(evt);
            }
        } catch (_) { /* 忽略派发失败 */ }
    }

    function getLanguage() { return currentLang; }

    // 取文案：t('connectBtn') / t('fields.name') / t('errTxFail', code, log)
    function lookup(dict, path) {
        if (!dict || !path) return undefined;
        if (path.indexOf('.') === -1) return dict[path];
        const parts = path.split('.');
        let cur = dict;
        for (const p of parts) {
            if (cur == null || typeof cur !== 'object') return undefined;
            cur = cur[p];
        }
        return cur;
    }
    function t(key, ...args) {
        let val = lookup(STRINGS[currentLang], key);
        if (val === undefined) {
            // 缺翻译兜底用中文
            val = lookup(STRINGS[DEFAULT_LANG], key);
            if (val === undefined) return key;
        }
        return typeof val === 'function' ? val(...args) : val;
    }

    // 暴露 API
    global.I18N = {
        t: t,
        setLanguage: setLanguage,
        getLanguage: getLanguage,
        toggleLanguage: function () {
            setLanguage(currentLang === 'zh' ? 'en' : 'zh');
            return currentLang;
        },
        SUPPORTED: SUPPORTED
    };

    // 初始化时设置 html lang（仅当 document 存在时）
    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.lang = (currentLang === 'zh') ? 'zh-CN' : 'en';
    }
})(typeof window !== 'undefined' ? window : globalThis);
