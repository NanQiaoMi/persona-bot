// scripts/create-test-user.js
// 运行: node scripts/create-test-user.js

const mongoose = require('mongoose');
const crypto = require('crypto');

// MongoDB 连接
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/personabot';

// 用户模型
const UserSchema = new mongoose.Schema({
  username: String,
  passwordHash: String,
  role: { type: String, default: 'user' },
  inviteCodeId: mongoose.Schema.Types.ObjectId,
  settings: {
    llmProvider: { type: String, default: 'openai' },
    apiKeyEncrypted: String,
    theme: { type: String, default: 'light' },
    language: { type: String, default: 'zh-CN' },
  },
}, { timestamps: true });

// 邀请码模型
const InviteCodeSchema = new mongoose.Schema({
  code: { type: String, unique: true, uppercase: true },
  createdBy: mongoose.Schema.Types.ObjectId,
  usedBy: [mongoose.Schema.Types.ObjectId],
  maxUses: { type: Number, default: 100 },
  currentUses: { type: Number, default: 0 },
  expiresAt: Date,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

async function createTestUser() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('已连接到 MongoDB');

    const User = mongoose.model('User', UserSchema);
    const InviteCode = mongoose.model('InviteCode', InviteCodeSchema);

    // 检查是否已存在测试用户
    const existingUser = await User.findOne({ username: 'testuser' });
    if (existingUser) {
      console.log('测试用户已存在');
      console.log('用户名: testuser');
      console.log('密码: Test123456');
      await mongoose.disconnect();
      return;
    }

    // 创建管理员用户（如果没有的话）
    let adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      // 简单的密码哈希（仅用于测试）
      const crypto = require('crypto');
      const passwordHash = crypto.createHash('sha256').update('Admin123456').digest('hex');
      
      adminUser = await User.create({
        username: 'admin',
        passwordHash,
        role: 'admin',
      });
      console.log('管理员用户已创建: admin / Admin123456');
    }

    // 创建邀请码
    const inviteCode = 'TEST2024';
    let code = await InviteCode.findOne({ code: inviteCode });
    if (!code) {
      code = await InviteCode.create({
        code: inviteCode,
        createdBy: adminUser._id,
        maxUses: 100,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1年后过期
      });
      console.log('邀请码已创建: TEST2024');
    }

    // 创建测试用户
    const passwordHash = crypto.createHash('sha256').update('Test123456').digest('hex');
    
    const testUser = await User.create({
      username: 'testuser',
      passwordHash,
      role: 'user',
      inviteCodeId: code._id,
    });

    // 更新邀请码使用次数
    code.currentUses += 1;
    code.usedBy.push(testUser._id);
    await code.save();

    console.log('\n========================================');
    console.log('测试账号创建成功！');
    console.log('========================================');
    console.log('用户名: testuser');
    console.log('密码: Test123456');
    console.log('邀请码: TEST2024');
    console.log('========================================\n');

    await mongoose.disconnect();
    console.log('已断开 MongoDB 连接');
  } catch (error) {
    console.error('创建测试用户失败:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

createTestUser();
