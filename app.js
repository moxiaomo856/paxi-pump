// ============================================================
// 1. 配置信息（Paxi 主网）
// ============================================================
const RPC = 'https://mainnet-rpc.paxinet.io';
const LCD = 'https://mainnet-lcd.paxinet.io';
const DENOM = 'upaxi';
const PREFIX = 'paxi';

// ImgBB 图床 API Key（两个 key 轮询使用，一个失败自动重试另一个）
const IMGBB_API_KEYS = [
    '98eb5c71d6b0ee63b1384f05bc4f0a81',
    'ca48b21f1a93e90b85bee090e34b36f2'
];
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

// 11 个预设收款地址（内部使用，用户不可见）
const FEE_RECEIVERS = [
    "paxi1ngut7ymp4cmzu7drjrc2gv7rhtnq4p0u6cgl0g",
    "paxi1kg0fzzyldr5ldggd8hhvvmyhg9xx3j3uvkn8eg",
    "paxi1m62c5kqs0marmv54scz88nw4cx4k06yehd92fk",
    "paxi120u6khy4n4yk89vmmkynl8r6yruen6sd7k47pe",
    "paxi1c2z42224lqss50t5mme36nmu22r4fwef4rlwxu",
    "paxi19qfjacug75d4jkj5d7r8maachnezgwus0w8wup",
    "paxi164lc3lq67u9ghkuy0k2aa7xcun4al23putcmzn",
    "paxi1hm83zslpckq2xrnsgk3qswksll6esc76suf9sw",
    "paxi16smk5dq5qwyqvhkchrrwxhg9e2w7cvxpsx9f49",
    "paxi194kpjqhyz7re2g749lc2030cgeg4sql5ldvyem",
    "paxi1ykgjrygltdctjlthmhvzv09h3yey0acefmyfnm"
];

let walletType = null;
let walletAddress = '';
let walletPubkey = null; // 缓存公钥，避免重复弹窗
let templates = [];
let currentTemplate = null;

// 取文案快捷方式
const t = (key, ...args) => window.I18N.t(key, ...args);

// ============================================================
// 2. 辅助工具
// ============================================================
function toBase64(bytes) {
    return btoa(String.fromCharCode(...bytes));
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// HTML 转义，防止 XSS
function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 随机选择一个收款地址
function getRandomReceiver() {
    const idx = Math.floor(Math.random() * FEE_RECEIVERS.length);
    return FEE_RECEIVERS[idx];
}

// 校验 bech32 地址格式（简化版：前缀 + 1 + 38位字符）
function isValidPaxiAddress(addr) {
    return typeof addr === 'string' && /^paxi1[0-9a-z]{38}$/.test(addr);
}

// ============================================================
// 全局刷新：把 data-i18n / data-i18n-text / data-i18n-title / data-i18n-aria 应用到 DOM
// ============================================================
function applyI18n(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) el.textContent = t(key);
    });
    scope.querySelectorAll('[data-i18n-text]').forEach(el => {
        const key = el.getAttribute('data-i18n-text');
        if (key) el.textContent = t(key);
    });
    scope.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key) el.title = t(key);
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach(el => {
        const key = el.getAttribute('data-i18n-aria');
        if (key) el.setAttribute('aria-label', t(key));
    });
    // 同步页面的 title
    const titleEl = document.querySelector('title[data-i18n]');
    if (titleEl) document.title = t('pageTitle');
}

