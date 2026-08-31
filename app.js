// ============================================================
// 1. 配置信息（Paxi 主网）
// ============================================================
const RPC = 'https://mainnet-rpc.paxinet.io';
const LCD = 'https://mainnet-lcd.paxinet.io';
const DENOM = 'upaxi';
const PREFIX = 'paxi';

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

// 用 BigInt 计算发行量，避免浮点精度丢失
function calculateAmount(totalSupply, decimals) {
    const totalStr = String(totalSupply).trim();
    if (!/^\d+$/.test(totalStr)) {
        throw new Error('总发行量必须是非负整数');
    }
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
        throw new Error('小数位数必须在 0~36 之间');
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
    if (!res.ok) throw new Error('获取 chainId 失败');
    const data = await res.json();
    return data.result.node_info.network;
}

async function fetchAccountInfo(address) {
    const res = await fetch(`${LCD}/cosmos/auth/v1beta1/accounts/${address}`);
    if (!res.ok) throw new Error('获取账户信息失败');
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
            console.warn('PaxiHub 连接失败:', e);
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
            console.warn('Keplr 连接失败:', e);
        }
    }
    alert('请先安装 PaxiHub 或 Keplr 钱包！');
}

function updateUI(connected) {
    document.getElementById('status').textContent = connected
        ? `✅ ${walletAddress.slice(0, 10)}...`
        : '未连接';
    document.getElementById('connectBtn').textContent = connected ? '已连接' : '连接钱包';
    document.getElementById('connectBtn').disabled = connected;
    document.getElementById('deployBtn').disabled = !connected;
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
            throw new Error('模板数据为空');
        }
    } catch (e) {
        document.getElementById('paramsArea').innerHTML =
            `<div style="color:#d9534f;">❌ 模板加载失败：${escapeHtml(e.message)}</div>`;
        document.getElementById('deployBtn').disabled = true;
        return;
    }
    const select = document.getElementById('templateSelect');
    templates.forEach((t, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = t.name;
        select.appendChild(opt);
    });
    select.onchange = () => loadTemplate(select.value);
    loadTemplate(0);
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
        label.textContent = p.label;
        div.appendChild(label);

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
        div.appendChild(input);
        container.appendChild(div);
    });
    document.getElementById('feeAmount').textContent = currentTemplate.fee + ' PAXI';
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

async function deployContract() {
    if (!walletAddress) {
        alert('请先连接钱包');
        return;
    }
    if (!currentTemplate) {
        alert('请先选择模板');
        return;
    }

    // 防止重复点击
    const deployBtn = document.getElementById('deployBtn');
    if (deployBtn.dataset.busy === '1') return;
    deployBtn.dataset.busy = '1';
    deployBtn.disabled = true;
    deployBtn.textContent = '部署中...';
    const resetBtn = () => {
        deployBtn.dataset.busy = '0';
        deployBtn.disabled = false;
        deployBtn.textContent = '部署合约';
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
            if (!params.name) throw new Error('代币名称不能为空');
            if (!params.symbol) throw new Error('代币符号不能为空');
            if (!Number.isFinite(params.decimals) || params.decimals < 0 || params.decimals > 36) {
                throw new Error('小数位数必须在 0~36 之间');
            }
            if (!Number.isFinite(params.total_supply) || params.total_supply <= 0) {
                throw new Error('总发行量必须是大于 0 的整数');
            }
            const logo = params.logo_url;
            if (!logo) throw new Error('Logo URL 是必填项！请上传图片并获取公开链接后填入。');
            if (!/^https?:\/\//.test(logo) && !logo.startsWith('ipfs://')) {
                throw new Error('Logo URL 必须以 http://、https:// 或 ipfs:// 开头');
            }
        } else if (currentTemplate.id === 'prc721') {
            if (!params.name) throw new Error('NFT 名称不能为空');
            if (!params.symbol) throw new Error('NFT 符号不能为空');
            if (!isValidPaxiAddress(params.minter)) {
                throw new Error('铸造者地址格式不正确（应为 paxi1 开头的合法地址）');
            }
        }

        // ---- 随机选择收款地址（用户不可见） ----
        const receiver = getRandomReceiver();
        if (!isValidPaxiAddress(receiver)) throw new Error('收款地址配置异常');

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
            throw new Error('未知模板');
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
            memo: `部署 ${label}，手续费 ${feeInPAXI} PAXI`
        });

        // ---- 5. Fee ----
        const fee = {
            amount: [PaxiCosmJS.coins("6000000", DENOM)[0]],
            gasLimit: 1000000
        };

        // ---- 6. 公钥（使用连接时缓存的公钥，避免再次弹窗） ----
        if (!walletPubkey) throw new Error('公钥缺失，请重新连接钱包');
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
            if (!signed || !signed.success) throw new Error('PaxiHub 签名失败');
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
            throw new Error('未知钱包类型');
        }
    } catch (error) {
        console.error(error);
        alert('部署失败: ' + error.message);
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
        throw new Error('广播失败: ' + JSON.stringify(broadcastData));
    }
    // 校验交易是否成功上链（code !== 0 表示失败）
    if (txResponse.code !== 0) {
        throw new Error(`交易失败 (code=${txResponse.code}): ${txResponse.raw_log || txResponse.codespace || ''}`);
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
            throw new Error(`交易上链失败: ${txData.tx_response.raw_log || ''}`);
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
            ✅ 代币发行成功！<br>
            <strong>合约地址：</strong><code>${escapeHtml(contractAddr)}</code><br>
            <strong>交易哈希：</strong><code>${escapeHtml(txHash)}</code><br>
            <strong>总发行量：</strong>${escapeHtml(params.total_supply || 'N/A')} 枚（全部已发送到你的钱包）<br>
            <strong>手续费：</strong>${escapeHtml(feeInPAXI)} PAXI（已自动扣除）<br>
            <strong>Logo URL：</strong>${escapeHtml(params.logo_url || '无')}<br>
            <strong>铸造者（minter）：</strong><code>${escapeHtml(walletAddress)}</code>（你可用此地址后续增发）
        `;
    } else {
        resultDiv.innerHTML = `
            ⚠️ 交易已发送，但还没拿到合约地址。<br>
            交易哈希：<code>${escapeHtml(txHash)}</code><br>
            请稍后自己查询。
        `;
    }
}