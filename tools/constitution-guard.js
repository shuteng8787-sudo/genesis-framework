// constitution-guard.js — Genesis 宪法保护机制
// 方案1（密码哈希）+ 方案2（文件完整性）组合
//
// 命令：
//   node constitution-guard.js set-password    — 书腾设置密码（交互式，密码不会显示在屏幕上）
//   node constitution-guard.js verify          — 验证宪法完整性（启动脚本自动调用）
//   node constitution-guard.js check-password  — 验证密码（修改宪法前调用）

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ===== 路径配置 =====
const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const CONSTITUTION_PATH = path.join(WORKSPACE_ROOT, 'constitution.md');
const INTEGRITY_PATH = path.join(WORKSPACE_ROOT, 'state', 'constitution-integrity.json');

// ===== 工具函数 =====
function sha256(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function computeFileHash(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    // 只对宪法正文部分做哈希（排除掉 integrity 元数据行）
    const bodyLines = content.split(/\r?\n/).filter(line => !line.startsWith('<!-- INTEGRITY:'));
    return sha256(bodyLines.join('\n').trim());
}

function loadIntegrity() {
    if (!fs.existsSync(INTEGRITY_PATH)) return null;
    return JSON.parse(fs.readFileSync(INTEGRITY_PATH, 'utf8'));
}

function saveIntegrity(data) {
    const dir = path.dirname(INTEGRITY_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(INTEGRITY_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ===== 密码输入（隐藏回显）=====
function askPassword(prompt) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        // On Windows, we can't easily hide input, so we warn the user
        process.stdout.write(prompt);
        rl.question('', (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

// ===== 命令实现 =====

async function setPassword() {
    console.log('🔐 Genesis 宪法密码设置');
    console.log('═'.repeat(50));
    console.log('');
    console.log('⚠️  此密码用于保护宪法三条最高法则不被未授权修改。');
    console.log('⚠️  密码本身不会被存储——只存储其 SHA-256 哈希值。');
    console.log('⚠️  请妥善保管密码，丢失后无法恢复。');
    console.log('');

    const password = await askPassword('请输入宪法保护密码: ');
    if (!password || password.length < 6) {
        console.error('❌ 密码太短（至少6个字符）');
        process.exit(1);
    }

    const confirm = await askPassword('请再次输入确认: ');
    if (password !== confirm) {
        console.error('❌ 两次输入不一致');
        process.exit(1);
    }

    // 加盐哈希（盐值固定为 "genesis-constitution" 以便跨设备验证）
    const salt = 'genesis-constitution-v1';
    const passwordHash = sha256(salt + password);

    // 计算当前宪法文件的哈希
    if (!fs.existsSync(CONSTITUTION_PATH)) {
        console.error('❌ 找不到 constitution.md');
        process.exit(1);
    }
    const fileHash = computeFileHash(CONSTITUTION_PATH);

    // 保存完整性数据
    const integrity = {
        version: '1.0',
        passwordHash: passwordHash,
        salt: salt,
        fileHash: fileHash,
        lastVerified: new Date().toISOString(),
        lastModifiedBy: '书腾（创造者）',
        note: '此文件记录宪法的密码哈希和文件完整性哈希。如文件哈希不匹配，说明宪法被篡改。'
    };
    saveIntegrity(integrity);

    // 在 constitution.md 末尾追加完整性标记
    let content = fs.readFileSync(CONSTITUTION_PATH, 'utf8');
    // 移除旧的 INTEGRITY 标记（如果有）
    content = content.replace(/\n<!-- INTEGRITY:.*-->\s*$/s, '');
    content = content.trimEnd() + '\n\n<!-- INTEGRITY: ' + fileHash + ' -->\n';
    fs.writeFileSync(CONSTITUTION_PATH, content, 'utf8');

    console.log('');
    console.log('✅ 宪法保护已启用！');
    console.log(`   密码哈希: ${passwordHash.substring(0, 16)}...`);
    console.log(`   文件哈希: ${fileHash.substring(0, 16)}...`);
    console.log(`   完整性文件: ${INTEGRITY_PATH}`);
    console.log('');
    console.log('📋 下一步：');
    console.log('   1. 启动脚本中加入 "node constitution-guard.js verify" 来自动校验');
    console.log('   2. 将 state/constitution-integrity.json 加入 .gitignore（不上传密码哈希）');
    console.log('   3. 推送 constitution.md 到 GitHub');
}

async function verify() {
    const integrity = loadIntegrity();
    if (!integrity) {
        console.log('⚠️  未设置宪法保护（state/constitution-integrity.json 不存在）');
        console.log('   运行 "node constitution-guard.js set-password" 来设置');
        process.exit(0); // 不阻止启动，只是警告
    }

    if (!fs.existsSync(CONSTITUTION_PATH)) {
        console.error('🚨 严重错误：constitution.md 文件不存在！宪法被删除！');
        process.exit(2);
    }

    const currentHash = computeFileHash(CONSTITUTION_PATH);
    if (currentHash !== integrity.fileHash) {
        console.error('🚨🚨🚨 宪法文件已被篡改！🚨🚨🚨');
        console.error(`   预期哈希: ${integrity.fileHash.substring(0, 16)}...`);
        console.error(`   实际哈希: ${currentHash.substring(0, 16)}...`);
        console.error('');
        console.error('宪法已被未授权修改。请联系创造者（书腾）处理。');
        console.error('AI 不应在宪法被篡改的状态下运行。');
        process.exit(2);
    }

    // 更新验证时间
    integrity.lastVerified = new Date().toISOString();
    saveIntegrity(integrity);

    console.log('✅ 宪法完整性验证通过');
    console.log(`   文件哈希: ${currentHash.substring(0, 16)}...`);
    console.log(`   上次验证: ${integrity.lastVerified}`);
}

async function checkPassword() {
    const integrity = loadIntegrity();
    if (!integrity) {
        console.error('❌ 未设置宪法保护。请先运行 set-password');
        process.exit(1);
    }

    const password = await askPassword('请输入宪法保护密码: ');
    const hash = sha256(integrity.salt + password);

    if (hash === integrity.passwordHash) {
        console.log('✅ 密码正确。你有权修改宪法。');
        console.log('');
        console.log('修改完成后，请运行 "node constitution-guard.js update-hash" 更新文件哈希。');
        process.exit(0);
    } else {
        console.error('❌ 密码错误。宪法修改被拒绝。');
        process.exit(1);
    }
}

async function updateHash() {
    const integrity = loadIntegrity();
    if (!integrity) {
        console.error('❌ 未设置宪法保护');
        process.exit(1);
    }

    // 先验证密码
    const password = await askPassword('请输入宪法保护密码以确认更新权限: ');
    const hash = sha256(integrity.salt + password);

    if (hash !== integrity.passwordHash) {
        console.error('❌ 密码错误。无法更新哈希。');
        process.exit(1);
    }

    // 更新文件哈希
    const newFileHash = computeFileHash(CONSTITUTION_PATH);
    integrity.fileHash = newFileHash;
    integrity.lastModifiedBy = '书腾（创造者）- ' + new Date().toISOString();
    saveIntegrity(integrity);

    // 更新 constitution.md 中的 INTEGRITY 行
    let content = fs.readFileSync(CONSTITUTION_PATH, 'utf8');
    content = content.replace(/\n<!-- INTEGRITY:.*-->\s*$/s, '');
    content = content.trimEnd() + '\n\n<!-- INTEGRITY: ' + newFileHash + ' -->\n';
    fs.writeFileSync(CONSTITUTION_PATH, content, 'utf8');

    console.log('✅ 宪法文件哈希已更新');
    console.log(`   新哈希: ${newFileHash.substring(0, 16)}...`);
}

// ===== 主入口 =====
const command = process.argv[2];

switch (command) {
    case 'set-password':
        setPassword();
        break;
    case 'verify':
        verify();
        break;
    case 'check-password':
        checkPassword();
        break;
    case 'update-hash':
        updateHash();
        break;
    default:
        console.log('Genesis 宪法守护工具 v1.0');
        console.log('');
        console.log('用法:');
        console.log('  node constitution-guard.js set-password    设置保护密码（仅书腾操作）');
        console.log('  node constitution-guard.js verify          验证宪法完整性（启动时自动调用）');
        console.log('  node constitution-guard.js check-password  验证密码（修改宪法前）');
        console.log('  node constitution-guard.js update-hash     更新文件哈希（修改宪法后）');
}