// ============================================================
// ImgBB 图片上传（浏览器端直接调用，不需要后端代理）
// 两个 API Key 轮询，一个失败自动重试另一个
// ============================================================
async function uploadToImgbb(file, onProgress) {
    if (!file || !file.type || !file.type.startsWith('image/')) {
        throw new Error(t('alertImageType'));
    }
    if (file.size > 32 * 1024 * 1024) {
        throw new Error(t('alertImageSize'));
    }
    // 读为 base64（去掉 data:image/xxx;base64, 前缀）
    const base64Full = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(new Error(t('alertReadFileFail')));
        fr.readAsDataURL(file);
    });
    const pureBase64 = base64Full.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

    // 按顺序尝试两个 API Key
    let lastErr = null;
    for (let i = 0; i < IMGBB_API_KEYS.length; i++) {
        const key = IMGBB_API_KEYS[i];
        const formData = new FormData();
        formData.append('key', key);
        formData.append('image', pureBase64);
        formData.append('name', file.name || 'paxi-logo');

        try {
            const resp = await fetch(IMGBB_UPLOAD_URL, {
                method: 'POST',
                body: formData
            });
            const data = await resp.json();
            if (resp.ok && data && data.success && data.data && (data.data.url || data.data.display_url)) {
                // 优先返回 display_url，其次 url（display_url 带缩略图框架）
                return data.data.url || data.data.display_url;
            } else {
                const errMsg = (data && data.error && data.error.message)
                    || (data && data.status_code ? `status=${data.status_code}` : t('alertUploadGeneral'));
                lastErr = new Error(`Key${i + 1} ${errMsg}`);
                continue;
            }
        } catch (e) {
            lastErr = new Error(`Key${i + 1}: ${e.message || e}`);
            continue;
        }
    }
    throw lastErr || new Error(t('alertUploadGeneral'));
}

// 用 BigInt 计算发行量，避免浮点精度丢失
function calculateAmount(totalSupply, decimals) {
    const totalStr = String(totalSupply).trim();
    if (!/^\d+$/.test(totalStr)) {
        throw new Error(t('errTotalSupplyInteger'));
    }
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
        throw new Error(t('errDecimalsRange'));
    }
    const totalBigInt = BigInt(totalStr);
    const multiplier = BigInt(10) ** BigInt(decimals);
    return (totalBigInt * multiplier).toString();
}

// ============================================================
// 极简 protobuf 编码器（仅用于 MsgInstantiateContract）
// 因为 paxi-cosmjs.umd.js 没有把 MsgInstantiateContract 暴露到全局 PaxiCosmJS，
// 所以这里手工编码 protobuf 字节，再用 PaxiCosmJS.Any 包装。
// MsgInstantiateContract 字段：
//   1: sender  (string, wire=2)
//   2: admin   (string, wire=2, optional)
//   3: code_id (uint64, wire=0)
//   4: label   (string, wire=2)
//   5: msg     (bytes, wire=2)
//   6: funds   (repeated Coin, wire=2) —— 本工具不附带资金，留空
// ============================================================
function concatBytes(arrs) {
    const total = arrs.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of arrs) { out.set(a, off); off += a.length; }
    return out;
}
function encodeVarintBytes(n) {
    let v = BigInt(n);
    const bytes = [];
    if (v === 0n) return Uint8Array.of(0);
    while (v > 0n) {
        let low = Number(v & 0x7fn);
        v >>= 7n;
        if (v > 0n) low |= 0x80;
        bytes.push(low);
    }
    return Uint8Array.from(bytes);
}
function encodeTag(fieldNumber, wireType) {
    return encodeVarintBytes((BigInt(fieldNumber) << 3n) | BigInt(wireType));
}
function encodeStringField(fieldNumber, str) {
    const body = new TextEncoder().encode(str);
    return concatBytes([encodeTag(fieldNumber, 2), encodeVarintBytes(body.length), body]);
}
function encodeBytesField(fieldNumber, bytes) {
    return concatBytes([encodeTag(fieldNumber, 2), encodeVarintBytes(bytes.length), bytes]);
}
function encodeVarintField(fieldNumber, value) {
    return concatBytes([encodeTag(fieldNumber, 0), encodeVarintBytes(value)]);
}
// 手工编码 MsgInstantiateContract，返回原始 protobuf 字节
function encodeMsgInstantiateContract(sender, admin, codeId, label, msgBytes, funds) {
    const parts = [];
    parts.push(encodeStringField(1, sender));
    if (admin) parts.push(encodeStringField(2, admin));
    parts.push(encodeVarintField(3, codeId));
    parts.push(encodeStringField(4, label));
    parts.push(encodeBytesField(5, msgBytes));
    // funds（字段6，repeated Coin）—— 本工具不附带资金，跳过
    return concatBytes(parts);
}

async function fetchChainId() {
    const res = await fetch(`${RPC}/status`);
    if (!res.ok) throw new Error(t('errChainId'));
    const data = await res.json();
    return data.result.node_info.network;
}

async function fetchAccountInfo(address) {
    const res = await fetch(`${LCD}/cosmos/auth/v1beta1/accounts/${address}`);
    if (!res.ok) throw new Error(t('errAccount'));
    const data = await res.json();
    const account = data.account || {};
    const base = account.base_account || account;
    return {
        accountNumber: Number(base.account_number || 0),
        sequence: Number(base.sequence || 0)
    };
}

// ============================================================
// 3. 连接钱包
// ============================================================
async function connectWallet() {
    if (typeof window.paxihub !== 'undefined' && window.paxihub.paxi) {
        try {
            const info = await window.paxihub.paxi.getAddress();
            walletAddress = info.address;
            walletPubkey = new Uint8Array(info.public_key);
            walletType = 'paxihub';
            updateUI(true);
            return;
        } catch (e) {
            console.warn('PaxiHub connection failed:', e);
        }
    }
    if (typeof window.keplr !== 'undefined') {
        try {
            await window.keplr.enable(PREFIX);
            const signer = window.keplr.getOfflineSigner(PREFIX);
            const accounts = await signer.getAccounts();
            walletAddress = accounts[0].address;
            walletPubkey = accounts[0].pubkey;
            walletType = 'keplr';
            updateUI(true);
            return;
        } catch (e) {
            console.warn('Keplr connection failed:', e);
        }
    }
    alert(t('alertInstallWallet'));
}

function updateUI(connected) {
    const statusEl = document.getElementById('status');
    const connectBtn = document.getElementById('connectBtn');
    const deployBtn = document.getElementById('deployBtn');

    if (connected) {
        // 状态文本：✅ + 地址前缀（在已连接基础上保留）
        statusEl.textContent = `${t('walletConnectedPrefix')} ${walletAddress.slice(0, 10)}...`;
        // 注意：保留 emoji 前缀 + 地址缩写，不强制覆盖 statusEl 的 data-i18n
        // 为了避免下次切换语言时把地址前缀覆盖掉，这里直接改 textContent，不重新跑 applyI18n
        statusEl.removeAttribute('data-i18n');
    } else {
        statusEl.textContent = t('walletDisconnected');
        statusEl.setAttribute('data-i18n', 'walletDisconnected');
    }

    connectBtn.textContent = connected ? t('connectedBtn') : t('connectBtn');
    connectBtn.disabled = !!connected;
    deployBtn.disabled = !connected;
    if (connected && currentTemplate) {
        replaceAddressPlaceholder();
    }
}

document.getElementById('connectBtn').addEventListener('click', connectWallet);

// ============================================================
// 4. 加载模板
// ============================================================
async function loadTemplates() {
    try {
        const resp = await fetch('templates.json');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        templates = await resp.json();
        if (!Array.isArray(templates) || templates.length === 0) {
            throw new Error(t('templateLoadFail'));
        }
    } catch (e) {
        document.getElementById('paramsArea').innerHTML =
            `<div style="color:#d9534f;">❌ ${escapeHtml(e.message)}</div>`;
        document.getElementById('deployBtn').disabled = true;
        return;
    }
    const select = document.getElementById('templateSelect');
    templates.forEach((tpl, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = tpl.name;
        select.appendChild(opt);
    });
    select.onchange = () => loadTemplate(select.value);
    loadTemplate(0);
}

// 根据 param.key 取得当前语言的 label
function getParamLabel(p) {
    // 优先用 i18n 字典里的 fields[key]，回退到 p.label
    const translated = t('fields.' + p.key);
    if (translated && translated !== ('fields.' + p.key)) return translated;
    return p.label || p.key;
}

function loadTemplate(index) {
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= templates.length) {
        return;
    }
    currentTemplate = templates[idx];
    const container = document.getElementById('paramsArea');
    container.innerHTML = '';
    currentTemplate.params.forEach(p => {
        const div = document.createElement('div');
        div.className = 'form-group';
        const label = document.createElement('label');
        label.textContent = getParamLabel(p);
        div.appendChild(label);

        // logo_url 字段特殊处理：输入框 + 上传按钮 + 预览
        if (p.key === 'logo_url') {
            const row = document.createElement('div');
            row.className = 'logo-input-row';

            const input = document.createElement('input');
            input.type = 'text';
            input.value = p.default || '';
            input.id = `param_${p.key}`;
            input.dataset.key = p.key;
            input.placeholder = t('logoUrlPlaceholder');
            row.appendChild(input);

            const upBtn = document.createElement('button');
            upBtn.type = 'button';
            upBtn.className = 'logo-upload-btn';
            upBtn.textContent = t('uploadImageBtn');
            row.appendChild(upBtn);

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.className = 'hidden-file';

            // 预览区
            const previewWrap = document.createElement('div');
            previewWrap.className = 'logo-preview-wrap';
            previewWrap.style.display = 'none';
            const previewImg = document.createElement('img');
            previewImg.className = 'logo-preview-img';
            previewImg.alt = 'Logo preview';
            previewWrap.appendChild(previewImg);

            // 隐藏的图片预加载：用于用户填好 URL 时显示预览
            if (p.default && /^https?:\/\//.test(p.default)) {
                previewImg.src = p.default;
                previewWrap.style.display = 'block';
            }

            // 手动改 URL 时刷新预览
            input.addEventListener('input', () => {
                const url = input.value.trim();
                if (/^https?:\/\//.test(url)) {
                    previewImg.src = url;
                    previewWrap.style.display = 'block';
                    checkReady();
                } else {
                    previewWrap.style.display = 'none';
                    previewImg.src = '';
                    checkReady();
                }
            });

            upBtn.addEventListener('click', () => fileInput.click());

            fileInput.addEventListener('change', async (ev) => {
                const file = ev.target.files && ev.target.files[0];
                if (!file) return;
                const originalBtnText = upBtn.textContent;
                upBtn.disabled = true;
                upBtn.textContent = t('uploadingBtn');
                try {
                    const imgUrl = await uploadToImgbb(file);
                    input.value = imgUrl;
                    previewImg.src = imgUrl;
                    previewWrap.style.display = 'block';
                    input.dispatchEvent(new Event('input'));
                } catch (e) {
                    alert(t('alertUploadFail') + e.message);
                } finally {
                    upBtn.disabled = false;
                    upBtn.textContent = originalBtnText || t('uploadImageBtn');
                    // 清空 file input，允许再次选同一文件触发 change
                    fileInput.value = '';
                }
            });

            div.appendChild(row);
            div.appendChild(fileInput);
            div.appendChild(previewWrap);
        } else {
            let input;
            if (p.type === 'textarea') {
                input = document.createElement('textarea');
                input.value = p.default || '';
            } else {
                input = document.createElement('input');
                input.type = p.type || 'text';
                input.value = p.default || '';
            }
            input.id = `param_${p.key}`;
            input.dataset.key = p.key;
            // 输入变更时重新检查是否满足部署条件
            input.addEventListener('input', checkReady);
            input.addEventListener('change', checkReady);
            div.appendChild(input);
        }
        container.appendChild(div);
    });
    document.getElementById('feeAmount').textContent = currentTemplate.fee + t('feeUnit');
    if (walletAddress) replaceAddressPlaceholder();
    checkReady();
}

function replaceAddressPlaceholder() {
    document.querySelectorAll('input, textarea').forEach(el => {
        if (el.value && el.value.includes('__ADDRESS__')) {
            el.value = el.value.replace(/__ADDRESS__/g, walletAddress);
        }
    });
}

function checkReady() {
    document.getElementById('deployBtn').disabled = !(walletAddress && currentTemplate);
}

loadTemplates();

// ============================================================
// 5. 部署合约（含随机手续费转账 + logo_url 必填校验）
// ============================================================
document.getElementById('deployBtn').addEventListener('click', deployContract);

// 重新加载当前模板（用于切换语言后刷新 param label 与 button 文本）
function refreshCurrentTemplateUI() {
    if (!currentTemplate) return;
    const select = document.getElementById('templateSelect');
    const idx = select.value;
    loadTemplate(idx);
    // 同步钱包栏按钮文案
    const connectBtn = document.getElementById('connectBtn');
    connectBtn.textContent = walletAddress ? t('connectedBtn') : t('connectBtn');
    // 同步状态文案（未连接时）
    const statusEl = document.getElementById('status');
    if (!walletAddress) {
        statusEl.textContent = t('walletDisconnected');
    } else {
        statusEl.textContent = `${t('walletConnectedPrefix')} ${walletAddress.slice(0, 10)}...`;
    }
}

async function deployContract() {
    if (!walletAddress) {
        alert(t('alertConnectFirst'));
        return;
    }
    if (!currentTemplate) {
        alert(t('alertSelectTemplate'));
        return;
    }

    // 防止重复点击
    const deployBtn = document.getElementById('deployBtn');
    if (deployBtn.dataset.busy === '1') return;
    deployBtn.dataset.busy = '1';
    deployBtn.disabled = true;
    deployBtn.textContent = t('deployingBtn');
    const resetBtn = () => {
        deployBtn.dataset.busy = '0';
        deployBtn.disabled = false;
        deployBtn.textContent = t('deployBtn');
    };

    try {
        // 收集参数
        const params = {};
        for (const p of currentTemplate.params) {
            const el = document.getElementById(`param_${p.key}`);
            let val = el.value.trim();
            if (p.type === 'number') val = Number(val);
            params[p.key] = val;
        }

        // ===== 输入校验 =====
        if (currentTemplate.id === 'prc20') {
            if (!params.name) throw new Error(t('errNameRequired'));
            if (!params.symbol) throw new Error(t('errSymbolRequired'));
            if (!Number.isFinite(params.decimals) || params.decimals < 0 || params.decimals > 36) {
                throw new Error(t('errDecimalsRange'));
            }
            if (!Number.isFinite(params.total_supply) || params.total_supply <= 0) {
                throw new Error(t('errTotalSupplyPositive'));
            }
            const logo = params.logo_url;
            if (!logo) throw new Error(t('errLogoRequired'));
            if (!/^https?:\/\//.test(logo) && !logo.startsWith('ipfs://')) {
                throw new Error(t('errLogoScheme'));
            }
        } else if (currentTemplate.id === 'prc721') {
            if (!params.name) throw new Error(t('errNftNameRequired'));
            if (!params.symbol) throw new Error(t('errNftSymbolRequired'));
            if (!isValidPaxiAddress(params.minter)) {
                throw new Error(t('errMinterInvalid'));
            }
        }

        // ---- 随机选择收款地址（用户不可见） ----
        const receiver = getRandomReceiver();
        if (!isValidPaxiAddress(receiver)) throw new Error(t('errReceiverConfig'));

        // 构建合约初始化消息
        let msg = {};
        if (currentTemplate.id === 'prc20') {
            // 用 BigInt 计算避免浮点精度丢失
            const amount = calculateAmount(params.total_supply, params.decimals);
            const initial_balances = [{ address: walletAddress, amount: amount }];
            const marketing = {
                project: params.project || '',
                description: params.description || '',
                marketing: walletAddress,
                logo: { url: params.logo_url }
            };
            // 按官方 PRC-20 标准：包含 mint 字段，铸造者为部署者钱包，允许后续增发
            msg = {
                name: params.name,
                symbol: params.symbol,
                decimals: params.decimals,
                initial_balances: initial_balances,
                mint: { minter: walletAddress },
                marketing: marketing
            };
            Object.keys(msg).forEach(k => msg[k] === null && delete msg[k]);
        } else if (currentTemplate.id === 'prc721') {
            msg = {
                name: params.name,
                symbol: params.symbol,
                minter: params.minter
            };
        } else {
            throw new Error(t('errUnknownTemplate'));
        }

        const chainId = await fetchChainId();
        const { accountNumber, sequence } = await fetchAccountInfo(walletAddress);

        // ---- 1. 构建转账消息（手续费） ----
        const feeInPAXI = currentTemplate.fee;
        const feeInUpaxi = feeInPAXI * 1_000_000;
        const sendMsg = PaxiCosmJS.MsgSend.fromPartial({
            fromAddress: walletAddress,
            toAddress: receiver,
            amount: [PaxiCosmJS.coins(feeInUpaxi.toString(), DENOM)[0]]
        });
        const anySend = PaxiCosmJS.Any.fromPartial({
            typeUrl: "/cosmos.bank.v1beta1.MsgSend",
            value: PaxiCosmJS.MsgSend.encode(sendMsg).finish()
        });

        // ---- 2. 构建实例化消息 ----
        // 注意：paxi-cosmjs.umd.js 未把 MsgInstantiateContract 暴露到 PaxiCosmJS 全局，
        // 这里手工编码 protobuf 字节，再用已暴露的 PaxiCosmJS.Any 包装。
        const label = `${currentTemplate.name}-${Date.now()}`;
        const msgJsonBytes = new TextEncoder().encode(JSON.stringify(msg));
        const instantiateValue = encodeMsgInstantiateContract(
            walletAddress,  // sender
            '',             // admin（--no-admin）
            currentTemplate.codeId, // code_id
            label,          // label
            msgJsonBytes,   // msg bytes
            []              // funds（无）
        );
        const anyInstantiate = PaxiCosmJS.Any.fromPartial({
            typeUrl: "/cosmwasm.wasm.v1.MsgInstantiateContract",
            value: instantiateValue
        });

        // ---- 3. 组合消息 ----
        const messages = [anySend, anyInstantiate];

        // ---- 4. TxBody ----
        const txBody = PaxiCosmJS.TxBody.fromPartial({
            messages: messages,
            memo: `${label} | fee ${feeInPAXI} PAXI`
        });

        // ---- 5. Fee ----
        const fee = {
            amount: [PaxiCosmJS.coins("6000000", DENOM)[0]],
            gasLimit: 1000000
        };

        // ---- 6. 公钥（使用连接时缓存的公钥，避免再次弹窗） ----
        if (!walletPubkey) throw new Error(t('errPubkeyMissing'));
        const pubkeyBytes = walletPubkey;
        // 按官方 DApp 示例写法
        const pubkeyAny = {
            typeUrl: "/cosmos.crypto.secp256k1.PubKey",
            value: PaxiCosmJS.PubKey.encode({ key: pubkeyBytes }).finish()
        };

        // ---- 7. AuthInfo ----
        const authInfo = PaxiCosmJS.AuthInfo.fromPartial({
            signerInfos: [{
                publicKey: pubkeyAny,
                modeInfo: { single: { mode: 1 } },
                sequence: BigInt(sequence)
            }],
            fee: fee
        });

        // ---- 8. SignDoc ----
        const signDoc = PaxiCosmJS.SignDoc.fromPartial({
            bodyBytes: PaxiCosmJS.TxBody.encode(txBody).finish(),
            authInfoBytes: PaxiCosmJS.AuthInfo.encode(authInfo).finish(),
            chainId: chainId,
            accountNumber: BigInt(accountNumber)
        });

        // ---- 9. 签名 ----
        let bodyBytesForRaw = signDoc.bodyBytes;
        let authInfoBytesForRaw = signDoc.authInfoBytes;

        if (walletType === 'paxihub') {
            const txObj = {
                bodyBytes: toBase64(signDoc.bodyBytes),
                authInfoBytes: toBase64(signDoc.authInfoBytes),
                chainId: chainId,
                accountNumber: signDoc.accountNumber.toString()
            };
            const signed = await window.paxihub.paxi.signAndSendTransaction(txObj);
            if (!signed || !signed.success) throw new Error(t('errSignPaxihub'));
            const sigBytes = Uint8Array.from(atob(signed.success), c => c.charCodeAt(0));

            // ---- 10. TxRaw ----
            const txRaw = PaxiCosmJS.TxRaw.fromPartial({
                bodyBytes: bodyBytesForRaw,
                authInfoBytes: authInfoBytesForRaw,
                signatures: [sigBytes]
            });
            const txBytes = PaxiCosmJS.TxRaw.encode(txRaw).finish();
            const base64Tx = toBase64(txBytes);
            await broadcastTx(base64Tx, label, feeInPAXI, params);
        } else if (walletType === 'keplr') {
            const signer = window.keplr.getOfflineSigner(PREFIX);
            const signed = await signer.signDirect(walletAddress, {
                bodyBytes: signDoc.bodyBytes,
                authInfoBytes: signDoc.authInfoBytes,
                chainId: chainId,
                accountNumber: signDoc.accountNumber
            });
            // 使用钱包实际签名时的 body/authInfo，保证签名与报文一致
            bodyBytesForRaw = signed.signed.bodyBytes;
            authInfoBytesForRaw = signed.signed.authInfoBytes;
            const sigBytes = signed.signature;
            const txRaw = PaxiCosmJS.TxRaw.fromPartial({
                bodyBytes: bodyBytesForRaw,
                authInfoBytes: authInfoBytesForRaw,
                signatures: [sigBytes]
            });
            const txBytes = PaxiCosmJS.TxRaw.encode(txRaw).finish();
            const base64Tx = toBase64(txBytes);
            await broadcastTx(base64Tx, label, feeInPAXI, params);
        } else {
            throw new Error(t('errUnknownWallet'));
        }
    } catch (error) {
        console.error(error);
        alert(t('alertDeployFail') + error.message);
    } finally {
        resetBtn();
    }
}

// 广播交易并展示结果
async function broadcastTx(base64Tx, label, feeInPAXI, params) {
    const broadcastRes = await fetch(`${LCD}/cosmos/tx/v1beta1/txs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tx_bytes: base64Tx,
            mode: 'BROADCAST_MODE_SYNC'
        })
    });
    const broadcastData = await broadcastRes.json();
    const txResponse = broadcastData.tx_response;

    if (!txResponse || !txResponse.txhash) {
        throw new Error(t('errBroadcast') + JSON.stringify(broadcastData));
    }
    // 校验交易是否成功上链（code !== 0 表示失败）
    if (txResponse.code !== 0) {
        throw new Error(t('errTxFail', txResponse.code, txResponse.raw_log || txResponse.codespace || ''));
    }
    const txHash = txResponse.txhash;

    // ---- 等待确认并解析合约地址 ----
    let contractAddr = null;
    for (let i = 0; i < 10; i++) {
        await sleep(2000);
        const txRes = await fetch(`${LCD}/cosmos/tx/v1beta1/txs/${txHash}`);
        if (!txRes.ok) continue;
        const txData = await txRes.json();
        // 二次校验：交易必须成功上链
        if (txData.tx_response && txData.tx_response.code !== 0) {
            throw new Error(t('errTxOnchain') + (txData.tx_response.raw_log || ''));
        }
        const events = txData.tx_response?.events || [];
        for (const evt of events) {
            if (evt.type === 'instantiate') {
                for (const attr of evt.attributes) {
                    if (attr.key === '_contract_address') {
                        contractAddr = attr.value;
                        break;
                    }
                }
            }
            if (contractAddr) break;
        }
        if (contractAddr) break;
    }

    const resultDiv = document.getElementById('result');
    resultDiv.style.display = 'block';
    if (contractAddr) {
        // 所有动态值都经过 escapeHtml 转义，防止 XSS
        resultDiv.innerHTML = `
            ${escapeHtml(t('resultSuccessTitle'))}<br>
            <strong>${escapeHtml(t('resultContractAddr'))}</strong><code>${escapeHtml(contractAddr)}</code><br>
            <strong>${escapeHtml(t('resultTxHash'))}</strong><code>${escapeHtml(txHash)}</code><br>
            <strong>${escapeHtml(t('resultTotalSupply'))}</strong>${escapeHtml(params.total_supply || 'N/A')}${escapeHtml(t('resultTotalSupplySuffix'))}<br>
            <strong>${escapeHtml(t('resultFee'))}</strong>${escapeHtml(feeInPAXI)}${escapeHtml(t('resultFeeSuffix'))}<br>
            <strong>${escapeHtml(t('resultLogoUrl'))}</strong>${escapeHtml(params.logo_url || t('resultNoLogo'))}<br>
            <strong>${escapeHtml(t('resultMinter'))}</strong><code>${escapeHtml(walletAddress)}</code>${escapeHtml(t('resultMinterSuffix'))}
        `;
    } else {
        resultDiv.innerHTML = `
            ${escapeHtml(t('resultNotReadyTitle'))}<br>
            ${escapeHtml(t('resultTxHash'))}<code>${escapeHtml(txHash)}</code><br>
            ${escapeHtml(t('resultNotReadyTip'))}
        `;
    }
}

// ============================================================
// 6. 语言切换
// ============================================================
function setupLangToggle() {
    const btn = document.getElementById('langToggleBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        window.I18N.toggleLanguage();
        // 按钮显示「要切换到的语言」，文案由 applyI18n 接管
        applyI18n();
        refreshCurrentTemplateUI();
    });
    // 监听来自其它代码/页签的语言变化
    window.addEventListener('languagechange', () => {
        applyI18n();
        refreshCurrentTemplateUI();
    });
    // 首次进入页面时也刷一遍（让按钮显示目标语言文案）
    applyI18n();
}

// 等 DOM 准备好后初始化语言按钮（脚本挂在 body 末尾，理论上 DOM 已就绪）
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupLangToggle);
} else {
    setupLangToggle();
}
